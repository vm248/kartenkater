import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { GameRoom } from './types';
import type { QuadratRoom } from './quadratTypes';
import type { CircleRoom } from './circleTypes';
import { getPlayerId, leaveRoom } from './gameActions';
import { leaveQuadratRoom } from './quadratActions';
import { leaveCircleRoom } from './circleActions';
import { Sun, Moon, Home as HomeIcon, WifiOff, Copy, Check } from 'lucide-react';
import GameSelection from './pages/GameSelection';
import Home from './pages/Home';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import QuadratHome from './pages/QuadratHome';
import QuadratLobby from './pages/QuadratLobby';
import QuadratGame from './pages/QuadratGame';
import CircleHome from './pages/CircleHome';
import CircleLobby from './pages/CircleLobby';
import CircleGame from './pages/CircleGame';

const THEMES = [
  { id: 'mono',   label: 'Mono',  colors: ['#111111', '#E8E8E8'] as [string, string] },
  { id: 'lila',   label: 'Lila',  colors: ['#7C3AED', '#EC4899'] as [string, string] },
  { id: 'ocean',  label: 'Blau',  colors: ['#0EA5E9', '#818CF8'] as [string, string] },
  { id: 'forest', label: 'Grün',  colors: ['#059669', '#06B6D4'] as [string, string] },
  { id: 'fire',   label: 'Rot',   colors: ['#DC2626', '#F97316'] as [string, string] },
] as const;
type ThemeId = 'mono' | 'lila' | 'ocean' | 'forest' | 'fire';

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

  const [circleRoomId, setCircleRoomId] = useState<string | null>(
    () => sessionStorage.getItem('circle_room')
  );
  const [circleRoom, setCircleRoom] = useState<CircleRoom | null>(null);

  const [localPlayerIds, setLocalPlayerIds] = useState<string[]>([]);
  const [localActiveId, setLocalActiveId] = useState<string>(getPlayerId);

  const [dark, setDark] = useState(
    () => localStorage.getItem('busfahren_dark') === '1'
  );
  const [theme, setTheme] = useState<ThemeId>(
    () => (localStorage.getItem('busfahren_theme') as ThemeId) ?? 'mono'
  );
  const [showThemePicker, setShowThemePicker] = useState(false);
  const themePickerRef = useRef<HTMLDivElement>(null);

  const [popupCopied, setPopupCopied] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);

  const playerId = getPlayerId();

  // URL params → auto-fill join form
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const join = params.get('join');
    const game = params.get('game');
    if (join && (game === 'busfahren' || game === 'quadrat' || game === 'circle')) {
      setInitialCode(join.toUpperCase());
      setSelectedGame(game);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Reconnect detection
  useEffect(() => {
    const on  = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Dark mode
  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('busfahren_dark', dark ? '1' : '0');
  }, [dark]);

  // Color theme
  useEffect(() => {
    document.body.classList.remove('theme-mono', 'theme-ocean', 'theme-forest', 'theme-fire');
    if (theme !== 'lila') document.body.classList.add(`theme-${theme}`);
    localStorage.setItem('busfahren_theme', theme);
  }, [theme]);

  // Close theme picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (themePickerRef.current && !themePickerRef.current.contains(e.target as Node)) {
        setShowThemePicker(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    sessionStorage.setItem('busfahren_room', roomId);
    const unsub = onSnapshot(doc(db, 'rooms', roomId), snap => {
      if (snap.exists()) {
        const data = snap.data() as GameRoom;
        if (!data.playerOrder.includes(playerId)) { handleLeave(); return; }
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
        if (!data.playerOrder.includes(playerId)) { handleLeave(); return; }
        setQuadratRoom(data);
      }
    });
    return unsub;
  }, [quadratRoomId]);

  useEffect(() => {
    if (!circleRoomId) return;
    sessionStorage.setItem('circle_room', circleRoomId);
    const unsub = onSnapshot(doc(db, 'circle', circleRoomId), snap => {
      if (snap.exists()) {
        const data = snap.data() as CircleRoom;
        if (!data.playerOrder.includes(playerId)) { handleLeave(); return; }
        setCircleRoom(data);
      }
    });
    return unsub;
  }, [circleRoomId]);

  function clearAllRooms() {
    sessionStorage.removeItem('busfahren_room');
    sessionStorage.removeItem('quadrat_room');
    sessionStorage.removeItem('circle_room');
    setRoomId(null); setRoom(null);
    setQuadratRoomId(null); setQuadratRoom(null);
    setCircleRoomId(null); setCircleRoom(null);
  }
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function handleJoined(id: string, localIds?: string[]) {
    clearAllRooms();
    if (localIds && localIds.length > 1) {
      setLocalPlayerIds(localIds);
      setLocalActiveId(localIds[0]);
    } else {
      requestNotificationPermission();
    }
    setRoomId(id);
  }
  function handleQuadratJoined(id: string, localIds?: string[]) {
    clearAllRooms();
    if (localIds && localIds.length > 1) {
      setLocalPlayerIds(localIds);
      setLocalActiveId(localIds[0]);
    } else {
      requestNotificationPermission();
    }
    setQuadratRoomId(id);
  }
  function handleCircleJoined(id: string, localIds?: string[]) {
    clearAllRooms();
    if (localIds && localIds.length > 1) {
      setLocalPlayerIds(localIds);
      setLocalActiveId(localIds[0]);
    } else {
      requestNotificationPermission();
    }
    setCircleRoomId(id);
  }
  function handleLeave() {
    clearAllRooms();
    setLocalPlayerIds([]);
    setLocalActiveId(playerId);
    setSelectedGame(null);
  }
  async function handleUserLeave() {
    if (room) await leaveRoom(room, playerId);
    if (quadratRoom) await leaveQuadratRoom(quadratRoom, playerId);
    if (circleRoom) await leaveCircleRoom(circleRoom, playerId);
    handleLeave();
  }

  const inRoom = roomId || quadratRoomId || circleRoomId;
  const showLobby        = room        && room.status === 'lobby';
  const showGame         = room        && room.status !== 'lobby';
  const showQuadratLobby = quadratRoom && quadratRoom.status === 'lobby';
  const showQuadratGame  = quadratRoom && quadratRoom.status !== 'lobby';
  const showCircleLobby  = circleRoom  && circleRoom.status === 'lobby';
  const showCircleGame   = circleRoom  && circleRoom.status !== 'lobby';

  const activeRoom    = (room        && room.status        !== 'lobby' && room.status        !== 'finished') ? room        : null;
  const activeQuadrat = (quadratRoom && quadratRoom.status !== 'lobby' && quadratRoom.status !== 'finished') ? quadratRoom : null;
  const activeCircle  = (circleRoom  && circleRoom.status  !== 'lobby' && circleRoom.status  !== 'finished') ? circleRoom  : null;

  // Busfahren phase3: busfahrer leaving already ends via leaveRoom; other players leaving doesn't interrupt the ride
  const tooFewPlayers =
    (activeRoom    && activeRoom.playerOrder.length    < 2 && activeRoom.status !== 'phase3') ||
    (activeQuadrat && activeQuadrat.playerOrder.length < 2) ||
    (activeCircle  && activeCircle.playerOrder.length  < 2);
  const popupCode = activeRoom?.id ?? activeQuadrat?.id ?? activeCircle?.id ?? '';

  function handlePopupCopy() {
    navigator.clipboard.writeText(popupCode).then(() => {
      setPopupCopied(true);
      setTimeout(() => setPopupCopied(false), 2000);
    });
  }

  const isLocalMode = localPlayerIds.length > 1;
  const effectivePlayerId = isLocalMode
    ? room?.status === 'phase1'      ? localActiveId
    : room?.status === 'phase3'      ? (room.busfahrerId ?? localPlayerIds[0])
    : quadratRoom?.status === 'playing'      ? localActiveId
    : quadratRoom?.status === 'distributing' ? (quadratRoom.winnerId ?? localPlayerIds[0])
    : circleRoom?.status === 'playing'       ? localActiveId
    : localPlayerIds[0]
    : playerId;
  const localTurnId = isLocalMode
    ? (room?.status === 'phase1' ? room.playerOrder[room.currentPlayerIndex] : null)
      ?? (quadratRoom?.status === 'playing' ? quadratRoom.playerOrder[quadratRoom.currentPlayerIndex] : null)
      ?? (quadratRoom?.status === 'distributing' ? quadratRoom.winnerId : null)
      ?? (circleRoom?.status === 'playing' ? circleRoom.playerOrder[circleRoom.currentPlayerIndex] : null)
    : null;
  const needsHandoff = localTurnId !== null
    && localTurnId !== localActiveId
    && localPlayerIds.includes(localTurnId);
  const activeRoomForHandoff = room ?? quadratRoom ?? circleRoom;

  const currentTheme = THEMES.find(t => t.id === theme) ?? THEMES[0];

  // Push notifications: fire when it becomes the current player's turn and tab is hidden
  const prevTurnPlayerRef = useRef<string | null>(null);
  const currentTurnPlayerId =
    room?.status === 'phase1'
      ? room.playerOrder[room.currentPlayerIndex]
    : (circleRoom?.status === 'playing' && !circleRoom.pendingAction)
      ? circleRoom.playerOrder[circleRoom.currentPlayerIndex]
    : quadratRoom?.status === 'playing'
      ? quadratRoom.playerOrder[quadratRoom.currentPlayerIndex]
    : null;

  useEffect(() => {
    if (isLocalMode || !currentTurnPlayerId) return;
    if (currentTurnPlayerId !== playerId) {
      prevTurnPlayerRef.current = currentTurnPlayerId;
      return;
    }
    if (prevTurnPlayerRef.current === playerId) return;
    prevTurnPlayerRef.current = playerId;
    if ((document.hidden || !document.hasFocus()) && Notification.permission === 'granted') {
      new Notification('Kartenkater', { body: 'Du bist dran!', icon: '/icon-192.png' });
    }
  }, [currentTurnPlayerId]);

  return (
    <>
      {/* Offline banner */}
      {offline && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
          background: 'linear-gradient(135deg,#EF4444,#DC2626)', color: '#fff',
          textAlign: 'center', padding: '10px 16px',
          fontSize: 14, fontWeight: 700, animation: 'slideDown 0.3s ease-out',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <WifiOff size={15} strokeWidth={2.5} />
          Verbindung unterbrochen – wird wiederhergestellt…
        </div>
      )}

      {/* Top bar – permanent, rounded card style */}
      <div style={{
        position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)',
        zIndex: 100, width: 'calc(100% - 24px)', maxWidth: 480,
        background: 'var(--card)', border: '1.5px solid var(--border)',
        borderRadius: 20, boxShadow: 'var(--shadow-sm)',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 8px', height: 48,
      }}>
        {/* Left: color theme picker */}
        <div ref={themePickerRef} style={{ position: 'relative' }}>
          <button className="icon-btn icon-btn-ghost" onClick={() => setShowThemePicker(p => !p)} title="Farbthema">
            <span style={{
              display: 'inline-block', width: 14, height: 14, borderRadius: '50%',
              background: `linear-gradient(135deg, ${currentTheme.colors[0]}, ${currentTheme.colors[1]})`,
              verticalAlign: 'middle',
            }} />
          </button>
          {showThemePicker && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', left: 0,
              background: 'var(--card)', borderRadius: 20, padding: '10px',
              border: '1.5px solid var(--border)', boxShadow: 'var(--shadow)',
              display: 'flex', flexDirection: 'column', gap: 5, zIndex: 300, minWidth: 148,
            }}>
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTheme(t.id); setShowThemePicker(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: theme === t.id ? 'var(--card-inner)' : 'transparent',
                    border: `2px solid ${theme === t.id ? 'var(--primary)' : 'transparent'}`,
                    borderRadius: 100, padding: '7px 12px', cursor: 'pointer', width: '100%',
                    color: 'var(--text)', fontSize: 13, fontWeight: 700,
                    margin: 0, boxShadow: 'none', transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})`,
                  }} />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Center: home (only when in a room/game) */}
        {(selectedGame || inRoom) && (
          <button className="icon-btn icon-btn-ghost" onClick={handleUserLeave} title="Hauptmenü">
            <HomeIcon size={17} strokeWidth={2} />
          </button>
        )}

        {/* Right: dark / light mode */}
        <button className="icon-btn icon-btn-ghost" onClick={() => setDark(d => !d)} title="Dark Mode">
          {dark ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
        </button>
      </div>

      {/* Too few players popup */}
      {tooFewPlayers && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div style={{
            background: 'var(--card)', borderRadius: 24, padding: '28px 28px 24px',
            textAlign: 'center', maxWidth: 320, width: '90%', boxShadow: 'var(--shadow)',
          }}>
            <p style={{ fontSize: 19, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Zu wenige Spieler</p>
            {(activeQuadrat || activeCircle) ? (
              <>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 16px' }}>
                  Teile den Code und warte, bis jemand beitritt.
                </p>
                <div className="room-code" style={{ margin: '0 0 10px' }}>{popupCode}</div>
                <button className="copy-btn" onClick={handlePopupCopy} style={{ marginBottom: 16 }}>
                  {popupCopied ? <><Check size={13} strokeWidth={2.5} /> Kopiert!</> : <><Copy size={13} /> Code kopieren</>}
                </button>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 16px' }}>
                Busfahren kann ohne 2 Spieler nicht fortgesetzt werden.
              </p>
            )}
            <button
              onClick={handleUserLeave}
              className="secondary"
              style={{ marginTop: 4 }}
            >
              Hauptmenü
            </button>
          </div>
        </div>
      )}

      {needsHandoff && activeRoomForHandoff && localTurnId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 500, gap: 8, padding: '2rem', textAlign: 'center',
        }}>
          <p style={{ opacity: 0.55, fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
            Jetzt dran
          </p>
          <h1 style={{ fontSize: 34, margin: '4px 0 24px', color: 'var(--primary)' }}>
            {activeRoomForHandoff.players[localTurnId]?.name}
          </h1>
          <button style={{ maxWidth: 280 }} onClick={() => setLocalActiveId(localTurnId)}>
            Anzeigen
          </button>
        </div>
      )}

      {!inRoom && !selectedGame && <GameSelection onSelect={setSelectedGame} />}
      {!inRoom && selectedGame === 'busfahren' && (
        <Home onJoined={handleJoined} onBack={() => setSelectedGame(null)} initialCode={initialCode ?? undefined} />
      )}
      {!inRoom && selectedGame === 'quadrat' && (
        <QuadratHome onJoined={(id, ids) => handleQuadratJoined(id, ids)} onBack={() => setSelectedGame(null)} initialCode={initialCode ?? undefined} />
      )}
      {!inRoom && selectedGame === 'circle' && (
        <CircleHome onJoined={(id, ids) => handleCircleJoined(id, ids)} onBack={() => setSelectedGame(null)} initialCode={initialCode ?? undefined} />
      )}
      {showLobby        && <Lobby        room={room}        playerId={isLocalMode ? localPlayerIds[0] : playerId} />}
      {showGame         && <Game         room={room}        playerId={effectivePlayerId} />}
      {showQuadratLobby && <QuadratLobby room={quadratRoom} playerId={isLocalMode ? localPlayerIds[0] : playerId} />}
      {showQuadratGame  && <QuadratGame  room={quadratRoom} playerId={effectivePlayerId} />}
      {showCircleLobby  && <CircleLobby  room={circleRoom}  playerId={isLocalMode ? localPlayerIds[0] : playerId} />}
      {showCircleGame   && <CircleGame   room={circleRoom}  playerId={effectivePlayerId} isLocalMode={isLocalMode} />}
    </>
  );
}
