import type { Metadata } from 'next';

import OverlayClient from './overlayClient';

export const metadata: Metadata = {
  title: 'Meet Overlay',
  description: 'Transparent annotation overlay companion for a Meet room.',
};

export default function Page() {
  return <OverlayClient />;
}
