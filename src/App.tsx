import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { GameRoom } from './types';
import type { QuadratRoom } from './quadratTypes';
import type { CircleRoom } from './circleTypes';
import { getPlayerId, leaveRoom } from './gameActions';
import { leaveQuadratRoom } from './quadratActions';
import { leaveCircleRoom } from './circleActions';
import { Sun, Moon, Home as HomeIcon, WifiOff, Copy, Check, Info, X, AlertTriangle, Send } from 'lucide-react';
import { submitErrorReport } from './errorActions';
import DevDashboard from './pages/DevDashboard';
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

const isDev = new URLSearchParams(window.location.search).has('dashboard');

export default function App() {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [initialCode, setInitialCode] = useState<string | null>(null);

  const [roomId, setRoomId] = useState<string | null>(
    () => localStorage.getItem('busfahren_room')
  );
  const [room, setRoom] = useState<GameRoom | null>(null);

  const [quadratRoomId, setQuadratRoomId] = useState<string | null>(
    () => localStorage.getItem('quadrat_room')
  );
  const [quadratRoom, setQuadratRoom] = useState<QuadratRoom | null>(null);

  const [circleRoomId, setCircleRoomId] = useState<string | null>(
    () => localStorage.getItem('circle_room')
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
  const [showInfo, setShowInfo] = useState(false);
  const [phase1HandoffReady, setPhase1HandoffReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(
    () => !localStorage.getItem('busfahren_welcomed')
  );
  const [infoTab, setInfoTab] = useState<'install' | 'multiplayer'>('install');
  const [showErrorReport, setShowErrorReport] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [errorSubmitting, setErrorSubmitting] = useState(false);
  const [errorSubmitted, setErrorSubmitted] = useState(false);

  function dismissWelcome() {
    localStorage.setItem('busfahren_welcomed', '1');
    setShowWelcome(false);
  }

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
    localStorage.setItem('busfahren_room', roomId);
    const unsub = onSnapshot(doc(db, 'rooms', roomId), snap => {
      if (snap.exists()) {
        const data = snap.data() as GameRoom;
        if (!data.playerOrder.includes(playerId)) { handleLeave(); return; }
        setRoom(data);
      } else {
        handleLeave();
      }
    });
    return unsub;
  }, [roomId]);

  useEffect(() => {
    if (!quadratRoomId) return;
    localStorage.setItem('quadrat_room', quadratRoomId);
    const unsub = onSnapshot(doc(db, 'quadrat', quadratRoomId), snap => {
      if (snap.exists()) {
        const data = snap.data() as QuadratRoom;
        if (!data.playerOrder.includes(playerId)) { handleLeave(); return; }
        setQuadratRoom(data);
      } else {
        handleLeave();
      }
    });
    return unsub;
  }, [quadratRoomId]);

  useEffect(() => {
    if (!circleRoomId) return;
    localStorage.setItem('circle_room', circleRoomId);
    const unsub = onSnapshot(doc(db, 'circle', circleRoomId), snap => {
      if (snap.exists()) {
        const data = snap.data() as CircleRoom;
        if (!data.playerOrder.includes(playerId)) { handleLeave(); return; }
        setCircleRoom(data);
      } else {
        handleLeave();
      }
    });
    return unsub;
  }, [circleRoomId]);

  function clearAllRooms() {
    localStorage.removeItem('busfahren_room');
    localStorage.removeItem('quadrat_room');
    localStorage.removeItem('circle_room');
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
  const isLoadingRoom = (!!roomId && !room) || (!!quadratRoomId && !quadratRoom) || (!!circleRoomId && !circleRoom);
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

  function openErrorReport() {
    setShowErrorReport(true);
    setErrorSubmitted(false);
    setErrorText('');
  }

  async function handleSubmitError() {
    if (!errorText.trim() || errorSubmitting) return;
    setErrorSubmitting(true);
    try {
      const gameType = roomId ? 'busfahren' : quadratRoomId ? 'quadrat' : circleRoomId ? 'circle' : undefined;
      const currentRoomId = roomId ?? quadratRoomId ?? circleRoomId ?? undefined;
      await submitErrorReport({ message: errorText.trim(), playerId, gameType, roomId: currentRoomId });
      setErrorSubmitted(true);
    } finally {
      setErrorSubmitting(false);
    }
  }

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
    && localPlayerIds.includes(localTurnId)
    // In Phase 1 the card result must be acknowledged before handing off the device
    && (room?.status !== 'phase1' || phase1HandoffReady);
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
        justifyContent: 'space-between', padding: '0 6px', height: 52,
      }}>
        {/* Left: color theme picker */}
        <div ref={themePickerRef} style={{ position: 'relative' }}>
          <button className="icon-btn icon-btn-ghost" onClick={() => setShowThemePicker(p => !p)} title="Farbthema">
            <span style={{
              display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
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

        {/* Center: info on main menu, home when in game/room */}
        {!selectedGame && !inRoom ? (
          <button className="icon-btn icon-btn-ghost" onClick={() => setShowInfo(true)} title="App installieren">
            <Info size={20} strokeWidth={2} />
          </button>
        ) : (selectedGame || inRoom) ? (
          <button className="icon-btn icon-btn-ghost" onClick={handleUserLeave} title="Hauptmenü">
            <HomeIcon size={20} strokeWidth={2} />
          </button>
        ) : null}

        {/* Right: dark / light mode */}
        <button className="icon-btn icon-btn-ghost" onClick={() => setDark(d => !d)} title="Dark Mode">
          {dark ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
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

      {showWelcome && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 600, padding: '1.25rem',
        }}>
          <div style={{
            background: 'var(--card)', borderRadius: 28, padding: '28px 24px 24px',
            maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <svg viewBox="0 0 100 100" width="88" height="88" style={{ display: 'block', margin: '0 auto 14px', overflow: 'visible' }}>
                {/* Back card: right, rotated clockwise */}
                <g transform="translate(60,50) rotate(13)">
                  <rect x="-28" y="-38" width="56" height="76" rx="5"
                        fill="white" stroke="var(--primary)" strokeWidth="3.2"/>
                  {/* Spade (filled) */}
                  <g transform="translate(0,3) scale(0.165)">
                    <path fill="var(--primary)"
                          d="M0-95 C52-95 92-45 92 8 C92 50 62 68 26 58 C32 72 36 86 50 95 L-50 95 C-36 86-32 72-26 58 C-62 68-92 50-92 8 C-92-45-52-95 0-95 Z"/>
                  </g>
                  <text x="-22" y="-24" fontFamily="Georgia,serif" fontSize="11" fontWeight="bold" fill="var(--primary)">A</text>
                  <g transform="rotate(180)">
                    <text x="-22" y="-24" fontFamily="Georgia,serif" fontSize="11" fontWeight="bold" fill="var(--primary)">A</text>
                  </g>
                </g>
                {/* Front card: left, rotated counter-clockwise (Ace of Hearts) */}
                <g transform="translate(40,52) rotate(-9)">
                  <rect x="-28" y="-38" width="56" height="76" rx="5"
                        fill="white" stroke="var(--primary)" strokeWidth="3.2"/>
                  {/* Heart (outline) */}
                  <path d="M0 15 C-1 12-19 2-19-8 C-19-19-12-24 0-14 C12-24 19-19 19-8 C19 2 1 12 0 15 Z"
                        fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round"/>
                  <text x="-22" y="-24" fontFamily="Georgia,serif" fontSize="11" fontWeight="bold" fill="var(--primary)">A</text>
                  <g transform="rotate(180)">
                    <text x="-22" y="-24" fontFamily="Georgia,serif" fontSize="11" fontWeight="bold" fill="var(--primary)">A</text>
                  </g>
                </g>
              </svg>
              <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--primary)' }}>
                Willkommen bei Kartenkater!
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Multiplayer-Trinkkartenspiele für den Abend –<br />
                Busfahren, Das Fenster und Circle.
              </p>
            </div>

            <div style={{
              background: 'var(--card-inner)', borderRadius: 16,
              padding: '14px 16px', marginBottom: 16,
              display: 'flex', alignItems: 'flex-start', gap: 12,
              border: '1.5px solid var(--border)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: 'var(--card)', border: '1.5px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Info size={16} strokeWidth={2} style={{ color: 'var(--primary)' }} />
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Tippe oben auf das <strong style={{ color: 'var(--text)' }}>
                  <Info size={12} strokeWidth={2.5} style={{ verticalAlign: 'middle', marginBottom: 1 }} />
                </strong>-Symbol um die App auf deinem Handy zu installieren – dann läuft sie wie eine native App.
              </p>
            </div>

            <button onClick={dismissWelcome}>
              Los geht's
            </button>
          </div>
        </div>
      )}

      {isLoadingRoom && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, zIndex: 50,
        }}>
          <div className="loading-spinner" />
          <p style={{ fontWeight: 600, fontSize: 16, margin: 0 }}>Raum wird geladen…</p>
          <button className="secondary" style={{ maxWidth: 220 }} onClick={handleLeave}>Abbrechen</button>
        </div>
      )}

      {showInfo && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200, padding: '1rem',
          }}
          onClick={() => setShowInfo(false)}
        >
          <div
            style={{
              background: 'var(--card)', borderRadius: 24, padding: '22px 20px 20px',
              maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>Hilfe</span>
              <button className="icon-btn icon-btn-ghost" onClick={() => setShowInfo(false)}>
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            {/* Tab switcher */}
            <div style={{
              display: 'flex', gap: 4, marginBottom: 16,
              background: 'var(--card-inner)', borderRadius: 13, padding: 4,
            }}>
              {(['install', 'multiplayer'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setInfoTab(tab)}
                  style={{
                    flex: 1, border: 'none', borderRadius: 10, padding: '7px 0',
                    background: infoTab === tab ? 'var(--card)' : 'transparent',
                    boxShadow: infoTab === tab ? 'var(--shadow-sm)' : 'none',
                    color: infoTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: 700, fontSize: 13, cursor: 'pointer', margin: 0,
                    transition: 'all 0.15s',
                  }}
                >
                  {tab === 'install' ? 'App installieren' : 'Multiplayer'}
                </button>
              ))}
            </div>

            {infoTab === 'install' ? (
              <>
                <div style={{ background: 'var(--card-inner)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14 }}>Android</p>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-muted)' }}>
                    <li>Seite in <strong style={{ color: 'var(--text)' }}>Chrome</strong> öffnen</li>
                    <li>Drei-Punkte-Menü <strong style={{ color: 'var(--text)' }}>⋮</strong> antippen</li>
                    <li><strong style={{ color: 'var(--text)' }}>"App installieren"</strong> wählen</li>
                    <li>Bestätigen – fertig</li>
                  </ol>
                </div>
                <div style={{ background: 'var(--card-inner)', borderRadius: 14, padding: '14px 16px' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14 }}>iPhone / iPad</p>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-muted)' }}>
                    <li>Seite in <strong style={{ color: 'var(--text)' }}>Safari</strong> öffnen <span style={{ fontSize: 12 }}>(nicht Chrome!)</span></li>
                    <li>Teilen-Symbol <strong style={{ color: 'var(--text)' }}>↑</strong> unten antippen</li>
                    <li><strong style={{ color: 'var(--text)' }}>"Zum Home-Bildschirm"</strong> wählen</li>
                    <li>Namen bestätigen – fertig</li>
                  </ol>
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                  Die App läuft dann ohne Browser-Leiste – wie eine native App.
                </p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  { n: 1, title: 'Spiel wählen', text: 'Tippe auf Busfahren, Das Fenster oder Circle.' },
                  { n: 2, title: 'Raum erstellen', text: 'Tippe auf "Neues Spiel" – du bekommst einen 4-stelligen Raumcode.' },
                  { n: 3, title: 'Code teilen', text: 'Schick den Code an deine Mitspieler – per Chat oder laut vorlesen.' },
                  { n: 4, title: 'Beitreten', text: 'Mitspieler tippen "Beitreten", geben den Code ein und sind dabei.' },
                  { n: 5, title: 'Spiel starten', text: 'Der Host (Ersteller) startet das Spiel sobald alle da sind.' },
                ] as { n: number; title: string; text: string }[]).map(({ n, title, text }) => (
                  <div key={n} style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    background: 'var(--card-inner)', borderRadius: 12, padding: '11px 13px',
                    border: '1.5px solid var(--border)',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: 'var(--primary)', color: 'var(--btn-color)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1,
                    }}>
                      {n}
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 13 }}>{title}</p>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{text}</p>
                    </div>
                  </div>
                ))}
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Kein Account nötig – einfach losspielen.
                </p>
              </div>
            )}
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
          <button style={{ maxWidth: 280 }} onClick={() => {
            setLocalActiveId(localTurnId);
            setPhase1HandoffReady(false);
          }}>
            Anzeigen
          </button>
        </div>
      )}

      {isDev ? <DevDashboard /> : (
        <>
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
          {showGame         && <Game         room={room}        playerId={effectivePlayerId} onLocalTurnDone={isLocalMode ? () => setPhase1HandoffReady(true) : undefined} />}
          {showQuadratLobby && <QuadratLobby room={quadratRoom} playerId={isLocalMode ? localPlayerIds[0] : playerId} />}
          {showQuadratGame  && <QuadratGame  room={quadratRoom} playerId={effectivePlayerId} />}
          {showCircleLobby  && <CircleLobby  room={circleRoom}  playerId={isLocalMode ? localPlayerIds[0] : playerId} />}
          {showCircleGame   && <CircleGame   room={circleRoom}  playerId={effectivePlayerId} isLocalMode={isLocalMode} />}
        </>
      )}

      {/* Bottom bar */}
      {!isDev && <div style={{
        position: 'fixed', bottom: 10, left: '50%', transform: 'translateX(-50%)',
        zIndex: 100, width: 'calc(100% - 24px)', maxWidth: 480,
        background: 'var(--card)', border: '1.5px solid var(--border)',
        borderRadius: 20, boxShadow: 'var(--shadow-sm)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 52,
      }}>
        <button
          onClick={openErrorReport}
          className="icon-btn-ghost"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 13, fontWeight: 600,
            padding: '0 20px', height: '100%', borderRadius: 20,
          }}
        >
          <AlertTriangle size={15} strokeWidth={2} />
          Fehler melden
        </button>
      </div>}

      {/* Error report modal */}
      {showErrorReport && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300, padding: '1rem',
          }}
          onClick={() => { if (!errorSubmitting) setShowErrorReport(false); }}
        >
          <div
            style={{
              background: 'var(--card)', borderRadius: 24, padding: '22px 20px 20px',
              maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>Fehler melden</span>
              <button className="icon-btn icon-btn-ghost" onClick={() => setShowErrorReport(false)} disabled={errorSubmitting}>
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            {errorSubmitted ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'var(--card-inner)', border: '2px solid var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px',
                }}>
                  <Check size={22} strokeWidth={2.5} style={{ color: 'var(--primary)' }} />
                </div>
                <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 6px' }}>Danke für dein Feedback!</p>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 20px' }}>Wir schauen uns das an.</p>
                <button onClick={() => setShowErrorReport(false)}>Schließen</button>
              </div>
            ) : (
              <>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Beschreibe kurz was passiert ist – kein Account nötig.
                </p>
                {(roomId || quadratRoomId || circleRoomId) && (
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                    Kontext: {roomId ? 'Busfahren' : quadratRoomId ? 'Das Fenster' : 'Circle'} · Raum {roomId ?? quadratRoomId ?? circleRoomId}
                  </p>
                )}
                <textarea
                  value={errorText}
                  onChange={e => setErrorText(e.target.value)}
                  placeholder='z.B. "Spiel hat sich aufgehängt nach dem Starten …"'
                  rows={4}
                  style={{
                    width: '100%', resize: 'none', borderRadius: 14, padding: '12px 14px',
                    background: 'var(--card-inner)', border: '1.5px solid var(--border)',
                    color: 'var(--text)', fontSize: 13, lineHeight: 1.6,
                    fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleSubmitError}
                  disabled={!errorText.trim() || errorSubmitting}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' }}
                >
                  {errorSubmitting
                    ? 'Wird gesendet…'
                    : <><Send size={15} strokeWidth={2.5} /> Absenden</>
                  }
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
