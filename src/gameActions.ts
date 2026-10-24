import { doc, updateDoc, deleteDoc, deleteField, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { GameRoom, GameSettings, Card, Player } from './types';
import {
  createDeck, createPyramid, buildRevealOrder, evaluateGuess, valueToNum,
  evaluateHigherLower, clampSettings, busfahrerCandidates, cardLabel,
} from './gameLogic';
import { createRoomDoc, updateRoomTx, roomExpiry, joinRoomTx } from './roomUtils';

const COL = 'rooms';

async function cleanupOldRooms(): Promise<void> {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const [oldSnap, emptySnap] = await Promise.all([
      getDocs(query(collection(db, COL), where('createdAt', '<', cutoff))),
      getDocs(query(collection(db, COL), where('playerOrder', '==', []))),
    ]);
    const refs = new Map([...oldSnap.docs, ...emptySnap.docs].map(d => [d.id, d.ref]));
    await Promise.all([...refs.values()].map(ref => deleteDoc(ref)));
  } catch {
    // cleanup failure should not block room creation
  }
}

export function getPlayerId(): string {
  let id = localStorage.getItem('busfahren_pid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('busfahren_pid', id);
  }
  return id;
}

const DEFAULT_SETTINGS: GameSettings = {
  deckType: 'skat',
  guessDeckCount: 1,
  busDeckCount: 1,
  pyramidRows: 3,
  cardsPerRound: 3,
  busDifficulty: 'normal',
};

function newRoom(code: string, hostId: string, players: Record<string, Player>, playerOrder: string[], isLocal: boolean): GameRoom {
  return {
    id: code,
    status: 'lobby',
    hostId,
    settings: DEFAULT_SETTINGS,
    players,
    playerOrder,
    deck: [],
    currentStep: 0,
    currentPlayerIndex: 0,
    pyramid: [],
    revealOrder: [],
    pyramidIndex: 0,
    busfahrerId: null,
    busfahrerName: null,
    tiebreakCandidates: null,
    tiebreakOffered: null,
    tiebreakPicks: null,
    busCards: [null, null, null, null, null],
    previousBusCards: [null, null, null, null, null],
    busIndex: 0,
    useHigherLower: false,
    awaitingContinue: false,
    lastFailedIndex: 0,
    lastAction: null,
    pyramidMatchText: null,
    busfahrerLeft: false,
    isLocal,
    createdAt: Date.now(),
    expireAt: roomExpiry(),
  };
}

export async function createRoom(playerId: string, playerName: string): Promise<string> {
  cleanupOldRooms(); // fire and forget – löscht Räume älter als 24h
  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };
  return createRoomDoc(COL, code => newRoom(code, playerId, { [playerId]: player }, [playerId], false));
}

export async function createLocalRoom(players: { id: string; name: string }[]): Promise<string> {
  cleanupOldRooms();
  const playerMap: Record<string, Player> = {};
  const playerOrder: string[] = [];
  for (const p of players) {
    playerMap[p.id] = { id: p.id, name: p.name, hand: [], joinedAt: Date.now() };
    playerOrder.push(p.id);
  }
  return createRoomDoc(COL, code => newRoom(code, players[0].id, playerMap, playerOrder, true));
}

export async function joinRoom(
  roomId: string,
  playerId: string,
  playerName: string
): Promise<{ ok: boolean; error?: string }> {
  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };
  return joinRoomTx(COL, roomId, player, false);
}

export async function updateSettings(roomId: string, settings: GameSettings): Promise<void> {
  await updateDoc(doc(db, COL, roomId), { settings: clampSettings(settings) });
}

/** Shared removal logic for leaving and kicking. */
function removalUpdate(room: GameRoom, playerId: string): Record<string, unknown> | 'delete' | null {
  if (!room.playerOrder.includes(playerId)) return null;
  const newOrder = room.playerOrder.filter(id => id !== playerId);
  if (newOrder.length === 0) return 'delete';

  const update: Record<string, unknown> = {
    playerOrder: newOrder,
    [`players.${playerId}`]: deleteField(),
  };
  const remainingPlayers = { ...room.players };
  delete remainingPlayers[playerId];

  if (room.hostId === playerId) {
    update.hostId = newOrder[Math.floor(Math.random() * newOrder.length)];
  }

  if (room.status === 'phase1') {
    const idx = room.playerOrder.indexOf(playerId);
    let ci = room.currentPlayerIndex;
    if (idx < ci) {
      ci--;
    } else if (idx === ci && ci >= newOrder.length) {
      // The last player of the round left during their turn → round is over
      ci = 0;
      const nextStep = room.currentStep + 1;
      update.currentStep = nextStep;
      if (nextStep >= room.settings.cardsPerRound) update.status = 'phase2start';
    }
    update.currentPlayerIndex = ci;
  }

  if (room.status === 'phase3' && room.busfahrerId === playerId) {
    update.status = 'finished';
    update.busfahrerLeft = true;
  }

  if (room.status === 'results' && room.busfahrerId === playerId) {
    // Busfahrer left before the ride started → determine a new one
    const candidates = busfahrerCandidates(remainingPlayers, newOrder);
    if (candidates.length === 1) {
      update.busfahrerId = candidates[0];
      update.busfahrerName = remainingPlayers[candidates[0]]?.name ?? '';
    } else {
      update.busfahrerId = null;
      update.busfahrerName = null;
      update.tiebreakCandidates = candidates;
      update.tiebreakOffered = null;
      update.tiebreakPicks = null;
    }
  }

  if (room.tiebreakCandidates?.includes(playerId)) {
    const remaining = room.tiebreakCandidates.filter(id => id !== playerId);
    if (remaining.length === 0) {
      update.tiebreakCandidates = null;
      update.tiebreakOffered = null;
      update.tiebreakPicks = null;
      update.status = 'finished';
    } else if (remaining.length === 1) {
      update.tiebreakCandidates = null;
      update.tiebreakOffered = null;
      update.tiebreakPicks = null;
      update.busfahrerId = remaining[0];
      update.busfahrerName = room.players[remaining[0]]?.name ?? '';
    } else {
      update.tiebreakCandidates = remaining;
      if (room.tiebreakOffered) update[`tiebreakOffered.${playerId}`] = deleteField();
      if (room.tiebreakPicks) update[`tiebreakPicks.${playerId}`] = deleteField();
    }
  }

  return update;
}

export async function kickPlayer(room: GameRoom, targetId: string): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => removalUpdate(cur, targetId));
}

export async function leaveRoom(room: GameRoom, playerId: string): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => removalUpdate(cur, playerId));
}

/** Local mode: the whole table leaves together → remove the room. */
export async function deleteLocalRoom(roomId: string): Promise<void> {
  await deleteDoc(doc(db, COL, roomId));
}

export async function startGame(room: GameRoom): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    if (cur.status !== 'lobby' || cur.playerOrder.length < 2) return null;
    const settings = clampSettings(cur.settings);
    const players: Record<string, Player> = {};
    for (const id of cur.playerOrder) players[id] = { ...cur.players[id], hand: [] };
    return {
      status: 'phase1',
      settings,
      deck: createDeck(settings, 'guess'),
      players,
      currentStep: 0,
      currentPlayerIndex: 0,
      lastAction: null,
      pyramidMatchText: null,
      busfahrerLeft: false,
    };
  });
}

export async function makeGuess(room: GameRoom, playerId: string, guess: string): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    // Guard against double taps and stale screens
    if (cur.status !== 'phase1') return null;
    if (cur.playerOrder[cur.currentPlayerIndex] !== playerId) return null;
    if (cur.currentStep !== room.currentStep) return null;
    const deck = [...cur.deck];
    if (deck.length === 0) return null;
    const card = deck.pop()!;
    const player = cur.players[playerId];
    const newHand = [...player.hand, card];

    const correct = evaluateGuess(guess, cur.currentStep, card, player.hand);
    const message = correct
      ? `${player.name} tippte „${guess}" – ${cardLabel(card)} – Richtig, darf verteilen!`
      : `${player.name} tippte „${guess}" – ${cardLabel(card)} – Falsch, muss trinken!`;

    let nextPlayerIndex = cur.currentPlayerIndex + 1;
    let nextStep = cur.currentStep;
    let newStatus: GameRoom['status'] = cur.status;

    if (nextPlayerIndex >= cur.playerOrder.length) {
      nextPlayerIndex = 0;
      nextStep++;
      if (nextStep >= cur.settings.cardsPerRound) newStatus = 'phase2start';
    }

    return {
      deck,
      [`players.${playerId}.hand`]: newHand,
      currentPlayerIndex: nextPlayerIndex,
      currentStep: nextStep,
      status: newStatus,
      lastAction: {
        playerId,
        playerName: player.name,
        correct,
        card,
        step: cur.currentStep,
        message,
        guess,
      },
    };
  });
}

export async function startPyramid(room: GameRoom, mode: 'top' | 'bottom'): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    if (cur.status !== 'phase2start') return null;
    const { cells, remaining } = createPyramid(cur.deck, cur.settings.pyramidRows);
    return {
      status: 'phase2',
      deck: remaining,
      pyramid: cells,
      revealOrder: buildRevealOrder(cur.settings.pyramidRows, mode),
      pyramidIndex: 0,
      pyramidMatchText: null,
      lastAction: null,
    };
  });
}

export async function revealNextPyramidCard(room: GameRoom): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    if (cur.status !== 'phase2' || cur.pyramidIndex !== room.pyramidIndex) return null;
    if (cur.pyramidIndex >= cur.revealOrder.length) return null;
    const pyramid = cur.pyramid.map(c => ({ ...c }));
    const revealIdx = cur.revealOrder[cur.pyramidIndex];
    pyramid[revealIdx] = { ...pyramid[revealIdx], revealed: true };
    const revealedCard = pyramid[revealIdx].card;

    const handUpdates: Record<string, Card[]> = {};
    const matchParts: string[] = [];

    for (const id of cur.playerOrder) {
      const player = cur.players[id];
      const matches = player.hand.filter(c => c.value === revealedCard.value);
      if (matches.length > 0) {
        matchParts.push(`${player.name} darf ${matches.length}x verteilen!`);
        handUpdates[`players.${id}.hand`] = player.hand.filter(c => c.value !== revealedCard.value);
      }
    }

    const nextPyramidIndex = cur.pyramidIndex + 1;
    const done = nextPyramidIndex >= cur.revealOrder.length;

    const matchText = matchParts.length > 0 ? matchParts.join(' ') : 'Kein Treffer.';
    const updateData: Record<string, unknown> = {
      pyramid,
      pyramidIndex: nextPyramidIndex,
      pyramidMatchText: done ? `Letzte Karte ${cardLabel(revealedCard)}: ${matchText}` : matchText,
      ...handUpdates,
    };

    if (done) {
      const updatedPlayers = { ...cur.players };
      for (const key of Object.keys(handUpdates)) {
        const id = key.split('.')[1];
        updatedPlayers[id] = { ...updatedPlayers[id], hand: handUpdates[key] };
      }
      const candidates = busfahrerCandidates(updatedPlayers, cur.playerOrder);

      updateData.status = 'results';
      if (candidates.length === 1) {
        updateData.busfahrerId = candidates[0];
        updateData.busfahrerName = updatedPlayers[candidates[0]].name;
        updateData.tiebreakCandidates = null;
      } else {
        updateData.busfahrerId = null;
        updateData.busfahrerName = null;
        updateData.tiebreakCandidates = candidates;
      }
    }
    return updateData;
  });
}

function dealTiebreakCards(candidates: string[], deckIn: Card[]): {
  offered: Record<string, Card[]>;
  picks: Record<string, Card | null>;
  deck: Card[];
} {
  let deck = [...deckIn];
  const needed = candidates.length * 5;
  if (deck.length < needed) {
    const suits = ['♥', '♦', '♣', '♠'] as const;
    const values = [2,3,4,5,6,7,8,9,10,'B','D','K','A'] as const;
    const fresh: Card[] = [];
    for (const suit of suits) for (const value of values) fresh.push({ suit, value } as Card);
    for (let i = fresh.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
    }
    deck = [...deck, ...fresh];
  }
  const offered: Record<string, Card[]> = {};
  const picks: Record<string, Card | null> = {};
  for (const id of candidates) {
    offered[id] = [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!];
    picks[id] = null;
  }
  return { offered, picks, deck };
}

export async function initTiebreak(room: GameRoom): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    if (cur.status !== 'results' || !cur.tiebreakCandidates || cur.tiebreakOffered) return null;
    const { offered, picks, deck } = dealTiebreakCards(cur.tiebreakCandidates, cur.deck);
    return { deck, tiebreakOffered: offered, tiebreakPicks: picks };
  });
}

export async function pickTiebreakCard(room: GameRoom, playerId: string, card: Card): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    if (!cur.tiebreakCandidates?.includes(playerId)) return null;
    if (!cur.tiebreakPicks || cur.tiebreakPicks[playerId]) return null;
    return { [`tiebreakPicks.${playerId}`]: card };
  });
}

export async function resolveTiebreak(room: GameRoom): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    const candidates = cur.tiebreakCandidates;
    const picks = cur.tiebreakPicks;
    if (!candidates || !picks || candidates.some(id => !picks[id])) return null;
    const maxVal = Math.max(...candidates.map(id => valueToNum(picks[id]!.value)));
    const winners = candidates.filter(id => valueToNum(picks[id]!.value) === maxVal);

    if (winners.length === 1) {
      return {
        busfahrerId: winners[0],
        busfahrerName: cur.players[winners[0]].name,
        tiebreakCandidates: null,
        tiebreakOffered: null,
        tiebreakPicks: null,
      };
    }
    const { offered, picks: newPicks, deck } = dealTiebreakCards(winners, cur.deck);
    return {
      deck,
      tiebreakCandidates: winners,
      tiebreakOffered: offered,
      tiebreakPicks: newPicks,
    };
  });
}

export async function startBusfahren(room: GameRoom): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    if (cur.status !== 'results' || !cur.busfahrerId || cur.tiebreakCandidates?.length) return null;
    const useHL = cur.settings.busDifficulty === 'easy';
    const deck = createDeck(cur.settings, 'bus');
    const previousBusCards: (Card | null)[] = [null, null, null, null, null];
    if (useHL) {
      for (let i = 0; i < 5; i++) previousBusCards[i] = deck.pop()!;
    }
    return {
      status: 'phase3',
      deck,
      busCards: [null, null, null, null, null],
      previousBusCards,
      busIndex: 0,
      useHigherLower: useHL,
      awaitingContinue: false,
      lastFailedIndex: 0,
      lastAction: null,
    };
  });
}

export async function makeBusAnswer(room: GameRoom, guess: string): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    if (cur.status !== 'phase3' || cur.busIndex >= 5 || cur.awaitingContinue) return null;
    if (cur.busIndex !== room.busIndex) return null;
    const deck = [...cur.deck];
    if (deck.length === 0) return null;

    const card = deck.pop()!;
    const prev = cur.previousBusCards[cur.busIndex];
    const isHL = cur.useHigherLower && prev !== null;

    let correct: boolean;
    if (isHL && prev) {
      correct = evaluateHigherLower(guess, valueToNum(card.value), valueToNum(prev.value));
    } else {
      const red = card.suit === '♥' || card.suit === '♦';
      correct = (guess === 'Rot' && red) || (guess === 'Schwarz' && !red);
    }

    const busCards = [...cur.busCards];
    busCards[cur.busIndex] = card;

    if (correct) {
      const nextIndex = cur.busIndex + 1;
      return {
        deck,
        busCards,
        busIndex: nextIndex,
        status: nextIndex >= 5 ? 'finished' : cur.status,
      };
    }
    let useHL = cur.useHigherLower;
    if (cur.busIndex === 4 && cur.settings.busDifficulty === 'normal') useHL = true;
    return {
      deck,
      busCards,
      awaitingContinue: true,
      lastFailedIndex: cur.busIndex,
      useHigherLower: useHL,
    };
  });
}

export async function continueAfterBusFail(room: GameRoom): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    if (cur.status !== 'phase3' || !cur.awaitingContinue) return null;
    const previousBusCards = [...cur.previousBusCards];
    const busCards = [...cur.busCards];
    for (let i = 0; i <= cur.lastFailedIndex; i++) {
      previousBusCards[i] = busCards[i];
      busCards[i] = null;
    }
    return {
      busCards,
      previousBusCards,
      busIndex: 0,
      awaitingContinue: false,
    };
  });
}

export async function reshuffleBusDeck(room: GameRoom): Promise<void> {
  await updateDoc(doc(db, COL, room.id), { deck: createDeck(clampSettings(room.settings), 'bus') });
}

export async function restartGame(room: GameRoom): Promise<void> {
  await updateRoomTx<GameRoom>(COL, room.id, cur => {
    if (cur.status === 'lobby') return null;
    const players: Record<string, Player> = {};
    for (const id of cur.playerOrder) players[id] = { ...cur.players[id], hand: [] };
    return {
      status: 'lobby',
      players,
      deck: [],
      pyramid: [],
      revealOrder: [],
      pyramidIndex: 0,
      busfahrerId: null,
      busfahrerName: null,
      tiebreakCandidates: null,
      tiebreakOffered: null,
      tiebreakPicks: null,
      busCards: [null, null, null, null, null],
      previousBusCards: [null, null, null, null, null],
      busIndex: 0,
      useHigherLower: false,
      awaitingContinue: false,
      lastFailedIndex: 0,
      lastAction: null,
      pyramidMatchText: null,
      busfahrerLeft: false,
      expireAt: roomExpiry(),
    };
  });
}
