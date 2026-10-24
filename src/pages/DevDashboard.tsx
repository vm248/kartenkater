import { useEffect, useState, useCallback } from 'react';
import { getAuth, onAuthStateChanged, signInWithPopup, signOut, GithubAuthProvider, type User } from 'firebase/auth';
import { collection, getDocs, deleteDoc, doc, query, orderBy, limit } from 'firebase/firestore';
import { app, db } from '../firebase';
import { LogIn, LogOut, RefreshCw, Trash2 } from 'lucide-react';

// Client-side gate only – the real protection is isAdmin() in firestore.rules (UID check)
const ALLOWED_EMAIL = 'vooke.meyer@t-online.de';
const auth = getAuth(app);
const provider = new GithubAuthProvider();
const ERRORS_LIMIT = 200;
// Cleanup leaves fresh lobbies alone (a host may be waiting for players)
const CLEANUP_MIN_AGE_MS = 60 * 60 * 1000;
const COL: Record<string, string> = { busfahren: 'rooms', quadrat: 'quadrat', circle: 'circle' };
const GAME_LABEL: Record<string, string> = { busfahren: 'Busfahren', quadrat: 'Das Fenster', circle: 'Circle' };

const btnBase: React.CSSProperties = { width: 'auto', boxShadow: 'none', display: 'flex', alignItems: 'center', cursor: 'pointer' };
const delBtn: React.CSSProperties = { ...btnBase, background: 'transparent', border: 'none', color: '#e53e3e', padding: 4, flexShrink: 0, borderRadius: 6 };
const actionBtn: React.CSSProperties = { ...btnBase, gap: 5, padding: '5px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', color: '#e53e3e', fontSize: 12, fontWeight: 700, flexShrink: 0 };

type RoomRow = { id: string; game: string; status: string; players: number; createdAt: number; };
type ErrorRow = { id: string; message: string; timestamp: number; gameType?: string; roomId?: string; playerId?: string; userAgent?: string; };

function formatAge(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}T`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return 'gerade';
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const color = status === 'lobby' ? '#6B7280' : status === 'finished' ? '#10B981' : '#F59E0B';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: color + '22', borderRadius: 6, padding: '2px 6px' }}>
      {status}
    </span>
  );
}

function GameBadge({ game }: { game: string }) {
  const colors: Record<string, string> = { busfahren: '#7C3AED', quadrat: '#0EA5E9', circle: '#059669' };
  const c = colors[game] ?? '#6B7280';
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color: c, background: c + '22', borderRadius: 6, padding: '2px 6px', letterSpacing: '0.03em' }}>
      {GAME_LABEL[game] ?? game}
    </span>
  );
}

export default function DevDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    document.title = 'Dashboard';
    return () => { document.title = 'Kartenkater'; };
  }, []);

  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u && u.email !== ALLOWED_EMAIL) {
        await signOut(auth);
        setAuthError('Kein Zugriff für diesen Account.');
        setUser(null);
      } else {
        setUser(u);
        setAuthError('');
      }
      setAuthLoading(false);
    });
  }, []);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError('');
    try {
      const [roomsSnap, quadratSnap, circleSnap, errorsSnap] = await Promise.all([
        getDocs(collection(db, 'rooms')),
        getDocs(collection(db, 'quadrat')),
        getDocs(collection(db, 'circle')),
        getDocs(query(collection(db, 'errors'), orderBy('timestamp', 'desc'), limit(ERRORS_LIMIT))),
      ]);

      const allRooms: RoomRow[] = [
        ...roomsSnap.docs.map(d => ({ id: d.id, game: 'busfahren', status: d.data().status, players: d.data().playerOrder?.length ?? 0, createdAt: d.data().createdAt })),
        ...quadratSnap.docs.map(d => ({ id: d.id, game: 'quadrat', status: d.data().status, players: d.data().playerOrder?.length ?? 0, createdAt: d.data().createdAt })),
        ...circleSnap.docs.map(d => ({ id: d.id, game: 'circle', status: d.data().status, players: d.data().playerOrder?.length ?? 0, createdAt: d.data().createdAt })),
      ].sort((a, b) => b.createdAt - a.createdAt);

      const allErrors: ErrorRow[] = errorsSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as ErrorRow))
        .sort((a, b) => b.timestamp - a.timestamp);

      setRooms(allRooms);
      setErrors(allErrors);
    } catch (e) {
      setDataError(`Laden fehlgeschlagen: ${(e as Error).message ?? e}. Stimmt die Admin-UID in den Firestore-Regeln?`);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  function reportFailures(results: PromiseSettledResult<unknown>[]) {
    const failed = results.filter(r => r.status === 'rejected').length;
    setDataError(failed ? `${failed} Löschvorgang/-vorgänge fehlgeschlagen.` : '');
  }

  async function deleteRoom(game: string, id: string) {
    const results = await Promise.allSettled([deleteDoc(doc(db, COL[game], id))]);
    reportFailures(results);
    if (results[0].status === 'fulfilled') setRooms(r => r.filter(x => x.id !== id || x.game !== game));
  }

  async function deleteError(id: string) {
    const results = await Promise.allSettled([deleteDoc(doc(db, 'errors', id))]);
    reportFailures(results);
    if (results[0].status === 'fulfilled') setErrors(e => e.filter(x => x.id !== id));
  }

  async function deleteAllErrors() {
    if (!errors.length || !window.confirm(`Alle ${errors.length} Fehlerberichte löschen?`)) return;
    const results = await Promise.allSettled(errors.map(e => deleteDoc(doc(db, 'errors', e.id))));
    reportFailures(results);
    const deleted = new Set(errors.filter((_, i) => results[i].status === 'fulfilled').map(e => e.id));
    setErrors(prev => prev.filter(e => !deleted.has(e.id)));
  }

  const isCleanupCandidate = (r: RoomRow) =>
    (r.status === 'finished' || r.players <= 1) && Date.now() - r.createdAt > CLEANUP_MIN_AGE_MS;

  async function cleanupRooms() {
    const toDelete = rooms.filter(isCleanupCandidate);
    if (!toDelete.length) return;
    const results = await Promise.allSettled(toDelete.map(r => deleteDoc(doc(db, COL[r.game], r.id))));
    reportFailures(results);
    const deleted = new Set(toDelete.filter((_, i) => results[i].status === 'fulfilled').map(r => r.game + r.id));
    setRooms(prev => prev.filter(x => !deleted.has(x.game + x.id)));
  }

  // ── Auth loading ──────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 1rem' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 15 }}>Laden…</span>
      </div>
    );
  }

  // ── Login screen ──────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 1.5rem' }}>
        <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 20, padding: '2rem 1.5rem', width: '100%', maxWidth: 360, textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <p style={{ fontWeight: 800, fontSize: 20, margin: '0 0 6px', color: 'var(--text)' }}>Developer Dashboard</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 28px' }}>Nur für autorisierte Nutzer</p>
          <button
            onClick={async () => { setSigningIn(true); setAuthError(''); try { await signInWithPopup(auth, provider); } catch { setAuthError('Login fehlgeschlagen.'); } finally { setSigningIn(false); } }}
            disabled={signingIn}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', padding: '12px 0', borderRadius: 13, border: '1.5px solid var(--border)', background: 'var(--card-inner)', color: 'var(--text)', fontWeight: 700, fontSize: 15, cursor: signingIn ? 'not-allowed' : 'pointer', opacity: signingIn ? 0.6 : 1 }}
          >
            <LogIn size={18} strokeWidth={2} />
            {signingIn ? 'Anmelden…' : 'Mit GitHub anmelden'}
          </button>
          {authError && (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--error, #e53e3e)', fontWeight: 600 }}>{authError}</p>
              <button onClick={() => window.location.replace('/')} className="secondary" style={{ width: '100%' }}>
                Zum Hauptmenü
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Stats ─────────────────────────────────────────────────────
  const statRooms = rooms.filter(r => r.game === 'busfahren').length;
  const statQuadrat = rooms.filter(r => r.game === 'quadrat').length;
  const statCircle = rooms.filter(r => r.game === 'circle').length;
  const activePlayers = rooms.reduce((s, r) => s + r.players, 0);
  const cleanupCount = rooms.filter(isCleanupCandidate).length;

  // ── Dashboard ─────────────────────────────────────────────────
  return (
    <div style={{ padding: '1.5rem 1rem 3rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontWeight: 800, fontSize: 19, margin: 0, color: 'var(--text)' }}>Dashboard</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>{user.email}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'monospace', wordBreak: 'break-all' }}>UID: {user.uid}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={loadData} disabled={dataLoading} style={{ ...btnBase, gap: 6, padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, boxShadow: 'none' }}>
            <RefreshCw size={14} strokeWidth={2} style={{ animation: dataLoading ? 'spin 1s linear infinite' : 'none' }} />
            {dataLoading ? 'Laden…' : 'Refresh'}
          </button>
          <button onClick={() => signOut(auth)} aria-label="Abmelden" title="Abmelden" style={{ ...btnBase, padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--card)', color: 'var(--text-muted)', boxShadow: 'none' }}>
            <LogOut size={14} strokeWidth={2} />
          </button>
        </div>
      </div>

      {dataError && (
        <div className="feedback wrong" style={{ marginBottom: 16, fontSize: 13 }}>{dataError}</div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Busfahren-Räume', value: statRooms },
          { label: 'Das Fenster-Räume', value: statQuadrat },
          { label: 'Circle-Räume', value: statCircle },
          { label: 'Spieler gesamt', value: activePlayers },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '14px 16px', boxShadow: 'var(--shadow-sm)' }}>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{value}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Fehlerberichte */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap', flexShrink: 0 }}>Fehlerberichte <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({errors.length})</span></p>
          {errors.length > 0 && (
            <button onClick={deleteAllErrors} style={actionBtn}>
              <Trash2 size={12} strokeWidth={2} /> Alle löschen
            </button>
          )}
        </div>
        {errors.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Keine Fehlerberichte
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {errors.map(e => (
              <div key={e.id} style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word' }}>{e.message}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatTs(e.timestamp)}</span>
                      {e.gameType && <GameBadge game={e.gameType} />}
                      {e.roomId && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{e.roomId}</span>}
                    </div>
                    {e.userAgent && (
                      <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.userAgent}</p>
                    )}
                  </div>
                  <button onClick={() => deleteError(e.id)} style={delBtn} aria-label="Fehlerbericht löschen" title="Löschen">
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Räume */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap', flexShrink: 0 }}>Räume <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({rooms.length})</span></p>
          {cleanupCount > 0 && (
            <button onClick={cleanupRooms} style={actionBtn}>
              <Trash2 size={12} strokeWidth={2} /> Cleanup ({cleanupCount})
            </button>
          )}
        </div>
        {rooms.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Keine Räume
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rooms.map(r => (
              <div key={r.id + r.game} style={{ background: 'var(--card)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: 'var(--text)', letterSpacing: '0.05em', minWidth: 44 }}>{r.id}</span>
                <GameBadge game={r.game} />
                <StatusBadge status={r.status} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{r.players}P · {formatAge(r.createdAt)}</span>
                <button onClick={() => deleteRoom(r.game, r.id)} style={delBtn} aria-label={`Raum ${r.id} löschen`} title="Löschen">
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
