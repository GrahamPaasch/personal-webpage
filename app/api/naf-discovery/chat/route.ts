import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

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

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload || !Array.isArray(payload.messages)) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const messages: IncomingMessage[] = [];
  for (const entry of payload.messages) {
    if (!entry || typeof entry.role !== 'string' || typeof entry.content !== 'string') {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }
    if (entry.role !== 'user' && entry.role !== 'assistant') {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }
    const content = entry.content.trim();
    if (!content) {
      return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
    }
    messages.push({ role: entry.role, content });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY is not configured.' }, { status: 500 });
  }

  try {
    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.4,
      max_tokens: 500,
    });
    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json({ error: 'No response generated.' }, { status: 500 });
    }
    return NextResponse.json({ message: reply });
  } catch (error) {
    console.error('Groq NAF discovery error:', error);
    return NextResponse.json({ error: 'Failed to generate response.' }, { status: 500 });
  }
}
