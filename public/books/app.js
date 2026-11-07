// /books reader (voice-ui spec 32). Static ES module; talks to /api/books.
import { canAdvance, citation, cmpAddr, copyPayload, copyPayloadHtml, fmtAddr, gistAt, gistsForRanges, parseAddr, permalink, rangeLabel } from '/books/lib.js';

const API = '/api/books';
const PW_KEY = 'books-pw';
const SET_KEY = 'books-settings';
const LOCAL_KEY = 'books-local'; // { [slug]: { place, pending, at } } — place for visitors, unsynced place for Graham
const BREAK_MS = 30 * 60 * 1000;
const REPORT_MS = 2500;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const strip = (h) => String(h || '').replace(/<a class="fn"[^>]*>.*?<\/a>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const ORIGIN = location.origin;

const S = {
  pw: localStorage.getItem(PW_KEY),
  index: null, // library index.json
  state: null, // public (or private) view from the API
  idleMs: null,
  books: new Map(), // slug -> book JSON
  book: null,
  slug: null,
  paras: [], // [{ c, p, i, words, el }]
  byKey: new Map(),
  place: null, // { c, p, i }
  pendingWords: 0,
  lastSentView: '',
  mode: 'scroll',
  page: 0,
  pageCount: 1,
  pageChapter: 0,
  trail: null, // { from } while rereading
  hold: null, // index of the place while resume context is showing
  top: null, // para at the top of the screen
  visible: [],
  loadAt: Date.now(),
  settings: {},
};

// ---------------------------------------------------------------- settings

function loadSettings() {
  try { S.settings = JSON.parse(localStorage.getItem(SET_KEY) || '{}'); } catch { S.settings = {}; }
  S.settings = { theme: 'dark', font: 'serif', size: 19, lh: 1.62, measure: 34, nums: true, mode: 'scroll', ...S.settings };
  S.mode = S.settings.mode;
}
function applySettings() {
  const d = document.documentElement;
  const s = S.settings;
  d.dataset.theme = s.theme;
  d.dataset.font = s.font;
  d.dataset.nums = s.nums ? 'on' : 'off';
  d.style.setProperty('--fs', s.size + 'px');
  d.style.setProperty('--lh', String(s.lh));
  d.style.setProperty('--measure', s.measure + 'em');
  document.querySelector('meta[name=theme-color]').content = getComputedStyle(d).getPropertyValue('--bg').trim() || '#14130f';
  localStorage.setItem(SET_KEY, JSON.stringify(s));
}
function settingsUi() {
  const s = S.settings;
  for (const n of ['mode', 'theme', 'font']) for (const r of document.querySelectorAll(`input[name=${n}]`)) r.checked = r.value === s[n];
  $('sizeOut').textContent = s.size;
  $('lhOut').textContent = s.lh.toFixed(2);
  $('measureOut').textContent = s.measure;
  $('numsChk').checked = s.nums;
  $('authMsg').textContent = S.pw ? 'Unlocked on this device — your place syncs.' : 'Locked: your place stays on this device.';
  $('authBtn').textContent = S.pw ? 'Lock' : 'Unlock';
}
/** Change the look without losing the paragraph at the top of the screen. */
function restyle(fn) {
  const anchor = S.top;
  fn();
  applySettings();
  settingsUi();
  if (!S.book) return;
  if (S.mode === 'pages') paginate(anchor);
  else if (anchor) scrollToPara(anchor, 'top', false);
}

// ---------------------------------------------------------------- local + server state

const local = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch { return {}; } };
function saveLocal(slug, patch) {
  const all = local();
  all[slug] = { ...(all[slug] || {}), ...patch, at: Date.now() };
  all._last = slug;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
}

async function api(method, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (method === 'GET' && S.pw) headers['x-books-password'] = S.pw;
  const r = await fetch(API, { method, headers, cache: 'no-store', body: body ? JSON.stringify({ ...body, password: S.pw }) : undefined, keepalive: !!(body && body.keepalive) });
  if (r.status === 401) {
    if (S.pw) { S.pw = null; localStorage.removeItem(PW_KEY); toast('Password changed — unlock again in Look.'); }
    throw new Error('locked');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function loadState() {
  try {
    const d = await api('GET');
    S.state = d;
    S.idleMs = d.idleMs ?? null;
  } catch (e) {
    if (e.message === 'locked') return loadState();
    S.state = S.state || { books: {}, last: null, totals: { booksFinished: 0, month: { paragraphs: 0, pages: 0, finished: 0 } } };
  }
}

async function getPw() {
  if (S.pw) return S.pw;
  const pw = prompt('Password to write notes and sync your place');
  if (!pw) return null;
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw, action: 'check' }) });
  if (!r.ok) { alert("That's not it."); return null; }
  S.pw = pw;
  localStorage.setItem(PW_KEY, pw);
  settingsUi();
  await loadState();
  return pw;
}

// ---------------------------------------------------------------- routing

async function route() {
  const m = location.pathname.match(/^\/books\/([a-z0-9-]+)\/?$/);
  const wantLib = new URLSearchParams(location.search).has('library');
  if (m && !wantLib) return openBook(m[1]);
  if (!wantLib) {
    const lastLocal = local()._last;
    const last = S.pw ? S.state.last || lastLocal : lastLocal || S.state.last;
    if (last && S.index.books.some((b) => b.slug === last)) {
      history.replaceState(null, '', `/books/${last}`);
      return openBook(last);
    }
  }
  showLibrary();
}

function showLibrary() {
  closeBook();
  document.body.classList.add('library');
  document.body.classList.remove('pages');
  $('library').hidden = false;
  $('reader').hidden = true;
  $('bookTitle').textContent = 'Library';
  $('chTitle').textContent = 'Books';
  $('pct').textContent = '';
  document.title = 'Books';
  const t = S.state.totals || { booksFinished: 0, month: { paragraphs: 0, pages: 0 } };
  const month = new Date().toLocaleDateString(undefined, { month: 'long' });
  $('totals').textContent = `${t.booksFinished} book${t.booksFinished === 1 ? '' : 's'} finished · ${t.month.paragraphs.toLocaleString()} paragraphs (about ${t.month.pages.toLocaleString()} pages) read in ${month}`;
  const loc = local();
  $('shelf').innerHTML = S.index.books.map((b) => {
    const st = S.state.books?.[b.slug];
    const i = S.pw ? st?.i : loc[b.slug]?.place?.i ?? st?.i;
    const pct = i != null ? Math.min(100, Math.round(((i + 1) / b.stats.paragraphs) * 100)) : 0;
    const where = st?.finished ? 'Finished' : i != null ? `${pct}% · at ${S.pw ? st?.place : fmtAddr(loc[b.slug]?.place) || st?.place}` : 'Not started';
    return `<li><a href="/books/${b.slug}">${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy">` : ''}<span>
      <span class="bt">${esc(b.title)}</span><span class="ba">${esc(b.author)}</span><span class="bp">${esc(where)}</span>
      <span class="bar2"><i style="width:${pct}%"></i></span></span></a></li>`;
  }).join('');
}

function closeBook() {
  S.book = null;
  S.slug = null;
  for (const id of ['placebar', 'trailbar', 'selbar']) $(id).hidden = true;
  $('text').innerHTML = '';
  $('flow').innerHTML = '';
}

// ---------------------------------------------------------------- book loading + rendering

async function fetchBook(slug) {
  if (S.books.has(slug)) return S.books.get(slug);
  const r = await fetch(`/books/data/${slug}.json`);
  if (!r.ok) throw new Error('no such book');
  const b = await r.json();
  S.books.set(slug, b);
  return b;
}

function chapterHtml(ch) {
  let h = `<section class="ch" id="ch-${ch.n}" data-c="${ch.n}">`;
  for (const p of ch.parts || []) h += `<div class="part"><h2>${esc(p.heading)}</h2>${(p.sub || []).map((s) => `<p>${s}</p>`).join('')}</div>`;
  h += `<h2 class="chh"><span class="chn">${esc(ch.heading)}</span>${ch.sub.length ? `<span class="chsub">${ch.sub.join('<br>')}</span>` : ''}</h2>`;
  for (const b of ch.blocks) {
    if (b.img) {
      const dims = b.w && b.h ? ` width="${b.w}" height="${b.h}"` : '';
      h += `<figure class="fig"><img src="${esc(b.img)}" alt="${esc(b.alt)}"${dims} loading="lazy" decoding="async">${b.caption ? `<figcaption>${b.caption}</figcaption>` : ''}</figure>`;
      continue;
    }
    const key = `${ch.n}:${b.p}`;
    if (b.side) h += `<div class="side">${esc(b.side)}</div>`;
    h += `<p class="para${b.q ? ' q' : ''}" id="${key}" data-c="${ch.n}" data-p="${b.p}"><a class="num" href="#${key}" data-n="${key}" aria-label="Link to paragraph ${key}"></a>${b.s.map((s, k) => `<span class="s" data-s="${k + 1}">${s}</span>`).join(' ')}</p>`;
  }
  return h + '</section>';
}

function indexParas(book) {
  S.paras = [];
  S.byKey = new Map();
  let i = 0;
  for (const ch of book.chapters) {
    for (const b of ch.blocks) {
      if (!b.p) continue;
      const words = strip(b.s.join(' ')).split(/\s+/).filter(Boolean).length;
      const para = { c: ch.n, p: b.p, i: i++, words, el: null };
      S.paras.push(para);
      S.byKey.set(`${ch.n}:${b.p}`, para);
    }
  }
}
const paraAt = (a) => (a ? S.byKey.get(`${a.c}:${a.p}`) || null : null);
const nearestPara = (a) => {
  if (!a) return null;
  return paraAt(a) || S.paras.find((x) => cmpAddr(x, a) >= 0) || S.paras[S.paras.length - 1];
};
const bindEls = (root) => {
  for (const el of root.querySelectorAll('.para')) {
    const p = S.byKey.get(el.id);
    if (p) p.el = el;
  }
};

async function openBook(slug) {
  let book;
  try { book = await fetchBook(slug); } catch { return showLibrary(); }
  document.body.classList.remove('library');
  $('library').hidden = true;
  $('reader').hidden = false;
  S.book = book;
  S.slug = slug;
  S.trail = null;
  S.lastSentView = '';
  document.title = `${book.title} — Books`;
  $('bookTitle').textContent = `${book.title} · ${book.author}`;
  indexParas(book);

  // whose place: Graham (unlocked) = the server's, plus anything not yet synced; visitors = this device's
  const loc = local()[slug] || {};
  const server = S.state.books?.[slug]?.place ? parseAddr(S.state.books[slug].place) : null;
  let place = S.pw ? server : loc.place || server;
  if (S.pw && loc.pending && (!place || cmpAddr(loc.pending, place) > 0)) place = loc.pending;
  S.place = place ? nearestPara(place) : null;
  if (S.place) S.place = { c: S.place.c, p: S.place.p, i: S.place.i };

  render();
  const target = parseAddr(location.hash);
  if (target) {
    goTo(target, { flash: true });
    // a permalink is a one-time jump: a reload later should return to the place, not here
    history.replaceState(null, '', location.pathname);
  } else if (S.place) {
    const idle = S.pw ? S.idleMs : loc.at ? Date.now() - loc.at : null;
    resumeAt(S.place, idle != null && idle > BREAK_MS);
  } else {
    goTo({ c: 1, p: 1 }, { top: true });
  }
  if (S.pw && loc.pending) report(true);
}

function render() {
  const book = S.book;
  document.body.classList.toggle('pages', S.mode === 'pages');
  $('pages').hidden = S.mode !== 'pages';
  $('text').hidden = S.mode === 'pages';
  if (S.mode === 'scroll') {
    $('flow').innerHTML = '';
    $('text').innerHTML = book.chapters.map(chapterHtml).join('');
    bindEls($('text'));
    decorate($('text'));
  } else {
    $('text').innerHTML = '';
    S.pageChapter = 0;
  }
  markPlace();
}

// ---------------------------------------------------------------- notes, highlights, links

function notesFor(slug) { return S.state.books?.[slug]?.notes || []; }

function unwrapMarks(root) {
  for (const m of root.querySelectorAll('mark[data-id]')) m.replaceWith(...m.childNodes);
  for (const a of root.querySelectorAll('aside.note')) a.remove();
  for (const p of root.querySelectorAll('.para.hl')) p.classList.remove('hl');
  root.normalize();
}

/** Wrap the first occurrence of `quote` inside `el` (across tags) in <mark>. */
function markQuote(el, quote, cls, id) {
  const want = quote.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!want) return false;
  const nodes = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('a.fn,.num') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let text = '';
  const map = []; // per normalised char: [node, offset]
  for (let n; (n = walker.nextNode());) {
    nodes.push(n);
    for (let k = 0; k < n.data.length; k++) {
      const ch = /\s/.test(n.data[k]) ? ' ' : n.data[k].toLowerCase();
      if (ch === ' ' && text.endsWith(' ')) continue;
      text += ch;
      map.push([n, k]);
    }
  }
  const at = text.indexOf(want);
  if (at < 0) return false;
  const [sn, so] = map[at];
  const [en, eo] = map[at + want.length - 1];
  const range = document.createRange();
  // wrap each text node segment separately so the HTML stays valid
  const segs = [];
  let inside = false;
  for (const n of nodes) {
    if (n === sn) inside = true;
    if (inside) segs.push([n, n === sn ? so : 0, n === en ? eo + 1 : n.data.length]);
    if (n === en) break;
  }
  for (const [n, a, b] of segs) {
    if (b <= a) continue;
    range.setStart(n, a);
    range.setEnd(n, b);
    const m = document.createElement('mark');
    m.className = cls;
    m.dataset.id = id;
    range.surroundContents(m);
  }
  return true;
}

function linkify(t) {
  return esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

const wideMargin = () => window.matchMedia('(min-width: 1240px)').matches;

function decorate(root) {
  if (!S.slug) return;
  unwrapMarks(root);
  for (const n of notesFor(S.slug)) {
    const start = paraAt(n.at);
    if (!start || !start.el || !root.contains(start.el)) continue;
    if (n.kind === 'highlight') {
      if (n.quote && !n.to && markQuote(start.el, n.quote, 'hl', n.id)) continue;
      const end = n.to ? paraAt(n.to) : start;
      for (const p of S.paras.slice(start.i, (end || start).i + 1)) if (p.el) { p.el.classList.add('hl'); p.el.dataset.hid = n.id; }
      continue;
    }
    if (n.quote) markQuote(start.el, n.quote, 'nq', n.id);
    const aside = document.createElement('aside');
    aside.className = `note${n.kind === 'link' ? ' link' : ''}`;
    aside.dataset.id = n.id;
    aside.setAttribute('aria-label', n.kind === 'link' ? 'Link' : 'Note');
    aside.innerHTML = n.kind === 'link'
      ? `<span class="k">↗</span><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label || n.url)}</a>${n.text ? `<br>${linkify(n.text)}` : ''}`
      : `<span class="k">✎</span>${linkify(n.text)}`;
    if (root.id === 'text' && wideMargin()) {
      // desktop: the note floats into the right margin, level with its paragraph
      start.el.before(aside);
    } else {
      // phone / pages: inline, after the last note already attached to this paragraph
      let after = start.el;
      while (after.nextElementSibling && after.nextElementSibling.matches('aside.note')) after = after.nextElementSibling;
      after.after(aside);
    }
  }
}

function refreshNotes() {
  if (!S.book) return;
  const anchor = S.top;
  if (S.mode === 'scroll') {
    const y = anchor && anchor.el ? anchor.el.getBoundingClientRect().top : null;
    decorate($('text'));
    if (y != null) window.scrollBy(0, anchor.el.getBoundingClientRect().top - y);
  } else {
    decorate($('flow'));
    paginate(anchor);
  }
}

// ---------------------------------------------------------------- navigation

// constant, so showing/hiding the bars never changes which paragraph counts as "the top"
const topEdge = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) + 6;

function scrollToPara(para, where = 'top', smooth = false, extra = 0) {
  if (!para || !para.el) return;
  S.progScroll = Date.now();
  // the first paragraph of a chapter: show the chapter heading too
  const el = para.p === 1 && !extra ? para.el.closest('.ch') || para.el : para.el;
  const y = el.getBoundingClientRect().top + window.scrollY - topEdge() - 6 - extra;
  window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' });
}

function goTo(a, opts = {}) {
  const para = nearestPara(a);
  if (!para) return;
  if (S.mode === 'pages') {
    showChapterPage(para);
  } else {
    scrollToPara(para, 'top', !!opts.smooth);
  }
  if (opts.flash) flash(para, a.s);
  setTimeout(track, 60);
}

function flash(para, s) {
  if (!para.el) return;
  const t = s ? para.el.querySelector(`.s[data-s="${s}"]`) : null;
  const el = t || para.el;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  if (t) setTimeout(() => t.classList.remove('flash'), 4000);
}

/** Return after a break: the place at the top, the two paragraphs before it faded in above. */
function resumeAt(place, afterBreak) {
  const para = nearestPara(place);
  if (S.mode === 'pages') {
    showChapterPage(para);
    return;
  }
  if (!afterBreak) return scrollToPara(para);
  const before = S.paras.slice(Math.max(0, para.i - 2), para.i).filter((p) => p.c === para.c && p.el);
  for (const b of before) b.el.classList.add('faded');
  const h = before.reduce((n, b) => n + b.el.getBoundingClientRect().height, 0);
  S.hold = para.i;
  scrollToPara(para, 'top', false, Math.min(h + 12, window.innerHeight * 0.42));
  if (before.length) toast(`Picking up at ${fmtAddr(para)}`);
}

function markPlace() {
  for (const el of document.querySelectorAll('.para.place')) el.classList.remove('place');
  const p = paraAt(S.place);
  if (p && p.el) p.el.classList.add('place');
}

function backToPlace() {
  const p = S.place ? paraAt(S.place) : S.paras[0];
  S.trail = null;
  $('trailbar').hidden = true;
  if (S.mode === 'pages') showChapterPage(p);
  else scrollToPara(p, 'top', true);
  setTimeout(() => flash(p), 350);
  setTimeout(track, 700);
}

async function moveHere() {
  const p = S.top;
  if (!p) return;
  const prev = S.place;
  await setBookmark(p);
  if (prev && prev.i !== p.i) toast(`Bookmark moved to ${fmtAddr(p)} (was ${fmtAddr(prev)})`, () => setBookmark(prev).then(() => toast(`Bookmark back at ${fmtAddr(prev)}`)));
  else toast(`Bookmark at ${fmtAddr(p)}`);
}

/** Put the bookmark on paragraph p. Never scrolls or jumps — the view stays where it is. */
async function setBookmark(p) {
  S.place = { c: p.c, p: p.p, i: p.i };
  S.pendingWords = 0;
  markPlace();
  saveLocal(S.slug, S.pw ? { pending: S.place } : { place: S.place });
  track();
  if (!S.pw) return;
  try {
    const d = await api('POST', { action: 'move-place', slug: S.slug, place: S.place });
    S.state = { ...S.state, ...d };
    saveLocal(S.slug, { pending: null });
  } catch {}
}

// ---------------------------------------------------------------- tracking what's on screen

function visibleParasScroll() {
  const top = topEdge();
  const bottom = window.innerHeight - (document.body.classList.contains('hide-bars') ? 0 : 56);
  const ps = S.paras;
  let lo = 0;
  let hi = ps.length - 1;
  while (lo < hi) { // first paragraph whose bottom is below the top edge
    const mid = (lo + hi) >> 1;
    if (ps[mid].el.getBoundingClientRect().bottom <= top + 4) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let k = lo; k < ps.length; k++) {
    const r = ps[k].el.getBoundingClientRect();
    if (r.top >= bottom) break;
    out.push(ps[k]);
  }
  // A screen with no paragraph on it (title page, a full-page plate) still has a position: the next paragraph down.
  // Without this the reader froze on the last paragraph it saw, and the bookmark controls went stale/missing.
  if (!out.length && ps[lo]) out.push(ps[lo]);
  return out;
}

function visibleParasPages() {
  const box = $('pages').getBoundingClientRect();
  const out = [];
  for (const p of S.paras) {
    if (p.c !== S.pageChapter || !p.el) continue;
    for (const r of p.el.getClientRects()) {
      if (r.right > box.left + 2 && r.left < box.right - 2 && r.bottom > box.top && r.top < box.bottom) { out.push(p); break; }
    }
  }
  return out;
}

let raf = 0;
function track() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (!S.book || !S.paras.length) return;
    const vis = S.mode === 'pages' ? visibleParasPages() : visibleParasScroll();
    if (!vis.length) return;
    S.visible = vis;
    S.top = vis[0];
    const ch = S.book.chapters[S.top.c - 1];
    $('chTitle').textContent = `${ch.heading}${ch.sub.length ? ' — ' + strip(ch.sub[0]) : ''}`;
    updatePlacebar();
    const shown = S.hold != null ? paraAt(S.place) || S.top : S.top; // during the resume fade, report the place itself
    $('pct').textContent = `${fmtAddr(shown)} · ${Math.round(((shown.i + 1) / S.paras.length) * 100)}%`;
    scheduleReport();
  });
}

function atPlaceish() {
  if (!S.place || !S.top) return true;
  if (S.hold != null) {
    if (S.top.i >= S.hold - 2 && S.top.i <= S.hold) return true;
    for (const el of document.querySelectorAll('.para.faded')) el.classList.remove('faded');
    S.hold = null;
  }
  if (S.visible.some((p) => p.i === S.place.i)) return true;
  const d = S.top.i - S.place.i;
  return d >= 0 && d <= 12;
}

function updatePlacebar() {
  const away = !atPlaceish();
  const behind = S.place && S.top && S.top.i < S.place.i;
  // The bookmark controls never disappear (spec 32): "Put bookmark here" is always on screen; "Go to bookmark"
  // shows whenever you're away from it. Only the selection toolbar or the reread trail (which has both) replace it.
  $('placebar').hidden = !!S.trail || !$('selbar').hidden;
  $('backBtn').hidden = !away || !S.place;
  if (away && S.place) $('backBtn').textContent = `${behind ? '↓' : '↑'} Go to bookmark · ${fmtAddr(S.place)}`;
  if (S.trail) {
    const p = S.place && S.top ? S.place.i - S.top.i : 0;
    $('trailMsg').textContent = p > 0 ? `Rereading · ${p} paragraph${p === 1 ? '' : 's'} to your place` : 'Caught up with your place';
  }
}

let reportTimer = 0;
function scheduleReport() {
  clearTimeout(reportTimer);
  reportTimer = setTimeout(() => commit(), REPORT_MS);
}

/** After the screen has been still for a moment: maybe advance the place, then report. */
function commit() {
  if (!S.book || !S.top) return;
  let cand = S.top;
  const lastPara = S.paras[S.paras.length - 1];
  const atEnd = S.mode === 'scroll'
    ? window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8
    : S.pageChapter === S.book.chapters.length && S.page >= S.pageCount - 1;
  if (atEnd) cand = S.visible[S.visible.length - 1];
  if (S.hold == null && canAdvance(S.place, cand)) {
    const from = S.place ? S.place.i + 1 : 0;
    for (const p of S.paras.slice(from, cand.i + 1)) S.pendingWords += p.words;
    S.place = { c: cand.c, p: cand.p, i: cand.i };
    markPlace();
    saveLocal(S.slug, S.pw ? { pending: S.place } : { place: S.place });
  } else {
    saveLocal(S.slug, {}); // touch "last active"
  }
  updatePlacebar();
  report(false, atEnd && S.place && S.place.i === lastPara.i);
}

let inflight = false;
async function report(force, finished = false) {
  if (!S.pw || !S.slug) return;
  const view = S.visible.map((p) => fmtAddr(p));
  const sig = `${S.slug}|${view.join(',')}|${fmtAddr(S.place)}`;
  if (!force && sig === S.lastSentView) return;
  if (inflight) { scheduleReport(); return; }
  inflight = true;
  const words = S.pendingWords;
  try {
    const d = await api('POST', { action: 'progress', slug: S.slug, view, place: S.place, words, finished: finished || undefined });
    S.lastSentView = sig;
    S.pendingWords -= words;
    S.state = { ...S.state, ...d };
    saveLocal(S.slug, { pending: null });
  } catch { /* stays pending in localStorage; retried on the next report */ }
  inflight = false;
}

function flushOnLeave() {
  if (!S.pw || !S.slug || !S.place) return;
  const view = S.visible.map((p) => fmtAddr(p));
  const body = JSON.stringify({ action: 'progress', slug: S.slug, view, place: S.place, words: S.pendingWords, password: S.pw });
  try { fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }); S.pendingWords = 0; } catch {}
}

// ---------------------------------------------------------------- page-turn mode

function showChapterPage(para, page) {
  if (!para) return;
  if (S.pageChapter !== para.c || !$('flow').firstChild) {
    S.pageChapter = para.c;
    $('flow').innerHTML = chapterHtml(S.book.chapters[para.c - 1]);
    for (const p of S.paras) p.el = null;
    bindEls($('flow'));
    decorate($('flow'));
    markPlace();
  }
  paginate(para, page);
}

function layoutPages() {
  const flow = $('flow');
  const wide = $('pages').clientWidth >= 1000;
  flow.style.columnCount = wide ? '2' : '1';
  flow.style.transition = 'none';
  flow.style.transform = 'translateX(0)';
  const stride = flow.clientWidth + 48;
  const last = flow.lastElementChild;
  const lastRect = last ? [...last.getClientRects()].pop() : null;
  const flowLeft = flow.getBoundingClientRect().left;
  const span = lastRect ? lastRect.right - flowLeft : flow.clientWidth;
  S.pageCount = Math.max(1, Math.ceil((span - 2) / stride));
  return stride;
}

function paginate(para, page) {
  if (S.mode !== 'pages') return;
  const stride = layoutPages();
  if (page === 'last') S.page = S.pageCount - 1;
  else if (Number.isInteger(page)) S.page = page;
  else if (para && para.el && para.c === S.pageChapter) {
    const r = para.el.getClientRects()[0];
    S.page = r ? Math.max(0, Math.floor((r.left - $('flow').getBoundingClientRect().left + 4) / stride)) : 0;
  } else S.page = 0;
  S.page = Math.min(S.page, S.pageCount - 1);
  setPage(false);
}

function setPage(animate = true) {
  const flow = $('flow');
  const stride = flow.clientWidth + 48;
  flow.style.transition = animate ? '' : 'none';
  flow.style.transform = `translateX(${-S.page * stride}px)`;
  let no = $('pageNo');
  if (!no) { no = document.createElement('div'); no.id = 'pageNo'; document.body.append(no); }
  no.textContent = `${S.book.chapters[S.pageChapter - 1].heading} · page ${S.page + 1} of ${S.pageCount}`;
  setTimeout(track, animate ? 300 : 20);
}

function turn(dir) {
  if (S.mode !== 'pages' || !S.book) return;
  if (dir > 0) {
    if (S.page < S.pageCount - 1) { S.page++; return setPage(); }
    const next = S.paras.find((p) => p.c === S.pageChapter + 1);
    if (next) showChapterPage(next, 0);
  } else {
    if (S.page > 0) { S.page--; return setPage(); }
    const prev = S.paras.find((p) => p.c === S.pageChapter - 1);
    if (prev) showChapterPage(prev, 'last');
  }
}

function setMode(mode) {
  if (mode === S.mode) return;
  const anchor = S.top || paraAt(S.place);
  S.mode = mode;
  S.settings.mode = mode;
  applySettings();
  if (!S.book) return;
  render();
  if (mode === 'scroll') { $('pageNo')?.remove(); requestAnimationFrame(() => { scrollToPara(nearestPara(anchor)); track(); }); }
  else showChapterPage(nearestPara(anchor) || S.paras[0]);
}

// ---------------------------------------------------------------- selection: note / highlight / link / copy

function selectionInfo() {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const root = S.mode === 'pages' ? $('flow') : $('text');
  if (!root.contains(range.commonAncestorContainer)) return null;
  const el = (n) => (n.nodeType === 1 ? n : n.parentElement);
  const paraOf = (n, forward) => {
    const e = el(n);
    let p = e.closest('.para');
    if (p) return p;
    // selection started in a heading or note: use the next (or previous) paragraph
    const all = [...root.querySelectorAll('.para')];
    p = forward ? all.find((x) => e.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) : all.reverse().find((x) => e.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING);
    return p || null;
  };
  const sp = paraOf(range.startContainer, true);
  const ep = paraOf(range.endContainer, false);
  if (!sp || !ep) return null;
  const sa = { c: +sp.dataset.c, p: +sp.dataset.p };
  const ea = { c: +ep.dataset.c, p: +ep.dataset.p };
  const ss = el(range.startContainer).closest('.s');
  const es = el(range.endContainer).closest('.s');
  if (ss && sp.contains(ss)) sa.s = +ss.dataset.s;
  if (es && ep.contains(es)) ea.s = +es.dataset.s;
  // clean copy: no margin numbers, footnote markers or notes
  const frag = range.cloneContents();
  for (const x of frag.querySelectorAll('.num, a.fn, aside.note, .side')) x.remove();
  const blocks = frag.querySelectorAll('.para');
  let text;
  if (blocks.length > 1) text = [...blocks].map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
  else text = frag.textContent.replace(/\s+/g, ' ').trim();
  const div = document.createElement('div');
  div.append(frag);
  return { start: sa, end: ea, text, html: div.innerHTML };
}

document.addEventListener('copy', (e) => {
  const info = selectionInfo();
  if (!info || !info.text) return; // anything else: the browser's normal copy
  const cite = citation(S.book, info.start, info.end, ORIGIN);
  e.clipboardData.setData('text/plain', copyPayload(info.text, cite));
  e.clipboardData.setData('text/html', copyPayloadHtml(info.html, S.book, info.start, info.end, ORIGIN));
  e.preventDefault();
});

let selTimer = 0;
document.addEventListener('selectionchange', () => {
  clearTimeout(selTimer);
  selTimer = setTimeout(() => {
    const info = S.book ? selectionInfo() : null;
    $('selbar').hidden = !info;
    S.sel = info;
    updatePlacebar();
  }, 250);
});

$('selbar').addEventListener('pointerdown', (e) => e.preventDefault()); // keep the selection alive on tap
$('selbar').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !S.sel) return;
  const info = S.sel;
  const one = info.start.c === info.end.c && info.start.p === info.end.p;
  const at = { c: info.start.c, p: info.start.p, ...(info.start.s && one && info.end.s === info.start.s ? { s: info.start.s } : {}) };
  const base = { slug: S.slug, at, to: one ? undefined : { c: info.end.c, p: info.end.p }, quote: one && info.text.length <= 400 ? info.text : undefined };
  const kind = b.dataset.sel;
  if (kind === 'cite') {
    const url = permalink(ORIGIN, S.slug, info.start.s && one ? info.start : { c: info.start.c, p: info.start.p });
    await copyText(url);
    toast(`Link to ${rangeLabel(info.start, info.end)} copied`);
    return;
  }
  if (kind === 'highlight') {
    getSelection().removeAllRanges();
    return saveNote({ ...base, action: 'note', kind: 'highlight' });
  }
  const r = await compose(kind, info.text);
  if (!r) return;
  getSelection().removeAllRanges();
  saveNote({ ...base, action: 'note', kind, ...r });
});

async function saveNote(body) {
  if (!(await getPw())) return;
  try {
    const d = await api('POST', body);
    S.state = { ...S.state, ...d };
    refreshNotes();
    toast(body.kind === 'highlight' ? 'Highlighted' : body.kind === 'link' ? 'Link added' : 'Note added');
  } catch (e) {
    toast(`Couldn't save: ${e.message}`);
  }
}

function compose(kind, quote) {
  return new Promise((resolve) => {
    const dlg = $('composeDlg');
    $('composeH').textContent = kind === 'link' ? 'Add a link' : 'Add a note';
    $('composeQuote').textContent = quote.length > 400 ? quote.slice(0, 400) + '…' : quote;
    $('urlRow').hidden = $('labelRow').hidden = kind !== 'link';
    $('textLabel').textContent = kind === 'link' ? 'Comment (optional)' : 'Note';
    $('composeUrl').required = kind === 'link';
    $('composeText').required = kind === 'note';
    $('composeUrl').value = $('composeLabel').value = $('composeText').value = '';
    dlg.returnValue = '';
    dlg.onclose = () => {
      if (dlg.returnValue !== 'save') return resolve(null);
      resolve(kind === 'link'
        ? { url: $('composeUrl').value.trim(), label: $('composeLabel').value.trim() || undefined, text: $('composeText').value.trim() || undefined }
        : { text: $('composeText').value.trim() });
    };
    dlg.showModal();
    (kind === 'link' ? $('composeUrl') : $('composeText')).focus();
  });
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); } catch {
    const ta = document.createElement('textarea');
    ta.value = t; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
}

// note menu (tap a note or a highlight)
let openNote = null;
function showNote(id) {
  const n = notesFor(S.slug).find((x) => x.id === id);
  if (!n) return;
  openNote = n;
  $('noteH').textContent = n.kind === 'highlight' ? 'Highlight' : n.kind === 'link' ? 'Link' : 'Note';
  $('noteBody').innerHTML = `<div class="gq">${esc(n.quote || rangeLabel(n.at, n.to))}</div>${n.text ? `<p>${linkify(n.text)}</p>` : ''}${n.url ? `<p><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.label || n.url)}</a></p>` : ''}`;
  $('noteDlg').showModal();
}
$('noteLink').onclick = async () => {
  if (!openNote) return;
  await copyText(permalink(ORIGIN, S.slug, openNote.at));
  toast('Link copied');
};
$('noteDel').onclick = async () => {
  if (!openNote || !(await getPw())) return;
  if (!confirm('Delete this for good?')) return;
  try {
    const d = await api('POST', { action: 'delete-note', slug: S.slug, id: openNote.id });
    S.state = { ...S.state, ...d };
    $('noteDlg').close();
    refreshNotes();
  } catch (e) { toast(e.message); }
};

// ---------------------------------------------------------------- "Where was I?"

async function recall() {
  if (!S.book) return;
  const body = $('recallBody');
  const gists = S.book.gists || [];
  let sessions = [];
  if (S.pw) {
    try {
      const d = await api('GET');
      S.state = { ...S.state, ...d };
      sessions = d.sessions?.[S.slug] || [];
    } catch {}
  }
  // newest first; a session is shown as the gists of the chunks it covered
  const groups = sessions.slice().reverse().map((s) => gistsForRanges(gists, s.ranges)).filter((g) => g.length);
  // nothing logged (new device / visitor): use the chunks leading up to the place
  if (!groups.length) {
    const here = S.place ? gistAt(gists, S.place) : null;
    const k = here ? gists.indexOf(here) : -1;
    if (k >= 0) groups.push(gists.slice(Math.max(0, k - 3), k + 1).filter((g) => g.text));
    for (let j = k - 4; j >= 0; j -= 4) groups.push(gists.slice(Math.max(0, j - 3), j + 1).filter((g) => g.text));
    for (let j = groups.length - 1; j >= 0; j--) if (!groups[j].length) groups.splice(j, 1);
  }
  const step = (n) => {
    if (!groups.length) {
      body.innerHTML = `<p>No summaries yet for this book${S.pw ? '' : ' — unlock to see your reading sessions'}.</p>`;
      return;
    }
    const g = groups[Math.min(n, groups.length - 1)];
    const label = n === 0 ? (sessions.length ? 'Last time you read' : 'Just before your place') : 'Before that';
    body.innerHTML = `<h3>${label}</h3>${g.map((x) => `<button class="gist" data-c="${x.c}" data-p="${x.from}"><span class="ga">${x.c}:${x.from}–${x.to} · ${esc(S.book.chapters[x.c - 1].heading)}</span>${esc(x.text)}</button>`).join('')}
      <p class="hint" style="margin:6px 0 0">Tap a summary to reread from there — your place stays put.</p>
      <div class="recall-actions"><button data-r="yes" class="primary">I remember — take me to my place</button>${n < groups.length - 1 ? `<button data-r="older">Don't remember — earlier</button>` : ''}</div>`;
    body.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.r === 'yes') { $('recallDlg').close(); backToPlace(); }
      else if (b.dataset.r === 'older') step(n + 1);
      else if (b.dataset.c) { $('recallDlg').close(); startTrail({ c: +b.dataset.c, p: +b.dataset.p }); }
    };
  };
  step(0);
  $('recallDlg').showModal();
}

function startTrail(a) {
  S.trail = { from: a };
  $('trailbar').hidden = false;
  $('placebar').hidden = true;
  goTo(a, { flash: true });
}

// ---------------------------------------------------------------- contents

function showToc() {
  const cur = S.top ? S.top.c : 1;
  const mine = S.place ? S.place.c : 0;
  $('tocList').innerHTML = S.book.chapters.map((ch) =>
    `${(ch.parts || []).map((p) => `<li class="tp">${esc(p.heading)}</li>`).join('')}<li class="${ch.n === cur ? 'cur' : ''} ${ch.n === mine ? 'mine' : ''}"><button data-c="${ch.n}"><span class="tn">${ch.n}. ${esc(ch.heading)}</span>${ch.sub.length ? `<span class="ts">${esc(strip(ch.sub[ch.sub.length > 1 && strip(ch.sub[0]).length < 14 ? 1 : 0]))}</span>` : ''}</button></li>`).join('');
  $('tocDlg').showModal();
  $('tocList').querySelector('.cur button')?.scrollIntoView({ block: 'center' });
}
$('tocList').onclick = (e) => {
  const b = e.target.closest('button[data-c]');
  if (!b) return;
  $('tocDlg').close();
  goTo({ c: +b.dataset.c, p: 1 });
};

// ---------------------------------------------------------------- misc UI

let toastTimer = 0;
function toast(msg, undo) {
  const t = $('toast');
  $('toastMsg').textContent = msg;
  const u = $('toastUndo');
  u.hidden = !undo;
  u.onclick = undo ? () => { t.classList.remove('on'); undo(); } : null;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), undo ? 6000 : 2400);
}

function wire() {
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
  }
  $('libBtn').onclick = () => { history.pushState(null, '', '/books?library'); showLibrary(); };
  $('shelf').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/books/"]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    history.pushState(null, '', a.getAttribute('href'));
    openBook(a.getAttribute('href').split('/').pop());
  });
  $('tocBtn').onclick = showToc;
  $('recallBtn').onclick = recall;
  $('placeBtn').onclick = backToPlace;
  $('backBtn').onclick = backToPlace;
  $('trailBack').onclick = backToPlace;
  $('trailMove').onclick = () => { moveHere(); S.trail = null; $('trailbar').hidden = true; updatePlacebar(); };
  $('moveBtn').onclick = moveHere;
  $('setBtn').onclick = () => { settingsUi(); $('setDlg').showModal(); };
  for (const r of document.querySelectorAll('#setDlg input[type=radio]')) {
    r.onchange = () => {
      if (r.name === 'mode') return setMode(r.value);
      restyle(() => { S.settings[r.name] = r.value; });
    };
  }
  const clampStep = (k, d, lo, hi, step) => restyle(() => { S.settings[k] = Math.round(Math.min(hi, Math.max(lo, S.settings[k] + d * step)) * 100) / 100; });
  for (const b of document.querySelectorAll('[data-size]')) b.onclick = () => clampStep('size', +b.dataset.size, 14, 30, 1);
  for (const b of document.querySelectorAll('[data-lh]')) b.onclick = () => clampStep('lh', +b.dataset.lh, 1.3, 2.1, 0.08);
  for (const b of document.querySelectorAll('[data-measure]')) b.onclick = () => clampStep('measure', +b.dataset.measure, 24, 48, 2);
  $('numsChk').onchange = () => restyle(() => { S.settings.nums = $('numsChk').checked; });
  $('authBtn').onclick = async () => {
    if (S.pw) { S.pw = null; localStorage.removeItem(PW_KEY); settingsUi(); toast('Locked on this device'); return; }
    if (await getPw()) { toast('Unlocked — your place syncs from here'); if (S.slug) openBook(S.slug); }
  };

  const reader = $('reader');
  reader.addEventListener('click', (e) => {
    const fn = e.target.closest('a.fn');
    if (fn) {
      e.preventDefault();
      const f = S.book.footnotes?.[fn.dataset.fn];
      $('fnH').textContent = `Footnote ${fn.textContent}`;
      $('fnBody').innerHTML = f ? f.html.map((h) => `<p>${h}</p>`).join('') : '<p>(missing)</p>';
      $('fnDlg').showModal();
      return;
    }
    const num = e.target.closest('a.num');
    if (num) {
      e.preventDefault();
      const a = parseAddr(num.dataset.n);
      copyText(permalink(ORIGIN, S.slug, a)).then(() => toast(`Link to ${fmtAddr(a)} copied`));
      return;
    }
    const note = e.target.closest('aside.note, mark[data-id]');
    if (note && !e.target.closest('a[href]') && getSelection().isCollapsed) return showNote(note.dataset.id);
    const hl = e.target.closest('.para.hl');
    if (hl && getSelection().isCollapsed && hl.dataset.hid && e.detail === 2) return showNote(hl.dataset.hid);
    if (S.mode === 'pages' && getSelection().isCollapsed && !e.target.closest('a,button')) {
      const x = e.clientX / window.innerWidth;
      if (x > 0.62) turn(1);
      else if (x < 0.3) turn(-1);
      else document.body.classList.toggle('hide-bars');
    }
  });

  // page mode: swipe
  let sx = null;
  $('pages').addEventListener('touchstart', (e) => { sx = e.touches.length === 1 ? [e.touches[0].clientX, e.touches[0].clientY] : null; }, { passive: true });
  $('pages').addEventListener('touchend', (e) => {
    if (!sx || !getSelection().isCollapsed) return;
    const dx = e.changedTouches[0].clientX - sx[0];
    const dy = e.changedTouches[0].clientY - sx[1];
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
    sx = null;
  });
  $('pages').addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) < 30 && Math.abs(e.deltaX) < 30) return;
    e.preventDefault();
    if (wheelLock) return;
    wheelLock = true;
    setTimeout(() => { wheelLock = false; }, 350);
    turn((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1);
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea,dialog') || e.metaKey || e.ctrlKey || e.altKey || !S.book) return;
    if (S.mode === 'pages') {
      if (['ArrowRight', 'PageDown', ' ', 'j'].includes(e.key)) { e.preventDefault(); turn(e.shiftKey && e.key === ' ' ? -1 : 1); }
      if (['ArrowLeft', 'PageUp', 'k'].includes(e.key)) { e.preventDefault(); turn(-1); }
    }
    if (e.key === 'p') backToPlace();
    if (e.key === 'c') showToc();
  });

  // scroll mode: hide bars when reading down, show when scrolling up
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    if (S.mode !== 'scroll' || !S.book) return;
    const y = window.scrollY;
    if (Date.now() - (S.progScroll || 0) < 900) lastY = y;
    else if (Math.abs(y - lastY) > 12) {
      document.body.classList.toggle('hide-bars', y > lastY && y > 200);
      lastY = y;
    }
    track();
  }, { passive: true });
  let wasWide = wideMargin();
  window.addEventListener('resize', () => {
    if (S.mode === 'pages' && S.book) paginate(S.top);
    else {
      if (wideMargin() !== wasWide) { wasWide = wideMargin(); refreshNotes(); }
      track();
    }
  });
  window.addEventListener('hashchange', () => {
    const a = parseAddr(location.hash);
    if (a && S.book) goTo(a, { flash: true });
  });
  window.addEventListener('popstate', () => route());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnLeave();
    else if (S.book && S.pw) loadState().then(() => { refreshNotes(); });
  });
  window.addEventListener('pagehide', flushOnLeave);
}
let wheelLock = false;

// ---------------------------------------------------------------- boot

(async function boot() {
  loadSettings();
  applySettings();
  wire();
  const [idx] = await Promise.all([fetch('/books/data/index.json', { cache: 'no-cache' }).then((r) => r.json()), loadState()]);
  S.index = idx;
  await route();
})();
