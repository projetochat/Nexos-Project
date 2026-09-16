import copy
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

    def test_backup_failure_restarts_existing_apps_without_migration(self):
        with tempfile.TemporaryDirectory() as folder:
            commands = []
            def run(args, **kwargs):
                commands.append(args)
                if 'pg_dump' in ' '.join(args):
                    raise CheckError('backup failed')
                return ''
            with patch.object(release, 'command', side_effect=run), self.assertRaises(CheckError):
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'}, {}, SHA, Path(folder))
            self.assertTrue(any('start' in command for command in commands))
            self.assertFalse(any('prisma:migrate:deploy' in command for command in commands))

    def test_migration_failure_never_starts_old_app_or_restores_database(self):
        with tempfile.TemporaryDirectory() as folder:
            commands = []
            def run(args, **kwargs):
                commands.append(args)
                if 'pg_dump' in ' '.join(args):
                    kwargs['output'].write(b'dump')
                if '/usr/bin/tar' in args and '-cf' in args:
                    Path(args[args.index('-cf') + 1]).write_bytes(b'storage')
                if 'prisma:migrate:deploy' in args:
                    raise CheckError('migration failed')
                return ''
            with patch.object(release, 'command', side_effect=run), \
                 patch.object(release, 'check_protected'), \
                 patch.object(release.subprocess, 'run') as process, self.assertRaises(CheckError):
                process.return_value.returncode = 1
                release.publish(config(), {'backend': 'sha256:old', 'frontend': 'sha256:old2'}, {}, SHA, Path(folder))
            self.assertFalse(any('start' in command or 'up' in command for command in commands))
            self.assertTrue(any('stop' in command for command in commands))
            self.assertEqual((Path(folder) / 'status.txt').read_text().strip(), 'RECUPERACAO_MANUAL_NECESSARIA')


if __name__ == '__main__':
    unittest.main()
