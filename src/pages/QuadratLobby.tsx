import { useState, useEffect, useRef } from 'react';
import { Grid3x3, LogOut, Play, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { QuadratRoom } from '../quadratTypes';
import { startQuadratGame, kickQuadratPlayer } from '../quadratActions';
import { MAX_PLAYERS } from '../roomUtils';
import { playerColor } from '../playerColors';
import RoomShareButtons from '../components/RoomShareButtons';

interface Props {
  room: QuadratRoom;
  playerId: string;
}

export default function QuadratLobby({ room, playerId }: Props) {
  const isHost = room.hostId === playerId;
  const [leaveMsg, setLeaveMsg] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [starting, setStarting] = useState(false);
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

  return (
    <div className="game-area">
      <h1><Grid3x3 size={22} strokeWidth={1.75} /> Das Fenster</h1>

      {!room.isLocal && (
        <>
          <h2>Raum-Code</h2>
          <div className="room-code">{room.id}</div>
          <RoomShareButtons roomId={room.id} game="quadrat" />
        </>
      )}

      {leaveMsg && (
        <div className="leave-toast" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LogOut size={14} strokeWidth={2} /> {leaveMsg}
        </div>
      )}

      <h3>Spieler ({room.playerOrder.length})</h3>
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
                  style={{ width: 'auto', padding: '8px 14px', fontSize: 13, margin: 0 }}
                  onClick={() => kickQuadratPlayer(room, id)}
                  aria-label={`${room.players[id]?.name} entfernen`}
                  title="Entfernen"
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="divider" />

      <div className="info-box" style={{ marginBottom: '1rem', fontSize: 13 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Kurzregeln</p>
        <p style={{ margin: '6px 0 0', opacity: 0.8, lineHeight: 1.6 }}>
          20 Karten im 5×5-Fenster, die 4 Ecken liegen offen. Du bleibst dran, solange du richtig rätst.<br />
          Bei gleichem Wert gibt es extra „Gleich" bzw. „Auf der Grenze".<br />
          Ab 1 Richtigem kannst du freiwillig weitergeben und Schlücke verteilen.<br />
          Falsch geraten → die Karte und alle damit verbundenen offenen Karten werden ersetzt, pro Karte 1 Schluck.<br />
          Wer die letzte der 16 verdeckten Karten richtig aufdeckt, verteilt 10 Schlücke.
        </p>
        <button
          className="secondary"
          onClick={() => setShowRules(r => !r)}
          style={{ width: 'auto', padding: '6px 14px', marginTop: 10, fontSize: 13 }}
        >
          {showRules ? <>Regeln ausblenden <ChevronUp size={14} /></> : <>Ausführliche Regeln <ChevronDown size={14} /></>}
        </button>

        {showRules && (
          <div style={{ marginTop: 12, lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Das Spielfeld</p>
            <p style={{ margin: '0 0 10px', opacity: 0.85 }}>
              Das Fenster ist ein 5×5-Raster mit 20 Karten (5 Felder bleiben leer).
              Die 4 <strong>Eckkarten (C)</strong> sind von Anfang an aufgedeckt und dienen als Vergleichskarten.
              Verfügbare Karten sind hervorgehoben – du tippst drauf und rätst.
            </p>

            <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Kartentypen & Ratmechanik</p>
            <p style={{ margin: '0 0 4px', opacity: 0.85 }}>
              <strong>Seitenkarten (S)</strong> – direkt neben den Ecken, sofort verfügbar.<br />
              Rate: <em>höher / tiefer / gleich</em> wie die benachbarte Eckkarte. „Gleich" gewinnt nur bei exakt gleichem Wert, bei gleichem Wert sind „Höher" und „Tiefer" falsch.
            </p>
            <p style={{ margin: '0 0 4px', opacity: 0.85 }}>
              <strong>Mittenkarten (M)</strong> – in der Mitte der Außenseiten, verfügbar wenn beide benachbarten Seitenkarten aufgedeckt sind.<br />
              Rate: <em>innerhalb / außerhalb</em> der zwei Seitenkarten – oder <em>auf der Grenze</em>, wenn sie genau einen der beiden Werte hat.
            </p>
            <p style={{ margin: '0 0 10px', opacity: 0.85 }}>
              <strong>Innenkarten (I)</strong> – zwischen den Mittenkarten, verfügbar wenn die benachbarte Mittenkarte aufgedeckt ist.<br />
              Rate: <em>höher / tiefer / gleich</em> wie die benachbarte Mittenkarte.
            </p>

            <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Zugablauf</p>
            <p style={{ margin: '0 0 4px', opacity: 0.85 }}>
              <strong>Richtig geraten:</strong> Karte wird aufgedeckt, du bleibst dran und kannst weitermachen oder freiwillig weitergeben.
            </p>
            <p style={{ margin: '0 0 4px', opacity: 0.85 }}>
              <strong>Weitergeben (ab 1 Richtigem):</strong> Du gibst deinen Zug ab und darfst so viele Schlücke verteilen, wie du in diesem Zug richtig geraten hast.
            </p>
            <p style={{ margin: '0 0 10px', opacity: 0.85 }}>
              <strong>Falsch geraten:</strong> Die falsche Karte und alle aufgedeckten Karten, die mit ihr verbunden sind (auch über die Ecken hinweg), werden durch neue ersetzt – die Ecken bleiben dabei offen. Du trinkst so viele Schlücke wie Karten ersetzt wurden. Dann ist der nächste Spieler dran.
            </p>

            <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Spielende</p>
            <p style={{ margin: 0, opacity: 0.85 }}>
              Wer die letzte der 16 verdeckten Karten richtig aufdeckt, gewinnt das Fenster und darf <strong>10 Schlücke</strong> frei unter allen anderen Spielern verteilen. Die im Zug gesammelten Schlücke verfallen dabei.
            </p>
          </div>
        )}
      </div>

      {isHost && (
        <>
          <button onClick={() => { if (!starting) { setStarting(true); startQuadratGame(room).finally(() => setStarting(false)); } }} disabled={room.playerOrder.length < 2 || starting}>
            <Play size={16} strokeWidth={2} /> Spiel starten
          </button>
          {room.playerOrder.length < 2 && (
            <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.6 }}>
              2+ Spieler nötig (max. {MAX_PLAYERS})
            </p>
          )}
        </>
      )}

      {!isHost && (
        <div className="waiting-text">Warte auf den Host…</div>
      )}
    </div>
  );
}
