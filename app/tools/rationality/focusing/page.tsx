import type { Metadata } from 'next';

import FocusingTool from './focusing-tool';

export const metadata: Metadata = {
  title: 'Focusing',
  description: 'Tune into your felt sense to surface what you really know.',
};

export default function Page() {
  return <FocusingTool />;
}
