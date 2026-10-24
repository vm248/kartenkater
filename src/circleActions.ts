import {
  doc, updateDoc, deleteDoc, deleteField, FieldPath,
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Player } from './types';
import type { CircleRoom, PendingCircleAction } from './circleTypes';
import {
  createCircleDeck, generateCardAngles,
  checkGap, getCardEffect, getSipsForCard, isRedSuit,
} from './circleLogic';
import { getPlayerId } from './gameActions';
import { createRoomDoc, updateRoomTx, roomExpiry, joinRoomTx, indexAfterRemoval } from './roomUtils';

const COL = 'circle';

async function cleanupOldCircleRooms(): Promise<void> {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const [oldSnap, emptySnap] = await Promise.all([
      getDocs(query(collection(db, COL), where('createdAt', '<', cutoff))),
      getDocs(query(collection(db, COL), where('playerOrder', '==', []))),
    ]);
    const refs = new Map([...oldSnap.docs, ...emptySnap.docs].map(d => [d.id, d.ref]));
    await Promise.all([...refs.values()].map(ref => deleteDoc(ref)));
  } catch {
    // ignore
  }
}

function emptyRoom(code: string, hostId: string, players: Record<string, Player>, playerOrder: string[], isLocal: boolean): CircleRoom {
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
    startIndex: 0,
    isLocal,
    createdAt: Date.now(),
    expireAt: roomExpiry(),
  };
}

/** A custom rule only counts if it contains more than whitespace. */
export function customRuleFor(room: CircleRoom, value: string | number): string | undefined {
  const rule = (room.cardRules ?? {})[String(value)]?.trim();
  return rule ? rule : undefined;
}

export async function createCircleRoom(playerId: string, playerName: string): Promise<string> {
  cleanupOldCircleRooms();
  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };
  return createRoomDoc(COL, code => emptyRoom(code, playerId, { [playerId]: player }, [playerId], false));
}

export async function createLocalCircleRoom(players: { id: string; name: string }[]): Promise<string> {
  cleanupOldCircleRooms();
  const playerMap: Record<string, Player> = {};
  const playerOrder: string[] = [];
  for (const p of players) {
    playerMap[p.id] = { id: p.id, name: p.name, hand: [], joinedAt: Date.now() };
    playerOrder.push(p.id);
  }
  return createRoomDoc(COL, code => emptyRoom(code, players[0].id, playerMap, playerOrder, true));
}

export async function joinCircleRoom(
  roomId: string,
  playerId: string,
  playerName: string,
): Promise<{ ok: boolean; error?: string }> {
  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };
  return joinRoomTx(COL, roomId, player, true);
}

function removalUpdate(room: CircleRoom, playerId: string): Record<string, unknown> | 'delete' | null {
  if (!room.playerOrder.includes(playerId)) return null;
  const newOrder = room.playerOrder.filter(id => id !== playerId);
  if (newOrder.length === 0) return 'delete';

  const update: Record<string, unknown> = {
    playerOrder: newOrder,
    [`players.${playerId}`]: deleteField(),
  };

  if (room.hostId === playerId) update.hostId = newOrder[0];
  if (room.daumenKingId === playerId) {
    update.daumenKingId = null;
    update.daumenKingUses = 0;
  }
  if (room.status === 'playing') {
    const idx = room.playerOrder.indexOf(playerId);
    update.currentPlayerIndex = indexAfterRemoval(room.currentPlayerIndex, idx, newOrder.length);

    // If the leaving player drew a card that wasn't confirmed yet, finish their turn for them
    if (room.pendingAction?.playerId === playerId) {
      update.pendingAction = null;
      if (room.cards.every(c => c.drawn)) update.status = 'finished';
    }
  }
  return update;
}

export async function kickCirclePlayer(room: CircleRoom, targetId: string): Promise<void> {
  await updateRoomTx<CircleRoom>(COL, room.id, cur => removalUpdate(cur, targetId));
}

export async function leaveCircleRoom(room: CircleRoom, playerId: string): Promise<void> {
  await updateRoomTx<CircleRoom>(COL, room.id, cur => removalUpdate(cur, playerId));
}

export async function deleteLocalCircleRoom(roomId: string): Promise<void> {
  await deleteDoc(doc(db, COL, roomId));
}

export async function startCircleGame(room: CircleRoom): Promise<void> {
  await updateRoomTx<CircleRoom>(COL, room.id, cur => {
    if (cur.status !== 'lobby' || cur.playerOrder.length < 2) return null;
    const start = (cur.startIndex ?? 0) % cur.playerOrder.length;
    return {
      status: 'playing',
      cards: createCircleDeck(),
      cardAngles: generateCardAngles(),
      currentPlayerIndex: start,
      acesDrawn: 0,
      daumenKingId: null,
      daumenKingUses: 0,
      lastQueenId: null,
      lastQueenName: null,
      gapBroken: false,
      pendingAction: null,
    };
  });
}

export async function drawCard(
  room: CircleRoom,
  cardIndex: number,
  playerId: string,
): Promise<void> {
  await updateRoomTx<CircleRoom>(COL, room.id, cur => {
    // Guard against double taps and stale screens
    if (cur.status !== 'playing' || cur.pendingAction) return null;
    if (cur.playerOrder[cur.currentPlayerIndex] !== playerId) return null;
    const card = cur.cards[cardIndex];
    if (!card || card.drawn) return null;

    const playerName = cur.players[playerId]?.name ?? '?';
    // Only the first gap in the game counts
    const createdGap = !cur.gapBroken && checkGap(cardIndex, cur.cards, cur.cardAngles);
    const customRule = customRuleFor(cur, card.value);
    const effect = getCardEffect(card.value, card.suit, cur.acesDrawn);

    const pending: PendingCircleAction = {
      type: effect,
      playerName,
      playerId,
      cardIndex,
      card: { value: card.value, suit: card.suit },
      createdGap,
      at: Date.now(),
    };
    if (effect === 'number') {
      pending.sips = getSipsForCard(card.value);
      pending.distribute = isRedSuit(card.suit);
    }

    const update: Record<string, unknown> = {
      cards: cur.cards.map((c, i) => (i === cardIndex ? { ...c, drawn: true } : c)),
      pendingAction: pending,
      ...(createdGap ? { gapBroken: true } : {}),
    };

    // A custom rule replaces the standard effect of the card completely
    if (!customRule) {
      if (effect === 'ace_normal' || effect === 'ace_ex') update.acesDrawn = cur.acesDrawn + 1;
      if (effect === 'queen') {
        update.lastQueenId = playerId;
        update.lastQueenName = playerName;
      }
      if (effect === 'jack') {
        update.daumenKingId = playerId;
        update.daumenKingUses = 3;
      }
    }
    return update;
  });
}

// Daumenking taps this to track one use (actual game is verbal)
export async function useDaumen(room: CircleRoom, kingId: string): Promise<void> {
  await updateRoomTx<CircleRoom>(COL, room.id, cur => {
    // Ignore if a new Daumenking took over in the meantime
    if (cur.daumenKingId !== kingId || cur.daumenKingUses <= 0) return null;
    const newUses = cur.daumenKingUses - 1;
    return {
      daumenKingUses: newUses,
      daumenKingId: newUses <= 0 ? null : kingId,
    };
  });
}

export async function confirmAction(room: CircleRoom): Promise<void> {
  const cardIndex = room.pendingAction?.cardIndex;
  await updateRoomTx<CircleRoom>(COL, room.id, cur => {
    if (!cur.pendingAction || cur.pendingAction.cardIndex !== cardIndex) return null;
    const allDrawn = cur.cards.every(c => c.drawn);
    return {
      pendingAction: null,
      currentPlayerIndex: (cur.currentPlayerIndex + 1) % cur.playerOrder.length,
      status: allDrawn ? 'finished' : 'playing',
    };
  });
}

/** Writes a single card rule (empty → removed), so concurrent edits of other cards are kept. */
export async function updateCardRule(roomId: string, cardValue: string, rule: string): Promise<void> {
  // Stored as typed (trailing spaces while typing survive); whitespace-only counts as no rule
  await updateDoc(doc(db, COL, roomId), new FieldPath('cardRules', cardValue), rule.trim() ? rule : deleteField());
}

export async function restartCircleGame(room: CircleRoom): Promise<void> {
  await updateRoomTx<CircleRoom>(COL, room.id, cur => {
    if (cur.status === 'lobby') return null;
    return {
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
      // Next round starts with the next player
      startIndex: ((cur.startIndex ?? 0) + 1) % Math.max(1, cur.playerOrder.length),
      expireAt: roomExpiry(),
    };
  });
}

export { getPlayerId };
