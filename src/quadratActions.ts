import { doc, deleteDoc, deleteField, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { Player } from './types';
import type { QuadratRoom, QCell } from './quadratTypes';
import {
  createQuadratDeck, createInitialGrid, evaluateQuadratGuess,
  CELL_TYPES, ensureDeck, connectedRevealedCells, isAvailable, comparisonPositions,
} from './quadratLogic';
import { getPlayerId } from './gameActions';
import { createRoomDoc, updateRoomTx, roomExpiry, joinRoomTx, indexAfterRemoval } from './roomUtils';

const COL = 'quadrat';

async function cleanupOldQuadratRooms(): Promise<void> {
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

function newRoom(code: string, hostId: string, players: Record<string, Player>, playerOrder: string[], isLocal: boolean): QuadratRoom {
  return {
    id: code,
    status: 'lobby',
    hostId,
    players,
    playerOrder,
    grid: [],
    deck: [],
    discard: [],
    currentPlayerIndex: 0,
    streak: 0,
    lastAction: null,
    winnerId: null,
    winnerName: null,
    sipsRemaining: 0,
    sipsGiven: {},
    awaitingDrinkConfirm: false,
    isLocal,
    createdAt: Date.now(),
    expireAt: roomExpiry(),
  };
}

export async function createQuadratRoom(playerId: string, playerName: string): Promise<string> {
  cleanupOldQuadratRooms();
  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };
  return createRoomDoc(COL, code => newRoom(code, playerId, { [playerId]: player }, [playerId], false));
}

export async function createLocalQuadratRoom(players: { id: string; name: string }[]): Promise<string> {
  cleanupOldQuadratRooms();
  const playerMap: Record<string, Player> = {};
  const playerOrder: string[] = [];
  for (const p of players) {
    playerMap[p.id] = { id: p.id, name: p.name, hand: [], joinedAt: Date.now() };
    playerOrder.push(p.id);
  }
  return createRoomDoc(COL, code => newRoom(code, players[0].id, playerMap, playerOrder, true));
}

export async function joinQuadratRoom(
  roomId: string,
  playerId: string,
  playerName: string,
): Promise<{ ok: boolean; error?: string }> {
  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };
  return joinRoomTx(COL, roomId, player, true);
}

/** Replaces the wrong card and every revealed card connected to it. */
function replaceConnected(room: QuadratRoom, cellIndex: number) {
  const grid: QCell[] = room.grid.map(c => ({ ...c }));
  const toRemove = connectedRevealedCells(cellIndex, grid);
  const { deck, discard } = ensureDeck([...room.deck], [...room.discard], toRemove.length);
  for (const pos of toRemove) {
    discard.push(grid[pos].card!);
    const replacement = deck.pop()!;
    const type = CELL_TYPES[pos];
    grid[pos] = { index: pos, type, card: replacement, revealed: type === 'C' };
  }
  return { grid, deck, discard };
}

function removalUpdate(room: QuadratRoom, playerId: string): Record<string, unknown> | 'delete' | null {
  if (!room.playerOrder.includes(playerId)) return null;
  const newOrder = room.playerOrder.filter(id => id !== playerId);
  if (newOrder.length === 0) return 'delete';

  const update: Record<string, unknown> = {
    playerOrder: newOrder,
    [`players.${playerId}`]: deleteField(),
  };

  if (room.hostId === playerId) {
    update.hostId = newOrder[Math.floor(Math.random() * newOrder.length)];
  }

  if (room.status === 'playing') {
    const idx = room.playerOrder.indexOf(playerId);
    update.currentPlayerIndex = indexAfterRemoval(room.currentPlayerIndex, idx, newOrder.length);

    if (idx === room.currentPlayerIndex) {
      // The next player starts fresh: no inherited streak or feedback
      update.streak = 0;
      update.lastAction = null;
      // If the leaving player was the wrong-guesser waiting to confirm, clean up the revealed card
      if (room.awaitingDrinkConfirm && room.lastAction) {
        Object.assign(update, replaceConnected(room, room.lastAction.cellIndex));
        update.awaitingDrinkConfirm = false;
      }
    }
  }

  if (room.status === 'distributing' && room.winnerId === playerId) {
    update.status = 'finished';
  }

  return update;
}

export async function kickQuadratPlayer(room: QuadratRoom, targetId: string): Promise<void> {
  await updateRoomTx<QuadratRoom>(COL, room.id, cur => removalUpdate(cur, targetId));
}

export async function leaveQuadratRoom(room: QuadratRoom, playerId: string): Promise<void> {
  await updateRoomTx<QuadratRoom>(COL, room.id, cur => removalUpdate(cur, playerId));
}

export async function deleteLocalQuadratRoom(roomId: string): Promise<void> {
  await deleteDoc(doc(db, COL, roomId));
}

export async function startQuadratGame(room: QuadratRoom): Promise<void> {
  await updateRoomTx<QuadratRoom>(COL, room.id, cur => {
    if (cur.status !== 'lobby' || cur.playerOrder.length < 2) return null;
    const { grid, remaining } = createInitialGrid(createQuadratDeck());
    return {
      status: 'playing',
      grid,
      deck: remaining,
      discard: [],
      currentPlayerIndex: 0,
      streak: 0,
      lastAction: null,
      sipsGiven: {},
    };
  });
}

export async function makeQuadratGuess(
  room: QuadratRoom,
  cellIndex: number,
  guess: string,
  playerId: string,
): Promise<void> {
  await updateRoomTx<QuadratRoom>(COL, room.id, cur => {
    // Guard against double taps and stale screens
    if (cur.status !== 'playing' || cur.awaitingDrinkConfirm) return null;
    if (cur.playerOrder[cur.currentPlayerIndex] !== playerId) return null;
    if (!isAvailable(cellIndex, cur.grid)) return null;

    const grid: QCell[] = cur.grid.map(c => ({ ...c }));
    const card = grid[cellIndex].card!;
    const playerName = cur.players[playerId].name;
    const compare = comparisonPositions(cellIndex).map(p => grid[p].card!);
    const correct = evaluateQuadratGuess(guess, cellIndex, grid);

    // Reveal the card in both cases so everyone sees it
    grid[cellIndex] = { ...grid[cellIndex], revealed: true };

    if (correct) {
      const allDone = grid.filter(c => c.type !== null).every(c => c.revealed);
      const lastAction = { playerName, cellIndex, guess, correct: true, card, drinkCount: 0, compare };
      if (allDone) {
        return {
          grid, streak: 0,
          status: 'distributing',
          winnerId: playerId,
          winnerName: playerName,
          sipsRemaining: 10,
          sipsGiven: {},
          lastAction,
        };
      }
      return { grid, streak: cur.streak + 1, lastAction };
    }

    // Wrong: show the card, replacement happens on confirm
    const drinkCount = connectedRevealedCells(cellIndex, grid).length;
    return {
      grid, streak: 0, awaitingDrinkConfirm: true,
      lastAction: { playerName, cellIndex, guess, correct: false, card, drinkCount, compare },
    };
  });
}

export async function confirmQuadratDrink(room: QuadratRoom): Promise<void> {
  await updateRoomTx<QuadratRoom>(COL, room.id, cur => {
    if (cur.status !== 'playing' || !cur.awaitingDrinkConfirm || !cur.lastAction) return null;
    return {
      ...replaceConnected(cur, cur.lastAction.cellIndex),
      currentPlayerIndex: (cur.currentPlayerIndex + 1) % cur.playerOrder.length,
      awaitingDrinkConfirm: false,
    };
  });
}

export async function giveSip(room: QuadratRoom, targetId: string): Promise<void> {
  await updateRoomTx<QuadratRoom>(COL, room.id, cur => {
    if (cur.status !== 'distributing' || cur.sipsRemaining <= 0) return null;
    return {
      [`sipsGiven.${targetId}`]: (cur.sipsGiven?.[targetId] ?? 0) + 1,
      sipsRemaining: cur.sipsRemaining - 1,
    };
  });
}

export async function finishSipDistribution(room: QuadratRoom): Promise<void> {
  await updateRoomTx<QuadratRoom>(COL, room.id, cur =>
    cur.status === 'distributing' ? { status: 'finished' } : null);
}

export async function restartQuadratGame(room: QuadratRoom): Promise<void> {
  await updateRoomTx<QuadratRoom>(COL, room.id, cur => {
    if (cur.status === 'lobby') return null;
    return {
      status: 'lobby',
      grid: [], deck: [], discard: [],
      streak: 0, currentPlayerIndex: 0,
      lastAction: null,
      winnerId: null, winnerName: null,
      sipsRemaining: 0, sipsGiven: {},
      awaitingDrinkConfirm: false,
      expireAt: roomExpiry(),
    };
  });
}

export async function passQuadratTurn(room: QuadratRoom): Promise<void> {
  await updateRoomTx<QuadratRoom>(COL, room.id, cur => {
    if (cur.status !== 'playing' || cur.awaitingDrinkConfirm) return null;
    if (cur.currentPlayerIndex !== room.currentPlayerIndex) return null;
    return {
      currentPlayerIndex: (cur.currentPlayerIndex + 1) % cur.playerOrder.length,
      streak: 0,
      lastAction: null,
    };
  });
}

// re-export so QuadratHome can use it without importing gameActions
export { getPlayerId };
