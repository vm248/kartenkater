import { useEffect, useRef, useState } from 'react';
import { Bus, ChevronUp, ChevronDown, RotateCcw, Play, Check, Shuffle, Layers, Clock, Hand } from 'lucide-react';
import type { Card, GameRoom } from '../types';
import { haptic } from '../haptic';
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
import {
  valueToNum, cardLabel, minDeckValue, impossibleHigherLower, impossibleInsideOutside,
  GUESS_EQUAL, GUESS_BORDER,
} from '../gameLogic';
import { playerColor } from '../playerColors';

interface Props {
  room: GameRoom;
  playerId: string;
  isLocalMode?: boolean;
  onLocalTurnDone?: () => void;
}

const STEP_NAMES = [
  'Frage 1: Rot oder Schwarz?',
  'Frage 2: Höher oder Tiefer?',
  'Frage 3: Innerhalb oder Außerhalb?',
  'Frage 4: Hast du die Farbe schon?',
];

const STEP_OPTIONS = [
  ['Rot', 'Schwarz'],
  ['Höher', GUESS_EQUAL, 'Tiefer'],
  ['Innerhalb', GUESS_BORDER, 'Außerhalb'],
  ['Habe ich schon', 'Habe ich noch nicht'],
];

/** Explains the current question with the player's own reference cards. */
function questionText(step: number, hand: Card[]): string {
  if (step === 0) return 'Ist deine nächste Karte rot oder schwarz?';
  if (step === 1 && hand[0]) return `Ist deine nächste Karte höher, tiefer oder gleich wie ${cardLabel(hand[0])}?`;
  if (step === 2 && hand[1]) {
    const [a, b] = [hand[0], hand[1]].sort((x, y) => valueToNum(x.value) - valueToNum(y.value));
    return `Liegt deine nächste Karte zwischen ${cardLabel(a)} und ${cardLabel(b)}, außerhalb oder genau auf einer der beiden?`;
  }
  if (step === 3) return 'Hast du die Farbe (♥ ♦ ♣ ♠) der nächsten Karte schon auf der Hand?';
  return '';
}

function impossibleOptions(step: number, hand: Card[], minValue: number): string[] {
  if (step === 1 && hand[0]) return impossibleHigherLower(valueToNum(hand[0].value), minValue);
  if (step === 2 && hand[1]) return impossibleInsideOutside(valueToNum(hand[0].value), valueToNum(hand[1].value), minValue);
  return [];
}

export default function Game({ room, playerId, isLocalMode, onLocalTurnDone }: Props) {
  // In local mode the whole table shares the device, so everyone can trigger host actions
  const isHost = isLocalMode || room.hostId === playerId;
  const { status } = room;
  const [busy, setBusy] = useState(false);
  const turnRef = useRef<HTMLDivElement>(null);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  }

  const lastActionKey = room.lastAction ? JSON.stringify(room.lastAction) : null;
  const prevLastActionRef = useRef(lastActionKey);
  useEffect(() => {
    if (room.lastAction && lastActionKey !== prevLastActionRef.current) {
      haptic(room.lastAction.correct ? 'success' : 'error');
    }
    prevLastActionRef.current = lastActionKey;
  }, [lastActionKey]);

  const isMyPhase1Turn = status === 'phase1' && room.playerOrder[room.currentPlayerIndex] === playerId;
  useEffect(() => {
    if (isMyPhase1Turn) turnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [isMyPhase1Turn]);

  // --- Phase 1: Kartenraten ---
  if (status === 'phase1') {
    const currentPlayerId = room.playerOrder[room.currentPlayerIndex];
    const isMyTurn = currentPlayerId === playerId;
    const currentPlayer = room.players[currentPlayerId];
    const step = room.currentStep;
    const options = STEP_OPTIONS[step] ?? [];
    const la = room.lastAction;
    const myHand = room.players[playerId]?.hand ?? [];
    const turnHand = currentPlayer?.hand ?? [];
    const impossible = impossibleOptions(step, turnHand, minDeckValue(room.settings));

    return (
      <div className="game-area">
        <h1><Bus size={22} strokeWidth={1.75} /> Busfahren</h1>
        <h2>{STEP_NAMES[step]}</h2>

        {isMyTurn ? (
          <div ref={turnRef} className="turn-banner">
            <p className="turn-banner-title">{isLocalMode ? `${currentPlayer?.name}, du bist dran!` : 'Du bist dran!'}</p>
            <p className="turn-banner-text">{questionText(step, turnHand)}</p>
            {step > 0 && turnHand.length > 0 && (
              <div className="card-row" style={{ justifyContent: 'center', margin: '8px 0 4px' }}>
                {turnHand.slice(0, step === 3 ? 3 : step).map((c, i) => <CardComponent key={i} card={c} small />)}
              </div>
            )}
            <p className="turn-banner-hint">Tippe deinen Tipp – dann wird deine Karte automatisch gezogen.</p>
            <div className="choices">
              {options.map(opt => (
                <button
                  key={opt}
                  onClick={() => run(() => makeGuess(room, playerId, opt))}
                  disabled={busy || impossible.includes(opt)}
                  title={impossible.includes(opt) ? 'Kann hier nicht gewinnen' : undefined}
                >
                  {opt}
                </button>
              ))}
            </div>
            {impossible.length > 0 && (
              <p className="turn-banner-hint" style={{ marginTop: 6 }}>
                Ausgegraut: kann mit diesen Karten nicht richtig sein.
              </p>
            )}
          </div>
        ) : onLocalTurnDone && la ? (
          <>
            <div key={JSON.stringify(la)} className={`feedback ${la.correct ? 'correct' : 'wrong'}`}>
              {la.message}
              <div style={{ marginTop: 6 }}>
                <CardComponent card={la.card} />
              </div>
            </div>
            {/* Local mode: player just made their guess, show result before handing off */}
            <button onClick={onLocalTurnDone} style={{ marginTop: 8 }}>
              <Check size={16} strokeWidth={2.5} /> Gesehen – Gerät weitergeben
            </button>
          </>
        ) : (
          <>
            {la && (
              <div key={JSON.stringify(la)} className={`feedback ${la.correct ? 'correct' : 'wrong'}`}>
                {la.message}
                <div style={{ marginTop: 6 }}>
                  <CardComponent card={la.card} />
                </div>
              </div>
            )}
            <div className="waiting-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Clock size={16} strokeWidth={2} /> {currentPlayer?.name ?? '?'} ist dran…
            </div>
          </>
        )}

        {isMyTurn && la && (
          <div key={JSON.stringify(la)} className={`feedback ${la.correct ? 'correct' : 'wrong'}`} style={{ fontSize: 13 }}>
            Vorher: {la.message}
          </div>
        )}

        <div className="divider" />
        <h3>{isLocalMode ? `Karten von ${room.players[playerId]?.name ?? ''}` : 'Deine Karten'}</h3>
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
        <h3>Alle Spieler</h3>
        {room.playerOrder.map(id => {
          const color = playerColor(room.playerOrder, id);
          const isCurrent = id === currentPlayerId;
          return (
            <div key={id} className="player-hand" style={{ marginBottom: 8, borderLeft: `3px solid ${color}`, outline: isCurrent ? `2px solid ${color}` : 'none' }}>
              <strong style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="player-dot" style={{ background: color }} />
                {room.players[id]?.name}
                {id === playerId && !isLocalMode && ' (Du)'}
                {isCurrent && <span className="badge" style={{ background: color }}>ist dran</span>}
              </strong>
              <div className="card-row" style={{ marginTop: 6 }}>
                {(room.players[id]?.hand ?? []).map((c, i) => (
                  id === playerId || isLocalMode
                    ? <CardComponent key={i} card={c} small={id !== playerId} />
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
    const la = room.lastAction;
    return (
      <div className="game-area">
        <h1><Bus size={22} strokeWidth={1.75} /> Busfahren</h1>

        {la && (
          <div key={JSON.stringify(la)} className={`feedback ${la.correct ? 'correct' : 'wrong'}`}>
            {la.message}
            <div style={{ marginTop: 6 }}>
              <CardComponent card={la.card} />
            </div>
          </div>
        )}

        <h2>Pyramide</h2>
        <p style={{ textAlign: 'center', fontSize: 14, color: 'var(--text-muted)' }}>
          Die Pyramide wird Karte für Karte aufgedeckt. Hast du eine Karte mit gleichem Wert,
          wird sie abgelegt und du darfst verteilen. Wer am Ende die meisten Karten hat, muss Busfahren.
        </p>
        {isHost ? (
          <>
            <p style={{ textAlign: 'center', fontWeight: 600 }}>In welcher Reihenfolge aufdecken?</p>
            <div className="choices">
              <button disabled={busy} onClick={() => run(() => startPyramid(room, 'top'))}><ChevronUp size={16} /> Von oben</button>
              <button disabled={busy} onClick={() => run(() => startPyramid(room, 'bottom'))}><ChevronDown size={16} /> Von unten</button>
            </div>
          </>
        ) : (
          <div className="waiting-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Clock size={16} strokeWidth={2} /> Warte auf den Host…
          </div>
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
        <h1><Bus size={22} strokeWidth={1.75} /> Busfahren</h1>
        <h2>Pyramidenphase</h2>

        <PyramidGrid pyramid={room.pyramid} rows={room.settings.pyramidRows} />

        {room.pyramidMatchText && (
          <div className="feedback" style={{ color: 'var(--primary)' }}>
            {room.pyramidMatchText}
          </div>
        )}

        {isHost && !done && (
          <button disabled={busy} onClick={() => run(() => revealNextPyramidCard(room))}>
            Nächste Karte aufdecken
          </button>
        )}
        {!isHost && !done && (
          <div className="waiting-text" style={{ fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Clock size={15} strokeWidth={2} /> Host deckt Karten auf…
          </div>
        )}

        <div className="divider" />
        {isLocalMode ? (
          <>
            <h3>Karten aller Spieler</h3>
            {room.playerOrder.map(id => {
              const hand = room.players[id]?.hand ?? [];
              return (
                <div key={id} className="player-hand" style={{ marginBottom: 8, borderLeft: `3px solid ${playerColor(room.playerOrder, id)}` }}>
                  <strong style={{ fontSize: 14 }}>{room.players[id]?.name}</strong>
                  <div className="card-row" style={{ marginTop: 6 }}>
                    {hand.length === 0
                      ? <span style={{ opacity: 0.5, fontSize: 13 }}>Keine Karten mehr</span>
                      : hand.map((c, i) => <CardComponent key={i} card={c} small />)}
                  </div>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <h3>Deine verbleibenden Karten</h3>
            <div className="player-hand">
              {myHand.length === 0 ? (
                <span style={{ opacity: 0.5, fontSize: 14 }}>Keine Karten mehr – sehr gut!</span>
              ) : (
                <div className="card-row">
                  {myHand.map((c, i) => <CardComponent key={i} card={c} />)}
                </div>
              )}
            </div>
          </>
        )}
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
      const maxVal = Math.max(...candidates.map(id => valueToNum(picks[id]!.value)));
      winnerIds = candidates.filter(id => valueToNum(picks[id]!.value) === maxVal);
    }

    return (
      <div className="game-area">
        <h1><Bus size={22} strokeWidth={1.75} /> Busfahren</h1>
        <h2>Busfahrer-Ermittlung</h2>

        {room.pyramidMatchText && (
          <div className="feedback" style={{ color: 'var(--primary)', fontSize: 14 }}>
            {room.pyramidMatchText}
          </div>
        )}

        {!candidates.length && room.busfahrerName && (
          <div className="info-box">
            <p style={{ fontSize: 20, fontWeight: 700 }}>
              {room.busfahrerId === playerId && !isLocalMode
                ? 'Du musst Busfahren!'
                : `${room.busfahrerName} muss Busfahren!`}
            </p>
          </div>
        )}
        {!candidates.length && room.busfahrerName && (
          isHost
            ? <button disabled={busy} onClick={() => run(() => startBusfahren(room))}><Play size={16} strokeWidth={2} /> Busfahren starten</button>
            : <div className="waiting-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Clock size={16} strokeWidth={2} /> Warte auf den Host…</div>
        )}

        {candidates.length > 0 && !offered && (
          <div className="info-box">
            <p style={{ fontWeight: 700, fontSize: 16 }}>
              Gleichstand! Stechen zwischen: {candidates.map(id => room.players[id]?.name).join(' & ')}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Jeder zieht verdeckt eine Karte – die höchste Karte muss fahren.
            </p>
            {isHost
              ? <button style={{ marginTop: 8 }} disabled={busy} onClick={() => run(() => initTiebreak(room))}><Layers size={15} /> Stechen starten</button>
              : <div className="waiting-text" style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Clock size={16} strokeWidth={2} /> Warte auf den Host…</div>}
          </div>
        )}

        {candidates.length > 0 && offered && !allPicked && (
          <div className="info-box">
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 10px' }}>
              Stechen – {candidates.map(id => room.players[id]?.name).join(' & ')}
            </p>
            {iAmCandidate && !myPick && (
              <>
                <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Hand size={16} strokeWidth={2} />
                  {isLocalMode ? `${room.players[playerId]?.name}, tippe auf eine Karte:` : 'Tippe auf eine Karte:'}
                </p>
                <div className="card-row" style={{ justifyContent: 'center', gap: 8 }}>
                  {offered[playerId]?.map((card, i) => (
                    <button
                      key={i}
                      className="card-pick"
                      disabled={busy}
                      aria-label={`Karte ${i + 1} ziehen`}
                      onClick={() => run(() => pickTiebreakCard(room, playerId, card))}
                    >
                      <CardComponent card={null} faceDown />
                    </button>
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
            <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {candidates.map(id => (
                <span key={id} style={{ fontSize: 13, opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {room.players[id]?.name}:{' '}
                  {picks?.[id]
                    ? <Check size={13} strokeWidth={2.5} color="#10B981" />
                    : <Clock size={13} strokeWidth={2} />}
                </span>
              ))}
            </div>
            {!iAmCandidate && (
              <div className="waiting-text" style={{ marginTop: 8 }}>Spieler ziehen ihre Karten…</div>
            )}
          </div>
        )}

        {candidates.length > 0 && offered && allPicked && picks && (
          <div className="info-box">
            <p style={{ fontWeight: 700, fontSize: 16, margin: '0 0 12px' }}>
              {winnerIds.length === 1
                ? `${room.players[winnerIds[0]]?.name} hat die höchste Karte und muss fahren!`
                : `Gleichstand! Neues Stechen zwischen: ${winnerIds.map(id => room.players[id]?.name).join(' & ')}`}
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
              <button disabled={busy} onClick={() => run(() => resolveTiebreak(room))}>
                {winnerIds.length === 1
                  ? <><Check size={15} strokeWidth={2.5} /> Busfahrer bestätigen</>
                  : <><RotateCcw size={15} /> Neues Stechen</>}
              </button>
            )}
            {!isHost && <div className="waiting-text">Warte auf den Host…</div>}
          </div>
        )}

        <div className="divider" />
        <h3>Kartenübersicht</h3>
        {room.playerOrder.map(id => {
          const count = room.players[id]?.hand?.length ?? 0;
          return (
            <div key={id} className="player-hand" style={{ marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>
                {room.players[id]?.name} – {count} {count === 1 ? 'Karte' : 'Karten'}
              </strong>
              <div className="card-row" style={{ marginTop: 6 }}>
                {(room.players[id]?.hand ?? []).map((c, i) => (
                  <CardComponent key={i} card={c} small />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // --- Phase 3: Busfahren ---
  if (status === 'phase3') {
    const isBusfahrer = room.busfahrerId === playerId;
    const prev = room.previousBusCards[room.busIndex] ?? null;
    const isHL = room.useHigherLower && prev !== null;
    const deckEmpty = room.deck.length === 0;
    const hlImpossible = isHL && prev ? impossibleHigherLower(valueToNum(prev.value), minDeckValue(room.settings)) : [];

    return (
      <div className="game-area">
        <h1><Bus size={22} strokeWidth={1.75} /> Busfahren</h1>
        <h2>{room.busfahrerName} fährt Bus!</h2>

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

        <p style={{ textAlign: 'center', opacity: 0.6, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <Layers size={13} strokeWidth={2} /> {room.deck.length} Karten im Deck
        </p>

        {room.awaitingContinue && (
          <div className="feedback wrong" style={{ marginBottom: 8 }}>
            Falsch – {room.busfahrerName} muss trinken und fängt von vorne an.
          </div>
        )}

        {!room.awaitingContinue && room.busIndex < 5 && !deckEmpty && (
          <div className="card-display">
            {isHL && prev
              ? `Karte ${room.busIndex + 1}: Höher, tiefer oder gleich wie ${cardLabel(prev)}?`
              : `Karte ${room.busIndex + 1}: Rot oder Schwarz?`}
          </div>
        )}

        {deckEmpty && room.busIndex < 5 && (
          <div className="feedback wrong" style={{ marginBottom: 8 }}>
            Das Deck ist leer!
          </div>
        )}

        {isBusfahrer ? (
          room.awaitingContinue ? (
            deckEmpty ? (
              <>
                <button disabled={busy} onClick={() => run(() => reshuffleBusDeck(room))}>
                  <Shuffle size={15} /> Neu mischen & weiterspielen
                </button>
                <button disabled={busy} onClick={() => run(() => restartGame(room))} className="secondary" style={{ marginTop: 8 }}>
                  <RotateCcw size={15} /> Neue Runde
                </button>
              </>
            ) : (
              <button disabled={busy} onClick={() => run(() => continueAfterBusFail(room))}>
                <Check size={16} strokeWidth={2.5} /> Getrunken – Nochmal von vorne!
              </button>
            )
          ) : deckEmpty && room.busIndex < 5 ? (
            <>
              <button disabled={busy} onClick={() => run(() => reshuffleBusDeck(room))}>
                <Shuffle size={15} /> Neu mischen & weiterspielen
              </button>
              <button disabled={busy} onClick={() => run(() => restartGame(room))} className="secondary" style={{ marginTop: 8 }}>
                <RotateCcw size={15} /> Neue Runde
              </button>
            </>
          ) : room.busIndex < 5 ? (
            <div className="choices">
              {(isHL ? ['Höher', GUESS_EQUAL, 'Tiefer'] : ['Rot', 'Schwarz']).map(opt => (
                <button
                  key={opt}
                  disabled={busy || hlImpossible.includes(opt)}
                  onClick={() => run(() => makeBusAnswer(room, opt))}
                >
                  {opt}
                </button>
              ))}
            </div>
          ) : null
        ) : (
          <div className="waiting-text" style={{ fontSize: 15 }}>
            {deckEmpty && room.busIndex < 5
              ? 'Deck leer – wartet auf neues Mischen…'
              : `${room.busfahrerName} fährt gerade Bus…`}
          </div>
        )}
      </div>
    );
  }

  // --- Finished ---
  if (status === 'finished') {
    const left = room.busfahrerLeft;
    return (
      <>
        {!left && <Confetti />}
        <div className="game-area">
          <h1><Bus size={22} strokeWidth={1.75} /> Busfahren</h1>
          <div className="info-box">
            <p style={{ fontSize: 20, fontWeight: 700 }}>
              {left
                ? `${room.busfahrerName ?? 'Der Busfahrer'} hat das Spiel verlassen.`
                : `${room.busfahrerName} hat den Bus überlebt!`}
            </p>
            {!left && room.busCards.every(c => c !== null) && (
              <div className="bus-grid" style={{ margin: '8px 0' }}>
                {room.busCards.map((c, i) => <CardComponent key={i} card={c} small />)}
              </div>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: 15, margin: 0 }}>Prost an alle!</p>
          </div>
          {isHost && (
            <button disabled={busy} onClick={() => run(() => restartGame(room))}>
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

  return null;
}
