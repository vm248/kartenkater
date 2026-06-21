import type { GameRoom } from '../types';
import CardComponent from '../components/CardComponent';
import PyramidGrid from '../components/PyramidGrid';
import Confetti from '../components/Confetti';
import {
  makeGuess,
  startPyramid,
  revealNextPyramidCard,
  initTiebreak,
  pickTiebreakCard,
  resolveTiebreak,
  startBusfahren,
  makeBusAnswer,
  continueAfterBusFail,
  reshuffleBusDeck,
  restartGame,
} from '../gameActions';
import { playerColor } from '../playerColors';

interface Props {
  room: GameRoom;
  playerId: string;
}

const STEP_NAMES = [
  'Frage 1: Rot oder Schwarz?',
  'Frage 2: Höher oder Tiefer?',
  'Frage 3: Innerhalb oder Außerhalb?',
  'Frage 4: Hast du das Symbol schon?',
];

const STEP_OPTIONS = [
  ['Rot', 'Schwarz'],
  ['Höher', 'Tiefer'],
  ['Innerhalb', 'Außerhalb'],
  ['Habe ich schon', 'Habe ich noch nicht'],
];

export default function Game({ room, playerId }: Props) {
  const isHost = room.hostId === playerId;
  const { status } = room;

  // --- Phase 1: Kartenraten ---
  if (status === 'phase1') {
    const currentPlayerId = room.playerOrder[room.currentPlayerIndex];
    const isMyTurn = currentPlayerId === playerId;
    const currentPlayer = room.players[currentPlayerId];
    const step = room.currentStep;
    const options = STEP_OPTIONS[step] ?? [];
    const la = room.lastAction;
    const myHand = room.players[playerId]?.hand ?? [];

    return (
      <div className="game-area">
        <h1>🚌 Busfahren</h1>
        <h2>{STEP_NAMES[step]}</h2>

        {la && (
          <div key={JSON.stringify(la)} className={`feedback ${la.correct ? 'correct' : 'wrong'}`}>
            {la.message}
            <div style={{ marginTop: 6 }}>
              <CardComponent card={la.card} />
            </div>
          </div>
        )}

        {isMyTurn ? (
          <>
            <p style={{ textAlign: 'center', fontWeight: 600 }}>Du bist dran!</p>
            <div className="choices">
              {options.map(opt => (
                <button key={opt} onClick={() => makeGuess(room, playerId, opt)}>
                  {opt}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="waiting-text">
            ⏳ {currentPlayer?.name ?? '?'} ist dran…
          </div>
        )}

        <div className="divider" />
        <h3>🃏 Deine Karten</h3>
        <div className="player-hand">
          {myHand.length === 0 ? (
            <span style={{ opacity: 0.5, fontSize: 14 }}>Noch keine Karten</span>
          ) : (
            <div className="card-row">
              {myHand.map((c, i) => <CardComponent key={i} card={c} />)}
            </div>
          )}
        </div>

        <div className="divider" />
        <h3>👥 Alle Spieler</h3>
        {room.playerOrder.map(id => {
          const color = playerColor(room.playerOrder, id);
          return (
            <div key={id} className="player-hand" style={{ marginBottom: 8, borderLeft: `3px solid ${color}` }}>
              <strong style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="player-dot" style={{ background: color }} />
                {room.players[id]?.name}
                {id === playerId && ' (Du)'}
                {id === currentPlayerId && ' 👈'}
              </strong>
              <div className="card-row" style={{ marginTop: 6 }}>
                {(room.players[id]?.hand ?? []).map((c, i) => (
                  id === playerId
                    ? <CardComponent key={i} card={c} />
                    : <CardComponent key={i} card={null} faceDown small />
                ))}
                {(room.players[id]?.hand ?? []).length === 0 && (
                  <span style={{ opacity: 0.4, fontSize: 13 }}>–</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // --- Phase 2 Start: Pyramidenmodus wählen ---
  if (status === 'phase2start') {
    return (
      <div className="game-area">
        <h1>🚌 Busfahren</h1>
        <h2>🧱 Pyramide</h2>
        <p style={{ textAlign: 'center' }}>Wie soll die Pyramide aufgedeckt werden?</p>
        {isHost ? (
          <div className="choices">
            <button onClick={() => startPyramid(room, 'top')}>🔼 Von oben</button>
            <button onClick={() => startPyramid(room, 'bottom')}>🔽 Von unten</button>
          </div>
        ) : (
          <div className="waiting-text">⏳ Warte auf den Host…</div>
        )}
      </div>
    );
  }

  // --- Phase 2: Pyramide ---
  if (status === 'phase2') {
    const done = room.pyramidIndex >= room.revealOrder.length;
    const myHand = room.players[playerId]?.hand ?? [];

    return (
      <div className="game-area">
        <h1>🚌 Busfahren</h1>
        <h2>🧱 Pyramidenphase</h2>

        <PyramidGrid pyramid={room.pyramid} rows={room.settings.pyramidRows} />

        {room.pyramidMatchText && (
          <div className="feedback" style={{ color: 'var(--primary)' }}>
            {room.pyramidMatchText}
          </div>
        )}

        {isHost && !done && (
          <button onClick={() => revealNextPyramidCard(room)}>
            Nächste Karte aufdecken
          </button>
        )}
        {!isHost && !done && (
          <div className="waiting-text" style={{ fontSize: 15 }}>
            ⏳ Host deckt Karten auf…
          </div>
        )}

        <div className="divider" />
        <h3>🃏 Deine verbleibenden Karten</h3>
        <div className="player-hand">
          {myHand.length === 0 ? (
            <span style={{ opacity: 0.5, fontSize: 14 }}>Keine Karten mehr – sehr gut! 🎉</span>
          ) : (
            <div className="card-row">
              {myHand.map((c, i) => <CardComponent key={i} card={c} />)}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Results: Busfahrer ermitteln ---
  if (status === 'results') {
    const candidates = room.tiebreakCandidates ?? [];
    const offered = room.tiebreakOffered;
    const picks = room.tiebreakPicks;
    const iAmCandidate = candidates.includes(playerId);
    const myPick = picks?.[playerId] ?? null;
    const allPicked = candidates.length > 0 && candidates.every(id => picks?.[id] != null);

    let winnerIds: string[] = [];
    if (allPicked && picks) {
      const maxVal = Math.max(...candidates.map(id => {
        const c = picks[id];
        return c ? (typeof c.value === 'number' ? c.value : { B: 11, D: 12, K: 13, A: 14 }[c.value as string] ?? 0) : 0;
      }));
      winnerIds = candidates.filter(id => {
        const c = picks[id];
        if (!c) return false;
        const v = typeof c.value === 'number' ? c.value : { B: 11, D: 12, K: 13, A: 14 }[c.value as string] ?? 0;
        return v === maxVal;
      });
    }

    return (
      <div className="game-area">
        <h1>🚌 Busfahren</h1>
        <h2>🚍 Busfahrer-Ermittlung</h2>

        {/* No tiebreak – winner known */}
        {!candidates.length && room.busfahrerName && (
          <div className="info-box">
            <p style={{ fontSize: 20, fontWeight: 700 }}>
              {room.busfahrerId === playerId
                ? '😱 Du musst Busfahren!'
                : `🚌 ${room.busfahrerName} muss Busfahren!`}
            </p>
          </div>
        )}
        {!candidates.length && room.busfahrerName && (
          isHost
            ? <button onClick={() => startBusfahren(room)}>🚌 Busfahren starten</button>
            : <div className="waiting-text">⏳ Warte auf den Host…</div>
        )}

        {/* Tiebreak: not yet started */}
        {candidates.length > 0 && !offered && (
          <div className="info-box">
            <p style={{ fontWeight: 700, fontSize: 16 }}>
              Gleichstand! Stechen zwischen: {candidates.map(id => room.players[id]?.name).join(' & ')}
            </p>
            {isHost
              ? <button style={{ marginTop: 8 }} onClick={() => initTiebreak(room)}>🃏 Stechen starten</button>
              : <div className="waiting-text" style={{ marginTop: 8 }}>⏳ Warte auf den Host…</div>}
          </div>
        )}

        {/* Tiebreak: picking phase */}
        {candidates.length > 0 && offered && !allPicked && (
          <div className="info-box">
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 10px' }}>
              🃏 Stechen – {candidates.map(id => room.players[id]?.name).join(' & ')}
            </p>
            {iAmCandidate && !myPick && (
              <>
                <p style={{ opacity: 0.7, fontSize: 13, margin: '0 0 10px' }}>Wähle eine Karte:</p>
                <div className="card-row" style={{ justifyContent: 'center', gap: 8 }}>
                  {offered[playerId]?.map((card, i) => (
                    <div
                      key={i}
                      onClick={() => pickTiebreakCard(room, playerId, card)}
                      style={{ cursor: 'pointer' }}
                    >
                      <CardComponent card={null} faceDown />
                    </div>
                  ))}
                </div>
              </>
            )}
            {iAmCandidate && myPick && (
              <>
                <p style={{ opacity: 0.7, fontSize: 13, margin: '0 0 6px' }}>Du hast gezogen:</p>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                  <CardComponent card={myPick} />
                </div>
              </>
            )}
            <div style={{ marginTop: 8 }}>
              {candidates.map(id => (
                <span key={id} style={{ fontSize: 13, opacity: 0.7, marginRight: 12 }}>
                  {room.players[id]?.name}: {picks?.[id] ? '✅' : '⏳'}
                </span>
              ))}
            </div>
            {!iAmCandidate && (
              <div className="waiting-text" style={{ marginTop: 8 }}>⏳ Spieler ziehen ihre Karten…</div>
            )}
          </div>
        )}

        {/* Tiebreak: all picked – reveal */}
        {candidates.length > 0 && offered && allPicked && picks && (
          <div className="info-box">
            <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 12px' }}>
              {winnerIds.length === 1
                ? `🎯 ${room.players[winnerIds[0]]?.name} hat die höchste Karte und muss fahren!`
                : `🤝 Gleichstand! Neues Stechen zwischen: ${winnerIds.map(id => room.players[id]?.name).join(' & ')}`}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 12 }}>
              {candidates.map(id => (
                <div key={id} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: playerColor(room.playerOrder, id) }}>
                    {room.players[id]?.name}
                  </div>
                  <CardComponent card={picks[id]} />
                </div>
              ))}
            </div>
            {isHost && (
              <button onClick={() => resolveTiebreak(room)}>
                {winnerIds.length === 1 ? '✅ Busfahrer bestätigen' : '🔄 Neues Stechen'}
              </button>
            )}
            {!isHost && <div className="waiting-text">⏳ Warte auf den Host…</div>}
          </div>
        )}

        <div className="divider" />
        <h3>Kartenübersicht</h3>
        {room.playerOrder.map(id => (
          <div key={id} className="player-hand" style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>
              {room.players[id]?.name} – {room.players[id]?.hand?.length ?? 0} Karten
            </strong>
            <div className="card-row" style={{ marginTop: 6 }}>
              {(room.players[id]?.hand ?? []).map((c, i) => (
                <CardComponent key={i} card={c} small />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // --- Phase 3: Busfahren ---
  if (status === 'phase3') {
    const isBusfahrer = room.busfahrerId === playerId;
    const prev = room.previousBusCards[room.busIndex] ?? null;
    const isHL = room.useHigherLower && prev !== null;
    const deckEmpty = room.deck.length === 0;

    return (
      <div className="game-area">
        <h1>🚌 Busfahren</h1>
        <h2>🚌 {room.busfahrerName} fährt Bus!</h2>

        <div style={{ marginBottom: 8 }}>
          <h3>Aktuelle Karten</h3>
          <div className="bus-grid">
            {room.busCards.map((c, i) => (
              <CardComponent key={i} card={c} faceDown={c === null} />
            ))}
          </div>
        </div>

        {room.previousBusCards.some(c => c !== null) && (
          <div style={{ marginBottom: 8 }}>
            <h3>Vergleichskarten</h3>
            <div className="bus-grid">
              {room.previousBusCards.map((c, i) => (
                <CardComponent key={i} card={c} faceDown={c === null} />
              ))}
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', opacity: 0.6, fontSize: 13 }}>
          🃏 {room.deck.length} Karten im Deck
        </p>

        {!room.awaitingContinue && room.busIndex < 5 && !deckEmpty && (
          <div className="card-display">
            {isHL && prev
              ? `Karte ${room.busIndex + 1}: Höher oder Tiefer als ${prev.value}${prev.suit}?`
              : `Karte ${room.busIndex + 1}: Rot oder Schwarz?`}
          </div>
        )}

        {deckEmpty && room.busIndex < 5 && (
          <div className="feedback wrong" style={{ marginBottom: 8 }}>
            🃏 Das Deck ist leer!
          </div>
        )}

        {isBusfahrer ? (
          room.awaitingContinue ? (
            <>
              <button onClick={() => continueAfterBusFail(room)}>
                😵 Nochmal von vorne!
              </button>
              <button
                onClick={() => restartGame(room)}
                style={{ marginTop: 8, background: 'var(--card-inner)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                🔁 Neue Runde
              </button>
            </>
          ) : deckEmpty && room.busIndex < 5 ? (
            <>
              <button onClick={() => reshuffleBusDeck(room)}>
                🔀 Neu mischen & weiterspielen
              </button>
              <button onClick={() => restartGame(room)} style={{ marginTop: 8, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                🏠 Deck leer – zurück zum Hauptmenü
              </button>
            </>
          ) : room.busIndex < 5 ? (
            <div className="choices">
              {(isHL ? ['Höher', 'Tiefer'] : ['Rot', 'Schwarz']).map(opt => (
                <button key={opt} onClick={() => makeBusAnswer(room, opt)}>{opt}</button>
              ))}
            </div>
          ) : null
        ) : (
          <div className="waiting-text" style={{ fontSize: 15 }}>
            {deckEmpty && room.busIndex < 5
              ? '🃏 Deck leer – wartet auf neues Mischen…'
              : `👀 ${room.busfahrerName} fährt gerade Bus…`}
          </div>
        )}
      </div>
    );
  }

  // --- Finished ---
  if (status === 'finished') {
    return (
      <>
        <Confetti />
        <div className="game-area">
          <h1>🚌 Busfahren</h1>
          <div className="info-box">
            <p style={{ fontSize: 24 }}>🎉</p>
            <p style={{ fontSize: 20, fontWeight: 700 }}>
              {room.busfahrerName} hat den Bus überlebt!
            </p>
            <p>Prost an alle! 🍻</p>
          </div>
          {isHost && (
            <button onClick={() => restartGame(room)}>
              🔁 Nochmal spielen
            </button>
          )}
          {!isHost && (
            <div className="waiting-text">⏳ Warte auf den Host…</div>
          )}
        </div>
      </>
    );
  }

  return null;
}
