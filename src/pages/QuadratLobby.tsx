import { useState, useEffect, useRef } from 'react';
import type { QuadratRoom } from '../quadratTypes';
import { startQuadratGame, kickQuadratPlayer } from '../quadratActions';
import { playerColor } from '../playerColors';

interface Props {
  room: QuadratRoom;
  playerId: string;
}

export default function QuadratLobby({ room, playerId }: Props) {
  const isHost = room.hostId === playerId;
  const [copied, setCopied] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState('');
  const prevOrderRef = useRef<string[]>(room.playerOrder);
  const prevPlayersRef = useRef(room.players);

  useEffect(() => {
    const prev = prevOrderRef.current;
    const left = prev.filter(id => !room.playerOrder.includes(id));
    if (left.length > 0) {
      const names = left.map(id => prevPlayersRef.current[id]?.name ?? 'Jemand');
      setLeaveMsg(`${names.join(', ')} hat den Raum verlassen.`);
      setTimeout(() => setLeaveMsg(''), 4000);
    }
    prevOrderRef.current = room.playerOrder;
    prevPlayersRef.current = room.players;
  }, [room.playerOrder]);

  function handleCopy() {
    navigator.clipboard.writeText(room.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="game-area">
      <h1>🪟 Das Fenster</h1>

      <h2>Raum-Code</h2>
      <div className="room-code">{room.id}</div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? '✅ Kopiert!' : '📋 Code kopieren'}
        </button>
      </div>

      {leaveMsg && <div className="leave-toast">🚪 {leaveMsg}</div>}

      <h3>👥 Spieler ({room.playerOrder.length})</h3>
      <ul className="player-list">
        {room.playerOrder.map(id => {
          const color = playerColor(room.playerOrder, id);
          return (
            <li key={id}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="player-dot" style={{ background: color }} />
                {room.players[id]?.name}
                {id === room.hostId && <span className="badge">Host</span>}
                {id === playerId && <span className="badge" style={{ background: '#27ae60' }}>Du</span>}
              </span>
              {isHost && id !== playerId && (
                <button
                  className="danger"
                  style={{ width: 'auto', padding: '4px 10px', fontSize: 13, margin: 0 }}
                  onClick={() => kickQuadratPlayer(room, id)}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="divider" />

      <div className="info-box" style={{ marginBottom: '1rem', fontSize: 13 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Kurzregeln</p>
        <p style={{ margin: '6px 0 0', opacity: 0.8, lineHeight: 1.5 }}>
          20 Karten im Quadrat. 3 richtig hintereinander → nächster Spieler.<br />
          Falsch → trinken (falsche Karte + alle angrenzenden offenen) → nächster Spieler.<br />
          Wer das Quadrat beendet, verteilt 10 Schlücke.
        </p>
      </div>

      {isHost && (
        <>
          <button onClick={() => startQuadratGame(room)} disabled={room.playerOrder.length < 2}>
            🚀 Spiel starten
          </button>
          {room.playerOrder.length < 2 && (
            <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.6 }}>
              Mindestens 2 Spieler nötig
            </p>
          )}
        </>
      )}

      {!isHost && (
        <div className="waiting-text">⏳ Warte auf den Host…</div>
      )}
    </div>
  );
}
