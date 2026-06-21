import { useState } from 'react';
import { Grid3x3, Check, X, RotateCcw, Clock, Beer } from 'lucide-react';
import type { QuadratRoom, QCell } from '../quadratTypes';
import { isAvailable, COMPARISON, CELL_TYPES } from '../quadratLogic';
import { makeQuadratGuess, giveSip, finishSipDistribution, restartQuadratGame, passQuadratTurn, confirmQuadratDrink } from '../quadratActions';
import { playerColor } from '../playerColors';
import CardComponent from '../components/CardComponent';
import Confetti from '../components/Confetti';

interface Props {
  room: QuadratRoom;
  playerId: string;
}

function getGuessOptions(cell: QCell): string[] {
  if (cell.type === 'M') return ['Innerhalb', 'Außerhalb'];
  return ['Höher', 'Tiefer'];
}

function ComparisonDisplay({ cell, grid }: { cell: QCell; grid: QCell[] }) {
  const comp = COMPARISON[cell.index];
  if (cell.type === 'S') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Vergleichskarte:</span>
        <CardComponent card={grid[comp as number].card} small />
      </div>
    );
  }
  if (cell.type === 'M') {
    const [p1, p2] = comp as [number, number];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Grenzen:</span>
        <CardComponent card={grid[p1].card} small />
        <span style={{ opacity: 0.5 }}>–</span>
        <CardComponent card={grid[p2].card} small />
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, opacity: 0.7 }}>Vergleichskarte:</span>
      <CardComponent card={grid[comp as number].card} small />
    </div>
  );
}

export default function QuadratGame({ room, playerId }: Props) {
  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [passPopup, setPassPopup] = useState(false);

  const { status, grid, currentPlayerIndex, playerOrder, streak, lastAction, players, awaitingDrinkConfirm } = room;
  const isHost = room.hostId === playerId;

  // --- Distributing phase ---
  if (status === 'distributing') {
    const isWinner = room.winnerId === playerId;
    return (
      <>
        <Confetti />
        <div className="game-area">
          <h1><Grid3x3 size={22} strokeWidth={1.75} /> Das Fenster</h1>
          <p style={{ textAlign: 'center', fontSize: 12, opacity: 0.45, margin: '-8px 0 8px', letterSpacing: 2, fontWeight: 600 }}>
            {room.id}
          </p>
          <div className="info-box">
            <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
              {room.winnerName} hat das Quadrat gelöst!
            </p>
            {isWinner && (
              <p style={{ margin: 0, opacity: 0.8 }}>Verteile deine 10 Schlücke!</p>
            )}
          </div>

          {isWinner && (
            <>
              <p style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }}>
                Noch {room.sipsRemaining} Schlücke
              </p>
              <ul className="player-list">
                {playerOrder.filter(id => id !== playerId).map(id => {
                  const color = playerColor(playerOrder, id);
                  const given = room.sipsGiven?.[id] ?? 0;
                  return (
                    <li key={id}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="player-dot" style={{ background: color }} />
                        {players[id]?.name}
                        {given > 0 && (
                          <span className="badge" style={{ background: '#e74c3c', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {given}× <Beer size={10} strokeWidth={2} />
                          </span>
                        )}
                      </span>
                      <button
                        style={{ width: 'auto', padding: '6px 16px', margin: 0, fontSize: 15 }}
                        onClick={() => giveSip(room, id)}
                        disabled={room.sipsRemaining <= 0 || loading}
                      >
                        +1
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button onClick={() => finishSipDistribution(room)} style={{ marginTop: 8 }}>
                {room.sipsRemaining > 0 ? `Fertig (${room.sipsRemaining} übrig)` : 'Fertig'}
              </button>
            </>
          )}

          {!isWinner && (
            <div className="waiting-text">
              {room.winnerName} verteilt Schlücke…
            </div>
          )}
        </div>
      </>
    );
  }

  // --- Finished phase ---
  if (status === 'finished') {
    return (
      <>
        <Confetti />
        <div className="game-area">
          <h1><Grid3x3 size={22} strokeWidth={1.75} /> Das Fenster</h1>
          <p style={{ textAlign: 'center', fontSize: 12, opacity: 0.45, margin: '-8px 0 8px', letterSpacing: 2, fontWeight: 600 }}>
            {room.id}
          </p>
          <div className="info-box">
            <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
              {room.winnerName} hat das Quadrat gelöst!
            </p>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 15 }}>Prost an alle!</p>
          </div>
          {isHost && (
            <button onClick={() => restartQuadratGame(room)}>
              <RotateCcw size={15} /> Nochmal spielen
            </button>
          )}
          {!isHost && (
            <div className="waiting-text">Warte auf den Host…</div>
          )}
        </div>
      </>
    );
  }

  // --- Playing phase ---
  if (!grid || grid.length === 0) {
    return <div className="game-area"><div className="waiting-text">Lade Spiel…</div></div>;
  }

  const currentPlayerId = playerOrder[currentPlayerIndex];
  const isMyTurn = currentPlayerId === playerId;

  async function handleGuess(guess: string) {
    if (selectedCell === null || loading) return;
    setLoading(true);
    await makeQuadratGuess(room, selectedCell, guess, playerId);
    setSelectedCell(null);
    setLoading(false);
  }

  const selectedCellData = selectedCell !== null ? grid[selectedCell] : null;

  async function handlePass() {
    setLoading(true);
    await passQuadratTurn(room);
    setPassPopup(false);
    setLoading(false);
  }

  async function handleConfirmDrink() {
    setLoading(true);
    await confirmQuadratDrink(room);
    setLoading(false);
  }

  return (
    <div className="game-area">
      {passPopup && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{
            background: 'var(--card)', borderRadius: 18, padding: '28px 32px',
            textAlign: 'center', maxWidth: 300, width: '90%',
          }}>
            <Beer size={32} strokeWidth={1.5} color="var(--primary)" style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px' }}>
              Verteile {streak} Schlück{streak === 1 ? '' : 'e'}!
            </p>
            <p style={{ opacity: 0.6, fontSize: 14, margin: '0 0 20px' }}>
              Sag deinen Mitspielern wer trinken muss.
            </p>
            <button onClick={handlePass} disabled={loading}>Fertig</button>
          </div>
        </div>
      )}
      <h1><Grid3x3 size={22} strokeWidth={1.75} /> Das Fenster</h1>
      <p style={{ textAlign: 'center', fontSize: 12, opacity: 0.45, margin: '-8px 0 8px', letterSpacing: 2, fontWeight: 600 }}>
        {room.id}
      </p>

      {/* Turn + streak */}
      <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>
          {isMyTurn ? 'Du bist dran!' : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
              <Clock size={17} strokeWidth={2} /> {players[currentPlayerId]?.name}…
            </span>
          )}
        </h2>
        {streak > 0 && (
          <div style={{ marginTop: 6, fontSize: 14, opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <Beer size={14} strokeWidth={2} /> {streak} Schlück{streak === 1 ? '' : 'e'} zum Weitergeben
          </div>
        )}
      </div>

      {/* Last action feedback */}
      {lastAction && (
        <div key={JSON.stringify(lastAction)} className={`feedback ${lastAction.correct ? 'correct' : 'wrong'}`} style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
          {lastAction.correct
            ? <><Check size={14} strokeWidth={2.5} /> {lastAction.playerName}: „{lastAction.guess}" – Richtig!</>
            : <><X size={14} strokeWidth={2.5} /> {lastAction.playerName}: „{lastAction.guess}" – Falsch! {lastAction.drinkCount}× trinken.</>}
        </div>
      )}

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 5,
        margin: '1rem auto',
        width: 'fit-content',
      }}>
        {grid.map((cell) => {
          if (cell.type === null) {
            return <div key={cell.index} style={{ width: 44, height: 60 }} />;
          }

          if (cell.revealed) {
            const isCorner = cell.type === 'C';
            return (
              <div key={cell.index} style={{ display: 'inline-flex', lineHeight: 0 }}>
                <CardComponent card={cell.card} small slotClass={isCorner ? 'slot-corner' : undefined} />
              </div>
            );
          }

          const available = isMyTurn && !loading && !awaitingDrinkConfirm && isAvailable(cell.index, grid);
          const isSelected = selectedCell === cell.index;

          return (
            <div
              key={cell.index}
              onClick={() => available && setSelectedCell(cell.index)}
              style={{ cursor: available ? 'pointer' : 'default', display: 'inline-flex', lineHeight: 0 }}
            >
              <CardComponent
                card={null}
                faceDown
                small
                slotClass={isSelected ? 'slot-selected' : available ? 'slot-available' : 'slot-unavailable'}
              />
            </div>
          );
        })}
      </div>

      {/* Guess panel */}
      {selectedCellData && isMyTurn && !awaitingDrinkConfirm && (
        <div className="info-box" style={{ marginTop: '0.5rem' }}>
          <ComparisonDisplay cell={selectedCellData} grid={grid} />
          <div className="choices" style={{ marginTop: '0.75rem' }}>
            {getGuessOptions(selectedCellData).map(opt => (
              <button key={opt} onClick={() => handleGuess(opt)} disabled={loading}>
                {opt}
              </button>
            ))}
          </div>
          <button
            className="secondary"
            onClick={() => setSelectedCell(null)}
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            Abbrechen
          </button>
        </div>
      )}

      {isMyTurn && !selectedCellData && !awaitingDrinkConfirm && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ opacity: 0.6, fontSize: 14, margin: '0 0 8px' }}>
            Tippe auf eine hervorgehobene Karte
          </p>
          {streak >= 1 && (
            <button
              className="secondary"
              onClick={() => setPassPopup(true)}
              disabled={loading}
              style={{ width: 'auto', padding: '8px 20px' }}
            >
              Weitergeben ({streak} Schlück{streak === 1 ? '' : 'e'} verteilen)
            </button>
          )}
        </div>
      )}

      {awaitingDrinkConfirm && (
        isMyTurn ? (
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <p style={{ fontWeight: 700, fontSize: 18, margin: '0 0 12px' }}>
              {lastAction?.drinkCount}× trinken!
            </p>
            <button onClick={handleConfirmDrink} disabled={loading}>
              <Check size={16} strokeWidth={2.5} /> Getrunken – Weiter!
            </button>
          </div>
        ) : (
          <div className="waiting-text">
            {players[currentPlayerId]?.name} trinkt {lastAction?.drinkCount} Schlücke…
          </div>
        )
      )}

      {/* Player list */}
      <div className="divider" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {playerOrder.map((id) => {
          const color = playerColor(playerOrder, id);
          const isCurrent = id === currentPlayerId;
          return (
            <div
              key={id}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--card-inner)',
                padding: '4px 10px', borderRadius: 20, fontSize: 13,
                border: isCurrent ? `2px solid ${color}` : '2px solid transparent',
                fontWeight: isCurrent ? 700 : 400,
              }}
            >
              <span className="player-dot" style={{ background: color }} />
              {players[id]?.name}
              {id === playerId && ' (Du)'}
            </div>
          );
        })}
      </div>
    </div>
  );
}
