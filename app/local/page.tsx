import { useState } from 'react';

export default function LocalPage() {
  const [board, setBoard] = useState<Array<string | null>>(Array(9).fill(null));
  const [winner, setWinner] = useState<string | 'draw' | null>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);

  const checkWinner = (board: Array<string | null>) => {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        setWinningLine([a, b, c]);
        return board[a];
      }
    }
    if (board.every(cell => cell !== null)) {
      return 'draw';
    }
    return null;
  };

  const handleClick = (index: number) => {
    if (board[index] || winner) return;
    const newBoard = [...board];
    newBoard[index] = 'X';
    setBoard(newBoard);
    const winner = checkWinner(newBoard);
    if (winner) {
      setWinner(winner);
      return;
    }
    const emptyCells = newBoard
      .map((cell, i) => (cell === null ? i : -1))
      .filter(i => i !== -1);
    if (emptyCells.length > 0) {
      const randomIndex = Math.floor(Math.random() * emptyCells.length);
      newBoard[emptyCells[randomIndex]] = 'O';
      setBoard(newBoard);
      const computerWinner = checkWinner(newBoard);
      if (computerWinner) {
        setWinner(computerWinner);
      }
    }
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setWinner(null);
    setWinningLine(null);
  };

  return (
    <section className="min-h-[70vh] p-8 flex flex-col items-center justify-center gap-8">
      <h1 className="text-4xl font-bold text-center text-purple-600">Tic-Tac-Toe</h1>
      {winner && (
        <div className="text-2xl font-bold text-center">
          {winner === 'draw' ? "It's a draw!" : `${winner} wins!`}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 w-64">
        {board.map((cell, index) => (
          <button
            key={index}
            className={`w-full aspect-square text-4xl font-bold rounded-lg transition-all duration-200 hover:scale-105 ${cell ? (cell === 'X' ? 'text-red-500' : 'text-blue-500') : 'bg-gray-200'} ${winningLine && winningLine.includes(index) ? 'bg-yellow-200' : ''}`}
            onClick={() => handleClick(index)}
          >
            {cell}
          </button>
        ))}
      </div>
      <button
        onClick={resetGame}
        className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
      >
        Reset Game
      </button>
    </section>
  );
}
