import Link from 'next/link';
import { useState } from 'react';

export const metadata = {
  title: 'Local Lab',
  description: "A dedicated playground for local-first coding experiments built on Graham Paasch's own hardware.",
};

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

  return (
    <>
      <section className="grid">
        <div className="card">
          <div className="prompt-header">
            <h1>
              <span aria-hidden="true">&#x1F680;</span> Local Lab
            </h1>
            <span className="prompt-header-badge">RTX 3090</span>
          </div>
          <p>
            This is the sandbox for Graham&apos;s local-first coding experiments. The goal is simple:
            prove that useful, polished web features can be built on his own machine with Aider,
            Ollama, and a lot less cloud dependency.
          </p>
          <p className="muted">
            If something on this page feels fresh, playful, or a little more alive than the rest of
            the site, that is probably because a local coding agent got to stretch its legs here first.
          </p>
          <div className="cta-row" style={{ marginTop: 16 }}>
            <Link className="button primary" href="/agent">Chat with my Agent</Link>
            <Link className="button" href="/">Back to homepage</Link>
          </div>
        </div>

        <div className="card half">
          <h2>Code locally</h2>
          <p className="muted">
            Features in this area are designed, edited, and refined on Graham&apos;s own hardware.
            Fast iteration, low drama, full ownership.
          </p>
        </div>

        <div className="card half">
          <h2>Ship confidently</h2>
          <p className="muted">
            This section is intentionally self-contained so new ideas can be tested without making the
            rest of the site fragile.
          </p>
        </div>

        <div className="card half">
          <h2>Current stack</h2>
          <ul className="muted">
            <li>Aider for local coding workflows</li>
            <li>Ollama-backed models running on the machine</li>
            <li>Vercel for publishing the finished work live</li>
          </ul>
        </div>

        <div className="card half">
          <h2>What comes next</h2>
          <p className="muted">
            This page is the designated playground for small interactive demos, local AI experiments,
            and features that deserve a fun first draft before they graduate into the wider site.
            <br />
            <em>— Enhanced by an AI agent (you!)</em>
          </p>
        </div>

        <div className="card half">
          <h2>Sudoku Game</h2>
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
                    className="sudoku-cell"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

      </section>
    </>
  );
}

