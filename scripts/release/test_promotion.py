import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from promotion import PromotionError, verify_run, verify_package, verify_receipt

SHA = 'a' * 40
WORKFLOW = '.github/workflows/build-production.yml'


class PromotionTest(unittest.TestCase):
    def test_run_rejects_other_commit_workflow_failed_or_pr(self):
        run = dict(head_sha=SHA, path=WORKFLOW, status='completed', conclusion='success', event='workflow_dispatch')
        jobs = [dict(name='build', conclusion='success'), dict(name='release', conclusion='skipped')]
        verify_run(run, jobs, SHA, WORKFLOW, 'build')
        for field, value in [('head_sha', 'b' * 40), ('path', 'other.yml'),
                             ('conclusion', 'failure'), ('status', 'in_progress'), ('event', 'pull_request')]:
            with self.subTest(field=field), self.assertRaises(PromotionError):
                verify_run(dict(run, **{field: value}), jobs, SHA, WORKFLOW, 'build')
        with self.assertRaises(PromotionError):
            verify_run(run, [dict(name='build', conclusion='success'),
                             dict(name='release', conclusion='success')], SHA, WORKFLOW, 'build')
        with self.assertRaises(PromotionError):
            verify_run(run, [], SHA, WORKFLOW, 'build')

    def test_plan_run_requires_one_successful_release_job(self):
        run = dict(head_sha=SHA, path=WORKFLOW, status='completed', conclusion='success', event='workflow_dispatch')
        verify_run(run, [dict(name='release', conclusion='success')], SHA, WORKFLOW, 'plan')
        for jobs in ([], [dict(name='release', conclusion='failure')],
                     [dict(name='release', conclusion='success')] * 2):
            with self.assertRaises(PromotionError):
                verify_run(run, jobs, SHA, WORKFLOW, 'plan')

    def test_package_rejects_symlink_and_duplicate_or_missing_checksums(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for name, content in {'commit.txt': SHA, 'images.txt': 'images', 'images.tar.gz': 'archive'}.items():
                (folder / name).write_text(content)
            lines = [hashlib.sha256((folder/n).read_bytes()).hexdigest() + '  ' + n + '\n'
                     for n in ['commit.txt', 'images.txt', 'images.tar.gz']]
            for manifest in (lines[:2], lines + [lines[0]]):
                (folder / 'SHA256SUMS').write_text(''.join(manifest))
                with self.assertRaises(PromotionError):
                    verify_package(folder, SHA)
            (folder / 'SHA256SUMS').write_text(''.join(lines))
            (folder / 'images.txt').unlink()
            (folder / 'images.txt').symlink_to(folder / 'commit.txt')
            with self.assertRaises(PromotionError):
                verify_package(folder, SHA)

    def test_package_rejects_tampering_extra_files_and_changed_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            payloads = {'commit.txt': (SHA + '\n').encode(), 'images.txt': b'images', 'images.tar.gz': b'archive'}
            for name, content in payloads.items():
                (folder / name).write_bytes(content)
            (folder / 'SHA256SUMS').write_text(''.join(hashlib.sha256(c).hexdigest() + '  ' + n + '\n' for n, c in payloads.items()))
            self.assertEqual(verify_package(folder, SHA), hashlib.sha256(b'archive').hexdigest())
            with self.assertRaises(PromotionError):
                verify_package(folder, 'b' * 40)
            (folder / 'images.tar.gz').write_bytes(b'tampered')
            with self.assertRaises(PromotionError):
                verify_package(folder, SHA)
            (folder / 'unexpected').write_text('extra')
            with self.assertRaises(PromotionError):
                verify_package(folder, SHA)

    def test_receipt_binds_environment_commit_source_and_archive(self):
        receipt = dict(environment='production', commit=SHA, source_run_id='123', archive_sha256='b'*64)
        verify_receipt(receipt, 'production', SHA, '123', 'b'*64)
        for args in [('homologation', SHA, '123', 'b'*64), ('production', 'c'*40, '123', 'b'*64),
                     ('production', SHA, '456', 'b'*64), ('production', SHA, '123', 'c'*64)]:
            with self.assertRaises(PromotionError):
                verify_receipt(receipt, *args)


if __name__ == '__main__':
    unittest.main()
