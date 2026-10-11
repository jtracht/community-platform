#!/usr/bin/env bash
set -euo pipefail

# Linux/GNU tar build step. Only the installation payload is copied.
root="$(cd "${1:-.}" && pwd)"
output="${2:?Output directory required}"
mkdir -p "$output"
output="$(cd "$output" && pwd)"
stage="$(mktemp -d)"
trap 'rm -rf -- "$stage"' EXIT

: "${RELEASE_COMMIT:?Full source commit required}"
: "${SOURCE_DATE_EPOCH:?Source commit timestamp required}"
export RELEASE_COMMIT SOURCE_DATE_EPOCH

for path in dist apps/public apps/admin packages/database/migrations scripts/build-assets.mjs docs package.json package-lock.json .env.example LICENSE README.md CONTRIBUTING.md SECURITY.md; do
  test -e "$root/$path"
  mkdir -p "$stage/$(dirname "$path")"
  cp -R -- "$root/$path" "$stage/$path"
done

if find "$stage" \( -type l -o -name .env -o \( -name '.env.*' ! -name .env.example \) -o -name '*.pem' -o -name '*.key' -o -name node_modules -o -name .git \) -print -quit | grep -q .; then
  echo 'Private files or symbolic links found in release payload' >&2
  exit 1
fi

node --input-type=module - "$stage" <<'JS'
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.argv[2];
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^[a-f0-9]{40}$/.test(process.env.RELEASE_COMMIT)) throw new Error('Invalid source commit');
if (!/^\d+$/.test(process.env.SOURCE_DATE_EPOCH)) throw new Error('Invalid source timestamp');
const manifest = {
  name: pkg.name, version: pkg.version, commit: process.env.RELEASE_COMMIT,
  sourceDate: new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString(),
  node: pkg.engines.node, configurationIncluded: false,
};
await writeFile(join(root, 'RELEASE.json'), JSON.stringify(manifest, null, 2) + '\n');
JS

tar --sort=name --mtime="@$SOURCE_DATE_EPOCH" --owner=0 --group=0 --numeric-owner -C "$stage" -cf - . | gzip -n > "$output/community-platform.tar.gz"
(cd "$output" && sha256sum community-platform.tar.gz > SHA256SUMS)
cp "$stage/RELEASE.json" "$output/RELEASE.json"
echo "Installation package created in $output"
