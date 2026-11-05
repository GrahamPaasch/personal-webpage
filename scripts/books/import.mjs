#!/usr/bin/env node
/**
 * Import a public-domain book into the /books reader (voice-ui spec 32).
 *
 *   node scripts/books/import.mjs <gutenberg-id | gutenberg URL | standardebooks.org URL | .html URL>
 *        [--slug s] [--title "..."] [--author "..."] [--no-gists]
 *
 * Writes public/books/data/<slug>.json (+ images under public/books/data/<slug>/)
 * and updates public/books/data/index.json. Then runs gists.mjs (local model)
 * unless --no-gists. Existing gists are kept for chunks whose range is unchanged.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockText, gistChunks, parseBookHtml, slugify } from './parse.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = join(ROOT, 'public/books/data');

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-gists') out.noGists = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out._.push(a);
  }
  return out;
}

async function download(url, dest) {
  const r = await fetch(url, { headers: { 'User-Agent': 'grahampaasch.com books importer' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

/** Returns { html, baseDir?, baseUrl?, source } */
async function fetchSource(input) {
  const gid = /^\d+$/.test(input) ? input : (input.match(/gutenberg\.org\/(?:ebooks|cache\/epub|files)\/(\d+)/) || [])[1];
  if (gid) {
    const dir = mkdtempSync(join(tmpdir(), `books-${gid}-`));
    const zip = join(dir, 'book.zip');
    await download(`https://www.gutenberg.org/cache/epub/${gid}/pg${gid}-h.zip`, zip);
    execFileSync('unzip', ['-oq', zip, '-d', dir]);
    const html = findHtml(dir);
    if (!html) throw new Error('no HTML file in the Gutenberg zip');
    return { html: readFileSync(html, 'utf8'), baseDir: dirname(html), source: { kind: 'gutenberg', id: Number(gid), url: `https://www.gutenberg.org/ebooks/${gid}` } };
  }
  if (/standardebooks\.org\/ebooks\//.test(input)) {
    const base = input.replace(/\/(text(\/single-page)?)?\/?$/, '');
    const url = `${base}/text/single-page`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return { html: await r.text(), baseUrl: url, source: { kind: 'standardebooks', url: base } };
  }
  if (/^https?:\/\//.test(input)) {
    const r = await fetch(input);
    if (!r.ok) throw new Error(`${input}: HTTP ${r.status}`);
    const kind = /wikisource\.org/.test(input) ? 'wikisource' : /archive\.org/.test(input) ? 'archive' : 'web';
    return { html: await r.text(), baseUrl: input, source: { kind, url: input } };
  }
  throw new Error(`don't know how to import "${input}" (want a Gutenberg id/URL, a Standard Ebooks URL or an HTML URL)`);
}

function findHtml(dir) {
  const all = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.html?$/.test(f)) all.push(p);
    }
  };
  walk(dir);
  return all.find((p) => /-images\.html$/.test(p)) || all.sort((a, b) => statSync(b).size - statSync(a).size)[0];
}

async function main() {
  const a = args(process.argv.slice(2));
  if (!a._[0]) {
    console.error('usage: import.mjs <gutenberg id | url> [--slug s] [--title t] [--author a] [--no-gists]');
    process.exit(2);
  }
  const src = await fetchSource(a._[0]);
  const book = parseBookHtml(src.html, { title: a.title, author: a.author });
  const slug = a.slug || slugify(book.title);
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`bad slug "${slug}"`);
  if (!book.chapters.length) throw new Error('parsed no chapters — the source layout is not supported yet');

  // images -> public/books/data/<slug>/<file>
  const imgDir = join(DATA, slug);
  mkdirSync(imgDir, { recursive: true });
  const rename = new Map();
  for (const src0 of book.images) {
    if (rename.has(src0)) continue;
    const file = basename(src0.split('?')[0]).replace(/[^A-Za-z0-9._-]/g, '_');
    const dest = join(imgDir, file);
    try {
      if (src.baseDir) copyFileSync(join(src.baseDir, src0), dest);
      else await download(new URL(src0, src.baseUrl).href, dest);
      rename.set(src0, `/books/data/${slug}/${file}`);
    } catch (e) {
      console.warn(`image ${src0} skipped: ${e.message}`);
    }
  }
  for (const ch of book.chapters) {
    ch.blocks = ch.blocks.filter((b) => !b.img || rename.has(b.img));
    for (const b of ch.blocks) {
      if (!b.img) continue;
      b.img = rename.get(b.img);
      if (!b.w || !b.h) Object.assign(b, imageSize(join(DATA, b.img.replace('/books/data/', ''))) || {});
    }
  }
  let cover = null;
  if (src.baseDir) {
    const c = readdirSync(src.baseDir).find((f) => /cover\.(png|jpe?g)$/.test(f));
    if (c) {
      copyFileSync(join(src.baseDir, c), join(imgDir, c));
      cover = `/books/data/${slug}/${c}`;
    }
  }

  // keep gists whose chunk is unchanged
  const outFile = join(DATA, `${slug}.json`);
  const old = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : null;
  const oldGists = new Map((old?.gists || []).filter((g) => g.text).map((g) => [`${g.c}:${g.from}-${g.to}`, g.text]));
  const gists = gistChunks(book.chapters).map((g) => ({ ...g, text: oldGists.get(`${g.c}:${g.from}-${g.to}`) || '' }));

  let paragraphs = 0;
  let words = 0;
  for (const ch of book.chapters) {
    for (const b of ch.blocks) {
      if (!b.p) continue;
      paragraphs++;
      words += blockText(b).split(/\s+/).filter(Boolean).length;
    }
  }
  const out = {
    slug,
    title: book.title,
    author: book.author,
    fullTitle: book.fullTitle,
    source: src.source,
    cover,
    stats: { chapters: book.chapters.length, paragraphs, words },
    chapters: book.chapters,
    footnotes: book.footnotes,
    gists,
  };
  writeFileSync(outFile, JSON.stringify(out));
  updateIndex(out);
  console.log(`${slug}: "${out.title}" by ${out.author} — ${out.stats.chapters} chapters, ${paragraphs} paragraphs, ${words} words, ${rename.size} images, ${Object.keys(book.footnotes).length} footnotes, ${gists.length} gist chunks (${gists.filter((g) => g.text).length} kept)`);
  console.log(`wrote ${outFile}`);

  if (!a.noGists) {
    execFileSync(process.execPath, [join(ROOT, 'scripts/books/gists.mjs'), slug], { stdio: 'inherit' });
  }
}

/** Width/height from a PNG/JPEG/GIF header, so the reader can reserve space (no layout jump). */
function imageSize(file) {
  try {
    const b = readFileSync(file);
    if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString('ascii', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch {}
  return null;
}

export function updateIndex(book) {
  const file = join(DATA, 'index.json');
  const idx = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { books: [] };
  const entry = { slug: book.slug, title: book.title, author: book.author, cover: book.cover, source: book.source, stats: book.stats };
  const i = idx.books.findIndex((b) => b.slug === book.slug);
  if (i >= 0) idx.books[i] = entry;
  else idx.books.push(entry);
  writeFileSync(file, JSON.stringify(idx, null, 1) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
