import { permanentRedirect } from 'next/navigation';
import PatternPalsAtlasOnly from '@/components/PatternPalsAtlasOnly';
import { REMOVED_PATTERN_IDS } from '@/lib/patternpals/derived';
import { describePattern } from '@/lib/patternpals/atlas';
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
    description: describePattern(pattern),
  };
}

export default async function PatternPalsPatternPage({ params }: PatternPageProps) {
  const { patternId } = await params;

  if (!getPatternById(patternId) && patternId in REMOVED_PATTERN_IDS) {
    // Old deep links to entries removed in the 2026-10 cleanup (book index lines, duplicates).
    const target = REMOVED_PATTERN_IDS[patternId];
    permanentRedirect(target ? `/patternpals/patterns/${target}` : '/patternpals');
  }

  return (
    <div className="patternpals-shell">
      <PatternPalsAtlasOnly initialPatternId={patternId} />
    </div>
  );
}
