import Link from 'next/link';
import { useState } from 'react';
import { hello } from './hello';

export default function LocalPage() {
  const initialGrid = [
    ['5', '3', '', '', '7', '', '', '', ''],
    ['6', '', '', '1', '9', '5', '', '', ''],
    ['', '9', '8', '', '', '', '', '6', ''],
    ['8', '', '', '', '6', '', '', '', '3'],
    ['4', '', '', '8', '', '3', '', '', '1'],
    ['7', '', '', '', '2', '', '', '', '6'],
    ['', '6', '', '', '', '', '2', '8', ''],
    ['', '', '', '4', '1', '9', '', '', '5'],
    ['', '', '', '', '8', '', '', '7', '9'],
  ];
  const [grid, setGrid] = useState<string[][]>(initialGrid);

const resetGrid = () => {
  setGrid([...initialGrid]);
};
return (
  <div className="sudoku-container">
    <h1>Sudoku</h1>
    <button onClick={resetGrid}>Reset</button>
    <div className="sudoku-grid">
      {grid.map((row, rowIndex) => (
        <div key={rowIndex} className="sudoku-row">
          {row.map((cell, colIndex) => (
            <input
              key={colIndex}
              type="text"
              value={cell}
              onChange={(e) => {
                const newGrid = [...grid];
                newGrid[rowIndex][colIndex] = e.target.value;
                setGrid(newGrid);
              }}
              disabled={cell !== ''}
              className="sudoku-cell"
            />
          ))}
        </div>
      ))}
    </div>
  </div>
)};
