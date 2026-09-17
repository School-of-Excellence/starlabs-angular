#!/usr/bin/env python3
"""hook-diff.py — do the screen's data-testid hooks and the suite's specs agree?

Mirrors what the readiness gate measures (starlabs-e2e-tests scripts/readiness/lib.cjs TESTID_REF):
only LITERAL ids count on both sides — anything containing ${...} is invisible to it, which is the
usual reason a gate says "selectors gone from the app" about hooks you can see rendering.

    python3 hook-diff.py src/app/AppEngagement/interim-report-log modes
    python3 hook-diff.py src/app/Workshop workshops --hub /path/to/starlabs-e2e-tests

Exit code 0 = aligned, 1 = a mismatch the gate will block on.
"""
import argparse
import glob
import os
import re
import sys

LITERAL = r'''["']([^"'${}]+)["']'''
DECLARED = re.compile(r'data-testid\s*=\s*' + LITERAL)   # the app declares
REFERENCED = re.compile(r'getByTestId\(\s*' + LITERAL)   # the specs reference
VALID_ID = re.compile(r'^[a-z0-9][a-z0-9-]*$')
DEFAULT_HUB = '/Users/macbook/Projects/Functions/starlabs-e2e-tests'


def ids_in(paths, pattern):
    found = set()
    for path in paths:
        with open(path, encoding='utf-8', errors='ignore') as fh:
            found |= set(pattern.findall(fh.read()))
    return {i for i in found if VALID_ID.match(i)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('app_dir', help='screen folder in starlabs-angular, e.g. src/app/AppEngagement/interim-report-log')
    ap.add_argument('suite', help='hub suite that owns it (its specDir), e.g. modes')
    ap.add_argument('--hub', default=os.environ.get('HUB_PATH', DEFAULT_HUB))
    args = ap.parse_args()

    app_files = glob.glob(f'{args.app_dir}/**/*.html', recursive=True) + \
                glob.glob(f'{args.app_dir}/**/*.ts', recursive=True)
    spec_files = glob.glob(os.path.join(args.hub, args.suite, '**', '*.spec.ts'), recursive=True)
    if not app_files:
        sys.exit(f'no app files under {args.app_dir}')
    if not spec_files:
        sys.exit(f'no specs under {os.path.join(args.hub, args.suite)}')

    declared = ids_in(app_files, DECLARED)
    referenced = ids_in(spec_files, REFERENCED)
    prefixes = tuple({i.split('-')[0] + '-' for i in declared})

    missing = sorted(i for i in referenced - declared if i.startswith(prefixes))
    unreferenced = sorted(declared - referenced)

    print(f'{len(declared)} hooks declared in {args.app_dir}')
    print(f'{len(spec_files)} spec files in {args.suite}\n')
    if missing:
        print(f'BLOCKED — the specs reference {len(missing)} id(s) the app does not declare literally:')
        print('  ' + '\n  '.join(missing))
        print('  → the hook was renamed/removed, or its data-testid is interpolated (${...}).\n')
    if unreferenced:
        print(f'BLOCKED — {len(unreferenced)} hook(s) no spec references:')
        print('  ' + '\n  '.join(unreferenced))
        print('  → drive them in a case, or register them in an ADDR test.fixme block.\n')
    if missing or unreferenced:
        return 1
    print('aligned — 0 referenced-but-missing, 0 unreferenced')
    return 0


if __name__ == '__main__':
    sys.exit(main())
