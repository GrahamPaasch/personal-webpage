import React, { useState } from 'react';
import React, { useState } from 'react';

export default function TicTacToe() {
  // Your existing code here

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
