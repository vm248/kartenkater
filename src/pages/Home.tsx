import { useState } from 'react';
import { createRoom, joinRoom, getPlayerId } from '../gameActions';

interface Props {
  onJoined: (roomId: string) => void;
}

export default function Home({ onJoined }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('busfahren_name') ?? '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      const roomId = await createRoom(playerId, name.trim());
      onJoined(roomId);
    } catch (e) {
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
      const result = await joinRoom(code.trim(), playerId, name.trim());
      if (result.ok) {
        onJoined(code.trim().toUpperCase());
      } else {
        setError(result.error ?? 'Unbekannter Fehler.');
      }
    } catch (e) {
      setError('Fehler beim Beitreten. Bitte nochmal versuchen.');
    }
    setLoading(false);
  }

  return (
    <div className="game-area">
      <h1>🚌 Busfahren</h1>

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
        🎉 Neuen Raum erstellen
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
        🚪 Raum beitreten
      </button>
    </div>
  );
}
