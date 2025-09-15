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
          'Tell me about Vigil Pathfinder',
          'Where can I read your writings?',
          'What instruments do you play?',
          'How to contact you?'
        ],
      },
    ],
    supportsAuthenticatedExtendedCard: false,
  };
}

// Provider helpers
async function callGemini(apiKey: string, body: any): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

async function callOpenAI(apiKey: string, messages: any[]): Promise<string | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.3, max_tokens: 512 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

// Minimal executor with RAG context; uses Gemini by default, falls back to OpenAI if configured
async function generateReply(prompt: string): Promise<string> {
  const geminiKey = process.env.GOOGLE_API_KEY || '';
  const openaiKey = process.env.OPENAI_API_KEY || '';
  const system = AGENT_PROFILE;
  const ctx = await searchSiteContext(prompt, { k: 3, perExcerptChars: 700 });

  const baseUser = `${ctx.text ? ctx.text + '\n\n' : ''}User: ${prompt}`;

  // If no keys configured, provide a deterministic helpful reply
  if (!geminiKey && !openaiKey) {
    return (
      `Hi! I’m Graham’s A2A agent. I can help with:\n- Writings: /writings\n- Hobbies: /hobbies\n- Professional: /professional\nAsk me anything about the site or Graham.`
    );
  }

  // Try Gemini first if available
  if (geminiKey) {
    try {
      const body = {
        contents: [ { role: 'user', parts: [{ text: `${system}\n\n${baseUser}` }] } ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
      };
      const res = await callGemini(geminiKey, body);
      if (res.ok) {
        const data = await res.json();
        const t = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (typeof t === 'string' && t.trim()) return t.trim();
      } else if (!(openaiKey && (res.status === 429 || res.status === 403 || res.status >= 500))) {
        return `Sorry, I had trouble generating a response (status ${res.status}).`;
      }
    } catch {}
  }

  // Fallback to OpenAI if configured
  if (openaiKey) {
    const alt = await callOpenAI(openaiKey, [
      { role: 'system', content: system },
      { role: 'user', content: baseUser },
    ]);
    if (alt && alt.trim()) return alt.trim();
  }

  return 'Sorry, I could not produce a response.';
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
