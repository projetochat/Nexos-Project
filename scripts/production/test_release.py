import copy
import ast
import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import release
from preflight import CheckError
from test_preflight import config

SHA = 'a' * 40


def migration_preflight(reconciliation_required=False):
    return json.dumps({
        'code': 'CONTACT_CUSTOM_FIELD_IDENTITY_PREFLIGHT_OK',
        'reconciliationRequired': reconciliation_required,
    })


def make_archive(path, mutate=lambda value: None, extra=None):
    manifest = [{'Config': f'{name}.json', 'RepoTags': [f'trixus-release/{name}:{SHA}'],
                 'Layers': ['layer.tar']} for name in release.SERVICES]
    mutate(manifest)
    entries = {'manifest.json': json.dumps(manifest).encode(), 'layer.tar': b'opaque-layer',
               # An OCI index must never be forwarded to Docker.
               'index.json': b'{"untrusted":"ignored"}'}
    for name in release.SERVICES:
        entries[f'{name}.json'] = json.dumps({'os': 'linux', 'architecture': 'amd64', 'config': {}}).encode()
    with tarfile.open(path, 'w') as archive:
        for name, payload in entries.items():
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            archive.addfile(info, io.BytesIO(payload))
        if extra:
            archive.addfile(extra)


class ReleaseTest(unittest.TestCase):
    def test_preflight_subprocess_cannot_consume_incoming_ssh_archive(self):
        folder = str(Path(__file__).resolve().parent)
        child = 'import sys; print(len(sys.stdin.buffer.read()))'
        harness = (
            f'import sys, json; sys.path.insert(0, {folder!r}); import release; '
            f'count = release.command([sys.executable, "-c", {child!r}]); '
            'print(json.dumps([count, sys.stdin.buffer.read().decode()]))'
        )
        result = subprocess.run([sys.executable, '-B', '-c', harness], input=b'archive-payload',
                                capture_output=True, check=True, timeout=20)
        self.assertEqual(json.loads(result.stdout), ['0', 'archive-payload'])

    def test_explicit_backup_stream_is_still_passed_to_subprocess(self):
        with tempfile.TemporaryFile() as stream:
            stream.write(b'backup')
            stream.seek(0)
            count = release.command([sys.executable, '-c',
                                     'import sys; print(len(sys.stdin.buffer.read()))'], input_file=stream)
        self.assertEqual(count, '6')

    def test_request_rejects_shell_injection_unbounded_size_and_other_verbs(self):
        valid = ['plan', SHA, 'b' * 64, '10']
        self.assertEqual(release.parse_request(valid)[-1], 10)
        for index, value in ((0, 'sh'), (1, SHA + ';id'), (2, '../hash'), (3, '-1'),
                             (3, str(release.MAX_ARCHIVE + 1))):
            candidate = valid.copy()
            candidate[index] = value
            with self.subTest(value=value), self.assertRaises(CheckError):
                release.parse_request(candidate)

    def test_receive_rejects_truncated_extra_or_changed_content(self):
        digest = hashlib.sha256(b'abc').hexdigest()
        for value in (b'ab', b'abcd', b'xyz'):
            with tempfile.TemporaryDirectory() as folder, self.assertRaises(CheckError):
                release.receive(io.BytesIO(value), Path(folder) / 'input', digest, 3)

    def test_archive_removes_alternative_manifests_and_preserves_only_expected_tags(self):
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder) / 'in.tar', Path(folder) / 'out.tar'
            make_archive(source)
            release.normalize_archive(source, target, SHA)
            with tarfile.open(target) as archive:
                self.assertNotIn('index.json', archive.getnames())
                manifest = json.load(archive.extractfile('manifest.json'))
                self.assertEqual({tag for item in manifest for tag in item['RepoTags']},
                                 {f'trixus-release/{name}:{SHA}' for name in release.SERVICES})

    def test_archive_rejects_extra_tag_wrong_commit_traversal_symlink_duplicate(self):
        for mutation in (lambda m: m[0]['RepoTags'].append('postgres:16-alpine'),
                         lambda m: m[0].update(RepoTags=['trixus-release/backend:' + 'c' * 40]),
                         lambda m: m.append(copy.deepcopy(m[0]))):
            with tempfile.TemporaryDirectory() as folder, self.assertRaises(CheckError):
                source = Path(folder) / 'in.tar'
                make_archive(source, mutation)
                release.normalize_archive(source, Path(folder) / 'out.tar', SHA)
        for name, kind in (('../evil', tarfile.REGTYPE), ('link', tarfile.SYMTYPE),
                           ('manifest.json', tarfile.REGTYPE)):
            extra = tarfile.TarInfo(name)
            extra.type = kind
            with tempfile.TemporaryDirectory() as folder, self.assertRaises(CheckError):
                source = Path(folder) / 'in.tar'
                make_archive(source, extra=extra)
                release.normalize_archive(source, Path(folder) / 'out.tar', SHA)

    def test_config_preserves_infrastructure_secrets_and_scopes_limits(self):
        value = config()
        value['services']['backend']['environment']['TOKEN'] = 'a$b${c}'
        original = copy.deepcopy(value)
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'compose.json'
            command = release.compose_file(value, {name: name + ':image' for name in release.SERVICES}, target)
            updated = json.loads(target.read_text())
        self.assertEqual(value, original)
        self.assertEqual(updated['services']['postgres'], original['services']['postgres'])
        self.assertEqual(updated['services']['backend']['environment']['TOKEN'], 'a$$b$${c}')
        self.assertIn('trixus-vps', command)
        self.assertEqual(updated['services']['backend']['cap_drop'], ['ALL'])
        self.assertEqual(updated['services']['backend']['mem_limit'], '768m')
        self.assertEqual(updated['services']['backend']['memswap_limit'], '768m')
        self.assertEqual(
            updated['services']['backend']['environment']['TRIXUS_HISTORY_IMPORT_WORKER_ENABLED'],
            'false')
        self.assertEqual(
            updated['services']['backend']['environment']['TRIXUS_DEFERRED_REPLAY_WORKER_ENABLED'],
            'false')
        self.assertEqual(updated['services']['frontend']['healthcheck']['test'][:3],
                         ['CMD', 'bun', '-e'])
        self.assertIn('127.0.0.1:4173',
                      updated['services']['frontend']['healthcheck']['test'][3])

    def test_backup_failure_restarts_existing_apps_without_migration(self):
        with tempfile.TemporaryDirectory() as folder:
            commands = []
            marker = Path(folder) / 'recovery-required'
            def run(args, **kwargs):
                commands.append(args)
                if '--preflight-only' in args:
                    return migration_preflight()
                if 'pg_dump' in ' '.join(args):
                    raise CheckError('backup failed')
                return ''
            with patch.object(release, 'command', side_effect=run), \
                 patch.object(release, 'healthy_apps'), \
                 patch.object(release, 'check_protected'), \
                 patch.object(release.subprocess, 'run') as process, self.assertRaises(CheckError):
                process.return_value.returncode = 1
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'},
                                {}, SHA, Path(folder), marker)
            previous = json.loads((Path(folder) / 'previous-compose.json').read_text())
            self.assertEqual(previous['services']['backend']['mem_limit'], '768m')
            self.assertEqual(previous['services']['backend']['memswap_limit'], '768m')
            self.assertEqual(previous['services']['backend']['cap_drop'], ['ALL'])
            self.assertTrue(any('start' in command for command in commands))
            self.assertFalse(any('prisma:migrate:deploy' in command and '--preflight-only' not in command
                                 for command in commands))

    def test_migration_failure_never_starts_old_app_or_restores_database(self):
        with tempfile.TemporaryDirectory() as folder:
            commands = []
            marker = Path(folder) / 'recovery-required'
            def run(args, **kwargs):
                commands.append(args)
                if '--preflight-only' in args:
                    return migration_preflight()
                if 'pg_dump' in ' '.join(args):
                    kwargs['output'].write(b'dump')
                if '/usr/bin/tar' in args and '-cf' in args:
                    Path(args[args.index('-cf') + 1]).write_bytes(b'storage')
                if 'prisma:migrate:deploy' in args and '--preflight-only' not in args:
                    raise CheckError('migration failed')
                return ''
            with patch.object(release, 'command', side_effect=run), \
                 patch.object(release, 'check_protected'), \
                 patch.object(release.subprocess, 'run') as process, self.assertRaises(CheckError):
                process.return_value.returncode = 1
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'},
                                {}, SHA, Path(folder), marker)
            self.assertFalse(any('start' in command or 'up' in command for command in commands))
            self.assertTrue(any('stop' in command for command in commands))
            self.assertEqual(marker.read_text().strip(), str(Path(folder)))
            self.assertEqual((Path(folder) / 'status.txt').read_text().strip(), 'RECUPERACAO_MANUAL_NECESSARIA')

    def test_initial_migration_preflight_fails_without_downtime_or_marker(self):
        with tempfile.TemporaryDirectory() as folder:
            commands = []
            marker = Path(folder) / 'recovery-required'

            def run(args, **kwargs):
                commands.append(args)
                if '--preflight-only' in args:
                    raise CheckError('preflight failed')
                return ''

            with patch.object(release, 'command', side_effect=run), \
                 patch.object(release.subprocess, 'run') as process, self.assertRaises(CheckError):
                process.return_value.returncode = 1
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'},
                                {}, SHA, Path(folder), recovery_marker=marker)

            self.assertFalse(marker.exists())
            self.assertFalse(any('stop' in command or 'start' in command for command in commands))
            self.assertFalse(any('pg_dump' in ' '.join(command) for command in commands))
            self.assertFalse(any('prisma:migrate:deploy' in command and '--preflight-only' not in command
                                 for command in commands))
            self.assertEqual((Path(folder) / 'status.txt').read_text().strip(),
                             'PREFLIGHT_REPROVADO_SEM_INDISPONIBILIDADE')

    def test_second_preflight_failure_restarts_apps_and_clears_marker(self):
        with tempfile.TemporaryDirectory() as folder:
            commands = []
            marker = Path(folder) / 'recovery-required'
            preflights = 0

            def run(args, **kwargs):
                nonlocal preflights
                commands.append(args)
                if '--preflight-only' in args:
                    preflights += 1
                    if preflights == 2:
                        raise CheckError('drift after maintenance')
                    return migration_preflight()
                if 'pg_dump' in ' '.join(args):
                    kwargs['output'].write(b'dump')
                if '/usr/bin/tar' in args and '-cf' in args:
                    Path(args[args.index('-cf') + 1]).write_bytes(b'storage')
                return ''

            with patch.object(release, 'command', side_effect=run), \
                 patch.object(release, 'healthy_apps'), \
                 patch.object(release, 'check_protected'), \
                 patch.object(release.subprocess, 'run') as process, self.assertRaises(CheckError):
                process.return_value.returncode = 1
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'},
                                {}, SHA, Path(folder), recovery_marker=marker)

            self.assertEqual(preflights, 2)
            self.assertFalse(marker.exists())
            self.assertTrue(any('stop' in command for command in commands))
            self.assertTrue(any('start' in command for command in commands))
            self.assertFalse(any('prisma:migrate:deploy' in command and '--preflight-only' not in command
                                 for command in commands))
            self.assertEqual((Path(folder) / 'status.txt').read_text().strip(),
                             'FALHA_ANTES_DA_MIGRACAO_APLICACAO_ANTERIOR_REINICIADA')

    def test_failed_restart_health_preserves_recovery_marker(self):
        with tempfile.TemporaryDirectory() as folder:
            marker = Path(folder) / 'recovery-required'
            preflights = 0

            def run(args, **kwargs):
                nonlocal preflights
                if '--preflight-only' in args:
                    preflights += 1
                    if preflights == 2:
                        raise CheckError('drift after maintenance')
                    return migration_preflight()
                if 'pg_dump' in ' '.join(args):
                    kwargs['output'].write(b'dump')
                if '/usr/bin/tar' in args and '-cf' in args:
                    Path(args[args.index('-cf') + 1]).write_bytes(b'storage')
                return ''

            with patch.object(release, 'command', side_effect=run), \
                 patch.object(release, 'healthy_apps', side_effect=CheckError('unhealthy')), \
                 patch.object(release, 'check_protected'), \
                 patch.object(release.subprocess, 'run') as process, self.assertRaises(CheckError):
                process.return_value.returncode = 1
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'},
                                {}, SHA, Path(folder), marker)

            self.assertEqual(marker.read_text().strip(), str(Path(folder)))

    def test_cleanup_failure_does_not_prevent_healthy_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            commands = []
            marker = Path(folder) / 'recovery-required'
            preflights = 0

            def run(args, **kwargs):
                nonlocal preflights
                commands.append(args)
                if '--preflight-only' in args:
                    preflights += 1
                    if preflights == 2:
                        raise CheckError('drift after maintenance')
                    return migration_preflight()
                if 'pg_dump' in ' '.join(args):
                    kwargs['output'].write(b'dump')
                if '/usr/bin/tar' in args and '-cf' in args:
                    Path(args[args.index('-cf') + 1]).write_bytes(b'storage')
                return ''

            with patch.object(release, 'command', side_effect=run), \
                 patch.object(release, 'healthy_apps') as healthy, \
                 patch.object(release, 'check_protected'), \
                 patch.object(release.subprocess, 'run', side_effect=CheckError('inspect failed')), \
                 self.assertRaises(CheckError):
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'},
                                {}, SHA, Path(folder), marker)

            self.assertTrue(any('start' in command for command in commands))
            healthy.assert_called_once_with(release.BASE)
            self.assertEqual(marker.read_text().strip(), str(Path(folder)))
            self.assertEqual((Path(folder) / 'status.txt').read_text().strip(),
                             'APLICACAO_ANTERIOR_SAUDAVEL_LIMPEZA_MANUAL_NECESSARIA')

    def test_release_orders_both_preflights_before_migration_application(self):
        with tempfile.TemporaryDirectory() as folder:
            commands = []
            marker = Path(folder) / 'recovery-required'

            def run(args, **kwargs):
                commands.append(args)
                if '--preflight-only' in args:
                    return migration_preflight()
                if 'pg_dump' in ' '.join(args):
                    kwargs['output'].write(b'dump')
                if '/usr/bin/tar' in args and '-cf' in args:
                    Path(args[args.index('-cf') + 1]).write_bytes(b'storage')
                return ''

            with patch.object(release, 'command', side_effect=run), \
                 patch.object(release, 'check_protected'), \
                 patch.object(release, 'healthy_apps'), \
                 patch.object(release, 'STATE', Path(folder)):
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'},
                                {}, SHA, Path(folder), recovery_marker=marker)

            first_preflight = next(index for index, args in enumerate(commands)
                                   if '--preflight-only' in args)
            stop = next(index for index, args in enumerate(commands) if 'stop' in args)
            second_preflight = next(index for index, args in enumerate(commands[first_preflight + 1:],
                                      first_preflight + 1) if '--preflight-only' in args)
            apply = next(index for index, args in enumerate(commands)
                         if 'prisma:migrate:deploy' in args and '--preflight-only' not in args)
            self.assertLess(first_preflight, stop)
            self.assertLess(stop, second_preflight)
            self.assertLess(second_preflight, apply)
            self.assertFalse(marker.exists())

    def test_release_applies_reviewed_reconciliation_under_the_official_locked_path(self):
        with tempfile.TemporaryDirectory() as folder:
            commands = []
            marker = Path(folder) / 'recovery-required'

            def run(args, **kwargs):
                commands.append(args)
                if '--preflight-only' in args:
                    return migration_preflight(reconciliation_required=True)
                if 'pg_dump' in ' '.join(args):
                    kwargs['output'].write(b'dump')
                if '/usr/bin/tar' in args and '-cf' in args:
                    Path(args[args.index('-cf') + 1]).write_bytes(b'storage')
                return ''

            with patch.object(release, 'command', side_effect=run), \
                 patch.object(release, 'check_protected'), \
                 patch.object(release, 'healthy_apps'), \
                 patch.object(release, 'STATE', Path(folder)):
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'},
                                {}, SHA, Path(folder), recovery_marker=marker)

            apply = next(args for args in commands
                         if 'prisma:migrate:deploy' in args and '--preflight-only' not in args)
            self.assertIn('--apply-reviewed-reconciliation', apply)
            source = ast.parse(Path(release.__file__).read_text())
            main = next(node for node in source.body
                        if isinstance(node, ast.FunctionDef) and node.name == 'main')
            lock = next(node for node in ast.walk(main)
                        if isinstance(node, ast.With) and 'release.lock' in ast.unparse(node.items[0].context_expr))
            calls = [node for node in ast.walk(lock) if isinstance(node, ast.Call)]
            self.assertTrue(any(isinstance(call.func, ast.Attribute) and call.func.attr == 'flock'
                                for call in calls))
            self.assertTrue(any(isinstance(call.func, ast.Name) and call.func.id == 'publish'
                                for call in calls))

    def test_healthy_apps_uses_only_loopback_and_checks_trixus_identity(self):
        calls = []

        def run(args, **kwargs):
            calls.append(args)
            if args[-1].endswith('/api/health'):
                return ('{"ok":true,"service":"trixus-api","database":"up",'
                        '"redis":"up","queue":"up","storage":"up"}')
            return '<html><head><title>Trixus</title></head></html>'

        with patch.object(release, 'command', side_effect=run), \
             patch.object(release, 'app_container_state', return_value={
                 'backend': 'a' * 64, 'frontend': 'b' * 64,
             }), patch.object(release.time, 'sleep') as sleep:
            release.healthy_apps(['docker', 'compose'], stabilization_seconds=30)

        urls = [args[-1] for args in calls]
        self.assertEqual(urls, ['http://127.0.0.1:3001/api/health',
                                'http://127.0.0.1:4173/',
                                'http://127.0.0.1:3001/api/health',
                                'http://127.0.0.1:4173/'])
        self.assertTrue(all(url.startswith('http://127.0.0.1:') for url in urls))
        sleep.assert_called_once_with(30)

    def test_healthy_apps_rejects_unrelated_responses(self):
        healthy = ('{"ok":true,"service":"trixus-api","database":"up",'
                   '"redis":"up","queue":"up","storage":"up"}')
        for backend, frontend in (('{"status":"ok"}', '<title>Trixus</title>'),
                                  ('not-json', '<title>Trixus</title>'),
                                  ('{"ok":true,"service":"other","database":"up",'
                                   '"redis":"up","queue":"up","storage":"up"}',
                                   '<title>Trixus</title>'),
                                  (healthy, '<title>GLPI</title>')):
            with self.subTest(backend=backend, frontend=frontend), \
                 patch.object(release, 'command', side_effect=[backend, frontend]), \
                 patch.object(release, 'app_container_state', return_value={
                     'backend': 'a' * 64, 'frontend': 'b' * 64,
                 }), patch.object(release.time, 'sleep'), \
                 self.assertRaises(CheckError):
                release.healthy_apps(['docker', 'compose'], stabilization_seconds=0)

    def test_healthy_apps_rejects_restart_after_initial_health(self):
        healthy = ('{"ok":true,"service":"trixus-api","database":"up",'
                   '"redis":"up","queue":"up","storage":"up"}')
        stable = {'backend': 'a' * 64, 'frontend': 'b' * 64}
        with patch.object(release, 'command', side_effect=[healthy, '<title>Trixus</title>']), \
             patch.object(release, 'app_container_state', side_effect=[
                 stable, CheckError('Container da aplicacao instavel: backend'),
             ]), patch.object(release.time, 'sleep') as sleep, self.assertRaises(CheckError):
            release.healthy_apps(['docker', 'compose'], stabilization_seconds=30)
        sleep.assert_called_once_with(30)

    def test_retention_keeps_two_newest_current_and_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            releases = state / 'releases'
            releases.mkdir()
            shas = {name: char * 40 for name, char in (
                ('old', 'a'), ('recovery', 'b'), ('current', 'c'), ('newer', 'd'), ('newest', 'e'))}
            names = [
                f'20260920T000000Z-{shas["old"]}',
                f'20260921T000000Z-{shas["recovery"]}',
                f'20260922T000000Z-{shas["current"]}',
                f'20260923T000000Z-{shas["newer"]}',
                f'20260924T000000Z-{shas["newest"]}',
            ]
            for name in names:
                path = releases / name
                path.mkdir()
                (path / 'database.dump').write_bytes(b'backup')
            unexpected = releases / 'manual-notes'
            unexpected.mkdir()
            (unexpected / 'keep.txt').write_text('do not delete')
            (state / 'current.txt').write_text(str(releases / names[2]) + '\n')
            (state / 'recovery-required').write_text(str(releases / names[1]) + '\n')

            with patch.object(release, 'STATE', state), patch.object(release.subprocess, 'run') as run:
                removed = release.retain_release_history()

            self.assertEqual(removed, [names[0]])
            self.assertTrue((releases / names[4]).is_dir())
            self.assertTrue((releases / names[3]).is_dir())
            self.assertTrue((releases / names[2]).is_dir())
            self.assertTrue((releases / names[1]).is_dir())
            self.assertEqual((unexpected / 'keep.txt').read_text(), 'do not delete')
            image_rm = run.call_args.args[0]
            self.assertEqual(image_rm[:4], ['/usr/bin/docker', 'image', 'rm',
                                            f'trixus-release/backend:{shas["old"]}'])
            self.assertIn(f'trixus-previous/frontend:{names[0]}', image_rm)

    def test_retention_never_follows_symlink_or_accepts_external_marker(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            releases = state / 'releases'
            releases.mkdir()
            outside = state / 'outside'
            outside.mkdir()
            link = releases / '20260920-link'
            try:
                link.symlink_to(outside, target_is_directory=True)
            except OSError:
                self.skipTest('Symlinks are unavailable in this environment')
            for name in ('20260922-current', '20260923-new'):
                (releases / name).mkdir()
            unexpected = releases / 'manual-notes'
            unexpected.mkdir()
            (unexpected / 'keep.txt').write_text('do not delete')
            (state / 'current.txt').write_text(str(outside) + '\n')

            with patch.object(release, 'STATE', state), self.assertRaises(CheckError):
                release.retain_release_history()
            self.assertTrue(outside.is_dir())
            self.assertEqual((unexpected / 'keep.txt').read_text(), 'do not delete')


if __name__ == '__main__':
    unittest.main()
