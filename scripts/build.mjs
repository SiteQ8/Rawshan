// Compiles data/src into docs/data/bundle.json, the single data file the site and MCP server read.
// Usage: node scripts/build.mjs          write the bundle
//        node scripts/build.mjs --check  exit 1 if the committed bundle is out of date
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(`data/src/${f}`, root), 'utf8'));
const errors = [];
const fail = (m) => errors.push(m);

const project = json('project.json');
const domains = json('domains.json').domains;
const subdomains = json('subdomains.json').subdomains;
const controls = json('controls.json').controls;
const crosswalk = json('crosswalk.json').crosswalk;
const families = json('families.json').families;
const pdpl = json('pdpl.json').obligations;
const sources = json('sources.json');
const ui = json('ui.json');

// Integrity checks
if (domains.length !== 4) fail(`expected 4 domains, got ${domains.length}`);
if (subdomains.length !== 28) fail(`expected 28 subdomains, got ${subdomains.length}`);
if (controls.length !== 108) fail(`expected 108 controls, got ${controls.length}`);

const domIds = new Set(domains.map((d) => d.id));
const subIds = new Set(subdomains.map((s) => s.id));
const ctlIds = controls.map((c) => c.id);
const seen = new Set();
for (const id of ctlIds) {
  if (seen.has(id)) fail(`duplicate control id ${id}`);
  seen.add(id);
}
for (const s of subdomains) if (!domIds.has(s.domain)) fail(`subdomain ${s.id} points to unknown domain ${s.domain}`);
for (const c of controls) {
  if (!subIds.has(c.subdomain)) fail(`control ${c.id} points to unknown subdomain ${c.subdomain}`);
  if (c.id.split('-').slice(0, 2).join('-') !== c.subdomain) fail(`control ${c.id} id does not match subdomain ${c.subdomain}`);
  if (!c.summary_en || !c.summary_en.trim()) fail(`control ${c.id} missing English summary`);
  if (!c.summary_ar || !c.summary_ar.trim()) fail(`control ${c.id} missing Arabic summary`);
}
const cwSubs = new Set(crosswalk.map((x) => x.subdomain));
for (const s of subIds) if (!cwSubs.has(s)) fail(`crosswalk missing subdomain ${s}`);
for (const x of crosswalk) if (!subIds.has(x.subdomain)) fail(`crosswalk references unknown subdomain ${x.subdomain}`);

if (errors.length) {
  console.error('build failed:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

const bundle = {
  schema: 'ecc-register/1',
  project,
  generated: new Date().toISOString().slice(0, 10),
  counts: { domains: domains.length, subdomains: subdomains.length, controls: controls.length },
  domains,
  subdomains,
  controls,
  crosswalk,
  families,
  pdpl,
  sources,
  ui,
};

const outUrl = new URL('docs/data/bundle.json', root);
const outText = JSON.stringify(bundle, null, 1) + '\n';

if (process.argv.includes('--check')) {
  if (!existsSync(outUrl)) {
    console.error('bundle.json is missing; run node scripts/build.mjs');
    process.exit(1);
  }
  const current = readFileSync(outUrl, 'utf8');
  // Compare everything except the generated date line.
  const strip = (t) => t.replace(/"generated": "[^"]*",/, '');
  if (strip(current) !== strip(outText)) {
    console.error('bundle.json is out of date; run node scripts/build.mjs');
    process.exit(1);
  }
  console.log('bundle.json is up to date');
  process.exit(0);
}

mkdirSync(new URL('docs/data/', root), { recursive: true });
writeFileSync(outUrl, outText);
console.log(`wrote docs/data/bundle.json  (${domains.length} domains, ${subdomains.length} subdomains, ${controls.length} controls)`);
