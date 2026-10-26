"""Read-only provenance and package checks for promotion of an existing build."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.request


class PromotionError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise PromotionError(message)


def api(path):
    request = urllib.request.Request(
        'https://api.github.com/repos/' + os.environ['GITHUB_REPOSITORY'] + '/' + path,
        headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
                 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def verify_run(run, jobs, sha, workflow, kind):
    require(run.get('head_sha') == sha, 'Run commit differs from selected commit')
    require(run.get('path', '').split('@')[0] == workflow, 'Unexpected source workflow')
    require(run.get('status') == 'completed' and run.get('conclusion') == 'success',
            'Source run must have completed successfully')
    require(run.get('event') in ('workflow_dispatch', 'push'), 'PR runs cannot be promoted')
    expected = 'build' if kind == 'build' else 'release'
    matches = [job for job in jobs if job.get('name') == expected]
    require(len(matches) == 1 and matches[0].get('conclusion') == 'success',
            'Required source job did not succeed')
    if kind == 'build':
        require(all(j.get('conclusion') == 'skipped' for j in jobs if j.get('name') == 'release'),
                'Source must be a build-only run')


def verify_package(folder, sha):
    require(re.fullmatch('[0-9a-f]{40}', sha), 'Invalid commit')
    names = {'commit.txt', 'images.txt', 'images.tar.gz', 'SHA256SUMS'}
    require({p.name for p in folder.iterdir()} == names, 'Unexpected package files')
    require(all((folder / n).is_file() and not (folder / n).is_symlink() for n in names),
            'Package contains non-regular files')
    require((folder / 'commit.txt').read_text().strip() == sha, 'Package commit differs')
    checks = {}
    for line in (folder / 'SHA256SUMS').read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  (images\.tar\.gz|images\.txt|commit\.txt)', line)
        require(match is not None, 'Invalid checksum manifest')
        digest, name = match.groups()
        require(name not in checks, 'Duplicate checksum entry')
        checks[name] = digest
    require(set(checks) == names - {'SHA256SUMS'}, 'Incomplete checksum manifest')
    for name, digest in checks.items():
        with (folder / name).open('rb') as stream:
            require(hashlib.file_digest(stream, 'sha256').hexdigest() == digest,
                    'Package checksum differs')
    return checks['images.tar.gz']


def verify_receipt(receipt, environment, sha, source_run, digest):
    require(receipt == {'environment': environment, 'commit': sha,
                        'source_run_id': source_run, 'archive_sha256': digest},
            'Plan did not certify this exact build package')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=('run', 'package', 'receipt'))
    parser.add_argument('--environment', choices=('homologation', 'production'), required=True)
    parser.add_argument('--run-id')
    parser.add_argument('--kind', choices=('build', 'plan'), default='build')
    parser.add_argument('--receipt')
    args = parser.parse_args()
    sha = os.environ['GITHUB_SHA']
    source = os.environ.get('SOURCE_RUN_ID', '')
    require(re.fullmatch('[1-9][0-9]*', source), 'A source build run ID is required')
    if args.command == 'run':
        require(args.run_id and re.fullmatch('[1-9][0-9]*', args.run_id), 'Invalid run ID')
        run = api('actions/runs/' + args.run_id)
        jobs = []
        page = 1
        while True:
            batch = api(f'actions/runs/{args.run_id}/jobs?per_page=100&page={page}')['jobs']
            jobs.extend(batch)
            if len(batch) < 100:
                break
            page += 1
        workflow = '.github/workflows/build-' + args.environment + '.yml'
        verify_run(run, jobs, sha, workflow, args.kind)
    else:
        digest = verify_package(Path('release'), sha)
        if args.command == 'receipt':
            Path('plan-receipt').mkdir()
            Path('plan-receipt/plan.json').write_text(json.dumps({
                'environment': args.environment, 'commit': sha,
                'source_run_id': source, 'archive_sha256': digest}) + '\n')
        elif args.receipt:
            verify_receipt(json.loads(Path(args.receipt).read_text()),
                           args.environment, sha, source, digest)
    print('Promotion provenance verified')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Never print HTTP headers, responses, tokens or environment values.
        raise SystemExit('Promotion blocked: review run provenance, package and plan receipt') from None
