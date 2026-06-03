import PatternPalsAtlasOnly from '@/components/PatternPalsAtlasOnly';

export const metadata = {
  title: 'PatternPals Pattern Atlas',
  description:
    'A living atlas for passing jugglers: canonical pattern pages, teaching progressions, source citations, community memory, and practice planning.',
};

export default function PatternPalsPage() {
  return (
    <div className="patternpals-shell">
      <PatternPalsAtlasOnly />
    </div>
  );
}
