import type { Metadata } from 'next';
import BG2Viewer from './bg2-viewer';

export const metadata: Metadata = {
  title: 'Baldur\'s Gate II — Graham Paasch',
  description: 'Baldur\'s Gate II: Shadows of Amn running in the browser.',
};

export default function BG2Page() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <BG2Viewer />
    </div>
  );
}
