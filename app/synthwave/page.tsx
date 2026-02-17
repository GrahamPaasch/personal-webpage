export const metadata = {
  title: 'Synthwave Beats',
  description: 'A browser-based rhythm game with procedural synthwave music.',
};

export default function SynthwavePage() {
  return (
    <iframe
      src="/synthwave.html"
      title="Synthwave Beats"
      allow="autoplay"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
      }}
    />
  );
}
