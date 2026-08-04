import type { Metadata } from 'next';

import HammingQuestionsTool from './hamming-questions-tool';

export const metadata: Metadata = {
  title: 'Hamming Questions',
  description: 'Ask yourself: what\'s the most important problem you could be working on?',
};

export default function Page() {
  return <HammingQuestionsTool />;
}
