import PatternPalsAtlasOnly from '@/components/PatternPalsAtlasOnly';
import { PATTERN_LIBRARY, getPatternById } from '@/lib/patternpals/patterns';

type PatternPageProps = {
  params: Promise<{
    patternId: string;
  }>;
};

export async function generateStaticParams() {
  return PATTERN_LIBRARY.map((pattern) => ({
    patternId: pattern.id,
  }));
}

export async function generateMetadata({ params }: PatternPageProps) {
  const { patternId } = await params;
  const pattern = getPatternById(patternId);

  if (!pattern) {
    return {
      title: 'Pattern not found | PatternPals',
      description: 'Find juggling passing patterns, source excerpts, and practice recommendations in PatternPals.',
    };
  }

  return {
    title: `${pattern.name} | PatternPals`,
    description: `${pattern.description} Given who is at practice today, PatternPals helps jugglers choose, learn, and remember good passing patterns.`,
  };
}

export default async function PatternPalsPatternPage({ params }: PatternPageProps) {
  const { patternId } = await params;

  return (
    <div className="patternpals-shell">
      <PatternPalsAtlasOnly initialPatternId={patternId} />
    </div>
  );
}
