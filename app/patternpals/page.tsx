import PatternPalsApp from '@/components/PatternPalsApp';

export const metadata = {
  title: 'PatternPals',
  description: 'Pattern recommendations, session scheduling, and juggling progress tracking.',
};

export default function PatternPalsPage() {
  return (
    <div className="patternpals-shell">
      <PatternPalsApp />
    </div>
  );
}
