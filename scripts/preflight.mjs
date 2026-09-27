// Preflight: rebuild the bundle, run structural guards, then the test suite.
// Usage: node scripts/preflight.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const problems = [];
const run = (args, label) => {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) problems.push(`${label} failed:\n${r.stdout}\n${r.stderr}`);
  return r;
};

// 1) fresh build
run([join(root, 'scripts/build.mjs')], 'build');

// 2) guard files
for (const f of ['docs/.nojekyll', 'docs/CNAME', 'docs/robots.txt', 'docs/sitemap.xml', 'docs/data/bundle.json', 'LICENSE', 'NOTICE.md', 'README.md', 'package.json']) {
  if (!existsSync(join(root, f))) problems.push(`missing ${f}`);
}

// 3) CNAME matches the project domain
const bundle = JSON.parse(readFileSync(join(root, 'docs/data/bundle.json'), 'utf8'));
const cname = readFileSync(join(root, 'docs/CNAME'), 'utf8').trim();
if (cname !== bundle.project.domain) problems.push(`CNAME ${cname} does not match domain ${bundle.project.domain}`);

// 4) no unfinished markers left in shipped text
const TEXT = new Set(['.js', '.mjs', '.json', '.md', '.html', '.css']);
const marker = /\b(TODO|FIXME)\b/;
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.git', 'source'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (TEXT.has(extname(name)) && name !== 'preflight.mjs') {
      const s = readFileSync(p, 'utf8');
      if (marker.test(s)) problems.push(`unfinished marker in ${p}`);
    }
  }
}
walk(root);

// 5) MCP selftest
run([join(root, 'mcp/server.mjs'), '--selftest'], 'mcp selftest');

// 6) the test suite
const testFiles = readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => join(root, 'test', f));
const t = run(['--test', ...testFiles], 'tests');

if (problems.length) {
  console.error('PREFLIGHT FAILED');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('preflight passed');
console.log(t.stdout.split('\n').filter((l) => /^# (tests|pass|fail|suites)/.test(l)).join('\n'));
