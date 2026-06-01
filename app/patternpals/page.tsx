import PatternPalsApp from '@/components/PatternPalsApp';

export const metadata = {
  title: 'PatternPals',
  description:
    'Given who is at practice today, PatternPals helps jugglers choose, learn, and remember good passing patterns.',
};

export default function PatternPalsPage() {
  return (
    <div className="patternpals-shell">
      <PatternPalsApp />
    </div>
  );
}
