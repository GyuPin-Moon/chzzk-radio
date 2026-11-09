import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../extension/', import.meta.url).pathname;
const errors = [];

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
];
for (const file of referenced) {
  if (!existsSync(join(root, file))) errors.push(`manifest.json references a missing file: ${file}`);
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) errors.push(`manifest version is not x.y.z: ${manifest.version}`);

const files = readdirSync(root, { recursive: true }).map(String);
for (const page of files.filter(f => f.endsWith('.html'))) {
  const html = readFileSync(join(root, page), 'utf8');
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
    if (!existsSync(join(root, page, '..', ref))) errors.push(`${page} references a missing file: ${ref}`);
  }
}

// Remote code, string-to-code and HTML injection sinks are not used anywhere in the extension.
const forbidden = [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML/, /\beval\s*\(/, /new Function\s*\(/, /http:\/\//];
for (const script of files.filter(f => f.endsWith('.js'))) {
  const path = join(root, script);
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) errors.push(`${script} has a syntax error:\n${result.stderr}`);
  const source = readFileSync(path, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(source)) errors.push(`${script} uses a forbidden pattern: ${pattern}`);
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`ok: manifest ${manifest.version}, ${files.length} files checked`);
