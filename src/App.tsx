import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { GameRoom } from './types';
import type { QuadratRoom } from './quadratTypes';
import { getPlayerId } from './gameActions';
import GameSelection from './pages/GameSelection';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import QuadratHome from './pages/QuadratHome';
import QuadratLobby from './pages/QuadratLobby';
import QuadratGame from './pages/QuadratGame';

export default function App() {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  const [roomId, setRoomId] = useState<string | null>(
    () => sessionStorage.getItem('busfahren_room')
  );
  const [room, setRoom] = useState<GameRoom | null>(null);

  const [quadratRoomId, setQuadratRoomId] = useState<string | null>(
    () => sessionStorage.getItem('quadrat_room')
  );
  const [quadratRoom, setQuadratRoom] = useState<QuadratRoom | null>(null);

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
        const data = snap.data() as GameRoom;
        if (!data.playerOrder.includes(playerId)) {
          handleLeave();
          return;
        }
        setRoom(data);
      }
    });
    return unsub;
  }, [roomId]);

  useEffect(() => {
    if (!quadratRoomId) return;
    sessionStorage.setItem('quadrat_room', quadratRoomId);
    const unsub = onSnapshot(doc(db, 'quadrat', quadratRoomId), snap => {
      if (snap.exists()) {
        const data = snap.data() as QuadratRoom;
        if (!data.playerOrder.includes(playerId)) {
          handleLeave();
          return;
        }
        setQuadratRoom(data);
      }
    });
    return unsub;
  }, [quadratRoomId]);

  function handleJoined(id: string) {
    sessionStorage.removeItem('quadrat_room');
    setQuadratRoomId(null);
    setQuadratRoom(null);
    setRoomId(id);
  }

  function handleQuadratJoined(id: string) {
    sessionStorage.removeItem('busfahren_room');
    setRoomId(null);
    setRoom(null);
    setQuadratRoomId(id);
  }

  function handleLeave() {
    sessionStorage.removeItem('busfahren_room');
    sessionStorage.removeItem('quadrat_room');
    setRoomId(null);
    setRoom(null);
    setQuadratRoomId(null);
    setQuadratRoom(null);
    setSelectedGame(null);
  }

  const inRoom = roomId || quadratRoomId;
  const showLobby = room && room.status === 'lobby';
  const showGame = room && room.status !== 'lobby';
  const showQuadratLobby = quadratRoom && quadratRoom.status === 'lobby';
  const showQuadratGame = quadratRoom && quadratRoom.status !== 'lobby';

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
        {(selectedGame || inRoom) && (
          <button
            className="icon-btn"
            onClick={handleLeave}
            title="Hauptmenü"
            style={{ background: 'var(--card)', borderRadius: 8, padding: '6px 10px' }}
          >
            🏠
          </button>
        )}
      </div>

      {!inRoom && !selectedGame && <GameSelection onSelect={setSelectedGame} />}
      {!inRoom && selectedGame === 'busfahren' && (
        <Home onJoined={handleJoined} onBack={() => setSelectedGame(null)} />
      )}
      {!inRoom && selectedGame === 'quadrat' && (
        <QuadratHome onJoined={handleQuadratJoined} onBack={() => setSelectedGame(null)} />
      )}
      {showLobby && <Lobby room={room} playerId={playerId} />}
      {showGame && <Game room={room} playerId={playerId} />}
      {showQuadratLobby && <QuadratLobby room={quadratRoom} playerId={playerId} />}
      {showQuadratGame && <QuadratGame room={quadratRoom} playerId={playerId} />}
    </>
  );
}
