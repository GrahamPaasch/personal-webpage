import React, { useState, useEffect, useCallback, useRef } from 'react';

// --- Types & Constants ---
const GRID_SIZE = 20;
const INITIAL_SNAKE = [{ x: 10, y: 10 }];
const INITIAL_DIRECTION = { x: 0, y: 0 }; // Start stationary
const SPEED = 100; // ms per tick

type Direction = { x: number; y: number };
type Coordinate = { x: number; y: number };

// --- Helper Functions ---
const getRandomCoordinate = (): Coordinate => ({
  x: Math.floor(Math.random() * GRID_SIZE),
  y: Math.floor(Math.random() * GRID_SIZE),
});

const isCoordinate = (coord: Coordinate, list: Coordinate[]) =>
  list.some((c) => c.x === coord.x && c.y === coord.y);

// --- Main Component ---
export default function FitnessSnakeGame() {
  const [snake, setSnake] = useState<Coordinate[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Coordinate>(getRandomCoordinate());
  const [direction, setDirection] = useState<Direction>(INITIAL_DIRECTION);
  const [isRunning, setIsRunning] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [score, setScore] = useState(0);
  
  // Ref to track the latest direction to prevent double-turn collisions
  const directionRef = useRef<Direction>(INITIAL_DIRECTION);

  // --- Game Logic ---

  const startGame = () => {
    setSnake(INITIAL_SNAKE);
    setDirection({ x: 1, y: 0 }); // Start moving right
    directionRef.current = { x: 1, y: 0 };
    setFood(getRandomCoordinate());
    setIsRunning(true);
    setIsGameOver(false);
    setScore(0);
  };

  const gameOver = () => {
    setIsRunning(false);
    setIsGameOver(true);
  };

  const moveSnake = useCallback(() => {
    setSnake((prevSnake) => {
      const newHead = {
        x: prevSnake[0].x + directionRef.current.x,
        y: prevSnake[0].y + directionRef.current.y,
      };

      // Wall Collision
      if (
        newHead.x < 0 ||
        newHead.x >= GRID_SIZE ||
        newHead.y < 0 ||
        newHead.y >= GRID_SIZE
      ) {
        gameOver();
        return prevSnake;
      }

      // Self Collision
      if (isCoordinate(newHead, prevSnake)) {
        gameOver();
        return prevSnake;
      }

      const newSnake = [newHead, ...prevSnake];

      // Eat Food
      if (newHead.x === food.x && newHead.y === food.y) {
        setScore((s) => s + 1);
        setFood(getRandomCoordinate());
        // Don't pop the tail, so snake grows
      } else {
        newSnake.pop(); // Remove tail
      }

      return newSnake;
    });
  }, [food]);

  // --- Effects ---

  // Game Loop
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(moveSnake, SPEED);
    return () => clearInterval(interval);
  }, [isRunning, moveSnake]);

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isRunning) return;

      const currentDir = directionRef.current;
      let newDir: Direction = { ...currentDir };

      switch (e.key) {
        case 'ArrowUp':
          if (currentDir.y === 0) newDir = { x: 0, y: -1 };
          break;
        case 'ArrowDown':
          if (currentDir.y === 0) newDir = { x: 0, y: 1 };
          break;
        case 'ArrowLeft':
          if (currentDir.x === 0) newDir = { x: -1, y: 0 };
          break;
        case 'ArrowRight':
          if (currentDir.x === 0) newDir = { x: 1, y: 0 };
          break;
        default:
          return;
      }

      setDirection(newDir);
      directionRef.current = newDir;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRunning]);

  // --- Render Helpers ---
  
  // Calculate grid cell size percentage
  const cellSize = 100 / GRID_SIZE;

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] bg-slate-900 rounded-xl p-6 shadow-2xl font-sans text-white">
      
      {/* Header / Score */}
      <div className="w-full flex justify-between items-center mb-4 px-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          <h2 className="text-xl font-bold tracking-wider text-green-400">SNAKE</h2>
        </div>
        <div className="text-2xl font-mono font-bold text-white">
          Score: <span className="text-yellow-400">{score}</span>
        </div>
      </div>

      {/* Game Board Container */}
      <div className="relative w-full max-w-[500px] aspect-square bg-slate-800 rounded-lg overflow-hidden border-4 border-slate-700 shadow-inner">
        
        {/* Grid Background (Optional visual aid) */}
        <div className="absolute inset-0 grid grid-cols-[repeat(20,minmax(0,1fr))] grid-rows-[repeat(20,minmax(0,1fr))] opacity-10 pointer-events-none">
            {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => (
                <div key={i} className="border border-slate-500/30" />
            ))}
        </div>

        {/* Food */}
        <div
          className="absolute bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.6)] transition-all duration-100"
          style={{
            width: `${cellSize}%`,
            height: `${cellSize}%`,
            left: `${food.x * cellSize}%`,
            top: `${food.y * cellSize}%`,
            transform: 'scale(0.8)' // Make food slightly smaller than cell
          }}
        />

        {/* Snake */}
        {snake.map((segment, index) => (
          <div
            key={`${segment.x}-${segment.y}-${index}`}
            className={`absolute transition-all duration-75 ${
              index === 0 ? 'bg-green-400 z-10' : 'bg-green-600 z-0'
            }`}
            style={{
              width: `${cellSize}%`,
              height: `${cellSize}%`,
              left: `${segment.x * cellSize}%`,
              top: `${segment.y * cellSize}%`,
            }}
          >
            {/* Eyes for the head */}
            {index === 0 && (
               <div className="w-full h-full relative">
                  <div className="absolute w-[20%] h-[20%] bg-black rounded-full top-[20%] left-[20%]"></div>
                  <div className="absolute w-[20%] h-[20%] bg-black rounded-full top-[20%] right-[20%]"></div>
               </div>
            )}
          </div>
        ))}

        {/* Game Over Overlay */}
        {isGameOver && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
            <h2 className="text-4xl font-bold text-red-500 mb-2">GAME OVER</h2>
            <p className="text-slate-300 mb-6">Final Score: {score}</p>
            <button
              onClick={startGame}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-full transition-transform hover:scale-105 active:scale-95 shadow-lg"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Start Overlay */}
        {!isRunning && !isGameOver && snake.length === 1 && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-20">
            <p className="text-xl text-white mb-4 font-medium">Use Arrow Keys to Move</p>
            <button
              onClick={startGame}
              className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-full transition-transform hover:scale-105 active:scale-95 shadow-lg"
            >
              Start Game
            </button>
          </div>
        )}
      </div>

      {/* Controls Info */}
      <div className="mt-6 text-slate-500 text-sm flex gap-6">
        <span className="flex items-center gap-1"><kbd className="bg-slate-800 px-2 py-1 rounded border border-slate-700 text-xs">↑</kbd><kbd className="bg-slate-800 px-2 py-1 rounded border border-slate-700 text-xs">↓</kbd> Move</span>
        <span className="flex items-center gap-1"><kbd className="bg-slate-800 px-2 py-1 rounded border border-slate-700 text-xs">←</kbd><kbd className="bg-slate-800 px-2 py-1 rounded border border-slate-700 text-xs">→</kbd> Turn</span>
      </div>
    </div>
  );
}