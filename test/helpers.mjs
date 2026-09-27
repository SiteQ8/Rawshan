import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const bundle = JSON.parse(readFileSync(join(root, 'docs/data/bundle.json'), 'utf8'));
export const ARABIC = /[\u0600-\u06FF]/;
const stripPlaceholders = (s) => s.replace(/\{[^}]*\}/g, '');
export const sentencePeriods = (s) => (stripPlaceholders(s).match(/\./g) || []).length;
export const digits = (s) => (stripPlaceholders(s).match(/\d+/g) || []).sort();

// An Arabic sentence: ends with a single period, no Arabic or Latin mid-clause punctuation, Latin tokens start uppercase or digit.
export function arabicSentence(ar, where) {
  assert.ok(ARABIC.test(ar), `${where}: Arabic text expected`);
  assert.ok(ar.trim().endsWith('.'), `${where}: must end with a period`);
  assert.equal(sentencePeriods(ar), 1, `${where}: a period may only close the sentence`);
  assert.ok(!/[،؛]/.test(ar), `${where}: no Arabic comma or semicolon`);
  assert.ok(!/[,;:]/.test(stripPlaceholders(ar)), `${where}: join clauses with connectives, not Latin punctuation`);
  for (const tok of stripPlaceholders(ar).match(/[A-Za-z][A-Za-z0-9/&+-]*/g) || []) assert.match(tok, /^[A-Z0-9]/, `${where}: stray lowercase Latin word "${tok}"`);
}

// An Arabic label (title): no periods at all, same punctuation and token rules.
export function arabicLabel(ar, where) {
  assert.ok(ARABIC.test(ar), `${where}: Arabic text expected`);
  assert.equal(sentencePeriods(ar), 0, `${where}: a title should carry no period`);
  assert.ok(!/[،؛]/.test(ar), `${where}: no Arabic comma or semicolon`);
  assert.ok(!/[,;:]/.test(ar), `${where}: no Latin punctuation in a title`);
  for (const tok of ar.match(/[A-Za-z][A-Za-z0-9/&+-]*/g) || []) assert.match(tok, /^[A-Z0-9]/, `${where}: stray lowercase Latin word "${tok}"`);
}

export function pair(en, ar, where) {
  assert.ok(en && ar, `${where}: both languages required`);
  assert.ok(!ARABIC.test(en), `${where}: English text contains Arabic`);
  assert.deepEqual(digits(ar), digits(en), `${where}: every number must survive translation`);
}

const TEXT = new Set(['.js', '.mjs', '.json', '.md', '.html', '.css', '.txt', '.xml', '.svg', '.yml', '']);
export function textFiles(dir = root) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules', 'source'].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...textFiles(p));
    else if (TEXT.has(extname(name)) || ['LICENSE', 'NOTICE', 'CNAME', '.gitignore', '.nojekyll'].includes(name)) out.push(relative(root, p));
  }
  return out;
}
