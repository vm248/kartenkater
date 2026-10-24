import { useState } from 'react';
import { Grid3x3, Plus, LogIn, Monitor, X, Play } from 'lucide-react';
import { createQuadratRoom, joinQuadratRoom, createLocalQuadratRoom } from '../quadratActions';
import { getPlayerId } from '../gameActions';

interface Props {
  onJoined: (roomId: string, localPlayerIds?: string[]) => void;
  onBack: () => void;
  initialCode?: string;
}

export default function QuadratHome({ onJoined, onBack, initialCode }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('busfahren_name') ?? '');
  const [code, setCode] = useState(initialCode ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [localSetup, setLocalSetup] = useState(false);
  const [localPlayers, setLocalPlayers] = useState([
    { id: getPlayerId(), name: localStorage.getItem('busfahren_name') ?? '' },
    { id: crypto.randomUUID(), name: '' },
  ]);

  const playerId = getPlayerId();

  function saveName(v: string) {
    setName(v);
    localStorage.setItem('busfahren_name', v);
  }

  async function handleCreate() {
    if (!name.trim()) return setError('Bitte Namen eingeben.');
    setLoading(true);
    setError('');
    try {
      const roomId = await createQuadratRoom(playerId, name.trim());
      onJoined(roomId);
    } catch {
      setError('Fehler beim Erstellen. Bitte nochmal versuchen.');
    }
    setLoading(false);
  }

  async function handleJoin() {
    if (!name.trim()) return setError('Bitte Namen eingeben.');
    if (!code.trim()) return setError('Bitte Raumcode eingeben.');
    setLoading(true);
    setError('');
    try {
      const result = await joinQuadratRoom(code.trim(), playerId, name.trim());
      if (result.ok) {
        onJoined(code.trim().toUpperCase());
      } else {
        setError(result.error ?? 'Unbekannter Fehler.');
      }
    } catch {
      setError('Fehler beim Beitreten. Bitte nochmal versuchen.');
    }
    setLoading(false);
  }

  function updateLocalName(i: number, v: string) {
    setLocalPlayers(p => p.map((pl, idx) => idx === i ? { ...pl, name: v } : pl));
    if (i === 0) localStorage.setItem('busfahren_name', v);
  }

  function addLocalPlayer() {
    if (localPlayers.length >= 8) return;
    setLocalPlayers(p => [...p, { id: crypto.randomUUID(), name: '' }]);
  }

  function removeLocalPlayer(i: number) {
    setLocalPlayers(p => p.filter((_, idx) => idx !== i));
  }

  async function handleLocalStart() {
    // Player 1 carries this device's ID, so it must not be empty
    if (!localPlayers[0].name.trim()) return setError('Bitte zuerst Spieler 1 eintragen.');
    const filled = localPlayers.filter(p => p.name.trim());
    if (filled.length < 2) return setError('Mindestens 2 Namen eingeben.');
    setLoading(true);
    setError('');
    try {
      const players = filled.map(p => ({ id: p.id, name: p.name.trim() }));
      const roomId = await createLocalQuadratRoom(players);
      onJoined(roomId, players.map(p => p.id));
    } catch {
      setError('Fehler beim Erstellen.');
    }
    setLoading(false);
  }

  if (localSetup) {
    return (
      <div className="game-area">
        <button className="back-btn" onClick={() => { setLocalSetup(false); setError(''); }}>
          ‹ Zurück
        </button>
        <h1><Grid3x3 size={22} strokeWidth={1.75} /> Das Fenster</h1>
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, margin: '-12px 0 16px' }}>
          Lokal – ein Gerät für alle
        </p>

        <label>Spielernamen</label>
        {localPlayers.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="text"
              placeholder={i === 0 ? 'Spieler 1 (Pflicht)' : `Spieler ${i + 1}`}
              value={p.name}
              onChange={e => updateLocalName(i, e.target.value)}
              maxLength={20}
              style={{ flex: 1, marginBottom: 0 }}
            />
            {i >= 2 && (
              <button
                onClick={() => removeLocalPlayer(i)}
                style={{ width: 'auto', padding: '8px 12px', margin: 0, flexShrink: 0 }}
                aria-label={`Spieler ${i + 1} entfernen`}
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))}

        {localPlayers.length < 8 && (
          <button className="secondary" onClick={addLocalPlayer} style={{ marginBottom: 8 }}>
            <Plus size={16} strokeWidth={2.5} /> Spieler hinzufügen
          </button>
        )}

        {error && <div className="feedback wrong">{error}</div>}

        <button onClick={handleLocalStart} disabled={loading}>
          <Play size={16} strokeWidth={2} /> Lokal starten
        </button>
      </div>
    );
  }

  return (
    <div className="game-area">
      <button className="back-btn" onClick={onBack}>‹ Zurück</button>
      <h1><Grid3x3 size={22} strokeWidth={1.75} /> Das Fenster</h1>

      <label>Dein Name</label>
      <input
        type="text"
        placeholder="Max Mustermann"
        value={name}
        onChange={e => saveName(e.target.value)}
        maxLength={20}
      />

      {error && <div className="feedback wrong">{error}</div>}

      <button onClick={handleCreate} disabled={loading}>
        <Plus size={17} strokeWidth={2.5} /> {loading ? 'Erstelle Raum…' : 'Neuen Raum erstellen'}
      </button>

      <button className="secondary" onClick={() => { setError(''); setLocalSetup(true); }} disabled={loading}>
        <Monitor size={16} strokeWidth={2} /> Lokal (1 Gerät)
      </button>

      <div className="divider" />

      <label>Raumcode eingeben</label>
      <input
        type="text"
        placeholder="ABCD"
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        maxLength={4}
        style={{ letterSpacing: 6, fontWeight: 700 }}
      />

      <button className="secondary" onClick={handleJoin} disabled={loading}>
        <LogIn size={16} strokeWidth={2} /> {loading ? 'Verbinde…' : 'Raum beitreten'}
      </button>
    </div>
  );
}
