import { NextResponse } from 'next/server';
import { rateLimit, rateLimitHeaders } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = [
  "You're a friendly network automation consultant.",
  'Your goal is to understand their environment, pain points, and automation maturity.',
  'Ask follow-up questions to dig deeper.',
  'Reference NAF framework concepts naturally (Intent, Executor, Collector, Observability, Orchestrator, Presentation).',
  'Keep responses conversational and not too long.',
  'After gathering enough info (5-7 exchanges), offer to summarize their assessment.',
].join(' ');

type IncomingMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type GeneratedReply = { text: string; provider: string | null };
type OpenAIUserKeyResult = { text: string | null; error: 'invalid_api_key' | 'request_failed' | null };

const MAX_CONTENT_LENGTH = 80_000; // bytes (best-effort)
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_TOTAL_CHARS = 15_000;

// Provider helpers (OpenAI-compatible)
async function callGemini(apiKey: string, system: string, user: string): Promise<string | null> {
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

async function callOpenAICompat(
  baseUrl: string,
  headers: Record<string, string>,
  model: string,
  messages: { role: string; content: string }[]
): Promise<string | null> {
  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 512 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

function formatTranscript(messages: IncomingMessage[]): string {
  return messages
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
    .join('\n');
}

function buildOpenAIMessages(messages: IncomingMessage[]): { role: string; content: string }[] {
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
}

async function callOpenAIWithUserKey(apiKey: string, messages: IncomingMessage[]): Promise<OpenAIUserKeyResult> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: buildOpenAIMessages(messages),
        temperature: 0.3,
        max_tokens: 512,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      return { text: null, error: 'invalid_api_key' };
    }
    if (!res.ok) {
      return { text: null, error: 'request_failed' };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? null;
    return { text: text && text.trim() ? text.trim() : null, error: null };
  } catch {
    return { text: null, error: 'request_failed' };
  }
}

async function generateReply(messages: IncomingMessage[]): Promise<GeneratedReply> {
  const geminiKey = process.env.GOOGLE_API_KEY || '';
  const groqKey = process.env.GROQ_API_KEY || '';
  const cerebrasKey = process.env.CEREBRAS_API_KEY || '';
  const cfToken = process.env.CF_API_TOKEN || '';
  const cfAccount = process.env.CF_ACCOUNT_ID || '';
  const openrouterKey = process.env.OPENROUTER_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const providerOrder = (process.env.A2A_PROVIDER_ORDER || 'GEMINI,GROQ,CEREBRAS,CLOUDFLARE,OPENROUTER,OPENAI')
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);

  const requestStart = Date.now();
  const transcript = formatTranscript(messages);
  const geminiPrompt = transcript ? `${transcript}\nAssistant:` : 'User:';
  const openAIMessages = buildOpenAIMessages(messages);

  for (const provider of providerOrder) {
    try {
      if (provider === 'GEMINI' && geminiKey) {
        const text = await callGemini(geminiKey, SYSTEM_PROMPT, geminiPrompt);
        if (text && text.trim()) {
          console.log(`[naf-discovery] answered_by=GEMINI dur_ms=${Date.now() - requestStart}`);
          return finalize(text, 'GEMINI');
        }
      }
      if (provider === 'GROQ' && groqKey) {
        const text = await callOpenAICompat(
          'https://api.groq.com/openai/v1/chat/completions',
          { Authorization: `Bearer ${groqKey}` },
          process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          openAIMessages
        );
        if (text && text.trim()) {
          console.log(`[naf-discovery] answered_by=GROQ dur_ms=${Date.now() - requestStart}`);
          return finalize(text, 'GROQ');
        }
      }
      if (provider === 'CEREBRAS' && cerebrasKey) {
        const text = await callOpenAICompat(
          'https://api.cerebras.ai/v1/chat/completions',
          { Authorization: `Bearer ${cerebrasKey}` },
          process.env.CEREBRAS_MODEL || 'llama-3.1-70b-instruct',
          openAIMessages
        );
        if (text && text.trim()) {
          console.log(`[naf-discovery] answered_by=CEREBRAS dur_ms=${Date.now() - requestStart}`);
          return finalize(text, 'CEREBRAS');
        }
      }
      if (provider === 'CLOUDFLARE' && cfToken && cfAccount) {
        const text = await callOpenAICompat(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/v1/chat/completions`,
          { Authorization: `Bearer ${cfToken}` },
          process.env.CF_MODEL || '@cf/meta/llama-3.1-8b-instruct-fp8',
          openAIMessages
        );
        if (text && text.trim()) {
          console.log(`[naf-discovery] answered_by=CLOUDFLARE dur_ms=${Date.now() - requestStart}`);
          return finalize(text, 'CLOUDFLARE');
        }
      }
      if (provider === 'OPENROUTER' && openrouterKey) {
        const text = await callOpenAICompat(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            Authorization: `Bearer ${openrouterKey}`,
            'HTTP-Referer': 'https://www.grahampaasch.com',
            'X-Title': 'GrahamPaaschSite',
          },
          process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
          openAIMessages
        );
        if (text && text.trim()) {
          console.log(`[naf-discovery] answered_by=OPENROUTER dur_ms=${Date.now() - requestStart}`);
          return finalize(text, 'OPENROUTER');
        }
      }
      if (provider === 'OPENAI' && openaiKey) {
        const text = await callOpenAICompat(
          'https://api.openai.com/v1/chat/completions',
          { Authorization: `Bearer ${openaiKey}` },
          process.env.OPENAI_MODEL || 'gpt-4o-mini',
          openAIMessages
        );
        if (text && text.trim()) {
          console.log(`[naf-discovery] answered_by=OPENAI dur_ms=${Date.now() - requestStart}`);
          return finalize(text, 'OPENAI');
        }
      }
    } catch {
      // continue to next provider
    }
  }

  console.warn(`[naf-discovery] providers_exhausted dur_ms=${Date.now() - requestStart}`);
  return { text: '', provider: null };

  function finalize(text: string, provider: string): GeneratedReply {
    return { text: text.trim(), provider };
  }
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { id: 'naf:chat', limit: 12, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      { error: 'Payload too large.' },
      { status: 413, headers: rateLimitHeaders(rl) },
    );
  }

  const payload = await request.json().catch(() => null);
  if (!payload || !Array.isArray(payload.messages)) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }
  if (payload.apiKey !== undefined && typeof payload.apiKey !== 'string') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
  }

  const messages: IncomingMessage[] = [];
  if (payload.messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `Too many messages (max ${MAX_MESSAGES}).` },
      { status: 400, headers: rateLimitHeaders(rl) },
    );
  }

  let totalChars = 0;
  for (const entry of payload.messages) {
    if (!entry || typeof entry.role !== 'string' || typeof entry.content !== 'string') {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
    }
    if (entry.role !== 'user' && entry.role !== 'assistant') {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
    }
    const content = entry.content.trim();
    if (!content) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
    }
    if (content.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `A message is too long (max ${MAX_MESSAGE_CHARS} chars).` },
        { status: 400, headers: rateLimitHeaders(rl) },
      );
    }
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return NextResponse.json(
        { error: `Conversation is too long (max ${MAX_TOTAL_CHARS} chars total).` },
        { status: 400, headers: rateLimitHeaders(rl) },
      );
    }
    messages.push({ role: entry.role, content });
  }

  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : '';
  if (apiKey) {
    if (apiKey.length > 200) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400, headers: rateLimitHeaders(rl) });
    }
    const { text: reply, error } = await callOpenAIWithUserKey(apiKey, messages);
    if (error === 'invalid_api_key') {
      return NextResponse.json({ error: 'Invalid OpenAI API key.' }, { status: 401, headers: rateLimitHeaders(rl) });
    }
    if (!reply) {
      return NextResponse.json(
        { error: 'Failed to generate response with your API key.' },
        { status: 502, headers: rateLimitHeaders(rl) }
      );
    }
    return NextResponse.json({ message: reply }, { headers: rateLimitHeaders(rl) });
  }

  const hasProviders = [
    process.env.GOOGLE_API_KEY,
    process.env.GROQ_API_KEY,
    process.env.CEREBRAS_API_KEY,
    process.env.CF_API_TOKEN && process.env.CF_ACCOUNT_ID,
    process.env.OPENROUTER_API_KEY,
    process.env.OPENAI_API_KEY,
  ].some(Boolean);

  if (!hasProviders) {
    return NextResponse.json({ error: 'No AI providers are configured.' }, { status: 500, headers: rateLimitHeaders(rl) });
  }

  try {
    const { text: reply } = await generateReply(messages);
    if (!reply) {
      return NextResponse.json({ error: 'No response generated.' }, { status: 500, headers: rateLimitHeaders(rl) });
    }
    return NextResponse.json({ message: reply }, { headers: rateLimitHeaders(rl) });
  } catch (error) {
    console.error('NAF discovery error:', error);
    return NextResponse.json({ error: 'Failed to generate response.' }, { status: 500, headers: rateLimitHeaders(rl) });
  }
}
