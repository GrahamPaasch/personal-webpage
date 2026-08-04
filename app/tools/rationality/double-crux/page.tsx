import type { Metadata } from 'next';

import DoubleCruxTool from './double-crux-tool';

export const metadata: Metadata = {
  title: 'Double Crux',
  description: 'Find the core disagreement that, if resolved, changes both minds.',
};

export default function Page() {
  return <DoubleCruxTool />;
}
