import { useState, useEffect, useRef } from 'react';
import { Bus, LogOut, Play, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';
import type { GameRoom, GameSettings } from '../types';
import { updateSettings, startGame, kickPlayer } from '../gameActions';
import { clampSettings } from '../gameLogic';
import { MAX_PLAYERS } from '../roomUtils';
import { playerColor } from '../playerColors';
import RoomShareButtons from '../components/RoomShareButtons';

interface Props {
  room: GameRoom;
  playerId: string;
}

export default function Lobby({ room, playerId }: Props) {
  const isHost = room.hostId === playerId;
  const [settings, setSettings] = useState<GameSettings>(room.settings);
  // Number inputs keep the raw text while typing; the clamped value is saved
  const [draft, setDraft] = useState<Partial<Record<keyof GameSettings, string>>>({});
  const [saving, setSaving] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [starting, setStarting] = useState(false);
  const settingsKey = JSON.stringify(room.settings);

  // Keep in sync with Firestore (other tab, or after becoming host)
  useEffect(() => {
    if (!saving) setSettings(room.settings);
  }, [settingsKey]);
  const [leaveMsg, setLeaveMsg] = useState('');
  const prevOrderRef = useRef<string[]>(room.playerOrder);
  const prevPlayersRef = useRef(room.players);

  useEffect(() => {
    const prev = prevOrderRef.current;
    const current = room.playerOrder;
    const left = prev.filter(id => !current.includes(id));
    if (left.length > 0) {
      const names = left.map(id => prevPlayersRef.current[id]?.name ?? 'Jemand');
      setLeaveMsg(`${names.join(', ')} hat den Raum verlassen.`);
      setTimeout(() => setLeaveMsg(''), 4000);
    }
    prevOrderRef.current = current;
    prevPlayersRef.current = room.players;
  }, [room.playerOrder]);

  async function handleSettingsChange(partial: Partial<GameSettings>) {
    const next = clampSettings({ ...settings, ...partial });
    setSettings(next);
    setSaving(true);
    try { await updateSettings(room.id, next); } finally { setSaving(false); }
  }

  function numberInput(key: 'cardsPerRound' | 'guessDeckCount' | 'pyramidRows' | 'busDeckCount', label: string, min: number, max: number) {
    const id = `setting-${key}`;
    return (
      <div className="settings-row">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min} max={max}
          value={draft[key] ?? String(settings[key])}
          onChange={e => {
            const raw = e.target.value;
            setDraft(d => ({ ...d, [key]: raw }));
            const n = Number(raw);
            if (raw !== '' && Number.isInteger(n) && n >= min && n <= max) handleSettingsChange({ [key]: n });
          }}
          onBlur={() => {
            const raw = draft[key];
            setDraft(d => { const rest = { ...d }; delete rest[key]; return rest; });
            if (raw !== undefined) handleSettingsChange({ [key]: raw === '' ? settings[key] : Number(raw) });
          }}
        />
      </div>
    );
  }

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    try { await startGame(room); } finally { setStarting(false); }
  }

  return (
    <div className="game-area">
      <h1><Bus size={22} strokeWidth={1.75} /> Busfahren</h1>

      {!room.isLocal && (
        <>
          <h2>Raum-Code</h2>
          <div className="room-code">{room.id}</div>
          <RoomShareButtons roomId={room.id} game="busfahren" />
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
                  onClick={() => kickPlayer(room, id)}
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
          <strong>1. Raten:</strong> Wer dran ist, tippt eine Antwort – dann wird die Karte automatisch gezogen.
          Richtig → verteilen, falsch → trinken.<br />
          <strong>2. Pyramide:</strong> Karten werden aufgedeckt. Hast du den gleichen Wert, legst du ab und verteilst.<br />
          <strong>3. Busfahren:</strong> Wer am Ende die meisten Karten hat, fährt Bus.
        </p>
        <button
          className="secondary"
          onClick={() => setShowRules(r => !r)}
          style={{ width: 'auto', padding: '6px 14px', marginTop: 10, fontSize: 13 }}
        >
          {showRules ? <>Regeln ausblenden <ChevronUp size={14} /></> : <>Ausführliche Regeln <ChevronDown size={14} /></>}
        </button>
        {showRules && (
          <div style={{ marginTop: 12, lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 12, opacity: 0.85 }}>
            <p style={{ margin: '0 0 6px' }}><strong>Frage 1:</strong> Rot oder Schwarz?</p>
            <p style={{ margin: '0 0 6px' }}><strong>Frage 2:</strong> Höher, tiefer oder gleich wie deine erste Karte? „Gleich" gewinnt nur bei exakt gleichem Wert.</p>
            <p style={{ margin: '0 0 6px' }}><strong>Frage 3:</strong> Liegt die Karte zwischen deinen ersten beiden Karten, außerhalb oder genau auf einer der beiden („Auf der Grenze")?</p>
            <p style={{ margin: '0 0 6px' }}><strong>Frage 4:</strong> Hast du die Farbe (♥ ♦ ♣ ♠) schon auf der Hand?</p>
            <p style={{ margin: '0 0 6px' }}><strong>Pyramide:</strong> Der Host deckt Karte für Karte auf. Jede Handkarte mit gleichem Wert wird abgelegt – pro Karte darfst du einen Schluck verteilen.</p>
            <p style={{ margin: '0 0 6px' }}><strong>Busfahrer:</strong> Wer danach die meisten Karten hat, fährt Bus. Bei Gleichstand wird gestochen: Jeder zieht eine verdeckte Karte, die höchste fährt.</p>
            <p style={{ margin: 0 }}><strong>Busfahren:</strong> 5 Karten nacheinander richtig raten. Bei einem Fehler wird getrunken und von vorne begonnen.</p>
          </div>
        )}
      </div>

      {isHost && (
        <>
          <h3>Einstellungen {saving && <span style={{ fontSize: 12, opacity: 0.6, textTransform: 'none', letterSpacing: 0 }}>Speichert…</span>}</h3>

          <label>Kartendeck</label>
          <div className="radio-group" style={{ flexDirection: 'row', gap: 20, marginBottom: '1rem' }}>
            <label>
              <input
                type="radio"
                checked={settings.deckType === 'skat'}
                onChange={() => handleSettingsChange({ deckType: 'skat' })}
              />
              Skat (32)
            </label>
            <label>
              <input
                type="radio"
                checked={settings.deckType === 'full'}
                onChange={() => handleSettingsChange({ deckType: 'full' })}
              />
              Komplett (52)
            </label>
          </div>

          {numberInput('cardsPerRound', 'Karten pro Runde (1–4)', 1, 4)}
          {numberInput('guessDeckCount', 'Decks (Raten & Pyramide, 1–3)', 1, 3)}
          {numberInput('pyramidRows', 'Pyramide (3–6 Reihen)', 3, 6)}
          {numberInput('busDeckCount', 'Decks (Busfahren, 1–3)', 1, 3)}

          <label>Schwierigkeit Busfahren</label>
          <div className="radio-group">
            <label>
              <input type="radio" checked={settings.busDifficulty === 'easy'}
                onChange={() => handleSettingsChange({ busDifficulty: 'easy' })} />
              <span><strong>Leicht</strong> – Nur "Höher, Tiefer oder Gleich"</span>
            </label>
            <label>
              <input type="radio" checked={settings.busDifficulty === 'normal'}
                onChange={() => handleSettingsChange({ busDifficulty: 'normal' })} />
              <span><strong>Mittel</strong> – "Rot oder Schwarz"; wer an Karte 5 scheitert, spielt ab dann "Höher/Tiefer"</span>
            </label>
            <label>
              <input type="radio" checked={settings.busDifficulty === 'schwer'}
                onChange={() => handleSettingsChange({ busDifficulty: 'schwer' })} />
              <span><strong>Schwer</strong> – Nur "Rot oder Schwarz"</span>
            </label>
          </div>

          <div className="divider" />

          {(() => {
            const deckSize = settings.deckType === 'skat' ? 32 : 52;
            const available = deckSize * settings.guessDeckCount;
            const pyramidCards = settings.pyramidRows * (settings.pyramidRows + 1) / 2;
            const needed = settings.cardsPerRound * room.playerOrder.length + pyramidCards;
            const tooFewCards = needed > available;
            return (
              <>
                {tooFewCards && (
                  <div className="feedback wrong" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={15} strokeWidth={2} />
                    Zu wenige Karten! Brauche {needed}, habe {available}. Mehr Decks oder weniger Karten pro Runde wählen.
                  </div>
                )}
                <button
                  onClick={handleStart}
                  disabled={room.playerOrder.length < 2 || tooFewCards || starting}
                >
                  <Play size={16} strokeWidth={2} /> Spiel starten
                </button>
                {room.playerOrder.length < 2 && (
                  <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.6 }}>
                    2+ Spieler nötig (max. {MAX_PLAYERS})
                  </p>
                )}
              </>
            );
          })()}
        </>
      )}

      {!isHost && (
        <div className="waiting-text">Warte auf den Host…</div>
      )}
    </div>
  );
}
