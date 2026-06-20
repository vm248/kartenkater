import { useState } from 'react';
import type { GameRoom, GameSettings } from '../types';
import { updateSettings, startGame, kickPlayer } from '../gameActions';

interface Props {
  room: GameRoom;
  playerId: string;
}

export default function Lobby({ room, playerId }: Props) {
  const isHost = room.hostId === playerId;
  const [settings, setSettings] = useState<GameSettings>(room.settings);
  const [saving, setSaving] = useState(false);

  async function handleSettingsChange(partial: Partial<GameSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    setSaving(true);
    await updateSettings(room.id, next);
    setSaving(false);
  }

  async function handleStart() {
    await startGame(room);
  }

  async function handleKick(targetId: string) {
    await kickPlayer(room, targetId);
  }

  return (
    <div className="game-area">
      <h1>🚌 Busfahren</h1>

      <h2>Raum beitreten</h2>
      <div className="room-code">{room.id}</div>
      <p style={{ textAlign: 'center', marginTop: 0, fontSize: 14, opacity: 0.7 }}>
        Anderen Spielern diesen Code mitteilen
      </p>

      <h3>👥 Spieler ({room.playerOrder.length})</h3>
      <ul className="player-list">
        {room.playerOrder.map(id => (
          <li key={id}>
            <span>
              {room.players[id]?.name}
              {id === room.hostId && <span className="badge">Host</span>}
              {id === playerId && <span className="badge" style={{ background: '#27ae60' }}>Du</span>}
            </span>
            {isHost && id !== playerId && (
              <button
                className="danger"
                style={{ width: 'auto', padding: '4px 10px', fontSize: 13, margin: 0 }}
                onClick={() => handleKick(id)}
              >
                ✕
              </button>
            )}
          </li>
        ))}
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

          <button
            onClick={handleStart}
            disabled={room.playerOrder.length < 2}
          >
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
