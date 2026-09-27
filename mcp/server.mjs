#!/usr/bin/env node
// MCP server (stdio, newline-delimited JSON-RPC 2.0) for Saudi Arabia's NCA Essential Cybersecurity Controls.
// No dependencies. All tools are read-only and work offline from the bundled data.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import * as core from '../docs/assets/core.js';

const bundle = JSON.parse(readFileSync(new URL('../docs/data/bundle.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const idx = core.indexBundle(bundle);
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const ECC_URL = (bundle.sources.sources.find((s) => s.id === 'ecc') || {}).url || '';
const PDF_URL = (bundle.sources.sources.find((s) => s.id === 'ecc-pdf') || {}).url || '';

const LANG = { type: 'string', enum: ['en', 'ar'], default: 'en', description: 'Language for summaries and names: en or ar.' };
const FORMAT = { type: 'string', enum: ['markdown', 'json'], default: 'markdown', description: 'markdown for reading, json for further processing.' };
const LIMIT = { type: 'integer', minimum: 1, maximum: 200, default: 25, description: 'Maximum items to return.' };
const OFFSET = { type: 'integer', minimum: 0, default: 0, description: 'Items to skip, for paging.' };
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const tools = [
  {
    name: 'ecc_overview',
    title: 'ECC overview',
    description: 'Summary of the NCA Essential Cybersecurity Controls (ECC-2:2024): the four domains, counts of subdomains and controls, and the official sources. Start here.',
    inputSchema: { type: 'object', properties: { lang: LANG, response_format: FORMAT }, additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'ecc_list_domains',
    title: 'List ECC domains',
    description: 'List the four ECC domains with their codes, names and the number of subdomains and controls in each.',
    inputSchema: { type: 'object', properties: { lang: LANG, response_format: FORMAT }, additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'ecc_list_subdomains',
    title: 'List ECC subdomains',
    description: 'List the 28 ECC subdomains with their codes, titles, objectives and control counts. Optionally limited to one domain.',
    inputSchema: { type: 'object', properties: { domain: { type: 'string', description: 'Domain code 1 to 4.' }, lang: LANG, response_format: FORMAT }, additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'ecc_get_control',
    title: 'Get one ECC control',
    description: 'Get a control by ID (for example "2-8-3", "2.8.3" or "283"): its own-words summary, subdomain, domain, official page, and ISO 27001 and NIST CSF 2.0 mapping. Summaries are this project\'s wording; the official text is at the page given.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Control ID such as "1-5-1".' }, lang: LANG, response_format: FORMAT }, required: ['id'], additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'ecc_search_controls',
    title: 'Search ECC controls',
    description: 'Search control summaries in English and Arabic and by ID. Optionally filter by domain code. Paged.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to find, in English or Arabic. Empty returns all controls.' },
        domain: { type: 'string', description: 'Domain code 1 to 4.' },
        limit: LIMIT, offset: OFFSET, lang: LANG, response_format: FORMAT,
      },
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'ecc_crosswalk',
    title: 'Crosswalk between frameworks',
    description: 'Map in either direction at the subdomain level. framework "ecc" with a subdomain code ("2-8") returns its ISO 27001 and NIST CSF 2.0 references. framework "iso27001" with a reference ("A.8.24") returns the ECC subdomains mapped to it. framework "csf2" with a category ("PR.DS") returns the ECC subdomains mapped to it. The mapping is this project\'s analysis, not an official NCA mapping.',
    inputSchema: {
      type: 'object',
      properties: { framework: { type: 'string', enum: ['ecc', 'iso27001', 'csf2'] }, id: { type: 'string' }, lang: LANG, response_format: FORMAT },
      required: ['framework', 'id'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'ecc_pdpl_obligations',
    title: 'PDPL obligations',
    description: 'List the core obligations from the Saudi Personal Data Protection Law that sit alongside the ECC. Optionally filter by words.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, lang: LANG, response_format: FORMAT }, additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'ecc_families',
    title: 'NCA control families',
    description: 'List the NCA control families, who each applies to, and which is the baseline, to help decide which NCA controls apply to an entity.',
    inputSchema: { type: 'object', properties: { lang: LANG, response_format: FORMAT }, additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'ecc_readiness_report',
    title: 'Readiness report for an assessment',
    description: 'Evaluate an assessment object saved by the web app (schema "ecc-register/1"): overall and per-domain readiness, a maturity band, status counts and a prioritized gap list. Paged over gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        assessment: { type: 'object', description: 'The JSON saved by the site: { schema, status: { "1-1-1": "implemented", ... }, notes: {...} }.' },
        limit: LIMIT, offset: OFFSET, lang: LANG, response_format: FORMAT,
      },
      required: ['assessment'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'ecc_sources',
    title: 'Official sources',
    description: 'List the official sources this register is built on, with links, and the provenance note that separates the official text from this project\'s own work.',
    inputSchema: { type: 'object', properties: { lang: LANG, response_format: FORMAT }, additionalProperties: false },
    annotations: RO,
  },
];

class ToolError extends Error {}
const L = (o, lang) => (o ? o[lang] ?? o.en : '');
const pickLang = (args) => (args.lang === 'ar' ? 'ar' : 'en');
const page = (list, args) => {
  const limit = Math.min(Math.max(Number.parseInt(args.limit ?? 25, 10) || 25, 1), 200);
  const offset = Math.max(Number.parseInt(args.offset ?? 0, 10) || 0, 0);
  const items = list.slice(offset, offset + limit);
  return { total: list.length, count: items.length, offset, items, has_more: offset + items.length < list.length, next_offset: offset + items.length < list.length ? offset + items.length : null };
};
const domainCode = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const code = String(raw).trim();
  if (!idx.domains.has(code)) throw new ToolError(`Unknown domain "${raw}". Use one of: ${bundle.domains.map((d) => d.id).join(', ')}.`);
  return code;
};
const domTitle = (d, lang) => (lang === 'ar' ? d.title_ar : d.title_en);
const subTitle = (s, lang) => (lang === 'ar' ? s.title_ar : s.title_en);
const subObj = (s, lang) => (lang === 'ar' ? s.objective_ar : s.objective_en);
const ctlSum = (c, lang) => (lang === 'ar' ? c.summary_ar : c.summary_en);

function result(obj, markdown, args) {
  const text = args.response_format === 'json' ? JSON.stringify(obj, null, 2) : markdown;
  return { content: [{ type: 'text', text }], structuredContent: obj };
}

const handlers = {
  ecc_overview(args) {
    const lang = pickLang(args);
    const domains = bundle.domains.map((d) => {
      const subs = bundle.subdomains.filter((s) => s.domain === d.id);
      const controls = (idx.byDomain.get(d.id) || []).length;
      return { code: d.id, name: domTitle(d, lang), subdomains: subs.length, controls };
    });
    const out = {
      framework: bundle.project.framework_version,
      counts: bundle.counts,
      domains,
      sources: { ecc: ECC_URL, official_document: PDF_URL },
      note: L(bundle.sources.note, lang),
    };
    const md = [
      `# ${bundle.project.name_en} (${bundle.project.framework_version})`,
      '',
      `${bundle.counts.domains} domains, ${bundle.counts.subdomains} subdomains, ${bundle.counts.controls} controls.`,
      '',
      ...domains.map((d) => `- **${d.code}** ${d.name}: ${d.subdomains} subdomains, ${d.controls} controls`),
      '',
      `Source: ${ECC_URL}`,
    ].join('\n');
    return result(out, md, args);
  },

  ecc_list_domains(args) {
    const lang = pickLang(args);
    const domains = bundle.domains.map((d) => ({
      code: d.id, name: domTitle(d, lang),
      subdomains: bundle.subdomains.filter((s) => s.domain === d.id).length,
      controls: (idx.byDomain.get(d.id) || []).length,
    }));
    const md = [`# ECC domains (${domains.length})`, '', ...domains.map((d) => `- **${d.code}** ${d.name}: ${d.subdomains} subdomains, ${d.controls} controls`)].join('\n');
    return result({ domains }, md, args);
  },

  ecc_list_subdomains(args) {
    const lang = pickLang(args);
    const dom = domainCode(args.domain);
    const list = bundle.subdomains.filter((s) => !dom || s.domain === dom).map((s) => ({
      code: s.id, domain: s.domain, title: subTitle(s, lang), objective: subObj(s, lang),
      controls: (idx.bySubdomain.get(s.id) || []).length, page: s.page,
    }));
    const md = [`# ECC subdomains (${list.length})`, '', ...list.map((s) => `- **${s.code}** ${s.title} (${s.controls} controls): ${s.objective}`)].join('\n');
    return result({ subdomains: list }, md, args);
  },

  ecc_get_control(args) {
    const lang = pickLang(args);
    const id = String(args.id || '').trim().replace(/[.\s]/g, '-').replace(/-+/g, '-');
    let c = idx.controls.get(id);
    if (!c && /^\d{3,}$/.test(String(args.id || '').trim())) {
      const raw = String(args.id).trim();
      const guess = `${raw[0]}-${raw.slice(1, raw.length - 1)}-${raw[raw.length - 1]}`;
      c = idx.controls.get(guess);
    }
    if (!c) throw new ToolError(`No control "${args.id}". IDs look like "2-8-3"; use ecc_search_controls to find one.`);
    const sub = idx.subdomains.get(c.subdomain);
    const dom = idx.domains.get(c.id.split('-')[0]);
    const cw = idx.crosswalk.get(c.subdomain) || { iso: [], csf: [] };
    const v = {
      id: c.id,
      domain: { code: dom.id, name: domTitle(dom, lang) },
      subdomain: { code: sub.id, title: subTitle(sub, lang) },
      summary: ctlSum(c, lang),
      official_page: c.page,
      official_url: PDF_URL ? `${PDF_URL}#page=${c.page}` : null,
      iso27001: cw.iso,
      csf2: cw.csf,
    };
    const md = [
      `## ${v.id}: ${v.subdomain.title}`,
      '',
      v.summary,
      '',
      `- Domain: ${v.domain.code} ${v.domain.name}`,
      `- Subdomain: ${v.subdomain.code} ${v.subdomain.title}`,
      `- Official text: page ${v.official_page} of the NCA ECC document${v.official_url ? ` (${v.official_url})` : ''}`,
      `- ISO 27001: ${v.iso27001.join(', ') || 'none'}`,
      `- NIST CSF 2.0: ${v.csf2.join(', ') || 'none'}`,
    ].join('\n');
    return result(v, md, args);
  },

  ecc_search_controls(args) {
    const lang = pickLang(args);
    const dom = domainCode(args.domain);
    let found = args.query ? core.searchControls(bundle, args.query, { limit: 500 }) : bundle.controls.slice();
    if (dom) found = found.filter((c) => c.id.split('-')[0] === dom);
    const p = page(found, args);
    const out = { ...p, items: p.items.map((c) => ({ id: c.id, subdomain: c.subdomain, summary: ctlSum(c, lang) })) };
    const md = [
      `Found ${p.total} controls${p.total ? `, showing ${p.offset + 1} to ${p.offset + p.count}` : ''}.`,
      '',
      ...p.items.map((c) => `- **${c.id}**: ${ctlSum(c, lang)}`),
      p.has_more ? `\nMore available: call again with offset ${p.next_offset}.` : '',
    ].join('\n');
    return result(out, md, args);
  },

  ecc_crosswalk(args) {
    const lang = pickLang(args);
    const fw = args.framework;
    const raw = String(args.id || '').trim();
    if (fw === 'ecc') {
      const sub = idx.subdomains.get(raw);
      const cw = idx.crosswalk.get(raw);
      if (!sub || !cw) throw new ToolError(`Unknown subdomain "${raw}". Subdomains look like "2-8"; see ecc_list_subdomains.`);
      const out = { framework: 'ecc', id: raw, title: subTitle(sub, lang), iso27001: cw.iso, csf2: cw.csf };
      const md = [`${raw} ${out.title} maps to:`, `- ISO 27001: ${cw.iso.join(', ') || 'none'}`, `- NIST CSF 2.0: ${cw.csf.join(', ') || 'none'}`].join('\n');
      return result(out, md, args);
    }
    const key = fw === 'iso27001' ? 'iso' : 'csf';
    const up = raw.toUpperCase();
    const subs = bundle.crosswalk
      .filter((x) => x[key].some((r) => r.toUpperCase() === up || r.toUpperCase().startsWith(up + '.') || r.toUpperCase().startsWith(up + '-')))
      .map((x) => { const s = idx.subdomains.get(x.subdomain); return { code: x.subdomain, title: subTitle(s, lang) }; });
    if (!subs.length) throw new ToolError(`Nothing mapped to ${fw} "${raw}". Examples: iso27001 "A.8.24", csf2 "PR.DS".`);
    const out = { framework: fw, id: raw, subdomains: subs };
    const md = [`${raw} maps to ${subs.length} ECC subdomains:`, ...subs.map((s) => `- **${s.code}** ${s.title}`)].join('\n');
    return result(out, md, args);
  },

  ecc_pdpl_obligations(args) {
    const lang = pickLang(args);
    const q = core.arabicFold(args.query || '').trim();
    const list = bundle.pdpl.filter((o) => !q || q.split(/\s+/).every((w) => core.arabicFold(`${o.id} ${o.en} ${o.ar}`).includes(w)));
    const items = list.map((o) => ({ id: o.id, summary: L(o, lang) }));
    const md = [`${items.length} PDPL obligations (summaries; rely on the official law).`, '', ...items.map((o) => `- **${o.id}**: ${o.summary}`)].join('\n');
    return result({ total: items.length, items }, md, args);
  },

  ecc_families(args) {
    const lang = pickLang(args);
    const items = bundle.families.map((f) => ({
      abbr: f.abbr, name: lang === 'ar' ? f.ar : f.en, baseline: !!f.baseline,
      applies_to: lang === 'ar' ? f.who_ar : f.who_en, note: lang === 'ar' ? f.note_ar : f.note_en,
    }));
    const md = [`# NCA control families (${items.length})`, '', ...items.map((f) => `- **${f.abbr}**${f.baseline ? ' (baseline)' : ''} ${f.name}: ${f.applies_to}`)].join('\n');
    return result({ families: items }, md, args);
  },

  ecc_readiness_report(args) {
    const lang = pickLang(args);
    const a = args.assessment;
    if (!a || typeof a !== 'object') throw new ToolError('Pass the assessment object saved by the web app.');
    if (a.schema && a.schema !== core.SCHEMA) throw new ToolError(`The assessment must have schema "${core.SCHEMA}". Save it from the site's Report tab.`);
    const ev = core.evaluate(bundle, a);
    const prio = { not_implemented: 1, partial: 2, unset: 3 };
    const gapsAll = [];
    for (const c of bundle.controls) {
      const st = ev.status[c.id] || 'unset';
      if (st === 'implemented' || st === 'not_applicable') continue;
      gapsAll.push({ id: c.id, subdomain: c.subdomain, status: st, priority: prio[st], summary: ctlSum(c, lang) });
    }
    gapsAll.sort((x, y) => x.priority - y.priority || x.id.localeCompare(y.id));
    const p = page(gapsAll, args);
    const out = {
      schema: core.SCHEMA,
      overall: { readiness: ev.overall.readiness, band: ev.overall.band, counts: ev.overall.counts, assessed: ev.assessedTotal, total: ev.total },
      domains: ev.domains.map((d) => ({ code: d.id, name: domTitle(d, lang), readiness: d.readiness, band: d.band, counts: d.counts })),
      gaps: p,
    };
    const o = ev.overall;
    const md = [
      `Overall readiness ${o.readiness == null ? 'not assessed' : o.readiness + '%'}${o.band ? ` (${L(bundle.ui['band.' + o.band], lang)})` : ''}.`,
      `Assessed ${ev.assessedTotal} of ${ev.total}. Implemented ${o.counts.implemented}, partial ${o.counts.partial}, not implemented ${o.counts.not_implemented}, not applicable ${o.counts.not_applicable}, not assessed ${o.counts.unset}.`,
      '',
      '| Domain | Readiness | Level |',
      '| --- | --- | --- |',
      ...out.domains.map((d) => `| ${d.code} ${d.name} | ${d.readiness == null ? '-' : d.readiness + '%'} | ${d.band ? L(bundle.ui['band.' + d.band], lang) : '-'} |`),
      '',
      `Gaps ${p.total ? `${p.offset + 1} to ${p.offset + p.count}` : '0'} of ${p.total}:`,
      ...p.items.map((g) => `- P${g.priority} ${g.status} **${g.id}**: ${g.summary}`),
      p.has_more ? `\nMore available: call again with offset ${p.next_offset}.` : '',
    ].join('\n');
    return result(out, md, args);
  },

  ecc_sources(args) {
    const lang = pickLang(args);
    const items = bundle.sources.sources.map((s) => ({ id: s.id, title: L(s, lang), url: s.url, use: L(s.use, lang) }));
    const md = [`# Official sources`, '', L(bundle.sources.note, lang), '', ...items.map((s) => `- **${s.title}**: ${s.url}`)].join('\n');
    return result({ note: L(bundle.sources.note, lang), sources: items }, md, args);
  },
};

function send(msg) { process.stdout.write(`${JSON.stringify(msg)}\n`); }
const reply = (id, res) => send({ jsonrpc: '2.0', id, result: res });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function handle(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && msg.id !== undefined && msg.id !== null) fail(msg.id, -32600, 'Invalid request');
    return;
  }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notifications need no reply
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      reply(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: pkg.name, title: `${bundle.project.name_en} MCP server`, version: pkg.version },
        instructions: 'Read-only tools for Saudi Arabia\'s NCA Essential Cybersecurity Controls (ECC-2:2024): domains, subdomains and controls with their summaries, a crosswalk to ISO 27001 and NIST CSF 2.0, the PDPL obligations, the NCA control families, and readiness reports for assessments saved by the web app. Summaries and mappings are this project\'s own work; cite the official page returned with each control.',
      });
      return;
    }
    case 'ping': reply(id, {}); return;
    case 'tools/list': reply(id, { tools }); return;
    case 'tools/call': {
      const h = handlers[params?.name];
      if (!h) { fail(id, -32602, `Unknown tool: ${params?.name}`); return; }
      try {
        reply(id, h(params.arguments || {}));
      } catch (e) {
        const text = e instanceof ToolError ? e.message : 'The tool failed on this input. Check the arguments against the tool schema.';
        if (!(e instanceof ToolError)) process.stderr.write(`tool ${params.name} failed: ${e.stack}\n`);
        reply(id, { isError: true, content: [{ type: 'text', text }] });
      }
      return;
    }
    default: fail(id, -32601, `Method not found: ${method}`);
  }
}

// --selftest drives every tool in-process and checks the shapes, without a client.
if (process.argv.includes('--selftest')) {
  let pass = 0, failn = 0;
  const ok = (cond, label) => { if (cond) { pass += 1; } else { failn += 1; console.error('FAIL: ' + label); } };
  ok(tools.length === 10, 'ten tools');
  const call = (name, argsObj = {}) => handlers[name](argsObj);
  try {
    ok(call('ecc_overview', {}).structuredContent.counts.controls === 108, 'overview counts 108');
    ok(call('ecc_list_domains', {}).structuredContent.domains.length === 4, 'four domains');
    ok(call('ecc_list_subdomains', {}).structuredContent.subdomains.length === 28, '28 subdomains');
    ok(call('ecc_list_subdomains', { domain: '2' }).structuredContent.subdomains.length === 15, '15 subdomains in domain 2');
    const gc = call('ecc_get_control', { id: '2-8-3' }).structuredContent;
    ok(gc.id === '2-8-3' && gc.summary.length > 0, 'get control 2-8-3');
    ok(call('ecc_get_control', { id: '283' }).structuredContent.id === '2-8-3', 'get control by compact id');
    ok(call('ecc_search_controls', { query: 'email' }).structuredContent.total === 5, 'search email = 5');
    ok(call('ecc_search_controls', { query: 'بريد', lang: 'ar' }).structuredContent.total === 5, 'search بريد = 5');
    ok(call('ecc_crosswalk', { framework: 'ecc', id: '2-8' }).structuredContent.iso27001.includes('A.8.24'), 'crosswalk ecc 2-8 -> iso');
    ok(call('ecc_crosswalk', { framework: 'iso27001', id: 'A.8.24' }).structuredContent.subdomains.some((s) => s.code === '2-8'), 'crosswalk iso -> ecc');
    ok(call('ecc_crosswalk', { framework: 'csf2', id: 'PR.DS' }).structuredContent.subdomains.length > 0, 'crosswalk csf -> ecc');
    ok(call('ecc_pdpl_obligations', {}).structuredContent.total === 12, '12 pdpl obligations');
    ok(call('ecc_families', {}).structuredContent.families.length === 6, 'six families');
    ok(call('ecc_sources', {}).structuredContent.sources.length === 6, 'six sources');
    const a = { schema: core.SCHEMA, status: { '1-1-1': 'implemented', '1-1-2': 'partial', '1-1-3': 'not_implemented', '2-8-1': 'not_applicable' }, notes: {} };
    const rep = call('ecc_readiness_report', { assessment: a }).structuredContent;
    ok(rep.overall.readiness === 50, 'readiness 50 for 1 impl + 1 partial + 1 not-impl');
    ok(rep.gaps.total === 106, 'gaps = 106 (108 - 1 implemented - 1 na)');
  } catch (e) { failn += 1; console.error('THREW: ' + e.stack); }
  console.log(`selftest: ${pass} passed, ${failn} failed`);
  process.exit(failn ? 1 : 0);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (text) => {
  if (!text.trim()) return;
  let msg;
  try { msg = JSON.parse(text); } catch { fail(null, -32700, 'Parse error'); return; }
  if (Array.isArray(msg)) { for (const m of msg) handle(m); return; }
  handle(msg);
});
rl.on('close', () => process.exit(0));
