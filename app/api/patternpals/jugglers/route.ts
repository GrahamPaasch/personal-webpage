import { NextRequest, NextResponse } from 'next/server';
import { createJuggler, listJugglers, updateJuggler } from '@/lib/patternpals/storage';
import type { ExperienceLevel, PropType } from '@/lib/patternpals/types';

export const runtime = 'nodejs';

const EXPERIENCE_LEVELS: ExperienceLevel[] = ['Beginner', 'Intermediate', 'Advanced'];
const PROP_OPTIONS: PropType[] = ['clubs', 'balls', 'rings'];

const isExperienceLevel = (value: any): value is ExperienceLevel =>
  EXPERIENCE_LEVELS.includes(value);

const isPropType = (value: any): value is PropType => PROP_OPTIONS.includes(value);

export async function GET() {
  const items = await listJugglers();
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const data = await request.json().catch(() => null);
  if (!data || typeof data.name !== 'string' || !data.name.trim()) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }
  if (!isExperienceLevel(data.experience)) {
    return NextResponse.json({ error: 'Invalid experience level.' }, { status: 400 });
  }

  const props = Array.isArray(data.props)
    ? data.props.filter(isPropType)
    : [];

  const created = await createJuggler({
    name: data.name.trim(),
    experience: data.experience,
    props,
  });

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const data = await request.json().catch(() => null);
  if (!data || typeof data.id !== 'string') {
    return NextResponse.json({ error: 'Juggler id is required.' }, { status: 400 });
  }

  const updates: {
    name?: string;
    experience?: ExperienceLevel;
    props?: PropType[];
  } = {};

  if (typeof data.name === 'string' && data.name.trim()) {
    updates.name = data.name.trim();
  }
  if (data.experience && isExperienceLevel(data.experience)) {
    updates.experience = data.experience;
  }
  if (Array.isArray(data.props)) {
    updates.props = data.props.filter(isPropType);
  }

  const updated = await updateJuggler(data.id, updates);
  if (!updated) {
    return NextResponse.json({ error: 'Juggler not found.' }, { status: 404 });
  }
  return NextResponse.json(updated);
}
