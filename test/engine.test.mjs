import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundle as b } from './helpers.mjs';
import * as core from '../docs/assets/core.js';

test('schema and statuses', () => {
  assert.equal(core.SCHEMA, 'ecc-register/1');
  assert.deepEqual(core.STATUSES, ['implemented', 'partial', 'not_implemented', 'not_applicable']);
});

test('maturity bands map at the thresholds', () => {
  assert.equal(core.band(null), null);
  assert.equal(core.band(0), 'initial');
  assert.equal(core.band(29), 'initial');
  assert.equal(core.band(30), 'developing');
  assert.equal(core.band(59), 'developing');
  assert.equal(core.band(60), 'defined');
  assert.equal(core.band(84), 'defined');
  assert.equal(core.band(85), 'managed');
  assert.equal(core.band(100), 'managed');
});

test('evaluate computes readiness over applicable controls only', () => {
  const a = { schema: core.SCHEMA, status: { '1-1-1': 'implemented', '1-1-2': 'partial', '1-1-3': 'not_implemented', '2-8-1': 'not_applicable' }, notes: {} };
  const ev = core.evaluate(b, a);
  // 3 applicable and assessed in domain 1: 1 + 0.5 + 0 = 1.5 / 3 = 50
  assert.equal(ev.overall.readiness, 50);
  assert.equal(ev.overall.band, 'developing');
  assert.equal(ev.overall.counts.implemented, 1);
  assert.equal(ev.overall.counts.partial, 1);
  assert.equal(ev.overall.counts.not_implemented, 1);
  assert.equal(ev.overall.counts.not_applicable, 1);
  assert.equal(ev.assessedTotal, 4);
  const d1 = ev.domains.find((d) => d.id === '1');
  assert.equal(d1.readiness, 50);
  assert.equal(d1.total, 35);
  const d2 = ev.domains.find((d) => d.id === '2');
  assert.equal(d2.readiness, null, 'domain with only a not-applicable has no readiness');
});

test('an empty assessment yields no readiness', () => {
  const ev = core.evaluate(b, core.emptyAssessment());
  assert.equal(ev.overall.readiness, null);
  assert.equal(ev.overall.band, null);
  assert.equal(ev.assessedTotal, 0);
});

test('search matches ids and both languages', () => {
  assert.equal(core.searchControls(b, 'email').length, 5);
  assert.equal(core.searchControls(b, 'بريد').length, 5);
  assert.equal(core.searchControls(b, '2-8-3').length, 1);
  assert.equal(core.searchControls(b, '').length, 0);
});

test('validateAssessment drops unknown ids and invalid statuses', () => {
  const dirty = { status: { '1-1-1': 'implemented', 'ZZ-9': 'implemented', '1-1-2': 'banana' }, notes: { '1-1-1': 'ok', 'ZZ-9': 'x' } };
  const clean = core.validateAssessment(b, dirty);
  assert.deepEqual(Object.keys(clean.status), ['1-1-1']);
  assert.deepEqual(Object.keys(clean.notes), ['1-1-1']);
});

test('crosswalk returns references for a subdomain', () => {
  const cw = core.crosswalk(b, '2-8');
  assert.ok(cw.iso.includes('A.8.24'));
  assert.ok(cw.csf.includes('PR.DS'));
  assert.equal(core.crosswalk(b, 'nope'), null);
});
