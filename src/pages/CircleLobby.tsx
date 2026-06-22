import { useState, useEffect, useRef, useCallback } from 'react';
import { Circle, Copy, Check, Link, LogOut, Play, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { CircleRoom } from '../circleTypes';
import { startCircleGame, kickCirclePlayer, updateCardRules } from '../circleActions';
import { playerColor } from '../playerColors';

interface Props {
  room: CircleRoom;
  playerId: string;
}

// Keys must match CardValue from types.ts: numbers 2-10, 'B' (Bube), 'D' (Dame), 'K' (König), 'A' (Ass)
const CARD_VALUES = ['2','3','4','5','6','7','8','9','10','B','D','K','A'];

const CARD_DISPLAY: Record<string, string> = {
  '2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9','10':'10',
  'B':'Bube','D':'Dame','K':'König','A':'Ass',
};

const CARD_STANDARD_RULES: Record<string, string> = {
  '2':  'Schwarz: 2 trinken · Rot: 2 verteilen',
  '3':  'Schwarz: 3 trinken · Rot: 3 verteilen',
  '4':  'Schwarz: 4 trinken · Rot: 4 verteilen',
  '5':  'Schwarz: 5 trinken · Rot: 5 verteilen',
  '6':  'Schwarz: 6 trinken · Rot: 6 verteilen',
  '7':  'Schwarz: 7 trinken · Rot: 7 verteilen',
  '8':  'Schwarz: 8 trinken · Rot: 8 verteilen',
  '9':  'Schwarz: 9 trinken · Rot: 9 verteilen',
  '10': 'Schwarz: 10 trinken · Rot: 10 verteilen',
  'B':  'Daumenking (3× nutzbar)',
  'D':  'Regel aufstellen',
  'K':  'Kategorie nennen',
  'A':  '1.–3. Ass normal · 4. Ass: alle exen',
};


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
          52 Karten im Kreis. Reihum eine Karte ziehen.<br />
          <strong>Zahl schwarz</strong> → selbst trinken · <strong>Zahl rot</strong> → verteilen<br />
          <strong>Bube</strong> → Daumenking (3× aktivierbar)<br />
          <strong>Dame</strong> → Regel aufstellen<br />
          <strong>König</strong> → Kategorie<br />
          <strong>4. Ass</strong> → Exen · <strong>Lücke reißen</strong> → Exen
        </p>
      </div>

      <CardRulesSection room={room} isHost={isHost} />

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

function CardRulesSection({ room, isHost }: { room: CircleRoom; isHost: boolean }) {
  const [open, setOpen] = useState(false);
  const [localRules, setLocalRules] = useState<Record<string, string>>(room.cardRules ?? {});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRules = room.cardRules ?? {};
  const customCount = Object.keys(cardRules).length;

  // Keep local state in sync when Firestore updates (e.g. from another client)
  useEffect(() => { setLocalRules(room.cardRules ?? {}); }, [room.cardRules]);

  const handleChange = useCallback((cardValue: string, rule: string) => {
    const updated = { ...localRules };
    if (!rule) {
      delete updated[cardValue];
    } else {
      updated[cardValue] = rule;
    }
    setLocalRules(updated);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateCardRules(room, updated);
    }, 500);
  }, [localRules, room]);

  return (
    <div style={{
      width: '100%', marginBottom: '1rem',
      border: '1.5px solid var(--border)', borderRadius: 16,
      background: 'var(--card-inner)', overflow: 'hidden',
    }}>
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
          Regeln anpassen
          {customCount > 0 && (
            <span style={{
              marginLeft: 8, background: 'var(--primary)', color: 'var(--btn-color)',
              borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 7px',
            }}>
              {customCount} geändert
            </span>
          )}
        </span>
        {open ? <ChevronUp size={16} strokeWidth={2} /> : <ChevronDown size={16} strokeWidth={2} />}
      </button>

      {open && (
        <div style={{ padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {CARD_VALUES.map(cv => {
            const current = localRules[cv] ?? '';
            const isModified = !!cardRules[cv];
            return (
              <div key={cv} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--card)', borderRadius: 10, padding: '7px 10px',
                border: `1.5px solid ${isModified ? 'var(--primary)' : 'var(--border)'}`,
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 800,
                  color: isModified ? 'var(--primary)' : 'var(--text-muted)',
                  minWidth: 34, flexShrink: 0,
                }}>
                  {CARD_DISPLAY[cv]}
                </span>
                {isHost ? (
                  <input
                    type="text"
                    value={current}
                    onChange={e => handleChange(cv, e.target.value)}
                    placeholder={CARD_STANDARD_RULES[cv]}
                    style={{
                      flex: 1, background: 'var(--input-bg)',
                      border: '1.5px solid var(--border)', borderRadius: 8,
                      padding: '4px 8px', fontSize: 12, fontWeight: 600,
                      color: 'var(--text)', fontFamily: 'inherit',
                      minWidth: 0, outline: 'none', margin: 0,
                      textAlign: 'left',
                    }}
                  />
                ) : (
                  <span style={{
                    flex: 1, fontSize: 12, fontWeight: 600,
                    color: isModified ? 'var(--text)' : 'var(--text-muted)',
                  }}>
                    {current || CARD_STANDARD_RULES[cv]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
