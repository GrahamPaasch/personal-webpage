import type { Metadata } from 'next';

import DemonstrationClient from './demonstrationClient';

export const metadata: Metadata = {
  title: 'Demonstration',
  description: 'An interactive particle-physics scene.',
};

export default function Page() {
  return <DemonstrationClient />;
}
