import { useState, useEffect, useRef } from 'react';
import { Circle, Copy, Check, Link, LogOut, Play, ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import type { CircleRoom } from '../circleTypes';
import { startCircleGame, kickCirclePlayer, updateCustomRules } from '../circleActions';
import { playerColor } from '../playerColors';

interface Props {
  room: CircleRoom;
  playerId: string;
}

export default function CircleLobby({ room, playerId }: Props) {
  const isHost = room.hostId === playerId;
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
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

  async function handleShareLink() {
    const url = `${window.location.origin}${window.location.pathname}?join=${room.id}&game=circle`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Kartenkater – Circle', url }); } catch {}
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      });
    }
  }

  return (
    <div className="game-area">
      <h1><Circle size={22} strokeWidth={1.75} /> Circle</h1>

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
                  onClick={() => kickCirclePlayer(room, id)}
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
          52 Karten im Kreis. Reihum eine Karte ziehen.<br />
          <strong>Zahl schwarz</strong> → selbst trinken · <strong>Zahl rot</strong> → verteilen<br />
          <strong>Bube</strong> → Daumenking (3× aktivierbar)<br />
          <strong>Dame</strong> → Regel aufstellen<br />
          <strong>König</strong> → Kategorie<br />
          <strong>4. Ass</strong> → Exen · <strong>Lücke reißen</strong> → Exen
        </p>
      </div>

      <CustomRulesSection room={room} isHost={isHost} />

      {isHost && (
        <>
          <button onClick={() => startCircleGame(room)} disabled={room.playerOrder.length < 2}>
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

function CustomRulesSection({ room, isHost }: { room: CircleRoom; isHost: boolean }) {
  const rules = room.customRules ?? [];
  const [open, setOpen] = useState(rules.length > 0);
  const [input, setInput] = useState('');

  function handleAdd() {
    const trimmed = input.trim();
    if (!trimmed) return;
    updateCustomRules(room, [...rules, trimmed]);
    setInput('');
  }

  function handleRemove(idx: number) {
    updateCustomRules(room, rules.filter((_, i) => i !== idx));
  }

  return (
    <div style={{
      width: '100%', marginBottom: '1rem',
      border: '1.5px solid var(--border)', borderRadius: 16,
      background: 'var(--card-inner)', overflow: 'hidden',
    }}>
      {/* Header – always visible, tap to expand */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', border: 'none', borderRadius: 0,
          padding: '12px 14px', margin: 0, boxShadow: 'none', cursor: 'pointer',
          color: 'var(--text)', transform: 'none',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13 }}>
          Eigene Regeln
          {rules.length > 0 && (
            <span style={{
              marginLeft: 8, background: 'var(--primary)', color: 'var(--btn-color)',
              borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 7px',
            }}>
              {rules.length}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Noch keine eigenen Regeln.
            </p>
          )}
          {rules.map((rule, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--card)', borderRadius: 10, padding: '8px 12px',
            }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{rule}</span>
              {isHost && (
                <button
                  onClick={() => handleRemove(idx)}
                  className="danger"
                  style={{ width: 'auto', padding: '3px 8px', fontSize: 12, margin: 0, flexShrink: 0 }}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>
          ))}

          {isHost && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="Neue Regel…"
                style={{
                  flex: 1, background: 'var(--card)', border: '1.5px solid var(--border)',
                  borderRadius: 10, padding: '8px 12px', fontSize: 13,
                  color: 'var(--text)', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleAdd}
                disabled={!input.trim()}
                style={{ width: 'auto', padding: '8px 12px', margin: 0, flexShrink: 0 }}
              >
                <Plus size={15} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
