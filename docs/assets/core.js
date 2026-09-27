// Shared logic for the web app and the MCP server. Pure functions over the data bundle, no DOM.

export const SCHEMA = 'ecc-register/1';
export const STATUSES = ['implemented', 'partial', 'not_implemented', 'not_applicable'];
export const SCORE = { implemented: 1, partial: 0.5, not_implemented: 0 };

// Readiness bands. A percentage over applicable controls maps to a maturity label.
export const BANDS = [
  { id: 'initial', min: 0 },
  { id: 'developing', min: 30 },
  { id: 'defined', min: 60 },
  { id: 'managed', min: 85 },
];

export function band(pct) {
  if (pct == null) return null;
  let hit = BANDS[0];
  for (const b of BANDS) if (pct >= b.min) hit = b;
  return hit.id;
}

export function normalizeId(s) {
  return String(s || '').trim().toLowerCase();
}

// Fold Arabic so search ignores diacritics and letter variants.
export function arabicFold(s) {
  return String(s || '')
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/[\u0649]/g, '\u064A')
    .replace(/\u0640/g, '')
    .toLowerCase()
    .trim();
}

export function indexBundle(bundle) {
  const domains = new Map(bundle.domains.map((d) => [d.id, d]));
  const subdomains = new Map(bundle.subdomains.map((s) => [s.id, s]));
  const controls = new Map(bundle.controls.map((c) => [c.id, c]));
  const bySubdomain = new Map();
  const byDomain = new Map();
  for (const c of bundle.controls) {
    if (!bySubdomain.has(c.subdomain)) bySubdomain.set(c.subdomain, []);
    bySubdomain.get(c.subdomain).push(c);
    const dom = c.id.split('-')[0];
    if (!byDomain.has(dom)) byDomain.set(dom, []);
    byDomain.get(dom).push(c);
  }
  const crosswalk = new Map((bundle.crosswalk || []).map((x) => [x.subdomain, x]));
  return { domains, subdomains, controls, bySubdomain, byDomain, crosswalk };
}

export function emptyAssessment() {
  return { schema: SCHEMA, status: {}, notes: {} };
}

// Keep only known control ids and valid statuses. Drop anything else.
export function validateAssessment(bundle, input) {
  const ix = indexBundle(bundle);
  const out = emptyAssessment();
  const st = (input && input.status) || {};
  const nt = (input && input.notes) || {};
  for (const [id, v] of Object.entries(st)) {
    if (ix.controls.has(id) && STATUSES.includes(v)) out.status[id] = v;
  }
  for (const [id, v] of Object.entries(nt)) {
    if (ix.controls.has(id) && typeof v === 'string' && v.trim()) out.notes[id] = v;
  }
  return out;
}

function rollup(controls, status) {
  let applicable = 0;
  let scoreSum = 0;
  const counts = { implemented: 0, partial: 0, not_implemented: 0, not_applicable: 0, unset: 0 };
  for (const c of controls) {
    const s = status[c.id] || 'unset';
    counts[s === 'unset' ? 'unset' : s] += 1;
    if (s === 'not_applicable') continue;
    if (s === 'unset') continue;
    applicable += 1;
    scoreSum += SCORE[s] ?? 0;
  }
  const assessed = applicable;
  const pct = assessed > 0 ? Math.round((scoreSum / assessed) * 100) : null;
  return { total: controls.length, applicable, assessed, counts, readiness: pct, band: band(pct) };
}

// Full evaluation: per-domain and overall readiness plus status counts.
export function evaluate(bundle, input) {
  const clean = validateAssessment(bundle, input);
  const ix = indexBundle(bundle);
  const domains = bundle.domains.map((d) => {
    const controls = ix.byDomain.get(d.id) || [];
    return { id: d.id, title_en: d.title_en, title_ar: d.title_ar, ...rollup(controls, clean.status) };
  });
  const overall = rollup(bundle.controls, clean.status);
  const assessedTotal = bundle.controls.filter((c) => clean.status[c.id]).length;
  return { schema: SCHEMA, overall, domains, assessedTotal, total: bundle.controls.length, status: clean.status, notes: clean.notes };
}

// Search controls by id, title or summary in both languages.
export function searchControls(bundle, query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const nq = normalizeId(q);
  const fq = arabicFold(q);
  const ix = indexBundle(bundle);
  const limit = opts.limit || 50;
  const out = [];
  for (const c of bundle.controls) {
    const sub = ix.subdomains.get(c.subdomain);
    const hay = [c.id, c.summary_en, sub && sub.title_en].filter(Boolean).join(' ').toLowerCase();
    const hayAr = arabicFold([c.summary_ar, sub && sub.title_ar].filter(Boolean).join(' '));
    if (hay.includes(nq) || hayAr.includes(fq)) out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export function crosswalk(bundle, subdomainId) {
  const ix = indexBundle(bundle);
  return ix.crosswalk.get(subdomainId) || null;
}
