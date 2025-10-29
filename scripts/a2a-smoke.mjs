#!/usr/bin/env node

import { randomUUID } from 'node:crypto';

const DEFAULT_CARD_URL = 'https://www.grahampaasch.com/api/a2a/.well-known/agent-card.json';
const DEFAULT_RPC_URL = 'https://www.grahampaasch.com/api/a2a';
const DEFAULT_USER_AGENT = 'graham-a2a-synthetic-ping/1.0';

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [rawKey, rawValue] = arg.slice(2).split('=', 2);
      const key = rawKey.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      if (typeof rawValue !== 'undefined') {
        result[key] = rawValue;
        continue;
      }
      const next = argv[i + 1];
      if (typeof next === 'undefined' || next.startsWith('-')) {
        result[key] = true;
      } else {
        result[key] = next;
        i += 1;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const flags = arg.slice(1).split('');
      for (const flag of flags) {
        if (flag === 'h') result.help = true;
        else if (flag === 'v') result.verbose = true;
        else result[flag] = true;
      }
    } else {
      result._.push(arg);
    }
  }
  return result;
}

function renderUsage() {
  console.log(`Usage: node scripts/a2a-smoke.mjs [options]

Checks the public A2A agent endpoint by fetching the agent card and sending a JSON-RPC message/send call.

Options:
  --card <url>          Agent card URL (default: ${DEFAULT_CARD_URL})
  --rpc <url>           JSON-RPC endpoint (defaults to the card's transport endpoint or ${DEFAULT_RPC_URL})
  --message <text>      Message to send (default: synthetic greeting with timestamp)
  --context <uuid>      Context ID to reuse (default: random UUID per request)
  --count <n>           Number of requests to send (default: 1)
  --interval <seconds>  Delay between requests when count > 1 (default: 0)
  --user-agent <ua>     User-Agent header (default: ${DEFAULT_USER_AGENT})
  --json                Print the raw JSON response in addition to the summary
  --verbose             Print extra diagnostics
  -h, --help            Show this help
`);
}

function toNumber(value, fallback) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    renderUsage();
    process.exit(0);
  }

  const cardUrl = args.card || DEFAULT_CARD_URL;
  const headers = {
    'User-Agent': args.userAgent || DEFAULT_USER_AGENT,
  };

  if (args.verbose) {
    console.log(`[a2a-smoke] Fetching card from ${cardUrl}`);
  }

  const cardStart = Date.now();
  const cardRes = await fetch(cardUrl, { headers });
  const cardElapsed = Date.now() - cardStart;

  if (!cardRes.ok) {
    console.error(`[a2a-smoke] Failed to fetch agent card (${cardRes.status} ${cardRes.statusText}) after ${cardElapsed}ms`);
    process.exit(1);
  }

  const card = await cardRes.json();
  const derivedRpc =
    args.rpc ||
    card?.transport?.jsonrpc?.endpoint ||
    (typeof card?.url === 'string' ? card.url.replace(/\/$/, '') : null) ||
    DEFAULT_RPC_URL;
  const rpcUrl = derivedRpc || DEFAULT_RPC_URL;

  console.log(`[a2a-smoke] Agent: ${card?.name ?? 'unknown'} (protocol ${card?.protocolVersion ?? 'n/a'}, version ${card?.version ?? 'n/a'})`);
  console.log(`[a2a-smoke] Using RPC endpoint: ${rpcUrl}`);

  const count = toNumber(args.count, 1);
  const intervalSeconds = Math.max(0, toNumber(args.interval, 0));
  const intervalMs = intervalSeconds * 1000;
  const printJson = Boolean(args.json);
  const verbose = Boolean(args.verbose);

  for (let i = 0; i < count; i += 1) {
    const requestId = randomUUID();
    const contextId = args.context || randomUUID();
    const messageText =
      args.message ||
      `Synthetic hello from grahampaasch.com smoke-check at ${new Date().toISOString()}`;

    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'message/send',
      params: {
        message: {
          kind: 'message',
          messageId: randomUUID(),
          role: 'user',
          contextId,
          parts: [{ kind: 'text', text: messageText }],
        },
        configuration: {
          acceptedOutputModes: ['text/plain'],
          blocking: true,
        },
      },
    };

    const reqHeaders = {
      ...headers,
      'Content-Type': 'application/json',
      'X-A2A-Synthetic': 'true',
    };

    if (verbose) {
      console.log(`[a2a-smoke] → (${i + 1}/${count}) context=${contextId} message="${messageText}"`);
    }

    const started = Date.now();
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(payload),
    }).catch((err) => {
      console.error(`[a2a-smoke] Request failed: ${err.message}`);
      process.exitCode = 1;
      return null;
    });
    if (!response) break;

    const elapsed = Date.now() - started;

    let bodyText;
    let parsed;
    try {
      bodyText = await response.text();
      parsed = bodyText ? JSON.parse(bodyText) : null;
    } catch (err) {
      console.error(`[a2a-smoke] Failed to parse JSON response: ${err.message}`);
      if (bodyText) console.error(`[a2a-smoke] Raw body: ${bodyText.slice(0, 500)}`);
      process.exitCode = 1;
      break;
    }

    if (!response.ok) {
      console.error(`[a2a-smoke] HTTP ${response.status} ${response.statusText} in ${elapsed}ms`);
      if (parsed?.error) {
        console.error(`[a2a-smoke] JSON-RPC error ${parsed.error.code}: ${parsed.error.message}`);
      }
      process.exitCode = 1;
    } else if (parsed?.error) {
      console.error(`[a2a-smoke] JSON-RPC error ${parsed.error.code}: ${parsed.error.message} (after ${elapsed}ms)`);
      process.exitCode = 1;
    } else if (parsed?.result) {
      const result = parsed.result;
      const kind = result.kind ?? 'unknown';
      let summary = kind;
      if (kind === 'message') {
        const firstPart = result.parts?.find((p) => p?.kind === 'text');
        const text = typeof firstPart?.text === 'string' ? firstPart.text : '';
        const snippet = text.length > 140 ? `${text.slice(0, 137)}…` : text;
        summary = `message (${text.length} chars)`;
        console.log(`[a2a-smoke] ✓ ${summary} in ${elapsed}ms`);
        console.log(`[a2a-smoke]   preview: ${snippet}`);
      } else {
        console.log(`[a2a-smoke] ✓ ${summary} in ${elapsed}ms`);
      }
      if (printJson) {
        console.log(JSON.stringify(parsed, null, 2));
      }
    } else {
      console.error(`[a2a-smoke] Unexpected response shape after ${elapsed}ms`);
      if (printJson) {
        console.log(JSON.stringify(parsed, null, 2));
      }
      process.exitCode = 1;
    }

    if (i < count - 1 && intervalMs > 0) {
      await sleep(intervalMs);
    }
  }
}

main().catch((err) => {
  console.error(`[a2a-smoke] Unhandled error: ${err.stack || err.message}`);
  process.exit(1);
});

