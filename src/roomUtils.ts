import { doc, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export const MAX_PLAYERS = 15;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

function genCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Firestore TTL policy field: rooms are removed automatically once this time has passed. */
export function roomExpiry(): Timestamp {
  return Timestamp.fromMillis(Date.now() + ROOM_TTL_MS);
}

/**
 * Creates a room document under a fresh 4-letter code.
 * Retries with a new code if the code is already taken.
 */
export async function createRoomDoc<T extends object>(col: string, build: (code: string) => T): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const ref = doc(db, col, code);
    const created = await runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, build(code));
      return true;
    });
    if (created) return code;
  }
  throw new Error('Kein freier Raumcode gefunden.');
}

/**
 * Reads the current room state inside a transaction and applies the update returned by `fn`.
 * `fn` returns null to abort (stale state / not allowed) or 'delete' to remove the room.
 * Returns true if something was written.
 */
export async function updateRoomTx<T>(
  col: string,
  id: string,
  fn: (cur: T) => Record<string, unknown> | 'delete' | null,
): Promise<boolean> {
  const ref = doc(db, col, id);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const res = fn(snap.data() as T);
    if (res === null) return false;
    if (res === 'delete') tx.delete(ref);
    else tx.update(ref, res);
    return true;
  });
}

interface JoinableRoom {
  status: string;
  isLocal?: boolean;
  players: Record<string, { name: string }>;
  playerOrder: string[];
}

/**
 * Adds a player to a room atomically, so simultaneous joins don't overwrite each other.
 * `randomPosition` inserts the player at a random seat (Fenster / Circle).
 */
export async function joinRoomTx(
  col: string,
  roomId: string,
  player: { id: string; name: string; hand: unknown[]; joinedAt: number },
  randomPosition: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const ref = doc(db, col, roomId.toUpperCase());
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return { ok: false, error: 'Raum nicht gefunden.' };
    const room = snap.data() as JoinableRoom;
    if (room.players[player.id]) {
      // Already in the room (e.g. second tab): just refresh the name
      if (room.players[player.id].name !== player.name) {
        tx.update(ref, { [`players.${player.id}.name`]: player.name });
      }
      return { ok: true };
    }
    if (room.isLocal) return { ok: false, error: 'Das ist ein lokales Spiel auf einem Gerät.' };
    if (room.status !== 'lobby') return { ok: false, error: 'Spiel läuft bereits.' };
    if (room.playerOrder.length >= MAX_PLAYERS) return { ok: false, error: `Raum ist voll (max. ${MAX_PLAYERS} Spieler).` };

    const newOrder = [...room.playerOrder];
    const insertAt = randomPosition ? Math.floor(Math.random() * (newOrder.length + 1)) : newOrder.length;
    newOrder.splice(insertAt, 0, player.id);
    tx.update(ref, { [`players.${player.id}`]: player, playerOrder: newOrder });
    return { ok: true };
  });
}

/** New turn index after removing the player at `idx`, keeping the same player on turn where possible. */
export function indexAfterRemoval(currentIndex: number, idx: number, newLength: number): number {
  if (newLength === 0) return 0;
  if (idx < currentIndex) return currentIndex - 1;
  if (idx === currentIndex) return currentIndex % newLength;
  return currentIndex;
}
