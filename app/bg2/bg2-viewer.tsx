'use client';

export default function BG2Viewer() {
  function openGame() {
    window.open('https://bg2.grahampaasch.com/?pwd=bg2play', '_blank');
  }

  const btnStyle: React.CSSProperties = {
    padding: '0.5rem 1.5rem',
    fontSize: '1rem',
    background: 'transparent',
    border: '2px solid #c8a96e',
    color: '#c8a96e',
    cursor: 'pointer',
    letterSpacing: '0.08em',
    fontFamily: 'serif',
    transition: 'background 0.2s',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'grid',
      gridTemplateRows: 'auto 1fr',
      background: '#0a0a0f',
      color: '#c8a96e',
      fontFamily: 'serif',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid #2a1f10',
        background: '#0d0a06',
      }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem', whiteSpace: 'nowrap' }}>
          Baldur&apos;s Gate II
        </h1>
        <button
          style={btnStyle}
          onClick={openGame}
          onMouseEnter={e => (e.currentTarget.style.background = '#c8a96e22')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          ▶ Enter the Sword Coast
        </button>
        <span style={{ color: '#555', fontSize: '0.78rem' }}>
          Opens game in new tab — press F11 for fullscreen
        </span>
      </div>

      {/* Voice + video lobby via Jitsi */}
      <iframe
        src="https://meet.jit.si/GrahamBG2SwordCoast#config.startWithVideoMuted=true&config.startWithAudioMuted=true&config.disableDeepLinking=true&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false"
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="camera; microphone; display-capture; fullscreen"
      />
    </div>
  );
}
