import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from './firebase';
import type { GameRoom } from './types';
import type { QuadratRoom } from './quadratTypes';
import type { CircleRoom } from './circleTypes';
import { getPlayerId, leaveRoom, joinRoom, deleteLocalRoom } from './gameActions';
import { leaveQuadratRoom, joinQuadratRoom, deleteLocalQuadratRoom } from './quadratActions';
import { leaveCircleRoom, joinCircleRoom, deleteLocalCircleRoom } from './circleActions';
import { Sun, Moon, Home as HomeIcon, WifiOff, Copy, Check, Info, X, AlertTriangle, Send, Bell, BellOff, RefreshCw } from 'lucide-react';
import { submitErrorReport } from './errorActions';
import ErrorBoundary from './components/ErrorBoundary';
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

// Dashboard (and firebase/auth) is only loaded under /?dashboard
const DevDashboard = lazy(() => import('./pages/DevDashboard'));

const THEMES = [
  { id: 'mono',   label: 'Mono',  colors: ['#111111', '#E8E8E8'] as [string, string] },
  { id: 'lila',   label: 'Lila',  colors: ['#7C3AED', '#EC4899'] as [string, string] },
  { id: 'ocean',  label: 'Blau',  colors: ['#0EA5E9', '#818CF8'] as [string, string] },
  { id: 'forest', label: 'Grün',  colors: ['#059669', '#06B6D4'] as [string, string] },
  { id: 'fire',   label: 'Rot',   colors: ['#DC2626', '#F97316'] as [string, string] },
] as const;
type ThemeId = 'mono' | 'lila' | 'ocean' | 'forest' | 'fire';

const isDev = new URLSearchParams(window.location.search).has('dashboard');
const ERROR_MAX_LENGTH = 2000;

// Local mode (one device for everyone) survives reloads / iOS tab eviction
const LOCAL_KEY = 'kartenkater_local';
type LocalState = { roomId: string; ids: string[]; activeId: string };
function loadLocalState(): LocalState | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const st = JSON.parse(raw) as LocalState;
    const rooms = ['busfahren_room', 'quadrat_room', 'circle_room'].map(k => localStorage.getItem(k));
    return rooms.includes(st.roomId) && Array.isArray(st.ids) && st.ids.length > 1 ? st : null;
  } catch {
    return null;
  }
}
const initialLocal = isDev ? null : loadLocalState();

function storedRoom(key: string): string | null {
  return isDev ? null : localStorage.getItem(key);
}

/** Shows "Du bist dran" as a system notification. Never throws (iOS Safari has no Notification API outside the PWA). */
function notifyTurn() {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const title = 'Kartenkater';
    const options = { body: 'Du bist dran!', icon: '/icon-192.png', tag: 'kartenkater-turn' };
    const fallback = () => { try { new Notification(title, options); } catch { /* not supported */ } };
    if ('serviceWorker' in navigator) {
      // Android Chrome only allows notifications via the service worker
      navigator.serviceWorker.getRegistration()
        .then(reg => (reg ? reg.showNotification(title, options) : fallback()))
        .catch(fallback);
    } else {
      fallback();
    }
  } catch {
    // ignore
  }
}

export default function App() {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  const [roomId, setRoomId] = useState<string | null>(
    () => storedRoom('busfahren_room')
  );
  const [room, setRoom] = useState<GameRoom | null>(null);

  const [quadratRoomId, setQuadratRoomId] = useState<string | null>(
    () => storedRoom('quadrat_room')
  );
  const [quadratRoom, setQuadratRoom] = useState<QuadratRoom | null>(null);

  const [circleRoomId, setCircleRoomId] = useState<string | null>(
    () => storedRoom('circle_room')
  );
  const [circleRoom, setCircleRoom] = useState<CircleRoom | null>(null);

  const [localPlayerIds, setLocalPlayerIds] = useState<string[]>(() => initialLocal?.ids ?? []);
  const [localActiveId, setLocalActiveId] = useState<string>(() => initialLocal?.activeId ?? getPlayerId());
  const localIdsRef = useRef(localPlayerIds);
  localIdsRef.current = localPlayerIds;

  // Firestore sync state: re-subscribe counter and "showing cached data" flag
  const [syncNonce, setSyncNonce] = useState(0);
  const [fromCache, setFromCache] = useState(false);
  const [showSyncBanner, setShowSyncBanner] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const [dark, setDark] = useState(
    () => localStorage.getItem('busfahren_dark') === '1'
  );
  const [hapticOn, setHapticOn] = useState(
    () => localStorage.getItem('busfahren_haptic') !== '0'
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
  const [errorSendFailed, setErrorSendFailed] = useState(false);

  const [joinPrompt, setJoinPrompt] = useState<{ code: string; game: 'busfahren' | 'quadrat' | 'circle' } | null>(null);
  const [joinPromptName, setJoinPromptName] = useState('');
  const [joinPromptLoading, setJoinPromptLoading] = useState(false);
  const [joinPromptError, setJoinPromptError] = useState('');

  function dismissWelcome() {
    localStorage.setItem('busfahren_welcomed', '1');
    setShowWelcome(false);
  }

  const playerId = getPlayerId();

  // URL params → auto-join popup
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const join = params.get('join');
    const game = params.get('game');
    if (join && (game === 'busfahren' || game === 'quadrat' || game === 'circle')) {
      setJoinPrompt({ code: join.toUpperCase(), game });
      setJoinPromptName(localStorage.getItem('busfahren_name') ?? '');
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

  // iOS freezes background tabs and silently drops the Firestore stream.
  // When the app comes back (after being hidden for a while) force a fresh connection.
  useEffect(() => {
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0;
    let reconnecting = false;
    async function reconnect() {
      if (reconnecting) return;
      reconnecting = true;
      try {
        await disableNetwork(db);
        await enableNetwork(db);
      } catch {
        // ignore – the SDK keeps retrying on its own
      } finally {
        reconnecting = false;
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 5000) reconnect();
      hiddenAt = 0;
    }
    function onPageShow(e: PageTransitionEvent) { if (e.persisted) reconnect(); }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', reconnect);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  // Only show the sync banner if cached data persists for a moment
  useEffect(() => {
    if (!fromCache) { setShowSyncBanner(false); return; }
    const t = setTimeout(() => setShowSyncBanner(true), 3000);
    return () => clearTimeout(t);
  }, [fromCache]);

  // Persist local mode
  useEffect(() => {
    const currentRoom = roomId ?? quadratRoomId ?? circleRoomId;
    try {
      if (localPlayerIds.length > 1 && currentRoom) {
        localStorage.setItem(LOCAL_KEY, JSON.stringify({ roomId: currentRoom, ids: localPlayerIds, activeId: localActiveId }));
      } else {
        localStorage.removeItem(LOCAL_KEY);
      }
    } catch { /* storage unavailable */ }
  }, [localPlayerIds, localActiveId, roomId, quadratRoomId, circleRoomId]);

  // Dark mode
  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('busfahren_dark', dark ? '1' : '0');
  }, [dark]);

  // Haptic toggle
  useEffect(() => {
    localStorage.setItem('busfahren_haptic', hapticOn ? '1' : '0');
  }, [hapticOn]);

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
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(doc(db, 'rooms', roomId), { includeMetadataChanges: true }, snap => {
      const cached = snap.metadata.fromCache;
      setFromCache(cached);
      if (snap.exists()) {
        const data = snap.data() as GameRoom;
        // Only trust server data for "you're no longer in this room"
        if (!cached && !isMember(data.playerOrder)) { handleLeave(); return; }
        setRoom(data);
      } else if (!cached) {
        handleLeave();
      }
    }, err => {
      // Listener died (e.g. network / quota) → show it and subscribe again
      console.warn('Firestore listener error', err);
      setFromCache(true);
      retry = setTimeout(() => setSyncNonce(n => n + 1), 2000);
    });
    return () => { unsub(); if (retry) clearTimeout(retry); };
  }, [roomId, syncNonce]);

  useEffect(() => {
    if (!quadratRoomId) return;
    localStorage.setItem('quadrat_room', quadratRoomId);
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(doc(db, 'quadrat', quadratRoomId), { includeMetadataChanges: true }, snap => {
      const cached = snap.metadata.fromCache;
      setFromCache(cached);
      if (snap.exists()) {
        const data = snap.data() as QuadratRoom;
        // Only trust server data for "you're no longer in this room"
        if (!cached && !isMember(data.playerOrder)) { handleLeave(); return; }
        setQuadratRoom(data);
      } else if (!cached) {
        handleLeave();
      }
    }, err => {
      // Listener died (e.g. network / quota) → show it and subscribe again
      console.warn('Firestore listener error', err);
      setFromCache(true);
      retry = setTimeout(() => setSyncNonce(n => n + 1), 2000);
    });
    return () => { unsub(); if (retry) clearTimeout(retry); };
  }, [quadratRoomId, syncNonce]);

  useEffect(() => {
    if (!circleRoomId) return;
    localStorage.setItem('circle_room', circleRoomId);
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(doc(db, 'circle', circleRoomId), { includeMetadataChanges: true }, snap => {
      const cached = snap.metadata.fromCache;
      setFromCache(cached);
      if (snap.exists()) {
        const data = snap.data() as CircleRoom;
        // Only trust server data for "you're no longer in this room"
        if (!cached && !isMember(data.playerOrder)) { handleLeave(); return; }
        setCircleRoom(data);
      } else if (!cached) {
        handleLeave();
      }
    }, err => {
      // Listener died (e.g. network / quota) → show it and subscribe again
      console.warn('Firestore listener error', err);
      setFromCache(true);
      retry = setTimeout(() => setSyncNonce(n => n + 1), 2000);
    });
    return () => { unsub(); if (retry) clearTimeout(retry); };
  }, [circleRoomId, syncNonce]);

  function isMember(order: string[]): boolean {
    return order.includes(playerId) || localIdsRef.current.some(id => order.includes(id));
  }

  function clearAllRooms() {
    localStorage.removeItem('busfahren_room');
    localStorage.removeItem('quadrat_room');
    localStorage.removeItem('circle_room');
    setRoomId(null); setRoom(null);
    setQuadratRoomId(null); setQuadratRoom(null);
    setCircleRoomId(null); setCircleRoom(null);
  }
  function requestNotificationPermission() {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Promise.resolve(Notification.requestPermission()).catch(() => {});
      }
    } catch { /* not supported */ }
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
    setPhase1HandoffReady(false);
    setConfirmLeave(false);
    setFromCache(false);
    setSelectedGame(null);
  }
  function handleUserLeave() {
    const local = localPlayerIds.length > 1;
    const r = room, q = quadratRoom, c = circleRoom;
    // Leave the UI immediately; the server write must not block (offline / errors)
    handleLeave();
    const ignore = () => {};
    if (local) {
      // The whole table leaves together → remove the room (fall back to leaving)
      if (r) deleteLocalRoom(r.id).catch(() => leaveRoom(r, playerId).catch(ignore));
      if (q) deleteLocalQuadratRoom(q.id).catch(() => leaveQuadratRoom(q, playerId).catch(ignore));
      if (c) deleteLocalCircleRoom(c.id).catch(() => leaveCircleRoom(c, playerId).catch(ignore));
      return;
    }
    if (r) leaveRoom(r, playerId).catch(ignore);
    if (q) leaveQuadratRoom(q, playerId).catch(ignore);
    if (c) leaveCircleRoom(c, playerId).catch(ignore);
  }
  function handleHomeClick() {
    const running = (room && room.status !== 'lobby' && room.status !== 'finished')
      || (quadratRoom && quadratRoom.status !== 'lobby' && quadratRoom.status !== 'finished')
      || (circleRoom && circleRoom.status !== 'lobby' && circleRoom.status !== 'finished');
    if (running) setConfirmLeave(true);
    else if (inRoom) handleUserLeave();
    else setSelectedGame(null);
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
    setErrorSendFailed(false);
    setErrorText('');
  }

  async function handleSubmitError() {
    if (!errorText.trim() || errorSubmitting) return;
    setErrorSubmitting(true);
    setErrorSendFailed(false);
    try {
      const gameType = roomId ? 'busfahren' : quadratRoomId ? 'quadrat' : circleRoomId ? 'circle' : undefined;
      const currentRoomId = roomId ?? quadratRoomId ?? circleRoomId ?? undefined;
      await submitErrorReport({ message: errorText.trim().slice(0, ERROR_MAX_LENGTH), playerId, gameType, roomId: currentRoomId });
      setErrorSubmitted(true);
    } catch {
      setErrorSendFailed(true);
    } finally {
      setErrorSubmitting(false);
    }
  }

  async function handleQuickJoin() {
    if (!joinPrompt || !joinPromptName.trim() || joinPromptLoading) return;
    setJoinPromptLoading(true);
    setJoinPromptError('');
    const name = joinPromptName.trim();
    localStorage.setItem('busfahren_name', name);
    try {
      let result: { ok: boolean; error?: string };
      if (joinPrompt.game === 'busfahren') {
        result = await joinRoom(joinPrompt.code, playerId, name);
        if (result.ok) { setJoinPrompt(null); handleJoined(joinPrompt.code); return; }
      } else if (joinPrompt.game === 'quadrat') {
        result = await joinQuadratRoom(joinPrompt.code, playerId, name);
        if (result.ok) { setJoinPrompt(null); handleQuadratJoined(joinPrompt.code); return; }
      } else {
        result = await joinCircleRoom(joinPrompt.code, playerId, name);
        if (result.ok) { setJoinPrompt(null); handleCircleJoined(joinPrompt.code); return; }
      }
      setJoinPromptError(result.error ?? 'Beitreten fehlgeschlagen.');
    } catch {
      setJoinPromptError('Verbindungsfehler. Bitte erneut versuchen.');
    } finally {
      setJoinPromptLoading(false);
    }
  }

  function handlePopupCopy() {
    navigator.clipboard?.writeText(popupCode).then(() => {
      setPopupCopied(true);
      setTimeout(() => setPopupCopied(false), 2000);
    }).catch(() => { /* clipboard blocked – code is visible anyway */ });
  }

  const isLocalMode = localPlayerIds.length > 1;
  // Busfahren Stechen: next candidate on this device who still has to pick a card
  const tiebreakNext = room?.status === 'results' && room.tiebreakOffered && room.tiebreakCandidates
    ? room.tiebreakCandidates.find(id => !room.tiebreakPicks?.[id]) ?? null
    : null;
  const effectivePlayerId = isLocalMode
    ? room?.status === 'phase1'      ? localActiveId
    : room?.status === 'results'     ? (tiebreakNext ?? localPlayerIds[0])
    : room?.status === 'phase3'      ? (room.busfahrerId ?? localPlayerIds[0])
    : quadratRoom?.status === 'playing'      ? localActiveId
    : quadratRoom?.status === 'distributing' ? (quadratRoom.winnerId ?? localPlayerIds[0])
    : circleRoom?.status === 'playing'       ? localActiveId
    : localPlayerIds[0]
    : playerId;
  const localTurnId = isLocalMode
    ? (room?.status === 'phase1' ? room.playerOrder[room.currentPlayerIndex] : null)
      ?? (room?.status === 'results' ? tiebreakNext : null)
      ?? (room?.status === 'phase3' ? room.busfahrerId : null)
      ?? (quadratRoom?.status === 'playing' ? quadratRoom.playerOrder[quadratRoom.currentPlayerIndex] : null)
      ?? (quadratRoom?.status === 'distributing' ? quadratRoom.winnerId : null)
      ?? (circleRoom?.status === 'playing' ? circleRoom.playerOrder[circleRoom.currentPlayerIndex] : null)
    : null;
  const needsHandoff = localTurnId !== null
    && localTurnId !== localActiveId
    && localPlayerIds.includes(localTurnId)
    // In Phase 1 the card result must be acknowledged before handing off the device
    // (at the start of a round there is no result yet)
    && (room?.status !== 'phase1' || phase1HandoffReady || !room.lastAction);
  const activeRoomForHandoff = room ?? quadratRoom ?? circleRoom;

  const currentTheme = THEMES.find(t => t.id === theme) ?? THEMES[0];

  // Push notifications: fire when it becomes this player's turn (or they must act) and the tab is hidden
  const isHostHere = (room?.hostId ?? quadratRoom?.hostId ?? circleRoom?.hostId) === playerId;
  const myTurn =
    (room?.status === 'phase1' && room.playerOrder[room.currentPlayerIndex] === playerId)
    || (room?.status === 'phase2start' && isHostHere)
    || (room?.status === 'results' && !!room.tiebreakOffered && !!room.tiebreakCandidates?.includes(playerId) && !room.tiebreakPicks?.[playerId])
    || (room?.status === 'phase3' && room.busfahrerId === playerId)
    || (circleRoom?.status === 'playing' && !circleRoom.pendingAction && circleRoom.playerOrder[circleRoom.currentPlayerIndex] === playerId)
    || (quadratRoom?.status === 'playing' && quadratRoom.playerOrder[quadratRoom.currentPlayerIndex] === playerId)
    || (quadratRoom?.status === 'distributing' && quadratRoom.winnerId === playerId);
  const prevMyTurnRef = useRef(false);

  useEffect(() => {
    const was = prevMyTurnRef.current;
    prevMyTurnRef.current = myTurn;
    if (isLocalMode || !myTurn || was) return;
    if (document.hidden || !document.hasFocus()) notifyTurn();
  }, [myTurn]);

  // ESC closes the topmost dialog
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (showErrorReport && !errorSubmitting) setShowErrorReport(false);
      else if (confirmLeave) setConfirmLeave(false);
      else if (showInfo) setShowInfo(false);
      else if (joinPrompt && !joinPromptLoading) setJoinPrompt(null);
      else if (showThemePicker) setShowThemePicker(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showErrorReport, errorSubmitting, confirmLeave, showInfo, joinPrompt, joinPromptLoading, showThemePicker]);

  if (isDev) {
    return (
      <Suspense fallback={<div className="waiting-text" style={{ padding: '4rem 1rem' }}>Laden…</div>}>
        <ErrorBoundary>
          <DevDashboard />
        </ErrorBoundary>
      </Suspense>
    );
  }

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
      {!offline && showSyncBanner && inRoom && (
        <div role="status" style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
          background: '#F59E0B', color: '#111',
          textAlign: 'center', padding: '8px 16px',
          fontSize: 13, fontWeight: 700, animation: 'slideDown 0.3s ease-out',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <RefreshCw size={14} strokeWidth={2.5} style={{ animation: 'spin 1s linear infinite' }} />
          Synchronisiere mit den anderen…
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
          <button className="icon-btn icon-btn-ghost" onClick={() => setShowThemePicker(p => !p)} title="Farbthema" aria-label="Farbthema wählen" aria-expanded={showThemePicker}>
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
                  aria-pressed={theme === t.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-start',
                    minHeight: 0,
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
          <button className="icon-btn icon-btn-ghost" onClick={() => setShowInfo(true)} title="Hilfe" aria-label="Hilfe öffnen">
            <Info size={20} strokeWidth={2} />
          </button>
        ) : (selectedGame || inRoom) ? (
          <button className="icon-btn icon-btn-ghost" onClick={handleHomeClick} title="Hauptmenü" aria-label="Zum Hauptmenü">
            <HomeIcon size={20} strokeWidth={2} />
          </button>
        ) : null}

        {/* Right: haptic + dark mode */}
        <div style={{ display: 'flex', gap: 0 }}>
          <button className="icon-btn icon-btn-ghost" onClick={() => setHapticOn(h => !h)} title={hapticOn ? 'Vibration an' : 'Vibration aus'} aria-label="Vibration" aria-pressed={hapticOn}>
            {hapticOn ? <Bell size={18} strokeWidth={2} /> : <BellOff size={18} strokeWidth={2} />}
          </button>
          <button className="icon-btn icon-btn-ghost" onClick={() => setDark(d => !d)} title="Dark Mode" aria-label="Dark Mode" aria-pressed={dark}>
            {dark ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
          </button>
        </div>
      </div>

      {/* Confirm leaving a running game */}
      {confirmLeave && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 450, padding: '1rem',
          }}
          onClick={() => setConfirmLeave(false)}
        >
          <div
            role="dialog" aria-modal="true" aria-labelledby="leave-title"
            style={{
              background: 'var(--card)', borderRadius: 24, padding: '24px 22px 18px',
              textAlign: 'center', maxWidth: 320, width: '100%', boxShadow: 'var(--shadow)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <p id="leave-title" style={{ fontSize: 19, fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Spiel verlassen?</p>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 16px', lineHeight: 1.5 }}>
              {isLocalMode
                ? 'Das lokale Spiel wird beendet.'
                : 'Du wirst aus dem laufenden Spiel entfernt und kannst nicht wieder einsteigen.'}
            </p>
            <button className="danger" onClick={handleUserLeave}>Verlassen</button>
            <button className="secondary" onClick={() => setConfirmLeave(false)}>Weiterspielen</button>
          </div>
        </div>
      )}

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
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <button className="copy-btn" onClick={handlePopupCopy}>
                    {popupCopied ? <><Check size={13} strokeWidth={2.5} /> Kopiert!</> : <><Copy size={13} /> Code kopieren</>}
                  </button>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 16px' }}>
                Busfahren kann ohne 2 Spieler nicht fortgesetzt werden.
              </p>
            )}
            <button
              onClick={() => handleUserLeave()}
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
          <div role="dialog" aria-modal="true" aria-label="Willkommen" style={{
            background: 'var(--card)', borderRadius: 28, padding: '28px 24px 24px',
            maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)',
            animation: 'fadeInOpacity 0.3s ease',
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
            role="dialog" aria-modal="true" aria-label="Hilfe"
            style={{
              background: 'var(--card)', borderRadius: 24, padding: '22px 20px 20px',
              maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)',
              maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>Hilfe</span>
              <button className="icon-btn icon-btn-ghost" onClick={() => setShowInfo(false)} aria-label="Schließen">
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
                    <li><strong style={{ color: 'var(--text)' }}>„App installieren"</strong> wählen</li>
                    <li>Bestätigen – fertig</li>
                  </ol>
                </div>
                <div style={{ background: 'var(--card-inner)', borderRadius: 14, padding: '14px 16px' }}>
                  <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14 }}>iPhone / iPad</p>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--text-muted)' }}>
                    <li>Seite in <strong style={{ color: 'var(--text)' }}>Safari</strong> öffnen <span style={{ fontSize: 12 }}>(ab iOS 16.4 auch Chrome)</span></li>
                    <li>Teilen-Symbol <strong style={{ color: 'var(--text)' }}>↑</strong> antippen</li>
                    <li><strong style={{ color: 'var(--text)' }}>„Zum Home-Bildschirm"</strong> wählen</li>
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
                  { n: 2, title: 'Raum erstellen', text: 'Namen eingeben und „Neuen Raum erstellen" tippen – du bekommst einen 4-stelligen Raumcode.' },
                  { n: 3, title: 'Code teilen', text: 'Schick Code, Link oder QR-Code an deine Mitspieler.' },
                  { n: 4, title: 'Beitreten', text: 'Mitspieler geben den Code ein und tippen „Raum beitreten" – oder öffnen einfach den Link.' },
                  { n: 5, title: 'Spiel starten', text: 'Der Host (Ersteller) startet das Spiel, sobald alle da sind.' },
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
                <div style={{
                  background: 'var(--card-inner)', borderRadius: 12, padding: '11px 13px',
                  border: '1.5px solid var(--border)',
                }}>
                  <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 13 }}>Nur ein Handy?</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Tippe auf „Lokal (1 Gerät)", trag alle Namen ein und reicht das Handy herum – die App sagt jeweils, wer dran ist.
                  </p>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Kein Account nötig – einfach losspielen.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {needsHandoff && activeRoomForHandoff && localTurnId && (
        <div role="dialog" aria-modal="true" aria-label="Gerät weitergeben" style={{
          position: 'fixed', inset: 0, background: 'var(--bg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 500, gap: 8, padding: '2rem', textAlign: 'center',
        }}>
          <p style={{ opacity: 0.55, fontSize: 13, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
            {room?.status === 'results' ? 'Stechen – jetzt dran' : room?.status === 'phase3' ? 'Busfahrer – jetzt dran' : 'Jetzt dran'}
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

      <ErrorBoundary>
        <>
          {!inRoom && !selectedGame && <GameSelection onSelect={setSelectedGame} />}
          {!inRoom && selectedGame === 'busfahren' && (
            <Home onJoined={handleJoined} onBack={() => setSelectedGame(null)} />
          )}
          {!inRoom && selectedGame === 'quadrat' && (
            <QuadratHome onJoined={(id, ids) => handleQuadratJoined(id, ids)} onBack={() => setSelectedGame(null)} />
          )}
          {!inRoom && selectedGame === 'circle' && (
            <CircleHome onJoined={(id, ids) => handleCircleJoined(id, ids)} onBack={() => setSelectedGame(null)} />
          )}
          {showLobby        && <Lobby        room={room}        playerId={isLocalMode ? localPlayerIds[0] : playerId} />}
          {showGame         && <Game         room={room}        playerId={effectivePlayerId} isLocalMode={isLocalMode} onLocalTurnDone={isLocalMode ? () => setPhase1HandoffReady(true) : undefined} />}
          {showQuadratLobby && <QuadratLobby room={quadratRoom} playerId={isLocalMode ? localPlayerIds[0] : playerId} />}
          {showQuadratGame  && <QuadratGame  room={quadratRoom} playerId={effectivePlayerId} isLocalMode={isLocalMode} />}
          {showCircleLobby  && <CircleLobby  room={circleRoom}  playerId={isLocalMode ? localPlayerIds[0] : playerId} />}
          {showCircleGame   && <CircleGame   room={circleRoom}  playerId={effectivePlayerId} isLocalMode={isLocalMode} />}
        </>
      </ErrorBoundary>

      {/* Quick-join popup (from share link / QR code) */}
      {joinPrompt && !inRoom && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 400, padding: '1rem',
          }}
          onClick={() => !joinPromptLoading && setJoinPrompt(null)}
        >
          <div
            role="dialog" aria-modal="true" aria-label="Raum beitreten"
            style={{
              background: 'var(--card)', borderRadius: 24, padding: '24px 20px 20px',
              maxWidth: 340, width: '100%', boxShadow: 'var(--shadow)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em' }}>Raum beitreten</span>
              <button className="icon-btn icon-btn-ghost" onClick={() => setJoinPrompt(null)} disabled={joinPromptLoading} aria-label="Schließen">
                <X size={20} strokeWidth={2} />
              </button>
            </div>
            <div className="room-code" style={{ marginBottom: 20, fontSize: 22 }}>{joinPrompt.code}</div>
            <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Dein Name
            </label>
            <input
              type="text"
              value={joinPromptName}
              onChange={e => setJoinPromptName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuickJoin()}
              placeholder="Name eingeben…"
              maxLength={20}
              disabled={joinPromptLoading}
              autoFocus
              style={{ marginBottom: joinPromptError ? 8 : 16 }}
            />
            {joinPromptError && (
              <p style={{ color: '#e53e3e', fontSize: 13, margin: '0 0 12px', fontWeight: 600 }}>{joinPromptError}</p>
            )}
            <button onClick={handleQuickJoin} disabled={!joinPromptName.trim() || joinPromptLoading}>
              {joinPromptLoading ? 'Verbinde…' : 'Beitreten'}
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{
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
      </div>

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
            role="dialog" aria-modal="true" aria-label="Fehler melden"
            style={{
              background: 'var(--card)', borderRadius: 24, padding: '22px 20px 20px',
              maxWidth: 360, width: '100%', boxShadow: 'var(--shadow)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', color: 'var(--text)' }}>Fehler melden</span>
              <button className="icon-btn icon-btn-ghost" onClick={() => setShowErrorReport(false)} disabled={errorSubmitting} aria-label="Schließen">
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
                  placeholder='z.B. „Spiel hat sich aufgehängt nach dem Starten …"'
                  aria-label="Fehlerbeschreibung"
                  maxLength={ERROR_MAX_LENGTH}
                  rows={4}
                  style={{
                    width: '100%', resize: 'none', borderRadius: 14, padding: '12px 14px',
                    background: 'var(--card-inner)', border: '1.5px solid var(--border)',
                    color: 'var(--text)', fontSize: 16, lineHeight: 1.5,
                    fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 4,
                    outline: 'none',
                  }}
                />
                <p style={{ margin: '0 0 10px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                  {errorText.length} / {ERROR_MAX_LENGTH}
                </p>
                {errorSendFailed && (
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#e53e3e', fontWeight: 600, textAlign: 'center' }}>
                    Senden fehlgeschlagen. Bitte prüfe deine Verbindung.
                  </p>
                )}
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
