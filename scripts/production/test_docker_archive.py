"""Opt-in real Docker save/normalize/load test, confined to synthetic image tags."""
import hashlib
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from release import SERVICES, compose_file, normalize_archive


@unittest.skipUnless(os.environ.get('TRIXUS_TEST_DOCKER_ARCHIVE') == '1', 'Requires local Docker opt-in')
class DockerArchiveTest(unittest.TestCase):
    def test_generated_compose_is_accepted_without_build_or_infrastructure_changes(self):
        root = Path(__file__).resolve().parents[2]
        env = dict(os.environ, TRIXUS_ENV_FILE='.env.vps.example')
        value = json.loads(subprocess.check_output([
            'docker', 'compose', '--env-file', '.env.vps.example', '-f', 'docker-compose.vps.yml',
            '--profile', 'release', 'config', '--format', 'json'], cwd=root, env=env, timeout=30))
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'compose.json'
            compose_file(value, {name: f'trixus-release/{name}:' + 'a' * 40 for name in SERVICES}, path)
            generated = json.loads(subprocess.check_output([
                'docker', 'compose', '--project-directory', str(root), '-f', str(path),
                '--profile', 'release', 'config', '--format', 'json'], timeout=30))
            for name in ('postgres', 'redis', 'evolution-api', 'evolution-postgres', 'evolution-redis'):
                self.assertEqual(generated['services'][name], value['services'][name])
            for name in SERVICES:
                self.assertNotIn('build', generated['services'][name])
                self.assertEqual(generated['services'][name]['environment'], value['services'][name]['environment'])

    def test_roundtrip_three_distinct_images(self):
        sha = hashlib.sha1(os.urandom(32)).hexdigest()
        tags = [f'trixus-release/{name}:{sha}' for name in SERVICES]
        def docker(*args):
            return subprocess.check_output(['docker', *args], stderr=subprocess.STDOUT, timeout=180).decode().strip()
        try:
            with tempfile.TemporaryDirectory() as folder:
                folder = Path(folder)
                for name, tag in zip(SERVICES, tags):
                    (folder / 'Dockerfile').write_text(f'FROM oven/bun:1.3.14-alpine\nLABEL trixus-test={name}\n')
                    docker('build', '--pull=false', '-t', tag, str(folder))
                def content(tag):
                    image = json.loads(docker('image', 'inspect', tag))[0]
                    # OCI conversion can change the containerd manifest digest.
                    return {key: image[key] for key in ('Config', 'RootFS', 'Architecture', 'Os')}
                original = [content(tag) for tag in tags]
                docker('save', '-o', str(folder / 'source.tar'), *tags)
                normalize_archive(folder / 'source.tar', folder / 'clean.tar.gz', sha)
                docker('image', 'rm', *tags)
                docker('load', '-i', str(folder / 'clean.tar.gz'))
                self.assertEqual(original, [content(tag) for tag in tags])
                for tag in tags:
                    self.assertEqual(docker('run', '--rm', '--network', 'none', '--memory', '128m',
                                            '--cap-drop', 'ALL', tag, 'bun', '--version'), '1.3.14')
        finally:
            subprocess.run(['docker', 'image', 'rm', *tags], capture_output=True, timeout=60)


if __name__ == '__main__':
    unittest.main()
