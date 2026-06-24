import {
  doc, setDoc, updateDoc, getDoc,
  collection, query, where, getDocs, deleteDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Player } from './types';
import type { CircleRoom, PendingCircleAction } from './circleTypes';
import {
  createCircleDeck, generateCardAngles,
  checkGap, getCardEffect, getSipsForCard, isRedSuit,
} from './circleLogic';
import { getPlayerId } from './gameActions';

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function cleanupOldCircleRooms(): Promise<void> {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const [oldSnap, emptySnap] = await Promise.all([
      getDocs(query(collection(db, 'circle'), where('createdAt', '<', cutoff))),
      getDocs(query(collection(db, 'circle'), where('playerOrder', '==', []))),
    ]);
    const refs = new Map([...oldSnap.docs, ...emptySnap.docs].map(d => [d.id, d.ref]));
    await Promise.all([...refs.values()].map(ref => deleteDoc(ref)));
  } catch {
    // ignore
  }
}

function emptyRoom(code: string, hostId: string, players: Record<string, Player>, playerOrder: string[]): CircleRoom {
  return {
    id: code,
    status: 'lobby',
    hostId,
    players,
    playerOrder,
    currentPlayerIndex: 0,
    cards: [],
    cardAngles: [],
    acesDrawn: 0,
    daumenKingId: null,
    daumenKingUses: 0,
    lastQueenId: null,
    lastQueenName: null,
    gapBroken: false,
    customRules: [],
    cardRules: {},
    pendingAction: null,
    createdAt: Date.now(),
  };
}

export async function createCircleRoom(playerId: string, playerName: string): Promise<string> {
  cleanupOldCircleRooms();
  const code = genCode();
  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };
  const room = emptyRoom(code, playerId, { [playerId]: player }, [playerId]);
  await setDoc(doc(db, 'circle', code), room);
  return code;
}

export async function createLocalCircleRoom(players: { id: string; name: string }[]): Promise<string> {
  cleanupOldCircleRooms();
  const code = genCode();
  const playerMap: Record<string, Player> = {};
  const playerOrder: string[] = [];
  for (const p of players) {
    playerMap[p.id] = { id: p.id, name: p.name, hand: [], joinedAt: Date.now() };
    playerOrder.push(p.id);
  }
  const room = emptyRoom(code, players[0].id, playerMap, playerOrder);
  await setDoc(doc(db, 'circle', code), room);
  return code;
}

export async function joinCircleRoom(
  roomId: string,
  playerId: string,
  playerName: string,
): Promise<{ ok: boolean; error?: string }> {
  const ref = doc(db, 'circle', roomId.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, error: 'Raum nicht gefunden.' };
  const room = snap.data() as CircleRoom;
  if (room.players[playerId]) return { ok: true };
  if (room.status !== 'lobby') return { ok: false, error: 'Spiel läuft bereits.' };
  if (room.playerOrder.length >= 15) return { ok: false, error: 'Raum ist voll (max. 15 Spieler).' };

  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };
  const insertAt = Math.floor(Math.random() * (room.playerOrder.length + 1));
  const newOrder = [...room.playerOrder];
  newOrder.splice(insertAt, 0, playerId);

  await updateDoc(ref, {
    [`players.${playerId}`]: player,
    playerOrder: newOrder,
  });
  return { ok: true };
}

export async function kickCirclePlayer(room: CircleRoom, targetId: string): Promise<void> {
  const newOrder = room.playerOrder.filter(id => id !== targetId);
  const newPlayers = { ...room.players };
  delete newPlayers[targetId];
  await updateDoc(doc(db, 'circle', room.id), { playerOrder: newOrder, players: newPlayers });
}

export async function leaveCircleRoom(room: CircleRoom, playerId: string): Promise<void> {
  const newOrder = room.playerOrder.filter(id => id !== playerId);
  if (newOrder.length === 0) {
    await deleteDoc(doc(db, 'circle', room.id));
    return;
  }
  const newPlayers = { ...room.players };
  delete newPlayers[playerId];
  const update: Record<string, unknown> = { playerOrder: newOrder, players: newPlayers };

  if (room.hostId === playerId) update.hostId = newOrder[0];
  if (room.daumenKingId === playerId) {
    update.daumenKingId = null;
    update.daumenKingUses = 0;
  }
  // If the leaving player was the one who drew a card, clear the overlay so the game isn't locked
  if (room.pendingAction?.playerId === playerId) {
    update.pendingAction = null;
  }
  if (room.status === 'playing') {
    const idx = room.playerOrder.indexOf(playerId);
    let ci = room.currentPlayerIndex;
    if (idx < ci) ci--;
    else if (idx === ci) ci = ci % newOrder.length;
    update.currentPlayerIndex = ci;
  }
  await updateDoc(doc(db, 'circle', room.id), update);
}

export async function startCircleGame(room: CircleRoom): Promise<void> {
  const cards = createCircleDeck();
  const cardAngles = generateCardAngles();
  await updateDoc(doc(db, 'circle', room.id), {
    status: 'playing',
    cards,
    cardAngles,
    currentPlayerIndex: 0,
    acesDrawn: 0,
    daumenKingId: null,
    daumenKingUses: 0,
    lastQueenId: null,
    lastQueenName: null,
    gapBroken: false,
    pendingAction: null,
  });
}

export async function drawCard(
  room: CircleRoom,
  cardIndex: number,
  playerId: string,
): Promise<void> {
  if (room.pendingAction) return;
  if (room.cards[cardIndex]?.drawn) return;

  const card = room.cards[cardIndex];
  const playerName = room.players[playerId]?.name ?? '?';
  // Only the first gap in the game counts
  const createdGap = !room.gapBroken && checkGap(cardIndex, room.cards, room.cardAngles);
  const effect = getCardEffect(card.value, card.suit, room.acesDrawn);

  const newCards = room.cards.map((c, i) =>
    i === cardIndex ? { ...c, drawn: true } : c,
  );

  const pending: PendingCircleAction = {
    type: effect,
    playerName,
    playerId,
    cardIndex,
    card: { value: card.value, suit: card.suit },
    createdGap,
  };

  if (effect === 'number') {
    const sips = getSipsForCard(card.value);
    pending.sips = sips;
    pending.distribute = isRedSuit(card.suit);
  }

  const update: Record<string, unknown> = {
    cards: newCards,
    pendingAction: pending,
    ...(createdGap ? { gapBroken: true } : {}),
  };

  if (effect === 'ace_normal' || effect === 'ace_ex') {
    update.acesDrawn = room.acesDrawn + 1;
  }
  if (effect === 'queen') {
    update.lastQueenId = playerId;
    update.lastQueenName = playerName;
  }
  if (effect === 'jack') {
    update.daumenKingId = playerId;
    update.daumenKingUses = 3;
  }

  await updateDoc(doc(db, 'circle', room.id), update);
}

// Daumenking taps this to track one use (actual game is verbal)
export async function useDaumen(room: CircleRoom, kingId: string): Promise<void> {
  if (room.daumenKingUses <= 0) return;
  const newUses = room.daumenKingUses - 1;
  await updateDoc(doc(db, 'circle', room.id), {
    daumenKingUses: newUses,
    daumenKingId: newUses <= 0 ? null : kingId,
  });
}

export async function confirmAction(room: CircleRoom): Promise<void> {
  if (!room.pendingAction) return;
  const nextIndex = (room.currentPlayerIndex + 1) % room.playerOrder.length;
  const allDrawn = room.cards.every(c => c.drawn);
  await updateDoc(doc(db, 'circle', room.id), {
    pendingAction: null,
    currentPlayerIndex: nextIndex,
    status: allDrawn ? 'finished' : 'playing',
  });
}

export async function updateCustomRules(room: CircleRoom, rules: string[]): Promise<void> {
  await updateDoc(doc(db, 'circle', room.id), { customRules: rules });
}

export async function updateCardRules(room: CircleRoom, cardRules: Record<string, string>): Promise<void> {
  await updateDoc(doc(db, 'circle', room.id), { cardRules });
}

export async function restartCircleGame(room: CircleRoom): Promise<void> {
  await updateDoc(doc(db, 'circle', room.id), {
    status: 'lobby',
    cards: [],
    cardAngles: [],
    acesDrawn: 0,
    daumenKingId: null,
    daumenKingUses: 0,
    lastQueenId: null,
    lastQueenName: null,
    gapBroken: false,
    pendingAction: null,
    currentPlayerIndex: 0,
  });
}

export { getPlayerId };
