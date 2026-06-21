import { useState } from 'react';
import type { QuadratRoom, QCell } from '../quadratTypes';
import { isAvailable, COMPARISON, CELL_TYPES } from '../quadratLogic';
import { makeQuadratGuess, giveSip, finishSipDistribution, restartQuadratGame } from '../quadratActions';
import { playerColor } from '../playerColors';
import CardComponent from '../components/CardComponent';
import Confetti from '../components/Confetti';

interface Props {
  room: QuadratRoom;
  playerId: string;
}

function getGuessOptions(cell: QCell): string[] {
  if (cell.type === 'S') return ['drüber', 'drunter', 'gleich'];
  if (cell.type === 'M') return ['innerhalb', 'außerhalb'];
  return ['drüber', 'drunter'];
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

  const { status, grid, currentPlayerIndex, playerOrder, streak, lastAction, players } = room;
  const isHost = room.hostId === playerId;

  // --- Distributing phase ---
  if (status === 'distributing') {
    const isWinner = room.winnerId === playerId;
    return (
      <>
        <Confetti />
        <div className="game-area">
          <h1>🪟 Das Fenster</h1>
          <div className="info-box">
            <p style={{ fontSize: 24, margin: 0 }}>🎉</p>
            <p style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 4px' }}>
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
                          <span className="badge" style={{ background: '#e74c3c' }}>
                            {given}× 🍺
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
              🍺 {room.winnerName} verteilt Schlücke…
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
          <h1>🪟 Das Fenster</h1>
          <div className="info-box">
            <p style={{ fontSize: 24, margin: 0 }}>🎊</p>
            <p style={{ fontSize: 20, fontWeight: 700, margin: '8px 0 4px' }}>
              {room.winnerName} hat das Quadrat gelöst!
            </p>
            <p style={{ margin: 0 }}>Prost an alle! 🍻</p>
          </div>
          {isHost && (
            <button onClick={() => restartQuadratGame(room)}>🔁 Nochmal spielen</button>
          )}
          {!isHost && (
            <div className="waiting-text">⏳ Warte auf den Host…</div>
          )}
        </div>
      </>
    );
  }

  // --- Playing phase ---
  if (!grid || grid.length === 0) {
    return <div className="game-area"><div className="waiting-text">⏳ Lade Spiel…</div></div>;
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

  return (
    <div className="game-area">
      <h1>🪟 Das Fenster</h1>

      {/* Turn + streak */}
      <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
        <h2 style={{ margin: 0 }}>
          {isMyTurn ? '👉 Du bist dran!' : `⏳ ${players[currentPlayerId]?.name}…`}
        </h2>
        <div style={{ marginTop: 6, fontSize: 22, letterSpacing: 4 }}>
          {'✅'.repeat(streak)}{'⬜'.repeat(3 - streak)}
          <span style={{ fontSize: 13, opacity: 0.6, marginLeft: 8, letterSpacing: 0 }}>
            {streak}/3
          </span>
        </div>
      </div>

      {/* Last action feedback */}
      {lastAction && (
        <div className={`feedback ${lastAction.correct ? 'correct' : 'wrong'}`} style={{ marginBottom: '0.75rem' }}>
          {lastAction.correct
            ? `✅ ${lastAction.playerName}: „${lastAction.guess}" – Richtig!`
            : `❌ ${lastAction.playerName}: „${lastAction.guess}" – Falsch! ${lastAction.drinkCount}× trinken.`}
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
              <div
                key={cell.index}
                style={{
                  outline: isCorner ? '2px solid var(--accent)' : 'none',
                  borderRadius: 8,
                  display: 'inline-flex',
                }}
              >
                <CardComponent card={cell.card} small />
              </div>
            );
          }

          const available = isMyTurn && !loading && isAvailable(cell.index, grid);
          const isSelected = selectedCell === cell.index;

          return (
            <div
              key={cell.index}
              onClick={() => available && setSelectedCell(cell.index)}
              style={{
                cursor: available ? 'pointer' : 'default',
                borderRadius: 8,
                boxShadow: isSelected
                  ? '0 0 0 3px var(--secondary)'
                  : available
                  ? '0 0 8px var(--primary)'
                  : 'none',
                opacity: available ? 1 : 0.65,
                display: 'inline-flex',
                transition: 'box-shadow 0.15s',
              }}
            >
              <CardComponent card={null} faceDown small />
            </div>
          );
        })}
      </div>

      {/* Guess panel */}
      {selectedCellData && isMyTurn && (
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

      {isMyTurn && !selectedCellData && (
        <p style={{ textAlign: 'center', opacity: 0.6, fontSize: 14 }}>
          Tippe auf eine verfügbare Karte (leuchtendes Blau)
        </p>
      )}

      {/* Player list */}
      <div className="divider" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {playerOrder.map((id, i) => {
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
