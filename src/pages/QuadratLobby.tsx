import { useState, useEffect, useRef } from 'react';
import { Grid3x3, Copy, Check, Link, LogOut, Play } from 'lucide-react';
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
  const [linkCopied, setLinkCopied] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState('');
  const [showRules, setShowRules] = useState(false);
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

  async function handleShareLink() {
    const url = `${window.location.origin}${window.location.pathname}?join=${room.id}&game=quadrat`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Kartenkater – Das Fenster', url }); } catch {}
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
    }
  }

  return (
    <div className="game-area">
      <h1><Grid3x3 size={22} strokeWidth={1.75} /> Das Fenster</h1>

      <h2>Raum-Code</h2>
      <div className="room-code">{room.id}</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: '1rem' }}>
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? <><Check size={13} strokeWidth={2.5} /> Kopiert!</> : <><Copy size={13} /> Code kopieren</>}
        </button>
        <button className="copy-btn" onClick={handleShareLink}>
          {linkCopied ? <><Check size={13} strokeWidth={2.5} /> Link kopiert!</> : <><Link size={13} /> Link teilen</>}
        </button>
      </div>

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
        <p style={{ margin: '6px 0 0', opacity: 0.8, lineHeight: 1.6 }}>
          20 Karten im 5×5-Fenster. Du bleibst dran solange du richtig rätst.<br />
          Ab 1 Richtigem kannst du freiwillig weitergeben und Schlücke verteilen.<br />
          Falsch geraten → trinken + nächster Spieler.<br />
          Wer alle 20 Karten aufdeckt, verteilt 10 Schlücke.
        </p>
        <button
          className="secondary"
          onClick={() => setShowRules(r => !r)}
          style={{ width: 'auto', padding: '6px 14px', marginTop: 10, fontSize: 13 }}
        >
          {showRules ? 'Regeln ausblenden ▲' : 'Ausführliche Regeln ▼'}
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
              Rate: <em>höher / tiefer</em> als die benachbarte Eckkarte. Gleicher Wert = falsch.
            </p>
            <p style={{ margin: '0 0 4px', opacity: 0.85 }}>
              <strong>Mittenkarten (M)</strong> – in der Mitte der Außenseiten, verfügbar wenn beide benachbarten Seitenkarten aufgedeckt sind.<br />
              Rate: <em>innerhalb / außerhalb</em> der zwei Seitenkarten. Genau auf der Grenze = falsch.
            </p>
            <p style={{ margin: '0 0 10px', opacity: 0.85 }}>
              <strong>Innenkarten (I)</strong> – zwischen den Mittenkarten, verfügbar wenn die benachbarte Mittenkarte aufgedeckt ist.<br />
              Rate: <em>höher / tiefer</em> als die benachbarte Mittenkarte. Gleicher Wert = falsch.
            </p>

            <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Zugablauf</p>
            <p style={{ margin: '0 0 4px', opacity: 0.85 }}>
              <strong>Richtig geraten:</strong> Karte wird aufgedeckt, du bleibst dran und kannst weitermachen oder freiwillig weitergeben.
            </p>
            <p style={{ margin: '0 0 4px', opacity: 0.85 }}>
              <strong>Weitergeben (ab 1 Richtigem):</strong> Du gibst deinen Zug ab und darfst so viele Schlücke verteilen, wie du in diesem Zug richtig geraten hast.
            </p>
            <p style={{ margin: '0 0 10px', opacity: 0.85 }}>
              <strong>Falsch geraten:</strong> Die falsche Karte + alle direkt benachbarten aufgedeckten Karten werden entfernt und durch neue ersetzt. Du musst so viele Schlücke trinken wie Karten entfernt wurden. Dann ist der nächste Spieler dran.
            </p>

            <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Spielende</p>
            <p style={{ margin: 0, opacity: 0.85 }}>
              Wer alle 20 Karten aufdeckt, gewinnt das Fenster und darf <strong>10 Schlücke</strong> frei unter allen anderen Spielern verteilen.
            </p>
          </div>
        )}
      </div>

      {isHost && (
        <>
          <button onClick={() => startQuadratGame(room)} disabled={room.playerOrder.length < 2}>
            <Play size={16} strokeWidth={2} /> Spiel starten
          </button>
          {room.playerOrder.length < 2 && (
            <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.6 }}>
              Mindestens 2 Spieler nötig
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
