import type { GameRoom } from '../types';
import CardComponent from '../components/CardComponent';
import PyramidGrid from '../components/PyramidGrid';
import {
  makeGuess,
  startPyramid,
  revealNextPyramidCard,
  doTiebreak,
  startBusfahren,
  makeBusAnswer,
  continueAfterBusFail,
  reshuffleBusDeck,
  restartGame,
} from '../gameActions';

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
          <div className={`feedback ${la.correct ? 'correct' : 'wrong'}`}>
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
        {room.playerOrder.map(id => (
          <div key={id} className="player-hand" style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>
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
        ))}
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
    const hasTiebreak = room.tiebreakCandidates && room.tiebreakCandidates.length > 0;

    return (
      <div className="game-area">
        <h1>🚌 Busfahren</h1>
        <h2>🚍 Busfahrer-Ermittlung</h2>

        <div className="info-box">
          {room.busfahrerName && !hasTiebreak ? (
            <>
              <p style={{ fontSize: 20, fontWeight: 700 }}>
                {room.busfahrerName === room.players[playerId]?.name
                  ? '😱 Du musst Busfahren!'
                  : `🚌 ${room.busfahrerName} muss Busfahren!`}
              </p>
            </>
          ) : hasTiebreak ? (
            <>
              <p>Gleichstand! Stechen zwischen:</p>
              <p style={{ fontWeight: 700 }}>
                {room.tiebreakCandidates!.map(id => room.players[id]?.name).join(' & ')}
              </p>
              {isHost && (
                <button onClick={() => doTiebreak(room)}>🎲 Stechen durchführen</button>
              )}
            </>
          ) : (
            <p>Wird ermittelt…</p>
          )}
        </div>

        {room.busfahrerName && !hasTiebreak && (
          <>
            {isHost ? (
              <button onClick={() => startBusfahren(room)}>
                🚌 Busfahren starten
              </button>
            ) : (
              <div className="waiting-text">⏳ Warte auf den Host…</div>
            )}
          </>
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
            <button onClick={() => continueAfterBusFail(room)}>
              😵 Nochmal von vorne!
            </button>
          ) : deckEmpty && room.busIndex < 5 ? (
            <button onClick={() => reshuffleBusDeck(room)}>
              🔀 Neu mischen & weiterspielen
            </button>
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
    );
  }

  return null;
}
