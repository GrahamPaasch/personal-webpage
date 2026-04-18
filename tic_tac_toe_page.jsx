export default function TicTacToePage() {
  const [board, setBoard] = useState<Array<string | null>>(Array(9).fill(null));
  const [currentPlayer, setCurrentPlayer] = useState<'X' | 'O'>('X');
  const [winner, setWinner] = useState<string | null>(null);

  const checkWin = (board: Array<string | null>) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    return null;
  };

  const handleClick = (index: number) => {
    if (board[index] || winner) return;
    const newBoard = [...board];
    newBoard[index] = currentPlayer;
    setBoard(newBoard);
    const newWinner = checkWin(newBoard);
    if (newWinner) {
      setWinner(newWinner);
    } else if (newBoard.every(cell => cell)) {
      setWinner('Draw');
    } else {
      setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
    }
  };

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setCurrentPlayer('X');
    setWinner(null);
  };

  return (
    <section className="grid grid-cols-1 gap-8 max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-center text-gray-800">Tic Tac Toe</h1>
      <div className="grid grid-cols-3 gap-1">
        {board.map((cell, index) => (
          <button
            key={index}
            className="aspect-square bg-white rounded-lg flex items-center justify-center text-2xl font-bold hover:bg-gray-100 transition-colors duration-150 transform hover:scale-105"
            onClick={() => handleClick(index)}
          >
            {cell}
          </button>
        ))}
      </div>
      <div className="text-center text-lg font-medium text-gray-700">
        {winner ? (
          winner === 'Draw' ? 'It\'s a Draw!' : `Winner: ${winner}`
        ) : (
          `Player ${currentPlayer}'s turn`
        )}
      </div>
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors duration-150"
        onClick={resetGame}
      >
        New Game
      </button>
    </section>
  );
}
