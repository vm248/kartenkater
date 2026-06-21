import type { Card, CardSuit, CardValue } from './types';
import type { QCell, QCellType } from './quadratTypes';
import { valueToNum } from './gameLogic';

const SUITS: CardSuit[] = ['♥', '♦', '♣', '♠'];
const VALUES: CardValue[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'B', 'D', 'K', 'A'];

// 5×5 grid layout:
// C  S  M  S  C   (pos 0–4)
// S  .  I  .  S   (pos 5–9,  empty at 6,8)
// M  I  .  I  M   (pos 10–14, empty at 12)
// S  .  I  .  S   (pos 15–19, empty at 16,18)
// C  S  M  S  C   (pos 20–24)
export const CELL_TYPES: (QCellType | null)[] = [
  'C', 'S', 'M', 'S', 'C',
  'S', null, 'I', null, 'S',
  'M', 'I', null, 'I', 'M',
  'S', null, 'I', null, 'S',
  'C', 'S', 'M', 'S', 'C',
];

// S cards: single corner comparison; M cards: two S neighbors; I cards: adjacent M
export const COMPARISON: Record<number, number | [number, number]> = {
  1: 0,  3: 4,  5: 0,  9: 4,  15: 20, 19: 24, 21: 20, 23: 24,
  2: [1, 3], 10: [5, 15], 14: [9, 19], 22: [21, 23],
  7: 2, 11: 10, 13: 14, 17: 22,
};

// Positions that must be revealed before this cell can be attempted
export const UNLOCK: Record<number, number[]> = {
  0: [], 4: [], 20: [], 24: [],
  1: [], 3: [], 5: [], 9: [], 15: [], 19: [], 21: [], 23: [],
  2: [1, 3], 10: [5, 15], 14: [9, 19], 22: [21, 23],
  7: [2], 11: [10], 13: [14], 17: [22],
};

// Adjacent card positions (wrong guess causes drinking + replacement for these)
export const ADJACENT: Record<number, number[]> = {
  0: [1, 5],   1: [0, 2],   2: [1, 3, 7], 3: [2, 4],  4: [3, 9],
  5: [0, 10],  7: [2],       9: [4, 14],
  10: [5, 11, 15], 11: [10], 13: [14], 14: [9, 13, 19],
  15: [10, 20], 17: [22],   19: [14, 24],
  20: [15, 21], 21: [20, 22], 22: [17, 21, 23], 23: [22, 24], 24: [19, 23],
};

export function shuffleDeck<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createQuadratDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      cards.push({ value, suit });
    }
  }
  return shuffleDeck(cards);
}

export function createInitialGrid(deck: Card[]): { grid: QCell[]; remaining: Card[] } {
  const d = [...deck];
  const grid: QCell[] = CELL_TYPES.map((type, index) => ({
    index,
    type,
    card: type !== null ? d.pop()! : null,
    revealed: type === 'C',
  }));
  return { grid, remaining: d };
}

export function isAvailable(cellIndex: number, grid: QCell[]): boolean {
  const cell = grid[cellIndex];
  if (!cell.type || cell.type === 'C' || cell.revealed) return false;
  return (UNLOCK[cellIndex] ?? []).every(pos => grid[pos].revealed);
}

export function evaluateQuadratGuess(guess: string, cellIndex: number, grid: QCell[]): boolean {
  const cell = grid[cellIndex];
  const cv = valueToNum(cell.card!.value);
  const comp = COMPARISON[cellIndex];

  if (cell.type === 'S') {
    const rv = valueToNum(grid[comp as number].card!.value);
    if (guess === 'drüber') return cv > rv;
    if (guess === 'drunter') return cv < rv;
    if (guess === 'gleich') return cv === rv;
  }

  if (cell.type === 'M') {
    const [p1, p2] = comp as [number, number];
    const v1 = valueToNum(grid[p1].card!.value);
    const v2 = valueToNum(grid[p2].card!.value);
    const min = Math.min(v1, v2);
    const max = Math.max(v1, v2);
    if (guess === 'innerhalb') return cv > min && cv < max;
    if (guess === 'außerhalb') return cv < min || cv > max;
  }

  if (cell.type === 'I') {
    const rv = valueToNum(grid[comp as number].card!.value);
    if (guess === 'drüber') return cv > rv;
    if (guess === 'drunter') return cv < rv;
  }

  return false;
}

export function ensureDeck(deck: Card[], discard: Card[], needed: number): { deck: Card[]; discard: Card[] } {
  if (deck.length >= needed) return { deck, discard };
  const combined = shuffleDeck([...deck, ...discard]);
  return { deck: combined, discard: [] };
}
