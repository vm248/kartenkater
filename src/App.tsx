import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { GameRoom } from './types';
import type { QuadratRoom } from './quadratTypes';
import { getPlayerId, leaveRoom } from './gameActions';
import { leaveQuadratRoom } from './quadratActions';
import GameSelection from './pages/GameSelection';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import QuadratHome from './pages/QuadratHome';
import QuadratLobby from './pages/QuadratLobby';
import QuadratGame from './pages/QuadratGame';

export default function App() {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [initialCode, setInitialCode] = useState<string | null>(null);

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
  const [popupCopied, setPopupCopied] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  const playerId = getPlayerId();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const join = params.get('join');
    const game = params.get('game');
    if (join && (game === 'busfahren' || game === 'quadrat')) {
      setInitialCode(join.toUpperCase());
      setSelectedGame(game);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

  async function handleUserLeave() {
    if (room) await leaveRoom(room, playerId);
    if (quadratRoom) await leaveQuadratRoom(quadratRoom, playerId);
    handleLeave();
  }

  const inRoom = roomId || quadratRoomId;
  const showLobby = room && room.status === 'lobby';
  const showGame = room && room.status !== 'lobby';
  const showQuadratLobby = quadratRoom && quadratRoom.status === 'lobby';
  const showQuadratGame = quadratRoom && quadratRoom.status !== 'lobby';

  const activeRoom = (room && room.status !== 'lobby' && room.status !== 'finished') ? room : null;
  const activeQuadrat = (quadratRoom && quadratRoom.status !== 'lobby' && quadratRoom.status !== 'finished') ? quadratRoom : null;
  const tooFewPlayers =
    (activeRoom && activeRoom.playerOrder.length < 2) ||
    (activeQuadrat && activeQuadrat.playerOrder.length < 2);
  const popupCode = activeRoom?.id ?? activeQuadrat?.id ?? '';

  function handlePopupCopy() {
    navigator.clipboard.writeText(popupCode).then(() => {
      setPopupCopied(true);
      setTimeout(() => setPopupCopied(false), 2000);
    });
  }

  return (
    <>
      {offline && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
          background: '#c0392b', color: '#fff',
          textAlign: 'center', padding: '10px 16px',
          fontSize: 14, fontWeight: 600,
          animation: 'slideDown 0.3s ease-out',
        }}>
          ⚠️ Verbindung unterbrochen – wird wiederhergestellt…
        </div>
      )}
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
            onClick={handleUserLeave}
            title="Hauptmenü"
            style={{ background: 'var(--card)', borderRadius: 8, padding: '6px 10px' }}
          >
            🏠
          </button>
        )}
      </div>

      {tooFewPlayers && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div style={{
            background: 'var(--card)', borderRadius: 18, padding: '28px 28px 24px',
            textAlign: 'center', maxWidth: 320, width: '90%',
          }}>
            <p style={{ fontSize: 32, margin: '0 0 6px' }}>👋</p>
            <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Zu wenige Spieler</p>
            <p style={{ opacity: 0.65, fontSize: 14, margin: '0 0 16px' }}>
              Teile den Code und warte, bis jemand beitritt.
            </p>
            <div className="room-code" style={{ margin: '0 0 10px' }}>{popupCode}</div>
            <button className="copy-btn" onClick={handlePopupCopy} style={{ marginBottom: 16 }}>
              {popupCopied ? '✅ Kopiert!' : '📋 Code kopieren'}
            </button>
            <button
              onClick={handleUserLeave}
              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', width: '100%' }}
            >
              Hauptmenü
            </button>
          </div>
        </div>
      )}

      {!inRoom && !selectedGame && <GameSelection onSelect={setSelectedGame} />}
      {!inRoom && selectedGame === 'busfahren' && (
        <Home onJoined={handleJoined} onBack={() => setSelectedGame(null)} initialCode={initialCode ?? undefined} />
      )}
      {!inRoom && selectedGame === 'quadrat' && (
        <QuadratHome onJoined={handleQuadratJoined} onBack={() => setSelectedGame(null)} initialCode={initialCode ?? undefined} />
      )}
      {showLobby && <Lobby room={room} playerId={playerId} />}
      {showGame && <Game room={room} playerId={playerId} />}
      {showQuadratLobby && <QuadratLobby room={quadratRoom} playerId={playerId} />}
      {showQuadratGame && <QuadratGame room={quadratRoom} playerId={playerId} />}
    </>
  );
}
