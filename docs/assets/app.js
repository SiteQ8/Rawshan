// Rawshan web app. Renders the ECC register and the surrounding tabs from bundle.json.
// All state lives in the browser; nothing is sent anywhere.
import * as core from './core.js';

const LS_KEY = 'ecc-register:v1';
const LANG_KEY = 'ecc-register:lang';
const THEME_KEY = 'ecc-register:theme';

const html = document.documentElement;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON_MOON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const ICON_SUN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/></svg>';

let BUNDLE = null;
let IX = null;
const state = {
  lang: 'ar',
  theme: null, // null follows the system, else 'light' | 'dark'
  tab: 'register',
  a: core.emptyAssessment(),
  filter: 'all',
  q: '',
  notesOpen: new Set(),
};

/* ---------- persistence ---------- */
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) state.a = { schema: core.SCHEMA, status: {}, notes: {}, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  try {
    const l = localStorage.getItem(LANG_KEY);
    if (l === 'ar' || l === 'en') state.lang = l;
  } catch { /* ignore */ }
  try {
    const th = localStorage.getItem(THEME_KEY);
    if (th === 'light' || th === 'dark') state.theme = th;
  } catch { /* ignore */ }
}
function saveAssessment() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ status: state.a.status, notes: state.a.notes })); } catch { /* ignore */ }
}

/* ---------- i18n ---------- */
function t(key, vars) {
  const row = BUNDLE.ui[key];
  let s = row ? (row[state.lang] ?? row.en) : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
const other = () => (state.lang === 'ar' ? 'en' : 'ar');

function effectiveDark() {
  if (state.theme === 'dark') return true;
  if (state.theme === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyTheme() {
  if (state.theme) html.setAttribute('data-theme', state.theme); else html.removeAttribute('data-theme');
  const btn = $('#theme-toggle');
  const dark = effectiveDark();
  btn.innerHTML = dark ? ICON_SUN : ICON_MOON;
  btn.setAttribute('aria-label', dark ? t('theme.toLight') : t('theme.toDark'));
  btn.setAttribute('title', dark ? t('theme.toLight') : t('theme.toDark'));
}

function applyChrome() {
  html.setAttribute('lang', state.lang);
  html.setAttribute('dir', state.lang === 'ar' ? 'rtl' : 'ltr');
  const p = BUNDLE.project;
  document.title = state.lang === 'ar'
    ? 'روشن | سجل عمل للضوابط الأساسية للأمن السيبراني في المملكة العربية السعودية'
    : 'Rawshan | A working register for Saudi Arabia\'s NCA Essential Cybersecurity Controls';
  $('#app-name').textContent = BUNDLE.ui['app.title'][state.lang];
  $('#alt-name').textContent = BUNDLE.ui['app.title'][other()];
  $('#alt-name').setAttribute('lang', other());
  $('#tagline').textContent = t('app.tagline');
  $('#source-line').textContent = t('source.line');
  $('#skip').textContent = t('skip');
  const lang = $('#lang-toggle');
  lang.textContent = t('lang.switch');
  lang.setAttribute('lang', other());
  lang.setAttribute('aria-label', t('lang.switchLabel'));
  // tabs
  $$('#tabs [role="tab"]').forEach((b) => { b.textContent = t('tab.' + b.dataset.tab); });
  // footer
  $('#footer-license').textContent = t('footer.license');
  const code = $('#footer-code');
  code.textContent = t('about.code');
  code.href = `https://github.com/${p.owner}/${p.repo}`;
  code.setAttribute('target', '_blank'); code.setAttribute('rel', 'noopener');
  $('#footer-ver').textContent = t('footer.version', { v: p.version });
  applyTheme();
}

/* ---------- helpers ---------- */
function subsOfDomain(domId) {
  return BUNDLE.subdomains.filter((s) => s.domain === domId);
}
function controlsOfSub(subId) {
  return (IX.bySubdomain.get(subId) || []);
}
function statusOf(id) { return state.a.status[id] || ''; }
function matchesFilter(id) {
  const st = statusOf(id);
  switch (state.filter) {
    case 'implemented': return st === 'implemented';
    case 'partial': return st === 'partial';
    case 'gap': return st === 'not_implemented';
    case 'na': return st === 'not_applicable';
    case 'unset': return st === '';
    default: return true;
  }
}
function pct(v) { return v == null ? '-' : v + '%'; }

/* ---------- register ---------- */
function renderSummary() {
  const ev = core.evaluate(BUNDLE, state.a);
  const o = ev.overall;
  const bandLbl = o.band ? t('band.' + o.band) : '';
  let doms = '';
  for (const d of ev.domains) {
    const title = state.lang === 'ar' ? d.title_ar : d.title_en;
    const w = d.readiness == null ? 0 : d.readiness;
    doms += `<div class="dombar"><span class="dn">${esc(d.id)}. ${esc(title)}</span>`
      + `<span class="track"><i data-w="${w}"></i></span>`
      + `<span class="pv ${d.readiness == null ? 'na' : ''}">${esc(pct(d.readiness))}</span></div>`;
  }
  $('#summary').innerHTML =
    `<div class="summary-top">`
    + `<div class="overall"><div class="big ${o.readiness == null ? 'na' : ''}">${esc(pct(o.readiness))}</div>`
    + `<span class="lbl">${esc(t('readiness.overall'))}</span>`
    + (bandLbl ? `<span class="band-chip">${esc(bandLbl)}</span>` : '')
    + `<p class="assessed">${esc(t('readiness.assessed', { n: ev.assessedTotal, total: ev.total }))}</p></div>`
    + `<div class="dombars">${doms}</div></div>`;
  $$('#summary .track > i').forEach((i) => { i.style.setProperty('width', i.dataset.w + '%'); });
  // mini in tabbar
  const w = o.readiness == null ? 0 : o.readiness;
  $('#mini').innerHTML = `<span class="mini-bar"><i data-w="${w}"></i></span>`
    + `<span class="mini-v">${esc(pct(o.readiness))}</span>`
    + `<span class="mini-s">${esc(t('readiness.assessed', { n: ev.assessedTotal, total: ev.total }))}</span>`;
  $$('#mini .mini-bar > i').forEach((i) => { i.style.setProperty('width', i.dataset.w + '%'); });
}

function renderIndex() {
  const matchIds = state.q ? new Set(core.searchControls(BUNDLE, state.q, { limit: 500 }).map((c) => c.id)) : null;
  let visTotal = 0;
  const parts = BUNDLE.domains.map((d) => {
    let n = 0;
    for (const s of subsOfDomain(d.id)) for (const c of controlsOfSub(s.id)) {
      if ((!matchIds || matchIds.has(c.id)) && matchesFilter(c.id)) n += 1;
    }
    visTotal += n;
    const title = state.lang === 'ar' ? d.title_ar : d.title_en;
    return `<a href="#dom-${esc(d.id)}" data-dom="${esc(d.id)}"><span>${esc(d.id)}. ${esc(title)}</span><span class="cnt">${n}</span></a>`;
  });
  $('#dindex').innerHTML = parts.join('');
  return visTotal;
}

function statusButtons(id) {
  const st = statusOf(id);
  const one = (v, uiKey) => `<button type="button" class="st-btn" data-act="status" data-id="${esc(id)}" data-st="${v}" aria-pressed="${st === v}">${esc(t(uiKey))}</button>`;
  return `<div class="statuses" role="group">`
    + one('implemented', 'status.implemented')
    + one('partial', 'status.partial')
    + one('not_implemented', 'status.notimplemented')
    + one('not_applicable', 'status.notapplicable')
    + `</div>`;
}

function controlRow(c) {
  const summary = state.lang === 'ar' ? c.summary_ar : c.summary_en;
  const st = statusOf(c.id);
  const noteOpen = state.notesOpen.has(c.id) || !!state.a.notes[c.id];
  const note = state.a.notes[c.id] || '';
  return `<div class="ctrl ${st ? 's-' + st : ''}" id="c-${esc(c.id)}">`
    + `<div class="ctrl-top"><span class="ctrl-id">${esc(c.id)}</span>`
    + `<p class="ctrl-sum">${esc(summary)}</p>`
    + `<span class="ctrl-page">${esc(t('register.page', { n: c.page }))}</span></div>`
    + `<div class="ctrl-controls">${statusButtons(c.id)}`
    + `<button type="button" class="note-toggle" data-act="note-toggle" data-id="${esc(c.id)}">${esc(t('note.add'))}</button></div>`
    + (noteOpen ? `<div class="note-wrap"><textarea data-act="note" data-id="${esc(c.id)}" placeholder="${esc(t('note.placeholder'))}">${esc(note)}</textarea></div>` : '')
    + `</div>`;
}

function renderRows() {
  const matchIds = state.q ? new Set(core.searchControls(BUNDLE, state.q, { limit: 500 }).map((c) => c.id)) : null;
  let out = '';
  for (const d of BUNDLE.domains) {
    const dTitle = state.lang === 'ar' ? d.title_ar : d.title_en;
    let domInner = '';
    let domVisible = 0;
    for (const s of subsOfDomain(d.id)) {
      const rows = controlsOfSub(s.id).filter((c) => (!matchIds || matchIds.has(c.id)) && matchesFilter(c.id));
      if (!rows.length) continue;
      domVisible += rows.length;
      const sTitle = state.lang === 'ar' ? s.title_ar : s.title_en;
      const sObj = state.lang === 'ar' ? s.objective_ar : s.objective_en;
      domInner += `<div class="subdomain" id="sub-${esc(s.id)}"><div class="sub-head"><span class="scode">${esc(s.id)}</span>`
        + `<h4>${esc(sTitle)}</h4><p class="obj">${esc(sObj)}</p></div>`
        + rows.map(controlRow).join('') + `</div>`;
    }
    if (!domInner) continue;
    const total = (IX.byDomain.get(d.id) || []).length;
    out += `<section class="domain" id="dom-${esc(d.id)}"><div class="domain-head"><span class="dcode">${esc(d.id)}</span>`
      + `<h3>${esc(dTitle)}</h3><span class="dmeta">${esc(t('register.controlsIn', { n: domVisible }))} / ${total}</span></div>`
      + domInner + `</section>`;
  }
  const rowsEl = $('#rows');
  const emptyEl = $('#empty');
  if (!out) {
    rowsEl.innerHTML = '';
    emptyEl.hidden = false;
    emptyEl.textContent = t('empty.search');
  } else {
    emptyEl.hidden = true;
    rowsEl.innerHTML = out;
  }
}

function renderTools() {
  const seg = (v, key) => `<button type="button" class="seg-btn" data-act="filter" data-filter="${v}" aria-pressed="${state.filter === v}">${esc(t(key))}</button>`;
  $('#rtools').innerHTML =
    `<div class="search"><input type="search" id="q" value="${esc(state.q)}" placeholder="${esc(t('search.placeholder'))}" aria-label="${esc(t('search.label'))}"></div>`
    + `<div class="seg" role="group" aria-label="${esc(t('filter.all'))}">`
    + seg('all', 'filter.all') + seg('implemented', 'filter.implemented') + seg('partial', 'filter.partial')
    + seg('gap', 'filter.gap') + seg('na', 'filter.na') + seg('unset', 'filter.unset') + `</div>`
    + `<button type="button" class="btn-plain" data-act="reset">${esc(t('action.reset'))}</button>`;
}

function renderRegister() {
  renderSummary();
  renderTools();
  renderIndex();
  renderRows();
}

/* ---------- applicability ---------- */
function renderApplicability() {
  const fams = BUNDLE.families.map((f) => {
    const name = state.lang === 'ar' ? f.ar : f.en;
    const who = state.lang === 'ar' ? f.who_ar : f.who_en;
    const tag = f.baseline
      ? `<span class="tag covered">${esc(t('appl.covered'))}</span>`
      : `<span class="tag separate">${esc(t('appl.separate'))}</span>`;
    return `<div class="fam ${f.baseline ? 'baseline' : ''}"><div class="fam-top"><span class="abbr">${esc(f.abbr)}</span><h3>${esc(name)}</h3></div>`
      + `<p class="who-l">${esc(t('appl.who'))}</p><p class="who">${esc(who)}</p>${tag}</div>`;
  }).join('');
  $('#panel-applicability').innerHTML =
    `<div class="panel-head"><h2>${esc(t('appl.title'))}</h2><p>${esc(t('appl.intro'))}</p></div>`
    + `<div class="appl-grid">${fams}</div>`;
}

/* ---------- crosswalk ---------- */
function renderCrosswalk() {
  $('#cw-shell').innerHTML = `<div class="panel-head"><h2>${esc(t('cw.title'))}</h2><p>${esc(t('cw.intro'))}</p></div>`;
  const rows = BUNDLE.subdomains.map((s) => {
    const cw = IX.crosswalk.get(s.id) || { iso: [], csf: [] };
    const title = state.lang === 'ar' ? s.title_ar : s.title_en;
    const chips = (arr) => arr.map((x) => `<span class="chip">${esc(x)}</span>`).join('') || '<span class="chip">-</span>';
    return `<div class="cw-row"><div class="cw-sub"><span class="sc">${esc(s.id)}</span><h4>${esc(title)}</h4></div>`
      + `<div class="cw-col"><div class="cl">${esc(t('cw.iso'))}</div><div class="chips">${chips(cw.iso)}</div></div>`
      + `<div class="cw-col"><div class="cl">${esc(t('cw.csf'))}</div><div class="chips">${chips(cw.csf)}</div></div></div>`;
  }).join('');
  $('#cw-list').innerHTML = rows;
}

/* ---------- pdpl ---------- */
function renderPdpl() {
  const items = BUNDLE.pdpl.map((o) => `<div class="pd-item"><p>${esc(state.lang === 'ar' ? o.ar : o.en)}</p></div>`).join('');
  $('#panel-pdpl').innerHTML =
    `<div class="panel-head"><h2>${esc(t('pd.title'))}</h2><p>${esc(t('pd.intro'))}</p></div>`
    + `<div class="pd-grid">${items}</div>`;
}

/* ---------- report ---------- */
function renderReport() {
  const ev = core.evaluate(BUNDLE, state.a);
  const o = ev.overall;
  const c = o.counts;
  const stat = (n, cls, key) => `<div class="rep-stat"><div class="n ${cls}">${n}</div><div class="k">${esc(t(key))}</div></div>`;
  const bandLbl = o.band ? t('band.' + o.band) : '-';
  let tbody = '';
  for (const d of ev.domains) {
    const title = state.lang === 'ar' ? d.title_ar : d.title_en;
    tbody += `<tr><td>${esc(d.id)}. ${esc(title)}</td>`
      + `<td class="num">${esc(pct(d.readiness))}</td>`
      + `<td>${esc(d.readiness == null ? '-' : t('band.' + d.band))}</td>`
      + `<td class="num">${d.counts.implemented}</td><td class="num">${d.counts.partial}</td>`
      + `<td class="num">${d.counts.not_implemented}</td><td class="num">${d.counts.not_applicable}</td></tr>`;
  }
  const today = new Date().toISOString().slice(0, 10);
  $('#panel-report').innerHTML =
    `<div class="panel-head"><h2>${esc(t('report.title'))}</h2><p>${esc(t('report.intro'))}</p></div>`
    + `<div class="report-card">`
    + `<div class="report-actions"><button type="button" class="btn" data-act="export">${esc(t('report.export'))}</button>`
    + `<button type="button" class="btn" data-act="print">${esc(t('report.print'))}</button>`
    + `<span class="assessed">${esc(t('report.generated', { d: today }))}</span></div>`
    + `<div class="overall"><div class="big ${o.readiness == null ? 'na' : ''}">${esc(pct(o.readiness))}</div>`
    + `<span class="lbl">${esc(t('readiness.overall'))} · ${esc(bandLbl)}</span></div>`
    + `<div class="rep-grid">`
    + stat(c.implemented, 'met', 'status.implemented')
    + stat(c.partial, 'partial', 'status.partial')
    + stat(c.not_implemented, 'gap', 'status.notimplemented')
    + stat(c.not_applicable, 'na', 'status.notapplicable')
    + stat(c.unset, '', 'status.unset')
    + `</div>`
    + `<table class="rep-table"><thead><tr><th>${esc(t('readiness.byDomain'))}</th><th class="num">${esc(t('readiness.title'))}</th><th>${esc(t('col.band'))}</th>`
    + `<th class="num">${esc(t('status.implemented'))}</th><th class="num">${esc(t('status.partial'))}</th>`
    + `<th class="num">${esc(t('status.notimplemented'))}</th><th class="num">${esc(t('status.notapplicable'))}</th></tr></thead>`
    + `<tbody>${tbody}</tbody></table></div>`;
}

/* ---------- about ---------- */
function renderAbout() {
  const p = BUNDLE.project;
  const srcRows = BUNDLE.sources.sources.map((s) =>
    `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(state.lang === 'ar' ? s.ar : s.en)}</a></li>`).join('');
  $('#panel-about').innerHTML =
    `<div class="about"><h2>${esc(t('about.title'))}</h2>`
    + `<p>${esc(t('about.what'))}</p>`
    + `<p>${esc(t('about.how'))}</p>`
    + `<p class="disc">${esc(t('about.disclaimer'))}</p>`
    + `<h3>${esc(t('about.nameTitle'))}</h3><p>${esc(t('about.name'))}</p>`
    + `<h3>${esc(t('about.source'))}</h3><p>${esc(t('about.source'))}</p>`
    + `<h3>${esc(t('about.sources'))}</h3><ul>${srcRows}</ul>`
    + `<h3>${esc(t('about.code'))}</h3><p><a href="https://github.com/${esc(p.owner)}/${esc(p.repo)}" target="_blank" rel="noopener">github.com/${esc(p.owner)}/${esc(p.repo)}</a></p>`
    + `<p>${esc(t('about.mcp'))}</p></div>`;
}

/* ---------- tab switching ---------- */
const RENDERERS = {
  register: renderRegister,
  applicability: renderApplicability,
  crosswalk: renderCrosswalk,
  pdpl: renderPdpl,
  report: renderReport,
  about: renderAbout,
};
function showTab(tab) {
  state.tab = tab;
  $$('#tabs [role="tab"]').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
  $$('.main [role="tabpanel"]').forEach((p) => { p.hidden = p.id !== 'panel-' + tab; });
  RENDERERS[tab]();
}

/* ---------- popup ---------- */
let lastFocus = null;
function showDisclaimer() {
  lastFocus = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.id = 'disclaimer';
  const dir = state.lang === 'ar' ? 'rtl' : 'ltr';
  wrap.innerHTML =
    `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dt" dir="${dir}" lang="${state.lang}">`
    + `<div class="modal-crown"></div><div class="modal-body">`
    + `<h2 id="dt">${esc(t('popup.title'))}</h2>`
    + `<p>${esc(t('popup.body1'))}</p><p>${esc(t('popup.body2'))}</p>`
    + `<div class="modal-actions"><button type="button" class="modal-ack" data-act="ack">${esc(t('popup.ack'))}</button></div>`
    + `</div></div>`;
  document.body.appendChild(wrap);
  const ack = $('.modal-ack', wrap);
  ack.focus();
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeDisclaimer(); });
}
function closeDisclaimer() {
  const w = $('#disclaimer');
  if (w) w.remove();
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

/* ---------- events ---------- */
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function flash(msg) {
  const f = $('#flash');
  f.textContent = msg; f.hidden = false;
  clearTimeout(flash._t);
  flash._t = setTimeout(() => { f.hidden = true; }, 1800);
}

function onClick(e) {
  const tab = e.target.closest('#tabs [role="tab"]');
  if (tab) { showTab(tab.dataset.tab); return; }

  const dom = e.target.closest('.dindex a');
  if (dom) {
    e.preventDefault();
    const target = $('#dom-' + dom.dataset.dom);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;

  if (act === 'ack') { closeDisclaimer(); return; }
  if (act === 'lang') return;
  if (btn.id === 'lang-toggle') return;

  if (act === 'status') {
    const id = btn.dataset.id, st = btn.dataset.st;
    if (state.a.status[id] === st) delete state.a.status[id];
    else state.a.status[id] = st;
    saveAssessment();
    renderRegister();
    return;
  }
  if (act === 'note-toggle') {
    const id = btn.dataset.id;
    if (state.notesOpen.has(id)) state.notesOpen.delete(id); else state.notesOpen.add(id);
    renderRows();
    const ta = $(`textarea[data-id="${CSS.escape(id)}"]`);
    if (ta) ta.focus();
    return;
  }
  if (act === 'filter') {
    state.filter = btn.dataset.filter;
    renderRegister();
    return;
  }
  if (act === 'reset') {
    if (confirm(t('action.resetConfirm'))) {
      state.a = core.emptyAssessment();
      state.notesOpen.clear();
      saveAssessment();
      renderRegister();
      flash(t('action.reset'));
    }
    return;
  }
  if (act === 'export') {
    download('rawshan-assessment.json', JSON.stringify({ schema: core.SCHEMA, status: state.a.status, notes: state.a.notes }, null, 2), 'application/json');
    return;
  }
  if (act === 'print') { window.print(); return; }
}

function onInput(e) {
  const q = e.target.closest('#q');
  if (q) { state.q = q.value; renderSummary(); renderIndex(); renderRows(); return; }
  const note = e.target.closest('textarea[data-act="note"]');
  if (note) {
    const id = note.dataset.id, v = note.value;
    if (v.trim()) state.a.notes[id] = v; else delete state.a.notes[id];
    saveAssessment();
    return;
  }
}

function onKeydown(e) {
  if (e.key === 'Escape' && $('#disclaimer')) { closeDisclaimer(); return; }
  // arrow navigation across tabs
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.closest('#tabs [role="tab"]')) {
    const tabs = $$('#tabs [role="tab"]');
    const i = tabs.indexOf(e.target);
    const dir = (e.key === 'ArrowRight' ? 1 : -1) * (state.lang === 'ar' ? -1 : 1);
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    next.focus(); showTab(next.dataset.tab);
  }
}

$('#lang-toggle').addEventListener('click', () => {
  state.lang = other();
  try { localStorage.setItem(LANG_KEY, state.lang); } catch { /* ignore */ }
  applyChrome();
  showTab(state.tab);
});
$('#theme-toggle').addEventListener('click', () => {
  state.theme = effectiveDark() ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, state.theme); } catch { /* ignore */ }
  applyTheme();
});

document.addEventListener('click', onClick);
document.addEventListener('input', onInput);
document.addEventListener('keydown', onKeydown);

/* ---------- boot ---------- */
async function init() {
  loadState();
  try {
    const res = await fetch('data/bundle.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    BUNDLE = await res.json();
  } catch (err) {
    document.body.classList.remove('loading');
    $('#boot-error').hidden = false;
    return;
  }
  IX = core.indexBundle(BUNDLE);
  state.a = core.validateAssessment(BUNDLE, state.a);
  applyChrome();
  showTab('register');
  document.body.classList.remove('loading');
  showDisclaimer();
}
init();
