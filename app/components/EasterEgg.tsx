'use client';

import { useEffect, useState } from 'react';

// Konami code: ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI_CODE = [
  'ArrowUp', 'ArrowUp', 
  'ArrowDown', 'ArrowDown', 
  'ArrowLeft', 'ArrowRight', 
  'ArrowLeft', 'ArrowRight', 
  'KeyB', 'KeyA'
];

const BALL_COLORS = ['#f97316', '#facc15', '#22c55e', '#0ea5e9', '#8b5cf6', '#ec4899'];

type Ball = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
};

export default function EasterEgg() {
  const [sequence, setSequence] = useState<string[]>([]);
  const [activated, setActivated] = useState(false);
  const [balls, setBalls] = useState<Ball[]>([]);

  // Listen for Konami code
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const newSequence = [...sequence, e.code].slice(-KONAMI_CODE.length);
      setSequence(newSequence);
      
      if (newSequence.join(',') === KONAMI_CODE.join(',')) {
        setActivated(true);
        setSequence([]);
        
        // Create juggling balls
        const newBalls: Ball[] = BALL_COLORS.map((color, i) => ({
          id: i,
          x: Math.random() * (window.innerWidth - 60) + 30,
          y: -60 - (i * 100),
          vx: (Math.random() - 0.5) * 8,
          vy: 0,
          color,
        }));
        setBalls(newBalls);
        
        // Clear after 8 seconds
        setTimeout(() => {
          setActivated(false);
          setBalls([]);
        }, 8000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sequence]);

  // Animate balls with physics
  useEffect(() => {
    if (!activated || balls.length === 0) return;

    const gravity = 0.4;
    const bounce = 0.75;
    const friction = 0.99;

    const animate = () => {
      setBalls(prevBalls => 
        prevBalls.map(ball => {
          let { x, y, vx, vy } = ball;
          
          // Apply gravity
          vy += gravity;
          
          // Apply velocity
          x += vx;
          y += vy;
          
          // Bounce off walls
          if (x <= 30) {
            x = 30;
            vx = -vx * bounce;
          }
          if (x >= window.innerWidth - 30) {
            x = window.innerWidth - 30;
            vx = -vx * bounce;
          }
          
          // Bounce off floor
          if (y >= window.innerHeight - 30) {
            y = window.innerHeight - 30;
            vy = -vy * bounce;
            vx *= friction;
          }
          
          return { ...ball, x, y, vx, vy };
        })
      );
    };

    const interval = setInterval(animate, 16);
    return () => clearInterval(interval);
  }, [activated, balls.length]);

  if (!activated) return null;

  return (
    <div className="easter-egg-overlay" aria-hidden="true">
      <div className="easter-egg-message">🎪 You found the secret! 🤹</div>
      {balls.map(ball => (
        <div
          key={ball.id}
          className="juggling-ball"
          style={{
            left: ball.x - 20,
            top: ball.y - 20,
            background: `radial-gradient(circle at 30% 30%, ${ball.color}, ${ball.color}88)`,
            boxShadow: `0 4px 20px ${ball.color}66`,
          }}
        />
      ))}
      <style jsx>{`
        .easter-egg-overlay {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 9999;
        }
        .easter-egg-message {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 2rem;
          font-weight: 700;
          color: #fff;
          text-shadow: 0 2px 20px rgba(0,0,0,0.5);
          animation: popIn 0.5s ease-out;
          white-space: nowrap;
        }
        .juggling-ball {
          position: absolute;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          transition: none;
        }
        @keyframes popIn {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
          50% { transform: translate(-50%, -50%) scale(1.2); }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        @media (max-width: 768px) {
          .easter-egg-message {
            font-size: 1.3rem;
          }
          .juggling-ball {
            width: 30px;
            height: 30px;
          }
        }
      `}</style>
    </div>
  );
}
