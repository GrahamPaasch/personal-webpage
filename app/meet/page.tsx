'use client';

import { useState } from 'react';
import MeetRoom from './MeetRoom';

export default function MeetPage() {
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [joined, setJoined] = useState(false);
  const [token, setToken] = useState('');

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!roomName.trim() || !userName.trim()) return;
    const res = await fetch('/api/meet/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomName.trim(), username: userName.trim() }),
    });
    const data = await res.json();
    if (data.token) {
      setToken(data.token);
      setJoined(true);
    }
  }

  if (joined && token) {
    return (
      <MeetRoom
        token={token}
        roomName={roomName}
        onLeave={() => { setJoined(false); setToken(''); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <form onSubmit={handleJoin} className="bg-gray-900 p-8 rounded-2xl shadow-xl w-full max-w-md space-y-6">
        <h1 className="text-3xl font-bold text-white text-center">Meet</h1>
        <p className="text-gray-400 text-center text-sm">No limits. No restrictions. Your server.</p>
        <div>
          <label className="block text-gray-300 text-sm mb-1">Your Name</label>
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            placeholder="Enter your name"
            required
            aria-label="Your name"
          />
        </div>
        <div>
          <label className="block text-gray-300 text-sm mb-1">Room Name</label>
          <input
            type="text"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            placeholder="Enter room name"
            required
            aria-label="Room name"
          />
        </div>
        <button
          type="submit"
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors"
        >
          Join Room
        </button>
      </form>
    </div>
  );
}
