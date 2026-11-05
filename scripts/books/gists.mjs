#!/usr/bin/env node
/**
 * Fill in the "Where was I?" gists for a book: one or two sentences per
 * ~10-paragraph chunk, written by a SMALL LOCAL model (no API tokens).
 *
 *   node scripts/books/gists.mjs <slug> [--model qwen3-vl:8b] [--host http://127.0.0.1:11434] [--redo]
 *
 * Uses whichever Ollama model is already resident on .21's GPU when possible
 * (default qwen3-vl:8b, the one the voice stack keeps loaded) and never passes
 * options that would force a reload (num_ctx etc.), so the voice models are
 * never evicted. Saves after every chunk, so it can be stopped and resumed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockText } from './parse.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const slug = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && argv[i - 1] !== '--redo'));
const HOST = opt('host', process.env.BOOKS_GIST_HOST || 'http://127.0.0.1:8093/v1');
const MODEL = opt('model', process.env.BOOKS_GIST_MODEL || 'gemma-3-12b');
const REDO = argv.includes('--redo');
if (!slug) {
  console.error('usage: gists.mjs <slug> [--model m] [--host url] [--redo]');
  process.exit(2);
}

const file = join(ROOT, 'public/books/data', `${slug}.json`);
const book = JSON.parse(readFileSync(file, 'utf8'));

const OPENAI = /\/v1\/?$/.test(HOST); // llama.cpp llama-server (OpenAI-compatible) vs Ollama

async function ask(passage, context) {
  const messages = [
        {
          role: 'system',
          content:
            'You write memory-jogging gists for a reader who has lost track of where they were in a book. ' +
            'Given a passage, reply with ONE or TWO plain sentences (max 45 words) saying concretely what happens or what is described: ' +
            'name the people, places and things. Present tense. No preamble, no "This passage", no quotes, no markdown.',
        },
        { role: 'user', content: `${context}\n\nPassage:\n${passage}` },
  ];
  const r = OPENAI
    ? await fetch(`${HOST.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, temperature: 0.2, max_tokens: 120, messages }),
      })
    : await fetch(`${HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, stream: false, think: false, options: { temperature: 0.2, num_predict: 120 }, messages }),
      });
  if (!r.ok) throw new Error(`model HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const content = OPENAI ? j.choices?.[0]?.message?.content : j.message?.content;
  if (!content || !content.trim()) throw new Error('model returned no text (thinking-only reply?)');
  return content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^\s*(this passage|the passage|in this passage)[^,:]*[,:]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const todo = book.gists.filter((g) => REDO || !g.text);
console.log(`${slug}: ${todo.length} of ${book.gists.length} chunks to gist with ${MODEL} @ ${HOST}`);
let done = 0;
const t0 = Date.now();
for (const g of todo) {
  const ch = book.chapters[g.c - 1];
  const paras = ch.blocks.filter((b) => b.p && b.p >= g.from && b.p <= g.to).map(blockText);
  let passage = paras.join('\n\n');
  if (passage.length > 9000) passage = passage.slice(0, 9000) + ' …';
  const context = `Book: ${book.title} by ${book.author}. ${ch.heading}${ch.sub?.length ? ' — ' + ch.sub.join(' ').replace(/<[^>]+>/g, '').slice(0, 200) : ''}.`;
  for (let attempt = 1; ; attempt++) {
    try {
      g.text = await ask(passage, context);
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`  retry ${g.c}:${g.from}-${g.to}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  writeFileSync(file, JSON.stringify(book));
  done++;
  if (done % 10 === 0 || done === todo.length) {
    console.log(`  ${done}/${todo.length} (${Math.round((Date.now() - t0) / 1000)}s)  ${g.c}:${g.from}-${g.to} ${g.text.slice(0, 90)}`);
  }
  // breathe between requests so a voice-stack request never waits behind a queue of ours
  await new Promise((r) => setTimeout(r, 250));
}
console.log(`${slug}: gists done`);
