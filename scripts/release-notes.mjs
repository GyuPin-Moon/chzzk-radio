import { readFileSync } from 'node:fs';

const version = process.argv[2];
const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split('\n');
const start = lines.findIndex(line => line.startsWith(`## [${version}]`));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
console.log(lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim());
