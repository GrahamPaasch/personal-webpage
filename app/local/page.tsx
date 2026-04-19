import React from 'react';

export default function Page() {
  return (
    <div className="game-container">
      <h1>Snake Game</h1>
      <iframe 
        src="/local/snake.html" 
        title="Snake Game" 
        style={{ width: '100%', height: '500px', border: 'none' }}
      />
    </div>
  );
}