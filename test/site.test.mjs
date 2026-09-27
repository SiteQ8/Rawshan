import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { root, bundle as b } from './helpers.mjs';

const html = readFileSync(join(root, 'docs/index.html'), 'utf8');
const app = readFileSync(join(root, 'docs/assets/app.js'), 'utf8');

test('page declares a strict, self-only CSP', () => {
  assert.match(html, /Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'/);
  assert.match(html, /object-src 'none'/);
  assert.match(html, /base-uri 'self'/);
});

test('page is right-to-left Arabic by default and links its own assets', () => {
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /assets\/app\.js/);
  assert.match(html, /assets\/styles\.css/);
  assert.match(html, /assets\/fonts\.css/);
  assert.match(html, /favicon\.svg/);
});

test('no inline scripts or inline style attributes in the page', () => {
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(html), 'no inline <script> with code');
  assert.ok(!/\sstyle=/.test(html), 'no inline style attributes');
  assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html), 'no inline event handlers');
});

test('app applies inline widths through the CSSOM, not style attributes', () => {
  assert.match(app, /style\.setProperty\(/);
  assert.ok(!/\.setAttribute\(\s*['"]style['"]/.test(app), 'never sets a style attribute');
});

test('CNAME matches the project domain and Pages guard files exist', () => {
  const cname = readFileSync(join(root, 'docs/CNAME'), 'utf8').trim();
  assert.equal(cname, b.project.domain);
  assert.ok(existsSync(join(root, 'docs/.nojekyll')), '.nojekyll present');
  assert.ok(existsSync(join(root, 'docs/robots.txt')), 'robots.txt present');
  assert.ok(existsSync(join(root, 'docs/sitemap.xml')), 'sitemap.xml present');
  assert.ok(existsSync(join(root, 'docs/data/bundle.json')), 'bundle present');
});

test('the every-visit disclaimer is shown unconditionally', () => {
  assert.match(app, /showDisclaimer\(\)/);
  // no acknowledgement gate stored in localStorage that would suppress it
  assert.ok(!/disclaimer.*localStorage|localStorage.*disclaimer/i.test(app), 'popup is not gated by storage');
});
