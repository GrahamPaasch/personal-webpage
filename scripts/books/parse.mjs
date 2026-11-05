/**
 * Pure book-parsing helpers for the /books reader (voice-ui spec 32).
 *
 * parseBookHtml(html) turns a Project Gutenberg (or similar) HTML ebook into
 * the reader's JSON shape:
 *   chapters[c-1].blocks = [{ p, s: [sentenceHtml...] } | { img, alt, caption }]
 * Chapters are numbered 1..N in reading order (front matter we keep, such as a
 * preface, counts as a chapter), paragraphs 1..k within each chapter, and
 * sentences 1..m within each paragraph, so every sentence has an address c:p.s.
 *
 * No I/O here: import.mjs does the downloading and writing.
 */
import { parseDocument } from 'htmlparser2';

// ---------------------------------------------------------------- sentences

/**
 * Words that end in a period without ending the sentence. Old books are full
 * of them: "M. de la Salle", "Tom. III. p. 444", "St. Lawrence", "Capt. Smith".
 * Single capital letters (initials) are handled separately.
 */
export const ABBREVIATIONS = new Set(
  (
    'mr mrs messrs dr st ste mt ft fr pere rev revd hon capt col gen lieut lt gov govr sr jr esq ' +
    'm mm mme mlle mgr msgr viz vol vols tom chap ch p pp ibid id cf fig figs no nos lat long deg ' +
    'hist ms mem lib liv cap art sect sec ed eds edit prof bp abp ven vid doct gent ult inst ' +
    'jan feb mar apr jun jul aug sep sept oct nov dec etc'
  ).split(' '),
);
// "etc." usually sits mid-sentence in these books ("bows, arrows, etc. and"),
// but when followed by a capital it nearly always ends one, so it is only
// treated as an abbreviation before lowercase text, which never splits anyway.
ABBREVIATIONS.delete('etc');

const CLOSERS = `"'”’)]»`;
const OPENERS = `"'“‘([«`;

/**
 * Split plain text into sentences. Returns [start, end) offsets into `text`
 * (trailing whitespace excluded). Conservative: a boundary needs terminal
 * punctuation, optional closing quotes, whitespace, then an uppercase letter
 * (optionally behind an opening quote) — and the word before the period must
 * not be a known abbreviation or a lone initial.
 */
export function splitSentences(text) {
  const out = [];
  const re = new RegExp(`[.!?]+[${escapeRe(CLOSERS)}]*(?=\\s+[${escapeRe(OPENERS)}]?[A-ZÀ-ÖØ-Þ])`, 'g');
  let start = 0;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    if (m[0][0] === '.' && !/[!?]/.test(m[0])) {
      const before = text.slice(start, m.index);
      const word = (before.match(/([A-Za-zÀ-ÿ&]+)$/) || [])[1] || '';
      if (/^[A-Z]$/.test(word)) continue; // initial: "A. B. Smith", "N. France"
      if (ABBREVIATIONS.has(word.toLowerCase())) continue;
    }
    const piece = text.slice(start, end).trim();
    if (piece.length < 3 && out.length) continue; // never leave a crumb sentence
    if (/^[IVXL]{1,5}\.$/.test(piece)) continue; // a list numeral ("II.") opens the next sentence
    out.push([start + leadingSpace(text, start), end]);
    start = end;
  }
  const lead = start + leadingSpace(text, start);
  if (text.slice(lead).trim()) out.push([lead, text.replace(/\s+$/, '').length]);
  return out;
}

function leadingSpace(text, i) {
  let n = 0;
  while (i + n < text.length && /\s/.test(text[i + n])) n++;
  return n;
}

function escapeRe(s) {
  return s.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&');
}

// ---------------------------------------------------------------- inline runs

/**
 * Inline content is a token list:
 *   { t: 'text', v, f }  text with format flags f = 'i' | 'b' | 'sc' | 'sup' | 'sub' (sorted, joined by ',')
 *   { t: 'fn', key, label }  footnote reference (zero width)
 *   { t: 'br' }
 */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FMT_TAG = { i: ['<i>', '</i>'], b: ['<b>', '</b>'], sc: ['<span class="sc">', '</span>'], sup: ['<sup>', '</sup>'], sub: ['<sub>', '</sub>'] };

export function tokensToHtml(tokens) {
  let html = '';
  for (const tok of tokens) {
    if (tok.t === 'br') html += '<br>';
    else if (tok.t === 'fn') html += `<a class="fn" data-fn="${tok.key}" href="#fn${tok.key}">${esc(tok.label)}</a>`;
    else if (tok.v) {
      let open = '';
      let close = '';
      for (const f of tok.f ? tok.f.split(',') : []) {
        open += FMT_TAG[f][0];
        close = FMT_TAG[f][1] + close;
      }
      html += open + esc(tok.v) + close;
    }
  }
  // Merge adjacent identical wrappers: "<i>a</i><i> b</i>" -> "<i>a b</i>".
  return html.replace(/<\/(i|b|sup|sub)><\1>/g, '').replace(/<\/span><span class="sc">/g, '');
}

/** Collapse whitespace across tokens, trim the ends, drop empty text tokens. */
export function normalizeTokens(tokens) {
  const out = [];
  let prevSpace = true; // trims leading space
  for (const tok of tokens) {
    if (tok.t === 'br' && !out.length) continue; // no leading <br>
    if (tok.t !== 'text') {
      if (tok.t === 'br') prevSpace = true;
      out.push(tok);
      continue;
    }
    let v = tok.v.replace(/[\s ]+/g, (ws) => (ws.includes(' ') && !/[\n\t ]/.test(ws) ? ' ' : ' '));
    if (prevSpace) v = v.replace(/^ +/, '');
    if (!v) continue;
    prevSpace = v.endsWith(' ');
    out.push({ ...tok, v });
  }
  // trim trailing space / br
  while (out.length) {
    const last = out[out.length - 1];
    if (last.t === 'br') { out.pop(); continue; }
    if (last.t === 'text') {
      const v = last.v.replace(/\s+$/, '');
      if (!v) { out.pop(); continue; }
      out[out.length - 1] = { ...last, v };
    }
    break;
  }
  // no space right after a <br>
  for (let i = 1; i < out.length; i++) {
    if (out[i].t === 'text' && out[i - 1].t === 'br') out[i] = { ...out[i], v: out[i].v.replace(/^ +/, '') };
  }
  return out.filter((t) => t.t !== 'text' || t.v);
}

export const tokensText = (tokens) => tokens.map((t) => (t.t === 'text' ? t.v : t.t === 'br' ? ' ' : '')).join('');

/**
 * Split a paragraph's tokens into per-sentence HTML strings. Formatting that
 * straddles a sentence boundary is closed and reopened, so each sentence is
 * well-formed HTML on its own. A footnote marker belongs to the sentence it
 * follows.
 */
export function sentencesFromTokens(tokens) {
  const text = tokensText(tokens);
  const bounds = splitSentences(text);
  if (bounds.length <= 1) return [tokensToHtml(tokens)];
  const groups = bounds.map(() => []);
  let off = 0;
  let si = 0;
  const sentenceAt = (pos, zeroWidth) => {
    // advance si to the sentence containing pos; zero-width items at a boundary stay with the earlier one
    while (si < bounds.length - 1 && (zeroWidth ? pos > bounds[si][1] : pos >= bounds[si + 1][0])) si++;
    return si;
  };
  for (const tok of tokens) {
    if (tok.t === 'fn') { groups[sentenceAt(off, true)].push(tok); continue; }
    if (tok.t === 'br') { groups[sentenceAt(off, false)].push(tok); off += 1; continue; }
    let v = tok.v;
    let pos = off;
    while (v.length) {
      const i = sentenceAt(pos, false);
      const end = i < bounds.length - 1 ? bounds[i + 1][0] : Infinity;
      const take = Math.min(v.length, end - pos);
      groups[i].push({ ...tok, v: v.slice(0, take) });
      v = v.slice(take);
      pos += take;
    }
    off += tok.v.length;
  }
  return groups.map((g) => tokensToHtml(normalizeTokens(g))).filter(Boolean);
}

// ---------------------------------------------------------------- DOM helpers

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'ul', 'ol', 'li', 'figure', 'section', 'article', 'hr', 'pre', 'dl', 'header', 'footer', 'main', 'nav', 'aside', 'body', 'html', 'center']);
const cls = (el) => (el.attribs && el.attribs.class ? el.attribs.class.split(/\s+/) : []);
const hasCls = (el, c) => cls(el).includes(c);
const isEl = (n) => n && (n.type === 'tag' || n.type === 'script' || n.type === 'style');

function textOf(node) {
  if (node.type === 'text') return node.data;
  if (!node.children) return '';
  if (isEl(node) && hasCls(node, 'pagenum')) return '';
  return node.children.map(textOf).join('');
}

function walkEls(node, fn) {
  if (isEl(node)) fn(node);
  if (node.children) for (const c of node.children) walkEls(c, fn);
}

function hasBlockChild(el) {
  return (el.children || []).some((c) => isEl(c) && BLOCK_TAGS.has(c.name));
}

function findImgs(el) {
  const imgs = [];
  walkEls(el, (e) => { if (e.name === 'img') imgs.push(e); });
  return imgs;
}

function decodeEntitiesLite(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// ---------------------------------------------------------------- metadata

/** "Parkman, Francis, 1823-1893" -> "Francis Parkman"; "Le Page du Pratz, -1775" -> "Le Page du Pratz". */
export function authorName(creator) {
  if (!creator) return 'Unknown';
  const parts = creator.split(',').map((s) => s.trim()).filter((s) => s && !/^[-\d?\s]+$/.test(s) && !/^\d/.test(s));
  if (parts.length >= 2) return `${parts[1]} ${parts[0]}`.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  return (parts[0] || creator).trim();
}

/** Short, stable URL slug from a title: "The History of Louisiana, Or of ..." -> "history-of-louisiana". */
export function slugify(title) {
  const head = title.split(/[,:;\n(]/)[0];
  const words = head
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && ['the', 'a', 'an'].includes(words[0])) words.shift();
  return words.slice(0, 6).join('-') || 'book';
}

const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'from', 'into']);
/** "CHAPTER IV." -> "Chapter IV"; leaves mixed-case headings alone apart from the trailing period. */
export function cleanHeading(s) {
  let t = s.replace(/\s+/g, ' ').trim().replace(/[.:]$/, '').trim();
  if (t === t.toUpperCase() && /[A-Z]/.test(t)) {
    t = t.toLowerCase().split(' ').map((w, i) => {
      if (/^[ivxlcdm]+\.?$/.test(w) && w.length <= 6 && (i > 0 || !t.includes(' '))) return w.toUpperCase();
      if (i > 0 && SMALL.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }
  return t;
}

const SKIP_HEADING = /^(contents|table of contents|list of (illustrations|maps|plates)|illustrations|maps|index|general index|footnotes?:?|notes:?|transcriber'?s? notes?|the full project gutenberg|advertisements?|new library edition|.*'s works$|imprint|colophon|uncopyright|endnotes|copyright)$|^(the full project gutenberg)/i;

// ---------------------------------------------------------------- the parser

/**
 * @param {string} html
 * @param {{ title?: string, author?: string }} [opts]
 * @returns {{ title, author, fullTitle, chapters, footnotes, images: string[] }}
 */
export function parseBookHtml(html, opts = {}) {
  const doc = parseDocument(html, { decodeEntities: true });

  // --- metadata
  const metas = {};
  walkEls(doc, (e) => { if (e.name === 'meta' && e.attribs.name && e.attribs.content) metas[e.attribs.name] ??= e.attribs.content; });
  let titleEl = null;
  walkEls(doc, (e) => { if (!titleEl && e.name === 'title') titleEl = e; });
  const fullTitle = decodeEntitiesLite(metas['dc.title'] || (titleEl ? textOf(titleEl) : '') || 'Untitled')
    .replace(/\s*\|\s*Project Gutenberg\s*$/, '').trim();
  const title = opts.title || fullTitle.split(/\n|&#10;/)[0].split(/,\s*(?:or|being|containing)\b/i)[0].trim();
  const author = opts.author || (metas['dc.creator'] ? authorName(decodeEntitiesLite(metas['dc.creator'])) : metas.author || 'Unknown');

  // --- footnote prepass: which ids are footnote targets, and which anchors are back-links
  const fnByElement = new Map(); // p.footnote element -> key
  const fnById = new Map(); // id inside a footnote -> key
  const footnotes = {}; // key -> { label, html: [] }
  let fnCount = 0;
  walkEls(doc, (e) => {
    if (e.name !== 'p' || !hasCls(e, 'footnote')) return;
    const ids = [];
    walkEls(e, (x) => { if (x.attribs && x.attribs.id) ids.push(x.attribs.id); });
    if (!ids.length) return; // "Footnotes:" label
    const key = String(++fnCount);
    fnByElement.set(e, key);
    for (const id of ids) fnById.set(id, key);
  });
  const backLinkIds = new Set(); // ids of reference anchors (the targets of footnote back-links)
  walkEls(doc, (e) => {
    if (e.name === 'a' && e.attribs.href && e.attribs.href.startsWith('#') && fnById.has(e.attribs.href.slice(1))) {
      if (e.attribs.id) backLinkIds.add(e.attribs.id);
    }
  });
  // Parkman-style: <a id="fnanchor_1"></a><a href="#footnote_1">[1]</a> — the empty sibling anchor is the back-link target.
  walkEls(doc, (e) => {
    if (e.name === 'a' && e.attribs.id && !e.attribs.href && /anchor|fr-|fnref|noteref/i.test(e.attribs.id)) backLinkIds.add(e.attribs.id);
  });

  const isFnRef = (e) => e.name === 'a' && e.attribs.href && e.attribs.href.startsWith('#') && fnById.has(e.attribs.href.slice(1));
  const isBackLink = (e) => e.name === 'a' && e.attribs.href && e.attribs.href.startsWith('#') && backLinkIds.has(e.attribs.href.slice(1));
  const labelOf = (e) => textOf(e).replace(/[[\]\s]/g, '') || '*';

  // --- inline tokenizer
  function inline(node, fmt, out, mode) {
    if (node.type === 'text') { out.push({ t: 'text', v: node.data, f: fmt }); return; }
    if (!isEl(node)) return;
    const name = node.name;
    if (name === 'script' || name === 'style' || name === 'img') return;
    if (hasCls(node, 'pagenum') || hasCls(node, 'sidenote')) return;
    if (name === 'br') { out.push({ t: 'br' }); return; }
    if (isFnRef(node) && mode !== 'footnote') {
      out.push({ t: 'fn', key: fnById.get(node.attribs.href.slice(1)), label: labelOf(node) });
      return;
    }
    if (isBackLink(node)) return; // footnote's own "1" link back to the text
    let f = fmt;
    const add = (flag) => { const set = new Set(f ? f.split(',') : []); set.add(flag); f = [...set].sort().join(','); };
    if (name === 'i' || name === 'em' || name === 'cite' || hasCls(node, 'italic')) add('i');
    if (name === 'b' || name === 'strong') add('b');
    if (hasCls(node, 'smcap') || hasCls(node, 'sc') || hasCls(node, 'smallcaps')) add('sc');
    if (name === 'sup') {
      // a <sup> that only wraps a footnote reference is just the reference
      const kids = (node.children || []).filter((c) => !(c.type === 'text' && !c.data.trim()));
      if (kids.length === 1 && isEl(kids[0]) && (isFnRef(kids[0]) || isBackLink(kids[0]))) { inline(kids[0], fmt, out, mode); return; }
      add('sup');
    }
    if (name === 'sub') add('sub');
    for (const c of node.children || []) inline(c, f, out, mode);
  }
  const tokensOf = (el, mode) => {
    const out = [];
    for (const c of el.children || []) inline(c, '', out, mode);
    return normalizeTokens(out);
  };

  // --- block walk
  const units = []; // { headings: [], sub: [], blocks: [], skip, nParas }
  let cur = null;
  let pendingSide = null;
  let carryImages = []; // images seen in skipped sections (e.g. a map placed in the contents)
  let lastFootnote = null;
  let started = false; // nothing counts until the first real section heading

  const newUnit = (heading, skip) => {
    cur = { headings: heading ? [heading] : [], sub: [], subRaw: [], blocks: [], skip, nParas: 0 };
    units.push(cur);
    if (!skip && carryImages.length) { cur.blocks.push(...carryImages); carryImages = []; }
  };

  const addImage = (imgEl, caption) => {
    const src = imgEl.attribs.src;
    if (!src || /^data:/.test(src) || /\b(logo|colophon|publisher'?s? mark|lbc mark)\b/i.test(imgEl.attribs.alt || '')) return;
    const block = { img: src, alt: (imgEl.attribs.alt || '').replace(/&gt;|>/g, '').trim(), caption: caption || '' };
    if (imgEl.attribs.width && imgEl.attribs.height) { block.w = Number(imgEl.attribs.width); block.h = Number(imgEl.attribs.height); }
    if (!cur || cur.skip || !started) carryImages.push(block);
    else cur.blocks.push(block);
  };

  const isSubtitleLike = (el, tokens) => {
    const text = tokensText(tokens);
    if (text.length > 320) return false;
    if (el.name !== 'p' || hasCls(el, 'center') || hasCls(el, 'secthead') || /center/.test(el.attribs.style || '')) return true;
    const italic = tokens.filter((t) => t.t === 'text' && t.f && /\b(i|sc)\b/.test(t.f)).reduce((n, t) => n + t.v.length, 0);
    if (italic / Math.max(1, text.replace(/\s/g, '').length) >= 0.5) return true;
    const letters = text.replace(/[^A-Za-z]/g, '');
    return letters.length > 0 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7;
  };

  const addParagraph = (el, tokens, extra = {}) => {
    if (!tokens.length) return;
    if (!cur || cur.skip || !started) return;
    const text = tokensText(tokens).trim();
    if (!text && !tokens.some((t) => t.t === 'fn')) return;
    const last = cur.blocks[cur.blocks.length - 1];
    if (last && last.img && !last.caption && el.name !== 'p' && text.length < 300) {
      last.caption = tokensToHtml(tokens);
      return;
    }
    if (cur.nParas === 0 && !extra.q) {
      const styled = isSubtitleLike(el, tokens);
      if (styled || (text.length <= 160 && !tokens.some((t) => t.t === 'fn'))) {
        cur.sub.push(tokensToHtml(tokens));
        cur.subRaw.push({ tokens, styled });
        return;
      }
    }
    const block = { p: ++cur.nParas, s: sentencesFromTokens(tokens) };
    if (pendingSide) { block.side = pendingSide; pendingSide = null; }
    if (extra.q) block.q = 1;
    cur.blocks.push(block);
  };

  function block(node, ctx) {
    if (!isEl(node)) {
      if (node.type === 'text' && node.data.trim() && ctx.looseParent) {
        // stray text directly inside a block container: treat as its own paragraph
        addParagraph(ctx.looseParent, normalizeTokens([{ t: 'text', v: node.data, f: '' }]), ctx);
      }
      return;
    }
    const name = node.name;
    const id = node.attribs.id || '';
    if (name === 'script' || name === 'style' || name === 'head') return;
    if (hasCls(node, 'pg-boilerplate') || /^pg-(header|footer)/.test(id)) return;
    if (hasCls(node, 'pagenum') || hasCls(node, 'transnote')) return;

    if (hasCls(node, 'footnotes')) {
      for (const c of node.children || []) footnoteBlock(c);
      return;
    }
    if (name === 'p' && fnByElement.has(node)) { footnoteBlock(node); return; }
    if (name === 'p' && hasCls(node, 'footnote')) return; // "Footnotes:" label

    if (/^h[1-6]$/.test(name)) {
      const text = cleanHeading(textOf(node));
      lastFootnote = null;
      if (!text) return;
      if (name === 'h1') { newUnit(null, true); return; } // the title page
      if (SKIP_HEADING.test(text)) { newUnit(text, true); return; }
      started = true;
      if (cur && !cur.skip && cur.nParas === 0 && !cur.blocks.some((b) => b.img) && cur.sub.length === 0) cur.headings.push(text);
      else newUnit(text, false);
      return;
    }
    if (name === 'hr') return;

    if (hasCls(node, 'sidenote')) { pendingSide = cleanHeading(textOf(node)); return; }

    if (name === 'img') { addImage(node, ''); return; }
    if (name === 'figure' || hasCls(node, 'figcenter') || hasCls(node, 'figure') || hasCls(node, 'fig')) {
      const imgs = findImgs(node);
      let cap = '';
      walkEls(node, (e) => { if (!cap && (e.name === 'figcaption' || hasCls(e, 'caption'))) cap = tokensToHtml(tokensOf(e)); });
      if (!cap) {
        const toks = tokensOf(node);
        if (tokensText(toks).trim()) cap = tokensToHtml(toks);
      }
      imgs.forEach((img, i) => addImage(img, i === imgs.length - 1 ? cap : ''));
      return;
    }

    if (name === 'p' || ((name === 'div' || name === 'li' || name === 'center') && !hasBlockChild(node))) {
      const imgs = findImgs(node);
      if (imgs.length) {
        const cap = tokensToHtml(tokensOf(node));
        imgs.forEach((img, i) => addImage(img, i === imgs.length - 1 ? cap : ''));
        return;
      }
      lastFootnote = null;
      addParagraph(node, tokensOf(node), ctx);
      return;
    }
    if (name === 'table') {
      if (!cur || cur.skip) return;
      const rows = [];
      walkEls(node, (e) => {
        if (e.name !== 'tr') return;
        const cells = (e.children || []).filter((c) => isEl(c) && (c.name === 'td' || c.name === 'th'));
        const toks = [];
        cells.forEach((c, i) => {
          if (i) toks.push({ t: 'text', v: ' — ', f: '' });
          const out = [];
          for (const k of c.children || []) inline(k, '', out);
          toks.push(...out);
        });
        const norm = normalizeTokens(toks);
        if (tokensText(norm).trim()) rows.push(norm);
      });
      const toks = [];
      rows.forEach((r, i) => { if (i) toks.push({ t: 'br' }); toks.push(...r); });
      if (toks.length) addParagraph({ name: 'p', attribs: {} }, toks, ctx);
      return;
    }
    const q = ctx.q || name === 'blockquote' || hasCls(node, 'blockquot') || hasCls(node, 'blockquote');
    for (const c of node.children || []) block(c, { q, looseParent: node });
  }

  function footnoteBlock(node) {
    if (!isEl(node)) return;
    if (/^h[1-6]$/.test(node.name)) return;
    if (node.name === 'p' && fnByElement.has(node)) {
      const key = fnByElement.get(node);
      let label = key;
      walkEls(node, (e) => { if (label === key && isBackLink(e)) label = labelOf(e); });
      footnotes[key] = { label, html: [tokensToHtml(tokensOf(node, 'footnote'))].filter(Boolean) };
      lastFootnote = key;
      return;
    }
    if (node.name === 'p' && lastFootnote) {
      const h = tokensToHtml(tokensOf(node, 'footnote'));
      if (h) footnotes[lastFootnote].html.push(h);
      return;
    }
    if (node.name === 'div' || node.name === 'blockquote') for (const c of node.children || []) footnoteBlock(c);
  }

  let body = null;
  walkEls(doc, (e) => { if (!body && e.name === 'body') body = e; });
  for (const c of (body || doc).children || []) block(c, { q: false, looseParent: null });

  // --- units -> chapters: sections with no paragraphs fold forward as part headings
  const chapters = [];
  let parts = [];
  let carry = [];
  for (const u of units) {
    if (u.skip) continue;
    if (u.nParas === 0 && u.subRaw.some((s) => !s.styled)) {
      // a section whose only text is short plain lines: those were paragraphs after all
      const paras = u.subRaw.filter((s) => !s.styled).map((s, k) => ({ p: k + 1, s: sentencesFromTokens(s.tokens) }));
      u.sub = u.subRaw.filter((s) => s.styled).map((s) => tokensToHtml(s.tokens));
      u.blocks = [...paras, ...u.blocks];
      u.nParas = paras.length;
    }
    if (u.nParas === 0) {
      parts.push({ heading: u.headings.join(' · '), sub: u.sub });
      carry.push(...u.blocks);
      continue;
    }
    const ch = { n: chapters.length + 1, heading: u.headings[u.headings.length - 1] || `Section ${chapters.length + 1}`, sub: u.sub, blocks: [...carry, ...u.blocks] };
    const pre = u.headings.slice(0, -1);
    if (pre.length) parts.push({ heading: pre.join(' · '), sub: [] });
    if (parts.length) ch.parts = parts;
    chapters.push(ch);
    parts = [];
    carry = [];
  }
  carry.push(...carryImages); // e.g. maps printed after the index
  if (carry.length && chapters.length) chapters[chapters.length - 1].blocks.push(...carry);

  // keep only footnotes that are referenced from kept text
  const used = new Set();
  for (const ch of chapters) for (const b of ch.blocks) for (const s of b.s || []) for (const m of s.matchAll(/data-fn="(\d+)"/g)) used.add(m[1]);
  for (const k of Object.keys(footnotes)) if (!used.has(k)) delete footnotes[k];

  const images = [];
  for (const ch of chapters) for (const b of ch.blocks) if (b.img) images.push(b.img);

  return { title, author, fullTitle, chapters, footnotes, images };
}

// ---------------------------------------------------------------- gist chunks

/** Plain text of a block (for gists, the CLI, search). */
export const blockText = (b) => (b.s || []).join(' ').replace(/<a class="fn"[^>]*>.*?<\/a>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * ~10-paragraph chunks inside each chapter (never across one). A short tail is
 * folded into the previous chunk so no gist covers just a sentence or two.
 * Returns [{ c, from, to }] with inclusive paragraph numbers.
 */
export function gistChunks(chapters, size = 10) {
  const out = [];
  for (const ch of chapters) {
    const n = ch.blocks.filter((b) => b.p).length;
    if (!n) continue;
    const local = [];
    for (let from = 1; from <= n; from += size) local.push({ c: ch.n, from, to: Math.min(n, from + size - 1) });
    if (local.length > 1 && local[local.length - 1].to - local[local.length - 1].from + 1 < Math.ceil(size / 2)) {
      const tail = local.pop();
      local[local.length - 1].to = tail.to;
    }
    out.push(...local);
  }
  return out;
}
