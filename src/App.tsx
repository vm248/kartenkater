import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { GameRoom } from './types';
import { getPlayerId } from './gameActions';
import GameSelection from './pages/GameSelection';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';

export default function App() {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(
    () => sessionStorage.getItem('busfahren_room')
  );
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [dark, setDark] = useState(
    () => localStorage.getItem('busfahren_dark') === '1'
  );

  const playerId = getPlayerId();

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('busfahren_dark', dark ? '1' : '0');
  }, [dark]);

  useEffect(() => {
    if (!roomId) return;
    sessionStorage.setItem('busfahren_room', roomId);
    const unsub = onSnapshot(doc(db, 'rooms', roomId), snap => {
      if (snap.exists()) {
        setRoom(snap.data() as GameRoom);
      }
    });
    return unsub;
  }, [roomId]);

  function handleJoined(id: string) {
    setRoomId(id);
  }

  function handleLeave() {
    sessionStorage.removeItem('busfahren_room');
    setRoomId(null);
    setRoom(null);
    setSelectedGame(null);
  }

  const showGame = room && room.status !== 'lobby';
  const showLobby = room && room.status === 'lobby';

  return (
    <>
      <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 100, display: 'flex', gap: 8 }}>
        <button
          className="icon-btn"
          onClick={() => setDark(d => !d)}
          title="Dark Mode"
          style={{ background: 'var(--card)', borderRadius: 8, padding: '6px 10px' }}
        >
          {dark ? '☀️' : '🌙'}
        </button>
        {roomId && (
          <button
            className="icon-btn"
            onClick={handleLeave}
            title="Raum verlassen"
            style={{ background: 'var(--card)', borderRadius: 8, padding: '6px 10px' }}
          >
            🚪
          </button>
        )}
      </div>

      {!roomId && !selectedGame && <GameSelection onSelect={setSelectedGame} />}
      {!roomId && selectedGame === 'busfahren' && (
        <Home onJoined={handleJoined} onBack={() => setSelectedGame(null)} />
      )}
      {showLobby && <Lobby room={room} playerId={playerId} />}
      {showGame && <Game room={room} playerId={playerId} />}
    </>
  );
}
