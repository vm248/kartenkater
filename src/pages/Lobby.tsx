import { useState, useEffect, useRef } from 'react';
import type { GameRoom, GameSettings } from '../types';
import { updateSettings, startGame, kickPlayer } from '../gameActions';
import { playerColor } from '../playerColors';

interface Props {
  room: GameRoom;
  playerId: string;
}

export default function Lobby({ room, playerId }: Props) {
  const isHost = room.hostId === playerId;
  const [settings, setSettings] = useState<GameSettings>(room.settings);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
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
    const next = { ...settings, ...partial };
    setSettings(next);
    setSaving(true);
    await updateSettings(room.id, next);
    setSaving(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(room.id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="game-area">
      <h1>🚌 Busfahren</h1>

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
                  onClick={() => kickPlayer(room, id)}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {isHost && (
        <>
          <div className="divider" />
          <h3>⚙️ Einstellungen {saving && <span style={{ fontSize: 12, opacity: 0.6 }}>Speichert…</span>}</h3>

          <label>🃏 Kartendeck</label>
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

          <div className="settings-row">
            <label>🎴 Karten pro Runde (1–4)</label>
            <input
              type="number"
              min={1} max={4}
              value={settings.cardsPerRound}
              onChange={e => handleSettingsChange({ cardsPerRound: Number(e.target.value) })}
            />
          </div>

          <div className="settings-row">
            <label>🗂️ Decks (Raten & Pyramide)</label>
            <input
              type="number"
              min={1} max={3}
              value={settings.guessDeckCount}
              onChange={e => handleSettingsChange({ guessDeckCount: Number(e.target.value) })}
            />
          </div>

          <div className="settings-row">
            <label>🏗️ Pyramide (3–6 Reihen)</label>
            <input
              type="number"
              min={3} max={6}
              value={settings.pyramidRows}
              onChange={e => handleSettingsChange({ pyramidRows: Number(e.target.value) })}
            />
          </div>

          <div className="settings-row">
            <label>🔁 Decks (Busfahren)</label>
            <input
              type="number"
              min={1} max={3}
              value={settings.busDeckCount}
              onChange={e => handleSettingsChange({ busDeckCount: Number(e.target.value) })}
            />
          </div>

          <label>🥴 Schwierigkeit Busfahren</label>
          <div className="radio-group">
            <label>
              <input type="radio" checked={settings.busDifficulty === 'easy'}
                onChange={() => handleSettingsChange({ busDifficulty: 'easy' })} />
              <span><strong>Leicht</strong> – Nur "Höher oder Tiefer"</span>
            </label>
            <label>
              <input type="radio" checked={settings.busDifficulty === 'normal'}
                onChange={() => handleSettingsChange({ busDifficulty: 'normal' })} />
              <span><strong>Mittel</strong> – Start mit "Rot/Schwarz", ab Karte 5 "Höher/Tiefer"</span>
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
                  <div className="feedback wrong" style={{ marginBottom: 8 }}>
                    ⚠️ Zu wenige Karten! Brauche {needed}, habe {available}. Mehr Decks oder weniger Karten pro Runde wählen.
                  </div>
                )}
                <button
                  onClick={startGame.bind(null, room)}
                  disabled={room.playerOrder.length < 2 || tooFewCards}
                >
                  🚀 Spiel starten
                </button>
                {room.playerOrder.length < 2 && (
                  <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.6 }}>
                    Mindestens 2 Spieler nötig
                  </p>
                )}
              </>
            );
          })()}
        </>
      )}

      {!isHost && (
        <div className="waiting-text">⏳ Warte auf den Host…</div>
      )}
    </div>
  );
}
