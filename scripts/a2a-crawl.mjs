#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const DEFAULT_SEEDS_FILE = 'scripts/a2a-seeds.txt';
const DEFAULT_OUTPUT_FILE = 'data/a2a-directory.json';
const DEFAULT_USER_AGENT =
  'graham-a2a-directory-crawler/0.1 (+https://www.grahampaasch.com/agent/for-agents)';
const REQUEST_TIMEOUT_MS = 10000;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [rawKey, rawValue] = arg.slice(2).split('=', 2);
      const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      if (typeof rawValue !== 'undefined') {
        args[key] = rawValue;
        continue;
      }
      const next = argv[i + 1];
      if (typeof next === 'undefined' || next.startsWith('-')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const flags = arg.slice(1).split('');
      for (const flag of flags) {
        if (flag === 'h') args.help = true;
        else if (flag === 'v') args.verbose = true;
        else args[flag] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function renderUsage() {
  console.log(`Usage: node scripts/a2a-crawl.mjs [options]

Fetch opt-in A2A manifests and cards to build a simple public directory.

Options:
  --seed <url>           Add a seed URL (repeatable). Falls back to ${DEFAULT_SEEDS_FILE}.
  --seeds <file>         Path to newline-delimited seed list.
  --output <file>        Where to write the directory JSON (default: ${DEFAULT_OUTPUT_FILE}).
  --user-agent <string>  Override crawler User-Agent string.
  --include-card         Fetch agentCardUrl if present in manifest (default true).
  --timeout <ms>         Request timeout per fetch (default: ${REQUEST_TIMEOUT_MS}).
  --json                 Echo final JSON to stdout in addition to writing the file.
  --verbose              Print per-fetch diagnostics.
  -h, --help             Show this help message.
`);
}

async function readSeeds({ seedList, seedsFile, verbose }) {
  const seeds = new Set();
  if (Array.isArray(seedList)) {
    for (const entry of seedList) {
      const trimmed = entry.trim();
      if (trimmed) seeds.add(trimmed);
    }
  } else if (typeof seedList === 'string') {
    const trimmed = seedList.trim();
    if (trimmed) seeds.add(trimmed);
  }

  const file = seedsFile || DEFAULT_SEEDS_FILE;
  try {
    const content = await readFile(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      seeds.add(trimmed);
    }
    if (verbose) console.log(`[crawler] Loaded ${seeds.size} seeds from ${file}`);
  } catch (err) {
    if (seeds.size === 0) {
      throw new Error(`No seeds provided and failed to read default list (${file}): ${err.message}`);
    }
    if (verbose) console.warn(`[crawler] Could not read seeds file ${file}: ${err.message}`);
  }

  return [...seeds];
}

function canonicalOrigin(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith('http')) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function splitByOrigin(seeds) {
  const origins = new Map();
  for (const seed of seeds) {
    const origin = canonicalOrigin(seed);
    if (!origin) continue;
    if (!origins.has(origin)) {
      origins.set(origin, { origin, seeds: [] });
    }
    origins.get(origin).seeds.push(seed);
  }
  return [...origins.values()];
}

function parseRobots(text, userAgent) {
  const sections = [];
  let current = { agents: [], rules: [] };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [directiveRaw, ...valueParts] = line.split(':');
    if (!directiveRaw || valueParts.length === 0) continue;
    const directive = directiveRaw.trim().toLowerCase();
    const value = valueParts.join(':').trim();

    if (directive === 'user-agent') {
      if (current.agents.length || current.rules.length) {
        sections.push(current);
        current = { agents: [], rules: [] };
      }
      current.agents.push(value.toLowerCase());
    } else if (directive === 'allow' || directive === 'disallow') {
      current.rules.push({ type: directive, value });
    }
  }
  if (current.agents.length || current.rules.length) sections.push(current);

  const ua = userAgent.toLowerCase();
  const relevant = sections
    .filter((section) => section.agents.includes(ua) || section.agents.includes('*'))
    .sort((a, b) => (a.agents.includes(ua) ? -1 : 1));

  const rules = [];
  for (const section of relevant) {
    for (const rule of section.rules) {
      rules.push(rule);
    }
  }

  function allows(pathname) {
    if (!rules.length) return true;
    let decision = null;
    let matchLength = -1;
    for (const { type, value } of rules) {
      const pattern = value.trim();
      if (pattern === '') {
        decision = type === 'allow';
        matchLength = Math.max(matchLength, 0);
        continue;
      }
      if (!pathname.startsWith(pattern)) continue;
      if (pattern.length >= matchLength) {
        decision = type === 'allow';
        matchLength = pattern.length;
      }
    }
    if (decision === null) return true;
    return decision;
  }

  return { allows };
}

async function fetchWithTimeout(url, { headers, timeoutMs, verbose, body, method = 'GET' }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (verbose) console.warn(`[crawler] Fetch failed for ${url}: ${err.message}`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, opts) {
  const res = await fetchWithTimeout(url, opts);
  const text = await res.text();
  return { res, text };
}

async function fetchJson(url, opts) {
  const response = await fetchWithTimeout(url, opts);
  const text = await response.text();
  let json = null;
  try {
    if (text) json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON (${err.message})`);
  }
  return { res: response, json, raw: text };
}

async function crawlOrigin(originCtx, options) {
  const { origin } = originCtx;
  const manifestUrl = new URL('/.well-known/agent.json', origin).toString();
  const headers = {
    'User-Agent': options.userAgent,
    'X-A2A-Crawler': 'true',
  };

  const summary = {
    origin,
    seeds: originCtx.seeds,
    manifestUrl,
    manifestStatus: null,
    manifest: null,
    manifestError: null,
    cardUrl: null,
    cardStatus: null,
    card: null,
    cardError: null,
    crawlId: randomUUID(),
    crawledAt: new Date().toISOString(),
  };

  let robots;
  try {
    const robotsUrl = new URL('/robots.txt', origin).toString();
    const { res, text } = await fetchText(robotsUrl, {
      headers,
      timeoutMs: options.timeoutMs,
      verbose: options.verbose,
    });
    if (res.ok && text) {
      robots = parseRobots(text, options.userAgent);
    }
  } catch (err) {
    if (options.verbose) console.warn(`[crawler] Robots fetch error for ${origin}: ${err.message}`);
  }

  const robotsGuard = robots?.allows?.bind(robots);
  const manifestPath = '/.well-known/agent.json';

  if (robotsGuard && !robotsGuard(manifestPath)) {
    summary.manifestError = 'Blocked by robots.txt';
    return summary;
  }

  try {
    if (options.verbose) console.log(`[crawler] Fetching manifest ${manifestUrl}`);
    const { res, json, raw } = await fetchJson(manifestUrl, {
      headers,
      timeoutMs: options.timeoutMs,
      verbose: options.verbose,
    });
    summary.manifestStatus = res.status;
    if (!res.ok) {
      summary.manifestError = `HTTP ${res.status}`;
    } else if (!json || typeof json !== 'object') {
      summary.manifestError = 'Response was not a JSON object';
    } else {
      summary.manifest = json;
      summary.manifestRaw = raw;
      if (typeof json.agentCardUrl === 'string') {
        summary.cardUrl = json.agentCardUrl;
      }
    }
  } catch (err) {
    summary.manifestError = err.message;
    return summary;
  }

  if (!summary.cardUrl || options.includeCard === false) {
    return summary;
  }

  try {
    const { res, json, raw } = await fetchJson(summary.cardUrl, {
      headers,
      timeoutMs: options.timeoutMs,
      verbose: options.verbose,
    });
    summary.cardStatus = res.status;
    if (!res.ok) {
      summary.cardError = `HTTP ${res.status}`;
    } else if (!json || typeof json !== 'object') {
      summary.cardError = 'Card was not a JSON object';
    } else {
      summary.card = json;
      summary.cardRaw = raw;
    }
  } catch (err) {
    summary.cardError = err.message;
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    renderUsage();
    process.exit(0);
  }

  const verbose = Boolean(args.verbose);
  const userAgent = args.userAgent || DEFAULT_USER_AGENT;
  const timeoutMs = Number.isFinite(Number(args.timeout))
    ? Number(args.timeout)
    : REQUEST_TIMEOUT_MS;
  const includeCard = args.includeCard !== 'false';
  const seedList = args.seed
    ? Array.isArray(args.seed) ? args.seed : [args.seed]
    : null;

  const seeds = await readSeeds({
    seedList,
    seedsFile: args.seeds,
    verbose,
  });
  if (!seeds.length) {
    throw new Error('No valid seeds supplied.');
  }

  const origins = splitByOrigin(seeds);
  if (verbose) {
    console.log(`[crawler] Crawling ${origins.length} origin(s)`);
  }

  const entries = [];
  for (const originCtx of origins) {
    try {
      const result = await crawlOrigin(originCtx, {
        userAgent,
        timeoutMs,
        includeCard,
        verbose,
      });
      entries.push(result);
    } catch (err) {
      entries.push({
        origin: originCtx.origin,
        seeds: originCtx.seeds,
        manifestUrl: new URL('/.well-known/agent.json', originCtx.origin).toString(),
        manifestStatus: null,
        manifest: null,
        manifestError: `Unhandled error: ${err.message}`,
        cardUrl: null,
        cardStatus: null,
        card: null,
        cardError: null,
        crawlId: randomUUID(),
        crawledAt: new Date().toISOString(),
      });
    }
  }

  const directory = {
    generatedAt: new Date().toISOString(),
    userAgent,
    seeds,
    originCount: origins.length,
    entryCount: entries.length,
    entries,
  };

  const outputPath = resolve(process.cwd(), args.output || DEFAULT_OUTPUT_FILE);
  await writeFile(outputPath, JSON.stringify(directory, null, 2), 'utf8');
  console.log(`[crawler] Directory written to ${outputPath}`);

  if (args.json) {
    console.log(JSON.stringify(directory, null, 2));
  }
}

main().catch((err) => {
  console.error(`[crawler] Fatal error: ${err.stack || err.message}`);
  process.exit(1);
});

