import copy
import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import release


SHA = "a" * 40


def temporary_directory():
    return tempfile.TemporaryDirectory(dir=Path.cwd())


def config():
    return {
        "name": "trixus-hml",
        "services": {
            "postgres": {"environment": {
                "POSTGRES_DB": "trixus_homolog", "POSTGRES_USER": "trixus",
                "POSTGRES_PASSWORD": "placeholder",
            }, "healthcheck": {"test": ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER}"]}},
            "redis": {},
            "evolution-postgres": {},
            "evolution-redis": {},
            "evolution-api": {
                "ports": [{"host_ip": "127.0.0.1", "published": "8081", "target": 8080}],
            },
            "backend": {
                "build": {"context": "."},
                "environment": {
                    "DATABASE_URL": "postgresql://trixus:placeholder@postgres:5432/trixus_homolog?schema=public",
                    "EVOLUTION_BASE_URL": "http://evolution-api:8080/",
                    "EVOLUTION_WEBHOOK_PUBLIC_URL": release.WEBHOOK_URL,
                    "TRIXUS_HISTORY_IMPORT_WORKER_ENABLED": "false",
                    "TRIXUS_DEFERRED_REPLAY_WORKER_ENABLED": "false",
                },
                "volumes": [{"type": "bind", "source": "/srv/trixus-hml-data",
                             "target": "/var/lib/trixus/storage"}],
                "ports": [{"host_ip": "127.0.0.1", "published": "3002", "target": 3001}],
            },
            "frontend": {
                "build": {"context": "."},
                "environment": {},
                "ports": [{"host_ip": "127.0.0.1", "published": "4174", "target": 4173}],
            },
            "migrate": {
                "build": {"context": "."},
                "environment": {"DATABASE_URL":
                    "postgresql://trixus:placeholder@postgres:5432/trixus_homolog?schema=public"},
            },
        },
    }


def make_archive(path, tags=None):
    tags = tags or [f"trixus-hml-release/{name}:{SHA}" for name in release.SERVICES]
    manifest = []
    payloads = {"layer.tar": b"layer"}
    for index, tag in enumerate(tags):
        name = f"config-{index}.json"
        payloads[name] = json.dumps({"os": "linux", "architecture": "amd64", "config": {}}).encode()
        manifest.append({"Config": name, "RepoTags": [tag], "Layers": ["layer.tar"]})
    payloads["manifest.json"] = json.dumps(manifest).encode()
    with tarfile.open(path, "w") as archive:
        for name, value in payloads.items():
            item = tarfile.TarInfo(name)
            item.size = len(value)
            archive.addfile(item, io.BytesIO(value))


class HomologationReleaseTest(unittest.TestCase):
    def test_fixed_namespace_and_canonical_urls_never_point_to_production(self):
        self.assertEqual(release.PROJECT, "trixus-hml")
        self.assertEqual(release.STATE.as_posix(), "/var/lib/trixus-hml-release")
        self.assertEqual(release.APP.as_posix(), "/opt/trixus-hml/app")
        self.assertEqual(release.STORAGE.as_posix(), "/srv/trixus-hml-data")
        self.assertEqual(release.WEBHOOK_URL,
                         "https://api-hom.trixus.com.br/api/webhooks/evolution")
        self.assertEqual(len(release.WEBHOOK_EVENTS), 5)

    def test_request_accepts_only_plan_or_deploy_and_bounded_archive(self):
        valid = ["plan", SHA, "b" * 64, "10"]
        self.assertEqual(release.parse_request(valid)[-1], 10)
        for index, value in ((0, "reset"), (1, SHA + ";id"), (2, "../digest"),
                             (3, "0"), (3, str(release.MAX_ARCHIVE + 1))):
            changed = valid.copy()
            changed[index] = value
            with self.subTest(value=value), self.assertRaises(release.CheckError):
                release.parse_request(changed)

    def test_receive_rejects_truncation_extra_bytes_and_changed_content(self):
        digest = hashlib.sha256(b"abc").hexdigest()
        for value in (b"ab", b"abcd", b"xyz"):
            with temporary_directory() as folder, self.assertRaises(release.CheckError):
                release.receive(io.BytesIO(value), Path(folder) / "input", digest, 3)

    def test_archive_allows_only_three_hml_tags(self):
        with temporary_directory() as folder:
            source, target = Path(folder) / "in.tar", Path(folder) / "out.tar.gz"
            make_archive(source)
            release.normalize_archive(source, target, SHA)
            with tarfile.open(target) as archive:
                manifest = json.load(archive.extractfile("manifest.json"))
            self.assertEqual({tag for item in manifest for tag in item["RepoTags"]},
                             {f"trixus-hml-release/{name}:{SHA}" for name in release.SERVICES})
        with temporary_directory() as folder, self.assertRaises(release.CheckError):
            source = Path(folder) / "bad.tar"
            make_archive(source, [f"trixus-release/{name}:{SHA}" for name in release.SERVICES])
            release.normalize_archive(source, Path(folder) / "out.tar.gz", SHA)

    def test_config_rejects_wrong_project_webhook_storage_and_workers(self):
        good = config()
        self.assertEqual(release.validate_config(good), {"backend": "3002", "frontend": "4174"})
        mutations = (
            lambda value: value.update(name="trixus-vps"),
            lambda value: value["services"]["backend"]["environment"].update(
                EVOLUTION_WEBHOOK_PUBLIC_URL="https://hom.trixus.com.br/api/webhooks/evolution"),
            lambda value: value["services"]["backend"]["volumes"][0].update(
                source="/srv/trixus-data"),
            lambda value: value["services"]["backend"]["environment"].update(
                TRIXUS_HISTORY_IMPORT_WORKER_ENABLED="true"),
        )
        for mutation in mutations:
            changed = copy.deepcopy(good)
            mutation(changed)
            with self.assertRaises(release.CheckError):
                release.validate_config(changed)

    def test_generated_compose_changes_only_application_images(self):
        value = config()
        original = copy.deepcopy(value)
        images = {name: f"trixus-hml-release/{name}:{SHA}" for name in release.SERVICES}
        with temporary_directory() as folder:
            command = release.compose_file(value, images, Path(folder) / "compose.json")
            generated = json.loads((Path(folder) / "compose.json").read_text())
        self.assertEqual(value, original)
        for service in release.INFRASTRUCTURE + ("evolution-api",):
            self.assertEqual(generated["services"][service], original["services"][service])
        for service in release.SERVICES:
            self.assertEqual(generated["services"][service]["image"], images[service])
            self.assertNotIn("build", generated["services"][service])
        self.assertIn("trixus-hml", command)
        self.assertEqual(generated["services"]["postgres"]["healthcheck"]["test"][1],
                         "pg_isready -U $${POSTGRES_USER}")

    def test_compose_rejects_single_dollar_in_container_command(self):
        value = config()
        value["services"]["postgres"]["healthcheck"]["test"][1] = (
            "pg_isready -U ${POSTGRES_USER}"
        )
        with self.assertRaises(release.CheckError):
            release.compose_json(value)

    def test_runner_contains_no_database_reset_seed_or_production_compose(self):
        source = Path(release.__file__).read_text(encoding="utf-8")
        for forbidden in ("prisma migrate reset", "prisma db push", "prisma:seed",
                          'PROJECT = "trixus-vps"', '/opt/trixus/app'):
            self.assertNotIn(forbidden, source)
        self.assertNotIn('"down"', source)
        self.assertNotIn('"--volumes"', source)

    def test_partial_stop_failure_restarts_every_writer_and_clears_owned_marker(self):
        value = config()
        apps = {
            "frontend": ("frontend-id", "sha256:frontend", "started"),
            "backend": ("backend-id", "sha256:backend", "started"),
            "evolution-api": ("evolution-id", "sha256:evolution", "started"),
        }
        commands = []

        def fake_command(args, **_kwargs):
            commands.append(args)
            if "--preflight-only" in args:
                return json.dumps({
                    "code": "CONTACT_CUSTOM_FIELD_IDENTITY_PREFLIGHT_OK",
                    "reconciliationRequired": False,
                })
            if args[:3] == ["/usr/bin/docker", "stop", "-t"] and args[-1] == "backend-id":
                raise release.CheckError("stop failed")
            return ""

        with temporary_directory() as folder:
            release_dir = Path(folder)
            original_state = release.STATE
            release.STATE = release_dir
            marker = release.STATE / "recovery-required"
            try:
                with patch.object(release, "command", side_effect=fake_command), \
                     patch.object(release, "healthy_apps"), \
                     patch.object(release, "check_protected"), \
                     patch.object(release, "production_fingerprint", return_value={}), \
                     patch.object(release.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run, \
                     self.assertRaises(release.CheckError):
                    release.publish(value, {"backend": "3002", "frontend": "4174"}, apps,
                                    {}, {}, SHA, release_dir)
                starts = [call.args[0][-1] for call in run.call_args_list
                          if call.args[0][:2] == ["/usr/bin/docker", "start"]]
                self.assertEqual(starts, ["evolution-id", "backend-id", "frontend-id"])
                self.assertFalse(marker.exists())
                self.assertEqual((release_dir / "status.txt").read_text().strip(),
                                 "HML_FALHA_ANTES_DA_MIGRACAO_APLICACAO_ANTERIOR_REINICIADA")
            finally:
                release.STATE = original_state

    def test_post_migration_failure_stops_evolution_and_application(self):
        value = config()
        apps = {
            "frontend": ("frontend-id", "sha256:frontend", "started"),
            "backend": ("backend-id", "sha256:backend", "started"),
            "evolution-api": ("evolution-id", "sha256:evolution", "started"),
        }

        def fake_command(args, **_kwargs):
            if "--preflight-only" in args:
                return json.dumps({
                    "code": "CONTACT_CUSTOM_FIELD_IDENTITY_PREFLIGHT_OK",
                    "reconciliationRequired": False,
                })
            if "up" in args:
                raise release.CheckError("publish failed")
            return ""

        with temporary_directory() as folder:
            release_dir = Path(folder)
            original_state = release.STATE
            release.STATE = release_dir
            marker = release.STATE / "recovery-required"
            try:
                with patch.object(release, "command", side_effect=fake_command), \
                     patch.object(release, "backup_state"), \
                     patch.object(release, "check_protected"), \
                     patch.object(release, "production_fingerprint", return_value={}), \
                     patch.object(release.subprocess, "run", return_value=SimpleNamespace(returncode=0)) as run, \
                     self.assertRaises(release.CheckError):
                    release.publish(value, {"backend": "3002", "frontend": "4174"}, apps,
                                    {}, {}, SHA, release_dir)
                commands = [call.args[0] for call in run.call_args_list]
                self.assertIn(
                    ["/usr/bin/docker", "stop", "-t", "30", "evolution-id"], commands
                )
                self.assertTrue(any(command[-2:] == ["frontend", "backend"]
                                    and "stop" in command for command in commands))
                self.assertTrue(marker.exists())
                self.assertEqual((release_dir / "status.txt").read_text().strip(),
                                 "HML_RECUPERACAO_MANUAL_NECESSARIA")
            finally:
                release.STATE = original_state

    def test_failed_disposable_restore_always_removes_owned_container(self):
        with temporary_directory() as folder:
            dump = Path(folder) / "database.dump"
            dump.write_bytes(b"dump")

            def fake_command(args, **_kwargs):
                if "pg_restore" in args:
                    raise release.CheckError("restore failed")
                return ""

            process_results = [SimpleNamespace(returncode=1), SimpleNamespace(returncode=0),
                               SimpleNamespace(returncode=0)]
            with patch.object(release, "command", side_effect=fake_command), \
                 patch.object(release.subprocess, "run", side_effect=process_results) as run, \
                 self.assertRaises(release.CheckError):
                release._verify_dump_restore("postgres:16-alpine", dump, "public", "owned")
            self.assertEqual(run.call_args_list[-1].args[0],
                             ["/usr/bin/docker", "rm", "-f", "owned-postgres"])


if __name__ == "__main__":
    unittest.main()
