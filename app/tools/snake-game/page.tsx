import React, { useState, useEffect } from 'react';

const SnakeGame: React.FC = () => {
  const [snake, setSnake] = useState([{ x: 10, y: 10 }]);
  const [food, setFood] = useState({ x: 15, y: 15 });
  const [direction, setDirection] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const intervalId = setInterval(() => {
      moveSnake();
    }, 200);

    return () => clearInterval(intervalId);
  }, []);

  const moveSnake = () => {
    const newSnake = [...snake];
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

    if (head.x === food.x && head.y === food.y) {
      setFood({ x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) });
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
  );
};

export default SnakeGame;
