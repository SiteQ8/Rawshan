import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundle as b, root, ARABIC, sentencePeriods, digits, textFiles, arabicSentence, arabicLabel, pair } from './helpers.mjs';

test('bundle is generated from data/src and up to date', () => {
  const r = spawnSync(process.execPath, [join(root, 'scripts/build.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('structure matches the official ECC document', () => {
  assert.equal(b.domains.length, 4);
  assert.equal(b.subdomains.length, 28);
  assert.equal(b.controls.length, 108);
  const perDomain = { 1: 35, 2: 61, 3: 4, 4: 8 };
  for (const [d, n] of Object.entries(perDomain)) {
    assert.equal(b.controls.filter((c) => c.id.split('-')[0] === d).length, n, `domain ${d} control count`);
  }
  assert.equal(new Set(b.controls.map((c) => c.id)).size, 108, 'control ids unique');
  const subIds = new Set(b.subdomains.map((s) => s.id));
  for (const c of b.controls) {
    assert.ok(subIds.has(c.subdomain), `${c.id} subdomain exists`);
    assert.equal(c.id.split('-').slice(0, 2).join('-'), c.subdomain, `${c.id} matches its subdomain`);
    assert.ok(c.page >= 1 && c.page <= 120, `${c.id} page in range`);
  }
});

test('every control has bilingual summaries that follow the Arabic writing rules', () => {
  for (const c of b.controls) {
    pair(c.summary_en, c.summary_ar, c.id);
    arabicSentence(c.summary_ar, c.id);
  }
});

test('domains and subdomains are bilingual and follow the rules', () => {
  for (const d of b.domains) {
    assert.ok(d.title_en && !ARABIC.test(d.title_en), `${d.id} title en`);
    arabicLabel(d.title_ar, `${d.id} title`);
  }
  for (const s of b.subdomains) {
    assert.ok(s.title_en && !ARABIC.test(s.title_en), `${s.id} title en`);
    arabicLabel(s.title_ar, `${s.id} title`);
    pair(s.objective_en, s.objective_ar, `${s.id} objective`);
    arabicSentence(s.objective_ar, `${s.id} objective`);
    assert.ok(['1', '2', '3', '4'].includes(s.domain), `${s.id} domain valid`);
  }
});

test('crosswalk covers every subdomain with plausible references', () => {
  const subIds = new Set(b.subdomains.map((s) => s.id));
  const covered = new Set(b.crosswalk.map((x) => x.subdomain));
  for (const s of subIds) assert.ok(covered.has(s), `crosswalk covers ${s}`);
  for (const x of b.crosswalk) {
    assert.ok(subIds.has(x.subdomain), `crosswalk subdomain ${x.subdomain} exists`);
    assert.ok(x.iso.length || x.csf.length, `${x.subdomain} has at least one mapping`);
    for (const r of x.iso) assert.match(r, /^(A\.)?\d+(\.\d+)*$/, `${x.subdomain} iso ref ${r}`);
    for (const r of x.csf) assert.match(r, /^[A-Z]{2}\.[A-Z]{2}$/, `${x.subdomain} csf ref ${r}`);
  }
});

test('PDPL obligations, families and sources are bilingual and follow the rules', () => {
  assert.equal(b.pdpl.length, 12);
  for (const o of b.pdpl) { pair(o.en, o.ar, o.id); arabicSentence(o.ar, o.id); }
  assert.equal(b.families.length, 6);
  assert.equal(b.families.filter((f) => f.baseline).length, 1);
  for (const f of b.families) {
    pair(f.en, f.ar, `${f.abbr} name`);
    arabicLabel(f.ar, `${f.abbr} name`);
    pair(f.who_en, f.who_ar, `${f.abbr} who`);
    arabicSentence(f.who_ar, `${f.abbr} who`);
    pair(f.note_en, f.note_ar, `${f.abbr} note`);
    arabicSentence(f.note_ar, `${f.abbr} note`);
  }
  assert.equal(b.sources.sources.length, 6);
  pair(b.sources.note.en, b.sources.note.ar, 'sources note');
  arabicSentence(b.sources.note.ar, 'sources note');
  for (const s of b.sources.sources) {
    pair(s.en, s.ar, `${s.id} title`);
    arabicLabel(s.ar, `${s.id} title`);
    pair(s.use.en, s.use.ar, `${s.id} use`);
    arabicSentence(s.use.ar, `${s.id} use`);
    assert.match(s.url, /^https:\/\//, `${s.id} url`);
  }
});

test('UI strings exist in both languages and Arabic follows the rules', () => {
  for (const [k, v] of Object.entries(b.ui)) {
    assert.ok(v.en && v.ar, k);
    assert.deepEqual(digits(v.ar), digits(v.en), `${k}: numbers match`);
    if (ARABIC.test(v.ar)) {
      assert.ok(!/[،؛]/.test(v.ar), `${k}: no Arabic comma or semicolon`);
      const p = sentencePeriods(v.ar);
      if (p) { assert.equal(p, 1, `${k}: one sentence only`); assert.ok(v.ar.trim().endsWith('.'), `${k}: period only at the end`); }
    }
  }
});

test('the project identity is correct', () => {
  assert.equal(b.project.owner, 'SiteQ8');
  assert.equal(b.project.repo, 'Rawshan');
  assert.equal(b.project.domain, 'rawshan.3li.info');
  assert.equal(b.project.name_en, 'Rawshan');
  assert.equal(b.project.name_ar, 'روشن');
});

test('repository text has no Unicode dashes, no excluded names and no attribution to an AI assistant', () => {
  const dash = /[\u2012\u2013\u2014\u2015\u2212]/;
  const words = [['n', 'b', 'k'], ['cl', 'aude'], ['anth', 'ropic']].map((w) => new RegExp(`\\b${w.join('')}`, 'i'));
  for (const f of textFiles()) {
    const s = readFileSync(join(root, f), 'utf8');
    assert.ok(!dash.test(s), `${f} contains a Unicode dash`);
    for (const w of words) assert.ok(!w.test(s), `${f} contains an excluded word`);
  }
});
