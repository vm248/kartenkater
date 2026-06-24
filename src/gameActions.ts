import { doc, setDoc, updateDoc, getDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { GameRoom, GameSettings, Card, Player } from './types';
import { createDeck, createPyramid, buildRevealOrder, evaluateGuess, valueToNum } from './gameLogic';

async function cleanupOldRooms(): Promise<void> {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const [oldSnap, emptySnap] = await Promise.all([
      getDocs(query(collection(db, 'rooms'), where('createdAt', '<', cutoff))),
      getDocs(query(collection(db, 'rooms'), where('playerOrder', '==', []))),
    ]);
    const refs = new Map([...oldSnap.docs, ...emptySnap.docs].map(d => [d.id, d.ref]));
    await Promise.all([...refs.values()].map(ref => deleteDoc(ref)));
  } catch {
    // cleanup failure should not block room creation
  }
}

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getPlayerId(): string {
  let id = localStorage.getItem('busfahren_pid');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('busfahren_pid', id);
  }
  return id;
}

export async function createRoom(playerId: string, playerName: string): Promise<string> {
  cleanupOldRooms(); // fire and forget – löscht Räume älter als 24h
  const code = genCode();
  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };

  const room: GameRoom = {
    id: code,
    status: 'lobby',
    hostId: playerId,
    settings: {
      deckType: 'skat',
      guessDeckCount: 1,
      busDeckCount: 1,
      pyramidRows: 3,
      cardsPerRound: 3,
      busDifficulty: 'normal',
    },
    players: { [playerId]: player },
    playerOrder: [playerId],
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
    createdAt: Date.now(),
  };

  await setDoc(doc(db, 'rooms', code), room);
  return code;
}

export async function createLocalRoom(players: { id: string; name: string }[]): Promise<string> {
  cleanupOldRooms();
  const code = genCode();
  const playerMap: Record<string, Player> = {};
  const playerOrder: string[] = [];
  for (const p of players) {
    playerMap[p.id] = { id: p.id, name: p.name, hand: [], joinedAt: Date.now() };
    playerOrder.push(p.id);
  }
  const room: GameRoom = {
    id: code, status: 'lobby', hostId: players[0].id,
    settings: { deckType: 'skat', guessDeckCount: 1, busDeckCount: 1, pyramidRows: 3, cardsPerRound: 3, busDifficulty: 'normal' },
    players: playerMap, playerOrder, deck: [],
    currentStep: 0, currentPlayerIndex: 0,
    pyramid: [], revealOrder: [], pyramidIndex: 0,
    busfahrerId: null, busfahrerName: null,
    tiebreakCandidates: null, tiebreakOffered: null, tiebreakPicks: null,
    busCards: [null, null, null, null, null],
    previousBusCards: [null, null, null, null, null],
    busIndex: 0, useHigherLower: false, awaitingContinue: false,
    lastFailedIndex: 0, lastAction: null, pyramidMatchText: null,
    createdAt: Date.now(),
  };
  await setDoc(doc(db, 'rooms', code), room);
  return code;
}

export async function joinRoom(
  roomId: string,
  playerId: string,
  playerName: string
): Promise<{ ok: boolean; error?: string }> {
  const ref = doc(db, 'rooms', roomId.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, error: 'Raum nicht gefunden.' };

  const room = snap.data() as GameRoom;
  if (room.status !== 'lobby') return { ok: false, error: 'Spiel läuft bereits.' };
  if (room.players[playerId]) return { ok: true };

  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };
  await updateDoc(ref, {
    [`players.${playerId}`]: player,
    playerOrder: [...room.playerOrder, playerId],
  });
  return { ok: true };
}

export async function updateSettings(roomId: string, settings: GameSettings): Promise<void> {
  await updateDoc(doc(db, 'rooms', roomId), { settings });
}

export async function kickPlayer(room: GameRoom, targetId: string): Promise<void> {
  const newOrder = room.playerOrder.filter(id => id !== targetId);
  const newPlayers = { ...room.players };
  delete newPlayers[targetId];
  await updateDoc(doc(db, 'rooms', room.id), {
    playerOrder: newOrder,
    players: newPlayers,
  });
}

export async function leaveRoom(room: GameRoom, playerId: string): Promise<void> {
  const newOrder = room.playerOrder.filter(id => id !== playerId);
  if (newOrder.length === 0) {
    await deleteDoc(doc(db, 'rooms', room.id));
    return;
  }

  const newPlayers = { ...room.players };
  delete newPlayers[playerId];
  const update: Record<string, unknown> = { playerOrder: newOrder, players: newPlayers };

  if (room.hostId === playerId) {
    update.hostId = newOrder[Math.floor(Math.random() * newOrder.length)];
  }

  if (room.status === 'phase1') {
    const idx = room.playerOrder.indexOf(playerId);
    let ci = room.currentPlayerIndex;
    if (idx < ci) ci--;
    else if (idx === ci) ci = ci % newOrder.length;
    update.currentPlayerIndex = ci;
  }

  if (room.status === 'phase3' && room.busfahrerId === playerId) {
    update.status = 'finished';
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
    }
  }

  await updateDoc(doc(db, 'rooms', room.id), update);
}

export async function startGame(room: GameRoom): Promise<void> {
  const deck = createDeck(room.settings, 'guess');
  const players: Record<string, Player> = {};
  for (const id of room.playerOrder) {
    players[id] = { ...room.players[id], hand: [] };
  }

  await updateDoc(doc(db, 'rooms', room.id), {
    status: 'phase1',
    deck,
    players,
    currentStep: 0,
    currentPlayerIndex: 0,
    lastAction: null,
    pyramidMatchText: null,
  });
}

export async function makeGuess(room: GameRoom, playerId: string, guess: string): Promise<void> {
  const deck = [...room.deck];
  if (deck.length === 0) return;
  const card = deck.pop()!;
  const player = room.players[playerId];
  const newHand = [...player.hand, card];

  const correct = evaluateGuess(guess, room.currentStep, card, player.hand);
  const message = correct
    ? `✅ Richtig – ${player.name} darf verteilen!`
    : `❌ Falsch – ${player.name} muss trinken!`;

  let nextPlayerIndex = room.currentPlayerIndex + 1;
  let nextStep = room.currentStep;
  let newStatus = room.status;

  if (nextPlayerIndex >= room.playerOrder.length) {
    nextPlayerIndex = 0;
    nextStep++;
    if (nextStep >= room.settings.cardsPerRound) {
      newStatus = 'phase2start';
    }
  }

  await updateDoc(doc(db, 'rooms', room.id), {
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
      step: room.currentStep,
      message,
    },
  });
}

export async function startPyramid(room: GameRoom, mode: 'top' | 'bottom'): Promise<void> {
  const { cells, remaining } = createPyramid(room.deck, room.settings.pyramidRows);
  const revealOrder = buildRevealOrder(room.settings.pyramidRows, mode);

  await updateDoc(doc(db, 'rooms', room.id), {
    status: 'phase2',
    deck: remaining,
    pyramid: cells,
    revealOrder,
    pyramidIndex: 0,
    pyramidMatchText: null,
    lastAction: null,
  });
}

export async function revealNextPyramidCard(room: GameRoom): Promise<void> {
  const pyramid = room.pyramid.map(c => ({ ...c }));
  const revealIdx = room.revealOrder[room.pyramidIndex];
  pyramid[revealIdx] = { ...pyramid[revealIdx], revealed: true };
  const revealedCard = pyramid[revealIdx].card;

  const handUpdates: Record<string, Card[]> = {};
  const matchParts: string[] = [];

  for (const id of room.playerOrder) {
    const player = room.players[id];
    const matches = player.hand.filter(c => c.value === revealedCard.value);
    if (matches.length > 0) {
      matchParts.push(`${player.name} darf ${matches.length}x verteilen!`);
      handUpdates[`players.${id}.hand`] = player.hand.filter(c => c.value !== revealedCard.value);
    }
  }

  const nextPyramidIndex = room.pyramidIndex + 1;
  const done = nextPyramidIndex >= room.revealOrder.length;

  const updateData: Record<string, unknown> = {
    pyramid,
    pyramidIndex: nextPyramidIndex,
    pyramidMatchText: matchParts.length > 0 ? matchParts.join(' ') : 'Kein Treffer.',
    ...handUpdates,
  };

  if (done) {
    // Apply hand updates locally to determine busfahrer
    const updatedPlayers = { ...room.players };
    for (const key of Object.keys(handUpdates)) {
      const id = key.split('.')[1];
      updatedPlayers[id] = { ...updatedPlayers[id], hand: handUpdates[key] };
    }

    const maxCards = Math.max(...room.playerOrder.map(id => updatedPlayers[id].hand.length));
    const candidates = room.playerOrder.filter(id => updatedPlayers[id].hand.length === maxCards);

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

  await updateDoc(doc(db, 'rooms', room.id), updateData);
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
  const candidates = room.tiebreakCandidates!;
  const { offered, picks, deck } = dealTiebreakCards(candidates, room.deck);
  await updateDoc(doc(db, 'rooms', room.id), {
    deck,
    tiebreakOffered: offered,
    tiebreakPicks: picks,
  });
}

export async function pickTiebreakCard(room: GameRoom, playerId: string, card: Card): Promise<void> {
  await updateDoc(doc(db, 'rooms', room.id), {
    [`tiebreakPicks.${playerId}`]: card,
  });
}

export async function resolveTiebreak(room: GameRoom): Promise<void> {
  const candidates = room.tiebreakCandidates!;
  const picks = room.tiebreakPicks!;
  if (candidates.some(id => !picks[id])) return;
  const maxVal = Math.max(...candidates.map(id => valueToNum(picks[id]!.value)));
  const winners = candidates.filter(id => valueToNum(picks[id]!.value) === maxVal);

  if (winners.length === 1) {
    await updateDoc(doc(db, 'rooms', room.id), {
      busfahrerId: winners[0],
      busfahrerName: room.players[winners[0]].name,
      tiebreakCandidates: null,
      tiebreakOffered: null,
      tiebreakPicks: null,
    });
  } else {
    const { offered, picks: newPicks, deck } = dealTiebreakCards(winners, room.deck);
    await updateDoc(doc(db, 'rooms', room.id), {
      deck,
      tiebreakCandidates: winners,
      tiebreakOffered: offered,
      tiebreakPicks: newPicks,
    });
  }
}

export async function startBusfahren(room: GameRoom): Promise<void> {
  const busDeck = createDeck(room.settings, 'bus');
  const useHL = room.settings.busDifficulty === 'easy';
  let deck = [...busDeck];
  const previousBusCards: (Card | null)[] = [null, null, null, null, null];

  if (useHL) {
    for (let i = 0; i < 5; i++) {
      previousBusCards[i] = deck.pop()!;
    }
  }

  await updateDoc(doc(db, 'rooms', room.id), {
    status: 'phase3',
    deck,
    busCards: [null, null, null, null, null],
    previousBusCards,
    busIndex: 0,
    useHigherLower: useHL,
    awaitingContinue: false,
    lastFailedIndex: 0,
    lastAction: null,
  });
}

export async function makeBusAnswer(room: GameRoom, guess: string): Promise<void> {
  if (room.busIndex >= 5 || room.awaitingContinue) return;
  const deck = [...room.deck];
  if (deck.length === 0) return;

  const card = deck.pop()!;
  const prev = room.previousBusCards[room.busIndex];
  const isHL = room.useHigherLower && prev !== null;

  let correct = false;
  if (isHL && prev) {
    const v1 = valueToNum(prev.value);
    const v2 = valueToNum(card.value);
    correct = (guess === 'Höher' && v2 > v1) || (guess === 'Tiefer' && v2 < v1);
  } else {
    const red = card.suit === '♥' || card.suit === '♦';
    correct = (guess === 'Rot' && red) || (guess === 'Schwarz' && !red);
  }

  const busCards = [...room.busCards];
  busCards[room.busIndex] = card;

  if (correct) {
    const nextIndex = room.busIndex + 1;
    await updateDoc(doc(db, 'rooms', room.id), {
      deck,
      busCards,
      busIndex: nextIndex,
      status: nextIndex >= 5 ? 'finished' : room.status,
    });
  } else {
    let useHL = room.useHigherLower;
    if (room.busIndex === 4 && room.settings.busDifficulty === 'normal') {
      useHL = true;
    }
    await updateDoc(doc(db, 'rooms', room.id), {
      deck,
      busCards,
      awaitingContinue: true,
      lastFailedIndex: room.busIndex,
      useHigherLower: useHL,
    });
  }
}

export async function continueAfterBusFail(room: GameRoom): Promise<void> {
  const previousBusCards = [...room.previousBusCards];
  const busCards = [...room.busCards];

  for (let i = 0; i <= room.lastFailedIndex; i++) {
    previousBusCards[i] = busCards[i];
    busCards[i] = null;
  }

  await updateDoc(doc(db, 'rooms', room.id), {
    busCards,
    previousBusCards,
    busIndex: 0,
    awaitingContinue: false,
  });
}

export async function reshuffleBusDeck(room: GameRoom): Promise<void> {
  const newDeck = createDeck(room.settings, 'bus');
  await updateDoc(doc(db, 'rooms', room.id), { deck: newDeck });
}

export async function restartGame(room: GameRoom): Promise<void> {
  const players: Record<string, Player> = {};
  for (const id of room.playerOrder) {
    players[id] = { ...room.players[id], hand: [] };
  }
  await updateDoc(doc(db, 'rooms', room.id), {
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
  });
}
