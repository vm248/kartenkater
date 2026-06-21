import { doc, setDoc, updateDoc, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Player } from './types';
import type { QuadratRoom, QCell } from './quadratTypes';
import {
  createQuadratDeck, createInitialGrid, evaluateQuadratGuess,
  CELL_TYPES, ensureDeck, connectedRevealedCells,
} from './quadratLogic';
import { getPlayerId } from './gameActions';

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function cleanupOldQuadratRooms(): Promise<void> {
  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const q = query(collection(db, 'quadrat'), where('createdAt', '<', cutoff));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  } catch {
    // ignore
  }
}

export async function createQuadratRoom(playerId: string, playerName: string): Promise<string> {
  cleanupOldQuadratRooms();
  const code = genCode();
  const player: Player = { id: playerId, name: playerName, hand: [], joinedAt: Date.now() };

  const room: QuadratRoom = {
    id: code,
    status: 'lobby',
    hostId: playerId,
    players: { [playerId]: player },
    playerOrder: [playerId],
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
    createdAt: Date.now(),
  };

  await setDoc(doc(db, 'quadrat', code), room);
  return code;
}

export async function createLocalQuadratRoom(players: { id: string; name: string }[]): Promise<string> {
  cleanupOldQuadratRooms();
  const code = genCode();
  const playerMap: Record<string, Player> = {};
  const playerOrder: string[] = [];
  for (const p of players) {
    playerMap[p.id] = { id: p.id, name: p.name, hand: [], joinedAt: Date.now() };
    playerOrder.push(p.id);
  }
  const room: QuadratRoom = {
    id: code, status: 'lobby', hostId: players[0].id,
    players: playerMap, playerOrder,
    grid: [], deck: [], discard: [],
    currentPlayerIndex: 0, streak: 0,
    lastAction: null, winnerId: null, winnerName: null,
    sipsRemaining: 0, sipsGiven: {}, awaitingDrinkConfirm: false,
    createdAt: Date.now(),
  };
  await setDoc(doc(db, 'quadrat', code), room);
  return code;
}

export async function joinQuadratRoom(
  roomId: string,
  playerId: string,
  playerName: string,
): Promise<{ ok: boolean; error?: string }> {
  const ref = doc(db, 'quadrat', roomId.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, error: 'Raum nicht gefunden.' };
  const room = snap.data() as QuadratRoom;
  if (room.players[playerId]) return { ok: true };
  if (room.status !== 'lobby') return { ok: false, error: 'Spiel läuft bereits.' };

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

export async function kickQuadratPlayer(room: QuadratRoom, targetId: string): Promise<void> {
  const newOrder = room.playerOrder.filter(id => id !== targetId);
  const newPlayers = { ...room.players };
  delete newPlayers[targetId];
  await updateDoc(doc(db, 'quadrat', room.id), {
    playerOrder: newOrder,
    players: newPlayers,
  });
}

export async function leaveQuadratRoom(room: QuadratRoom, playerId: string): Promise<void> {
  const newOrder = room.playerOrder.filter(id => id !== playerId);
  if (newOrder.length === 0) {
    await deleteDoc(doc(db, 'quadrat', room.id));
    return;
  }

  const newPlayers = { ...room.players };
  delete newPlayers[playerId];
  const update: Record<string, unknown> = { playerOrder: newOrder, players: newPlayers };

  if (room.hostId === playerId) {
    update.hostId = newOrder[Math.floor(Math.random() * newOrder.length)];
  }

  if (room.status === 'playing') {
    const idx = room.playerOrder.indexOf(playerId);
    let ci = room.currentPlayerIndex;
    if (idx < ci) ci--;
    else if (idx === ci) ci = ci % newOrder.length;
    update.currentPlayerIndex = ci;

    // If the leaving player was the wrong-guesser waiting to confirm, clean up the revealed card
    if (room.awaitingDrinkConfirm && idx === room.currentPlayerIndex && room.lastAction) {
      const gridCopy: QCell[] = room.grid.map(c => ({ ...c }));
      const toRemove = connectedRevealedCells(room.lastAction.cellIndex, gridCopy);
      let { deck, discard } = ensureDeck([...room.deck], [...room.discard], toRemove.length);
      for (const pos of toRemove) {
        discard.push(gridCopy[pos].card!);
        const replacement = deck.pop()!;
        const type = CELL_TYPES[pos];
        gridCopy[pos] = { index: pos, type, card: replacement, revealed: type === 'C' };
      }
      update.grid = gridCopy;
      update.deck = deck;
      update.discard = discard;
      update.awaitingDrinkConfirm = false;
    }
  }

  if (room.status === 'distributing' && room.winnerId === playerId) {
    update.status = 'finished';
  }

  await updateDoc(doc(db, 'quadrat', room.id), update);
}

export async function startQuadratGame(room: QuadratRoom): Promise<void> {
  const deck = createQuadratDeck();
  const { grid, remaining } = createInitialGrid(deck);
  await updateDoc(doc(db, 'quadrat', room.id), {
    status: 'playing',
    grid,
    deck: remaining,
    discard: [],
    currentPlayerIndex: 0,
    streak: 0,
    lastAction: null,
  });
}

export async function makeQuadratGuess(
  room: QuadratRoom,
  cellIndex: number,
  guess: string,
  playerId: string,
): Promise<void> {
  const grid: QCell[] = room.grid.map(c => ({ ...c }));
  const card = grid[cellIndex].card!;
  const playerName = room.players[playerId].name;
  const correct = evaluateQuadratGuess(guess, cellIndex, grid);

  if (correct) {
    grid[cellIndex] = { ...grid[cellIndex], revealed: true };
    const newStreak = room.streak + 1;
    const allDone = grid.filter(c => c.type !== null).every(c => c.revealed);

    if (allDone) {
      await updateDoc(doc(db, 'quadrat', room.id), {
        grid, streak: 0,
        status: 'distributing',
        winnerId: playerId,
        winnerName: playerName,
        sipsRemaining: 10,
        lastAction: { playerName, cellIndex, guess, correct: true, card, drinkCount: 0 },
      });
    } else {
      await updateDoc(doc(db, 'quadrat', room.id), {
        grid, streak: newStreak,
        lastAction: { playerName, cellIndex, guess, correct: true, card, drinkCount: 0 },
      });
    }
  } else {
    // Reveal wrong card so everyone can see it, but don't replace yet
    grid[cellIndex] = { ...grid[cellIndex], revealed: true };
    const drinkCount = connectedRevealedCells(cellIndex, grid).length;
    await updateDoc(doc(db, 'quadrat', room.id), {
      grid, streak: 0, awaitingDrinkConfirm: true,
      lastAction: { playerName, cellIndex, guess, correct: false, card, drinkCount },
    });
  }
}

export async function confirmQuadratDrink(room: QuadratRoom): Promise<void> {
  if (!room.lastAction) return;
  const grid: QCell[] = room.grid.map(c => ({ ...c }));
  const toRemove = connectedRevealedCells(room.lastAction.cellIndex, grid);

  let { deck, discard } = ensureDeck([...room.deck], [...room.discard], toRemove.length);
  for (const pos of toRemove) {
    discard.push(grid[pos].card!);
    const replacement = deck.pop()!;
    const type = CELL_TYPES[pos];
    grid[pos] = { index: pos, type, card: replacement, revealed: type === 'C' };
  }

  const nextIndex = (room.currentPlayerIndex + 1) % room.playerOrder.length;
  await updateDoc(doc(db, 'quadrat', room.id), {
    grid, deck, discard,
    currentPlayerIndex: nextIndex,
    awaitingDrinkConfirm: false,
  });
}

export async function giveSip(room: QuadratRoom, targetId: string): Promise<void> {
  if (room.sipsRemaining <= 0) return;
  const current = room.sipsGiven?.[targetId] ?? 0;
  await updateDoc(doc(db, 'quadrat', room.id), {
    [`sipsGiven.${targetId}`]: current + 1,
    sipsRemaining: room.sipsRemaining - 1,
  });
}

export async function finishSipDistribution(room: QuadratRoom): Promise<void> {
  await updateDoc(doc(db, 'quadrat', room.id), { status: 'finished' });
}

export async function restartQuadratGame(room: QuadratRoom): Promise<void> {
  await updateDoc(doc(db, 'quadrat', room.id), {
    status: 'lobby',
    grid: [], deck: [], discard: [],
    streak: 0, currentPlayerIndex: 0,
    lastAction: null,
    winnerId: null, winnerName: null,
    sipsRemaining: 0, sipsGiven: {},
    awaitingDrinkConfirm: false,
  });
}

export async function passQuadratTurn(room: QuadratRoom): Promise<void> {
  if (room.awaitingDrinkConfirm) return;
  const nextIndex = (room.currentPlayerIndex + 1) % room.playerOrder.length;
  await updateDoc(doc(db, 'quadrat', room.id), {
    currentPlayerIndex: nextIndex,
    streak: 0,
    lastAction: null,
  });
}

// re-export so QuadratHome can use it without importing gameActions
export { getPlayerId };
