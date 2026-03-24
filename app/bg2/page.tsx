import type { Metadata } from 'next';
import BG2Viewer from './bg2-viewer';

export const metadata: Metadata = {
  title: 'Baldur\'s Gate II — Graham Paasch',
  description: 'Baldur\'s Gate II: Shadows of Amn running in the browser.',
};

export default function BG2Page() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 50 }}>
      <BG2Viewer />
    </div>
  );
}
