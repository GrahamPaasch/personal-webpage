import { randomUUID } from 'crypto';
import type { AgentCard, Message } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  type AgentExecutor,
  type RequestContext,
  type ExecutionEventBus,
} from '@a2a-js/sdk/server';
import { JsonRpcTransportHandler } from '@a2a-js/sdk/server';
import { AGENT_NAME, AGENT_PROFILE } from '@/lib/agentProfile';
import { searchSiteContext } from '@/lib/siteContext';
import type { TaskStatusUpdateEvent } from '@a2a-js/sdk';

// Build Agent Card once
function buildAgentCard(baseUrl: string): AgentCard {
  return {
    name: `${AGENT_NAME}'s Site Agent`,
    description:
      'A simple chat agent for grahampaasch.com using the A2A protocol.',
    protocolVersion: '0.3.0',
    version: '0.1.0',
    url: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    preferredTransport: 'JSONRPC',
    provider: {
      organization: 'www.grahampaasch.com',
      url: 'https://www.grahampaasch.com',
    },
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      {
        id: 'site_chat',
        name: 'Site Chat',
        description:
          'Conversational Q&A about Graham, writings, hobbies, and professional background.',
        tags: ['chat', 'info', 'site'],
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
        examples: [
          'Tell me about Graham Paasch’s background.',
          'Where can I read your latest writing?',
          'What instruments do you play?',
          'How can I get in touch with you?'
        ],
      },
    ],
    supportsAuthenticatedExtendedCard: false,
  };
}

// Provider helpers (OpenAI-compatible)
async function callGemini(apiKey: string, system: string, user: string): Promise<string | null> {
  try {
    const body = {
      contents: [ { role: 'user', parts: [{ text: `${system}\n\n${user}` }] } ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
    };
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) return res.status >= 400 ? null : null;
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

async function callOpenAICompat(baseUrl: string, headers: Record<string,string>, model: string, messages: any[]): Promise<string | null> {
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

// Minimal executor with RAG context; tries providers in order
async function generateReply(prompt: string): Promise<string> {
  const geminiKey = process.env.GOOGLE_API_KEY || '';
  const groqKey = process.env.GROQ_API_KEY || '';
  const cerebrasKey = process.env.CEREBRAS_API_KEY || '';
  const cfToken = process.env.CF_API_TOKEN || '';
  const cfAccount = process.env.CF_ACCOUNT_ID || '';
  const openrouterKey = process.env.OPENROUTER_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const providerOrder = (process.env.A2A_PROVIDER_ORDER || 'GEMINI,GROQ,CEREBRAS,CLOUDFLARE,OPENROUTER,OPENAI')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  const system = AGENT_PROFILE;
  const ctx = await searchSiteContext(prompt, { k: 3, perExcerptChars: 700 });
  const context = ctx.context ? `${ctx.context}\n\n` : '';
  const baseUser = `${context}User: ${prompt}`;

  // If no keys configured, provide a deterministic helpful reply
  if (![geminiKey, groqKey, cerebrasKey, cfToken && cfAccount, openrouterKey, openaiKey].some(Boolean)) {
    const baseLinks = [
      'Read writings → /writings',
      'Explore hobbies → /hobbies',
      'Professional profile → /professional',
    ];
    const fallbackSources = ctx.display ? `\n\nSources:\n${ctx.display}` : '';
    return `Hi! I’m Graham’s A2A agent. I can point you to Graham’s writing, hobbies, and professional work.\n\nUseful links:\n${baseLinks.map((link) => `- ${link}`).join('\n')}${fallbackSources}`;
  }

  const requestStart = Date.now();
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: baseUser },
  ];

  for (const p of providerOrder) {
    try {
      if (p === 'GEMINI' && geminiKey) {
        const text = await callGemini(geminiKey, system, baseUser);
        if (text && text.trim()) { console.log(`[a2a] answered_by=GEMINI dur_ms=${Date.now() - requestStart}`); return finalize(text); }
      }
      if (p === 'GROQ' && groqKey) {
        const text = await callOpenAICompat(
          'https://api.groq.com/openai/v1/chat/completions',
          { Authorization: `Bearer ${groqKey}` },
          process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages
        );
        if (text && text.trim()) { console.log(`[a2a] answered_by=GROQ dur_ms=${Date.now() - requestStart}`); return finalize(text); }
      }
      if (p === 'CEREBRAS' && cerebrasKey) {
        const text = await callOpenAICompat(
          'https://api.cerebras.ai/v1/chat/completions',
          { Authorization: `Bearer ${cerebrasKey}` },
          process.env.CEREBRAS_MODEL || 'llama-3.1-70b-instruct',
          messages
        );
        if (text && text.trim()) { console.log(`[a2a] answered_by=CEREBRAS dur_ms=${Date.now() - requestStart}`); return finalize(text); }
      }
      if (p === 'CLOUDFLARE' && cfToken && cfAccount) {
        const text = await callOpenAICompat(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/v1/chat/completions`,
          { Authorization: `Bearer ${cfToken}` },
          process.env.CF_MODEL || '@cf/meta/llama-3.1-8b-instruct-fp8',
          messages
        );
        if (text && text.trim()) { console.log(`[a2a] answered_by=CLOUDFLARE dur_ms=${Date.now() - requestStart}`); return finalize(text); }
      }
      if (p === 'OPENROUTER' && openrouterKey) {
        const text = await callOpenAICompat(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            Authorization: `Bearer ${openrouterKey}`,
            'HTTP-Referer': 'https://www.grahampaasch.com',
            'X-Title': 'GrahamPaaschSite',
          },
          process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
          messages
        );
        if (text && text.trim()) { console.log(`[a2a] answered_by=OPENROUTER dur_ms=${Date.now() - requestStart}`); return finalize(text); }
      }
      if (p === 'OPENAI' && openaiKey) {
        const text = await callOpenAICompat(
          'https://api.openai.com/v1/chat/completions',
          { Authorization: `Bearer ${openaiKey}` },
          process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages
        );
        if (text && text.trim()) { console.log(`[a2a] answered_by=OPENAI dur_ms=${Date.now() - requestStart}`); return finalize(text); }
      }
    } catch {
      // continue to next provider
    }
  }

  console.warn(`[a2a] providers_exhausted dur_ms=${Date.now() - requestStart}`);
  return 'Sorry, I could not produce a response.';

  function finalize(text: string): string {
    if (ctx.display) return `${text.trim()}\n\nSources:\n${ctx.display}`;
    return text.trim();
  }
}

class SiteAgentExecutor implements AgentExecutor {
  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const userText = requestContext.userMessage?.parts?.[0]?.kind === 'text'
      ? (requestContext.userMessage.parts[0] as any).text as string
      : '';

    // streaming: emit a quick working status so the client can show a typing indicator
    const working: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId: requestContext.taskId,
      contextId: requestContext.contextId,
      status: { state: 'working', timestamp: new Date().toISOString() },
      final: false,
    };
    eventBus.publish(working);

    const reply = await generateReply(userText || '');

    const response: Message = {
      kind: 'message',
      messageId: randomUUID(),
      role: 'agent',
      parts: [{ kind: 'text', text: reply }],
      contextId: requestContext.contextId,
      taskId: requestContext.taskId,
    };
    eventBus.publish(response);

    const completed: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId: requestContext.taskId,
      contextId: requestContext.contextId,
      status: { state: 'completed', timestamp: new Date().toISOString() },
      final: true,
    };
    eventBus.publish(completed);
    eventBus.finished();
  }

  async cancelTask(_taskId: string, _eventBus: ExecutionEventBus): Promise<void> {
    // No-op; this agent does not create long-running tasks
    return;
  }
}

let singleton: {
  rpc: JsonRpcTransportHandler;
  handler: DefaultRequestHandler;
  card: AgentCard;
} | null = null;

export function getA2AServer(baseUrl: string) {
  if (singleton) return singleton;
  const card = buildAgentCard(baseUrl);
  const taskStore = new InMemoryTaskStore();
  const executor = new SiteAgentExecutor();
  const handler = new DefaultRequestHandler(card, taskStore, executor);
  const rpc = new JsonRpcTransportHandler(handler);
  singleton = { rpc, handler, card };
  return singleton;
}
