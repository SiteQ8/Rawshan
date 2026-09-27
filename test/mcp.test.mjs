import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { root } from './helpers.mjs';

const SERVER = join(root, 'mcp/server.mjs');

test('mcp selftest passes', () => {
  const r = spawnSync(process.execPath, [SERVER, '--selftest'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /0 failed/);
});

test('mcp answers a JSON-RPC session over stdio', () => {
  const reqs = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'ecc_get_control', arguments: { id: '2-8-3' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'ecc_readiness_report', arguments: { assessment: { schema: 'ecc-register/1', status: { '1-1-1': 'implemented' }, notes: {} } } } },
  ];
  const input = reqs.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const r = spawnSync(process.execPath, [SERVER], { input, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const byId = new Map(lines.map((m) => [m.id, m]));
  assert.ok(byId.get(1).result.protocolVersion, 'initialize returns a protocol version');
  assert.equal(byId.get(2).result.tools.length, 10, 'ten tools listed');
  const gc = byId.get(3).result;
  assert.equal(gc.structuredContent.id, '2-8-3');
  assert.ok(gc.content[0].text.length > 0);
  assert.equal(byId.get(4).result.structuredContent.overall.readiness, 100);
});
