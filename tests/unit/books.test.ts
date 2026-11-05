import { describe, expect, it } from 'vitest';
import { authorName, cleanHeading, gistChunks, parseBookHtml, slugify, splitSentences } from '@/scripts/books/parse.mjs';
import { canAdvance, citation, copyPayload, gistsForRanges, parseAddr, permalink, rangeLabel } from '@/public/books/lib.js';
import {
  addNote,
  advancePlace,
  deleteNote,
  emptyData,
  logView,
  markFinished,
  monthKey,
  movePlace,
  passwordOk,
  privateView,
  publicView,
  SESSION_GAP_MS,
} from '@/lib/books/state';
import { GET, POST } from '@/app/api/books/route';

const sentences = (t: string) => splitSentences(t).map(([a, b]: [number, number]) => t.slice(a, b));

// ------------------------------------------------------------------ numbering

const FIXTURE = `<!doctype html><html><head>
<meta name="dc.title" content="The History of Somewhere, Or of the Western Parts">
<meta name="dc.creator" content="Parkman, Francis, 1823-1893"></head><body>
<header class="pg-boilerplate pgheader" id="pg-header"><h2>The Project Gutenberg eBook</h2><p>Boilerplate to drop.</p></header>
<h1>THE HISTORY OF SOMEWHERE</h1><p>Title page text.</p>
<h2>CONTENTS</h2><p>Chapter I .... 1</p>
<p><img src="images/map.png" alt="A map" width="300" height="200"><br>The map</p>
<h2>PREFACE</h2>
<p>The preface has one paragraph. It has two sentences.</p>
<h2>BOOK I.</h2>
<p><i>The Transactions of the French.</i></p>
<h3>CHAPTER I.</h3>
<p><i>Of the first Discovery.</i></p>
<p>M. de la Salle went up the St. Lawrence with Capt. Smith. See Tom. III. p. 444 for more.<sup><a href="#fn-1" id="fr-1">1</a></sup> Then he left!</p>
<div class="sidenote">LA SALLE AT MONTREAL.</div>
<p>Second <i>paragraph, with a</i> span. <i>Italic runs across. The boundary</i> here.</p>
<p><a id="illus"><img src="images/beaver.png" alt="Beaver lodge" width="224" height="380"></a><br>Beaver lodge</p>
<p class="footnote"><b>Footnotes:</b></p>
<p class="footnote"><sup><a href="#fr-1" id="fn-1">1</a></sup> Charlevoix, Hist. N. France.</p>
<h3>CHAPTER II.</h3>
<p>Short chapter opening line that is a subtitle.</p>
<p>A paragraph long enough to be a body paragraph, not a subtitle, because it keeps going on and on about the river and the people who lived along its banks in great numbers for many years.</p>
<h2>INDEX</h2><p>Beaver, 3</p>
<section class="pg-boilerplate" id="pg-footer"><p>License.</p></section>
</body></html>`;

describe('books importer: numbering', () => {
  const book = parseBookHtml(FIXTURE);

  it('reads title and author from the metadata', () => {
    expect(book.title).toBe('The History of Somewhere');
    expect(book.author).toBe('Francis Parkman');
    expect(authorName('Le Page du Pratz, -1775')).toBe('Le Page du Pratz');
    expect(slugify('The History of Louisiana, Or of the Western Parts')).toBe('history-of-louisiana');
    expect(cleanHeading('CHAPTER IV.')).toBe('Chapter IV');
  });

  it('numbers chapters in reading order, dropping boilerplate, contents and index', () => {
    expect(book.chapters.map((c: { n: number; heading: string }) => `${c.n} ${c.heading}`)).toEqual(['1 Preface', '2 Chapter I', '3 Chapter II']);
    const all = JSON.stringify(book.chapters);
    expect(all).not.toContain('Boilerplate');
    expect(all).not.toContain('License');
    expect(all).not.toContain('Title page');
  });

  it('folds an empty "Book" heading into the next chapter as a part', () => {
    const ch = book.chapters[1];
    expect(ch.parts[0].heading).toBe('Book I');
    expect(ch.sub[0]).toContain('Of the first Discovery');
  });

  it('numbers paragraphs per chapter and sentences per paragraph', () => {
    const ch = book.chapters[1];
    const paras = ch.blocks.filter((b: { p?: number }) => b.p);
    expect(paras.map((b: { p: number }) => b.p)).toEqual([1, 2]);
    expect(paras[0].s).toHaveLength(3);
    expect(paras[0].s[0]).toBe('M. de la Salle went up the St. Lawrence with Capt. Smith.');
    expect(paras[0].s[1]).toMatch(/^See Tom\. III\. p\. 444 for more\.<a class="fn" data-fn="1"/);
    expect(paras[0].s[2]).toBe('Then he left!');
    expect(paras[1].side).toBe('La Salle at Montreal');
    // formatting that straddles a sentence break is closed and reopened
    expect(paras[1].s[1]).toBe('<i>Italic runs across.</i>');
    expect(paras[1].s[2]).toBe('<i>The boundary</i> here.');
  });

  it('keeps footnotes and illustrations', () => {
    expect(book.footnotes['1'].html[0]).toContain('Charlevoix, Hist. N. France.');
    const imgs = book.chapters.flatMap((c: { blocks: { img?: string; caption?: string }[] }) => c.blocks.filter((b) => b.img));
    expect(imgs.map((b: { img: string }) => b.img)).toEqual(['images/map.png', 'images/beaver.png']);
    expect(imgs[1].caption).toBe('Beaver lodge');
  });

  it('treats a short first line as the chapter subtitle, not paragraph 1', () => {
    const ch = book.chapters[2];
    expect(ch.sub[0]).toContain('Short chapter opening');
    expect(ch.blocks.filter((b: { p?: number }) => b.p)).toHaveLength(1);
  });

  it('chunks ~10 paragraphs per gist inside chapters, folding short tails', () => {
    const chs = [{ n: 1, blocks: Array.from({ length: 23 }, (_, i) => ({ p: i + 1 })) }, { n: 2, blocks: [{ p: 1 }, { img: 'x' }, { p: 2 }] }];
    expect(gistChunks(chs)).toEqual([
      { c: 1, from: 1, to: 10 },
      { c: 1, from: 11, to: 23 },
      { c: 2, from: 1, to: 2 },
    ]);
  });
});

describe('sentence splitting with old abbreviations', () => {
  it('does not split after titles, initials or references', () => {
    expect(sentences('Mr. Law and M. Bienville met at Ft. Rosalie. They spoke.')).toEqual(['Mr. Law and M. Bienville met at Ft. Rosalie.', 'They spoke.']);
    expect(sentences('J. B. Le Moyne came in 1699. He built a fort.')).toHaveLength(2);
    expect(sentences('Charlevoix, Hist. N. France, Tom. III. p. 444. Next sentence.')).toEqual(['Charlevoix, Hist. N. France, Tom. III. p. 444.', 'Next sentence.']);
  });
  it('splits on ? and ! and keeps closing quotes with the sentence', () => {
    expect(sentences('"Where is he?" said the chief. "Gone!" He wept.')).toEqual(['"Where is he?" said the chief.', '"Gone!"', 'He wept.']);
  });
  it('does not split before lowercase', () => {
    expect(sentences('bows, arrows, etc. and other things. The end.')).toEqual(['bows, arrows, etc. and other things.', 'The end.']);
  });
});

// ------------------------------------------------------------------ place

describe('place', () => {
  const t0 = Date.UTC(2026, 10, 5, 18);

  it('only moves forward on its own', () => {
    const d = emptyData();
    expect(advancePlace(d, 'b', { c: 1, p: 5, i: 4 }, t0, 500)).toBe(true);
    expect(advancePlace(d, 'b', { c: 1, p: 3, i: 2 }, t0)).toBe(false);
    expect(advancePlace(d, 'b', { c: 1, p: 5, i: 4 }, t0)).toBe(false);
    expect(d.books.b.place).toEqual({ c: 1, p: 5, i: 4 });
    expect(advancePlace(d, 'b', { c: 2, p: 1, i: 30 }, t0, 900)).toBe(true);
    expect(d.books.b.place).toMatchObject({ c: 2, p: 1 });
    const m = d.totals[monthKey(t0)];
    expect(m.paragraphs).toBe(5 + 26);
    expect(m.words).toBe(1400);
  });

  it('moves backwards only when asked ("move my place here")', () => {
    const d = emptyData();
    advancePlace(d, 'b', { c: 3, p: 1, i: 50 }, t0);
    movePlace(d, 'b', { c: 1, p: 2, i: 1 }, t0);
    expect(d.books.b.place).toEqual({ c: 1, p: 2, i: 1 });
  });

  it('compares chapter first, then paragraph', () => {
    const d = emptyData();
    advancePlace(d, 'b', { c: 2, p: 40 }, t0);
    expect(advancePlace(d, 'b', { c: 3, p: 1 }, t0)).toBe(true);
    expect(advancePlace(d, 'b', { c: 2, p: 99 }, t0)).toBe(false);
  });

  it('reader-side: reading may advance a little, a far jump may not', () => {
    expect(canAdvance({ i: 10 }, { i: 14 })).toBe(true);
    expect(canAdvance({ i: 10 }, { i: 9 })).toBe(false);
    expect(canAdvance({ i: 10 }, { i: 300 })).toBe(false);
    expect(canAdvance(null, { i: 0 })).toBe(true);
  });

  it('counts a finished book once', () => {
    const d = emptyData();
    expect(markFinished(d, 'b', t0)).toBe(true);
    expect(markFinished(d, 'b', t0)).toBe(false);
    expect(publicView(d, t0).totals.booksFinished).toBe(1);
  });
});

describe('private session log', () => {
  const t0 = Date.UTC(2026, 10, 5, 18);
  it('merges what was on screen into ranges and starts a new session after 30 minutes', () => {
    const d = emptyData();
    logView(d, 'b', [{ c: 1, p: 1 }, { c: 1, p: 2 }], t0);
    logView(d, 'b', [{ c: 1, p: 3 }, { c: 1, p: 4 }], t0 + 60_000);
    logView(d, 'b', [{ c: 2, p: 1 }], t0 + 120_000);
    logView(d, 'b', [{ c: 2, p: 5 }], t0 + 120_000 + SESSION_GAP_MS + 1);
    const s = d.private.sessions.b;
    expect(s).toHaveLength(2);
    expect(s[0].ranges).toEqual([[1, 1, 4], [2, 1, 1]]);
    expect(s[1].ranges).toEqual([[2, 5, 5]]);
  });

  it('public view has no timestamps, sessions or on-screen info', () => {
    const d = emptyData();
    logView(d, 'b', [{ c: 1, p: 1 }], t0);
    advancePlace(d, 'b', { c: 1, p: 1, i: 0 }, t0);
    addNote(d, 'b', { kind: 'note', at: '1:1', text: 'hello' }, t0);
    const pub = JSON.stringify(publicView(d, t0));
    expect(pub).not.toContain(String(t0));
    expect(pub).not.toMatch(/sessions|"view"|placeAt|noteAt|idle/);
    const priv = privateView(d, t0 + 5000);
    expect(priv.sessions.b).toHaveLength(1);
    expect(priv.idleMs).toBe(5000);
  });

  it('gists for a session are the chunks it touched', () => {
    const gists = [{ c: 1, from: 1, to: 10, text: 'a' }, { c: 1, from: 11, to: 20, text: 'b' }, { c: 2, from: 1, to: 10, text: 'c' }];
    expect(gistsForRanges(gists, [[1, 9, 12]]).map((g: { text: string }) => g.text)).toEqual(['a', 'b']);
  });
});

describe('notes', () => {
  it('validates and deletes', () => {
    const d = emptyData();
    expect(addNote(d, 'b', { kind: 'link', at: '1:1', url: 'javascript:alert(1)' }, 0)).toHaveProperty('error');
    expect(addNote(d, 'b', { kind: 'note', at: '1:1' }, 0)).toHaveProperty('error');
    const r = addNote(d, 'b', { kind: 'highlight', at: { c: 1, p: 2, s: 3 }, to: '1:4' }, 0) as { id: string };
    expect(d.books.b.notes[0]).toMatchObject({ kind: 'highlight', at: { c: 1, p: 2, s: 3 }, to: { c: 1, p: 4 } });
    expect(deleteNote(d, 'b', r.id)).toBe(true);
    expect(d.books.b.notes).toHaveLength(0);
  });
});

// ------------------------------------------------------------------ citations

describe('copy citation', () => {
  const book = { slug: 'history-of-louisiana', title: 'The History of Louisiana', author: 'Le Page du Pratz' };
  const O = 'https://www.grahampaasch.com';

  it('parses addresses from hashes', () => {
    expect(parseAddr('#3:14')).toEqual({ c: 3, p: 14 });
    expect(parseAddr('3:14.2')).toEqual({ c: 3, p: 14, s: 2 });
    expect(parseAddr('#3:0')).toBeNull();
    expect(parseAddr('#top')).toBeNull();
  });

  it('labels sentence, paragraph and ranges', () => {
    expect(rangeLabel({ c: 3, p: 14, s: 2 }, { c: 3, p: 14, s: 2 })).toBe('3:14.2');
    expect(rangeLabel({ c: 3, p: 14, s: 2 }, { c: 3, p: 14, s: 4 })).toBe('3:14.2–4');
    expect(rangeLabel({ c: 3, p: 14 }, { c: 3, p: 14 })).toBe('3:14');
    expect(rangeLabel({ c: 3, p: 14, s: 1 }, { c: 3, p: 16, s: 2 })).toBe('3:14–16');
    expect(rangeLabel({ c: 3, p: 14 }, { c: 4, p: 2 })).toBe('3:14–4:2');
  });

  it('formats "— Author, Title, address, permalink"', () => {
    expect(citation(book, { c: 19, p: 14, s: 2 }, { c: 19, p: 14, s: 2 }, O)).toBe(
      '— Le Page du Pratz, The History of Louisiana, 19:14.2, https://www.grahampaasch.com/books/history-of-louisiana#19:14.2',
    );
    expect(citation(book, { c: 19, p: 14, s: 2 }, { c: 19, p: 15, s: 1 }, O)).toBe(
      '— Le Page du Pratz, The History of Louisiana, 19:14–15, https://www.grahampaasch.com/books/history-of-louisiana#19:14',
    );
    expect(permalink(O + '/', 'la-salle', { c: 1, p: 2 })).toBe('https://www.grahampaasch.com/books/la-salle#1:2');
  });

  it('keeps the copied text exactly, citation on its own line', () => {
    expect(copyPayload('The beavers build.  ', '— A, T, 1:1, u')).toBe('The beavers build.\n\n— A, T, 1:1, u');
  });
});

// ------------------------------------------------------------------ auth

describe('auth', () => {
  it('accepts "Graham Books" in either order, any case or spacing', () => {
    for (const pw of ['Graham Books', 'graham books', 'BOOKS GRAHAM', ' graham-books! ', 'GrahamBooks']) expect(passwordOk(pw)).toBe(true);
    for (const pw of ['Graham Exercise', 'graham', 'books', 'graham book', '', null, 42]) expect(passwordOk(pw)).toBe(false);
  });

  const post = (body: unknown, headers: Record<string, string> = {}) =>
    POST(new Request('http://x/api/books', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify(body) }));

  it('rejects writes without the password and accepts them with it', async () => {
    expect((await post({ action: 'note', slug: 'b', kind: 'note', at: '1:1', text: 'x' })).status).toBe(401);
    expect((await post({ action: 'note', slug: 'b', kind: 'note', at: '1:1', text: 'x', password: 'wrong' })).status).toBe(401);
    expect((await post({ action: 'check', password: 'books graham' })).status).toBe(200);
    const r = await post({ action: 'progress', slug: 'auth-test', view: ['1:1', '1:2'], place: { c: 1, p: 2, i: 1 } }, { 'x-books-password': 'Graham Books' });
    expect(r.status).toBe(200);
    expect((await r.json()).books['auth-test'].place).toBe('1:2');
  });

  it('serves sessions only with the password', async () => {
    const pub = await (await GET(new Request('http://x/api/books'))).json();
    expect(pub.sessions).toBeUndefined();
    expect((await GET(new Request('http://x/api/books', { headers: { 'x-books-password': 'nope' } }))).status).toBe(401);
    const priv = await (await GET(new Request('http://x/api/books', { headers: { 'x-books-password': 'graham books' } }))).json();
    expect(priv.sessions['auth-test'][0].ranges).toEqual([[1, 1, 2]]);
  });
});
