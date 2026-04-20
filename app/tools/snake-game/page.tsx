import React, { useState, useEffect } from 'react';

const SnakeGame: React.FC = () => {
  const [snake, setSnake] = useState([{ x: 10, y: 10 }]);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [food, setFood] = useState({ x: 15, y: 15 });
  const [direction, setDirection] = useState({ x: 1, y: 0 });

  useEffect(() => {
    const intervalId = setInterval(() => {
      moveSnake();
    }, 200);

    return () => clearInterval(intervalId);
  }, []);

  const moveSnake = () => {
    if (gameOver) return;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  
    // Wall collision
    if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20) {
      setGameOver(true);
      return;
    }
  
    // Self collision
    for (let i = 0; i < snake.length; i++) {
      if (snake[i].x === head.x && snake[i].y === head.y) {
        setGameOver(true);
        return;
      }
    }
  
    const newSnake = [...snake];
    if (head.x === food.x && head.y === food.y) {
      setFood(generateFood());
      setScore(score + 1);
      newSnake.push(head);
    } else {
      newSnake.pop();
      newSnake.unshift(head);
    }

    setSnake(newSnake);
  };

  const changeDirection = (e: React.KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowUp':
        setDirection({ x: 0, y: -1 });
        break;
      case 'ArrowDown':
        setDirection({ x: 0, y: 1 });
        break;
      case 'ArrowLeft':
        setDirection({ x: -1, y: 0 });
        break;
      case 'ArrowRight':
        setDirection({ x: 1, y: 0 });
        break;
    }
  };

  return (
    <div
      style={{ width: '400px', height: '400px', border: '1px solid black' }}
      onKeyDown={changeDirection}
      tabIndex={0}
    >
      {snake.map((segment, index) => (
        <div key={index} style={{ position: 'absolute', left: `${segment.x * 20}px`, top: `${segment.y * 20}px`, width: '20px', height: '20px', backgroundColor: 'green' }} />
      ))}
      <div style={{ position: 'absolute', left: `${food.x * 20}px`, top: `${food.y * 20}px`, width: '20px', height: '20px', backgroundColor: 'red' }} />
    </div>
    {gameOver && (
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', fontSize: '24px', color: 'red', backgroundColor: 'rgba(0,0,0,0.5)', padding: '20px', borderRadius: '10px' }}>
        <h2>Game Over! 🐍</h2>
        <p>Score: {score}</p>
        <p>You hit a wall! Maybe try not to eat your own tail next time. 😄</p>
        <button onClick={() => {
          setSnake([{ x: 10, y: 10 }]);
          setFood(generateFood());
          setDirection({ x: 1, y: 0 });
          setGameOver(false);
          setScore(0);
        }} style={{ marginTop: '10px', padding: '8px 16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}>
          Play Again
        </button>
      </div>
    )}
  );
};

export default SnakeGame;
