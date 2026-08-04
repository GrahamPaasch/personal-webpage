import type { Metadata } from 'next';

import MeetClient from './meetClient';

export const metadata: Metadata = {
  title: 'Meet',
  description: 'A lightweight LiveKit video room with a shared annotation layer.',
};

export default function Page() {
  return <MeetClient />;
}
