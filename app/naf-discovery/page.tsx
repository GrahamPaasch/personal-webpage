import type { Metadata } from 'next';

import NafDiscoveryClient from './nafDiscoveryClient';

export const metadata: Metadata = {
  title: 'NAF Discovery Tool',
  description: 'An AI-guided network assessment that builds your Network Architecture Framework through conversation.',
};

export default function Page() {
  return <NafDiscoveryClient />;
}
