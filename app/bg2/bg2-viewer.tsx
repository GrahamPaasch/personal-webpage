'use client';

export default function BG2Viewer() {
  function openGame() {
    window.open('https://bg2.grahampaasch.com/?pwd=bg2play', '_blank');
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0f',
      color: '#c8a96e',
      fontFamily: 'serif',
      gap: '2rem',
    }}>
      <h1 style={{ fontSize: '2.5rem', margin: 0, textShadow: '0 0 20px #c8a96e55' }}>
        Baldur&apos;s Gate II
      </h1>
      <p style={{ fontSize: '1.1rem', color: '#9a7a4e', maxWidth: '480px', textAlign: 'center', lineHeight: 1.6 }}>
        Watch live — or take control and play. Mouse, keyboard, and audio all work
        in the game window. Chat and emoji reactions are available inside too.
      </p>
      <button
        onClick={openGame}
        style={{
          padding: '0.85rem 2.5rem',
          fontSize: '1.1rem',
          background: 'transparent',
          border: '2px solid #c8a96e',
          color: '#c8a96e',
          cursor: 'pointer',
          letterSpacing: '0.1em',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          (e.target as HTMLButtonElement).style.background = '#c8a96e22';
        }}
        onMouseLeave={e => {
          (e.target as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        Enter the Sword Coast
      </button>
      <p style={{ fontSize: '0.8rem', color: '#555', marginTop: '-1rem' }}>
        Opens in a new tab — press F11 for fullscreen
      </p>
    </div>
  );
}
