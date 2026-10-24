import type { Card, CardValue, CardSuit, GameSettings, PyramidCell, Player } from './types';

const SUITS: CardSuit[] = ['♥', '♦', '♣', '♠'];
const ALL_VALUES: CardValue[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'B', 'D', 'K', 'A'];
const SKAT_VALUES: CardValue[] = [7, 8, 9, 10, 'B', 'D', 'K', 'A'];

export function valueToNum(v: CardValue): number {
  if (v === 'B') return 11;
  if (v === 'D') return 12;
  if (v === 'K') return 13;
  if (v === 'A') return 14;
  return v as number;
}

export function isRed(card: Card): boolean {
  return card.suit === '♥' || card.suit === '♦';
}

/** Lowest card value in the deck (Skat starts at 7). */
export function minDeckValue(settings: GameSettings): number {
  return settings.deckType === 'skat' ? 7 : 2;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Keeps settings within the ranges the game can actually handle. */
export function clampSettings(s: GameSettings): GameSettings {
  return {
    deckType: s.deckType === 'full' ? 'full' : 'skat',
    guessDeckCount: clampInt(s.guessDeckCount, 1, 3, 1),
    busDeckCount: clampInt(s.busDeckCount, 1, 3, 1),
    pyramidRows: clampInt(s.pyramidRows, 3, 6, 3),
    cardsPerRound: clampInt(s.cardsPerRound, 1, 4, 3),
    busDifficulty: s.busDifficulty === 'easy' || s.busDifficulty === 'schwer' ? s.busDifficulty : 'normal',
  };
}

/** Players with the most remaining cards; one entry = Busfahrer, several = Stechen. */
export function busfahrerCandidates(players: Record<string, Player>, order: string[]): string[] {
  if (order.length === 0) return [];
  const maxCards = Math.max(...order.map(id => players[id]?.hand.length ?? 0));
  return order.filter(id => (players[id]?.hand.length ?? 0) === maxCards);
}

export function cardLabel(card: Card): string {
  return `${card.value}${card.suit}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createDeck(settings: GameSettings, phase: 'guess' | 'bus'): Card[] {
  const values = settings.deckType === 'skat' ? SKAT_VALUES : ALL_VALUES;
  const count = phase === 'bus' ? settings.busDeckCount : settings.guessDeckCount;
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    for (const suit of SUITS) {
      for (const value of values) {
        cards.push({ value, suit });
      }
    }
  }
  return shuffle(cards);
}

export function createPyramid(deck: Card[], rows: number): { cells: PyramidCell[]; remaining: Card[] } {
  const total = rows * (rows + 1) / 2;
  const remaining = [...deck];
  const cells: PyramidCell[] = [];
  for (let i = 0; i < total; i++) {
    cells.push({ card: remaining.pop()!, revealed: false });
  }
  return { cells, remaining };
}

export function buildRevealOrder(rows: number, mode: 'top' | 'bottom'): number[] {
  const rowArrays: number[][] = [];
  let idx = 0;
  for (let r = 1; r <= rows; r++) {
    const row: number[] = [];
    for (let i = 0; i < r; i++) row.push(idx++);
    rowArrays.push(row);
  }
  return mode === 'top' ? rowArrays.flat() : [...rowArrays].reverse().flat();
}

export const GUESS_EQUAL = 'Gleich';
export const GUESS_BORDER = 'Auf der Grenze';

/** Compare-based guess: 'Höher' / 'Tiefer' / 'Gleich' against a reference value. */
export function evaluateHigherLower(guess: string, cv: number, rv: number): boolean {
  if (guess === 'Höher') return cv > rv;
  if (guess === 'Tiefer') return cv < rv;
  if (guess === GUESS_EQUAL) return cv === rv;
  return false;
}

/** Range-based guess: 'Innerhalb' / 'Außerhalb' / 'Auf der Grenze' between two boundary values. */
export function evaluateInsideOutside(guess: string, cv: number, v1: number, v2: number): boolean {
  const min = Math.min(v1, v2);
  const max = Math.max(v1, v2);
  if (guess === 'Innerhalb') return cv > min && cv < max;
  if (guess === 'Außerhalb') return cv < min || cv > max;
  if (guess === GUESS_BORDER) return cv === min || cv === max;
  return false;
}

/** Options that can never win (e.g. "Höher" than an Ass, "Innerhalb" of 9 and 9). */
export function impossibleHigherLower(rv: number, minValue: number): string[] {
  const out: string[] = [];
  if (rv >= 14) out.push('Höher');
  if (rv <= minValue) out.push('Tiefer');
  return out;
}

export function impossibleInsideOutside(v1: number, v2: number, minValue: number): string[] {
  const min = Math.min(v1, v2);
  const max = Math.max(v1, v2);
  const out: string[] = [];
  if (max - min <= 1) out.push('Innerhalb');
  if (min <= minValue && max >= 14) out.push('Außerhalb');
  return out;
}

export function evaluateGuess(guess: string, step: number, card: Card, hand: Card[]): boolean {
  if (step === 0) {
    return (guess === 'Rot' && isRed(card)) || (guess === 'Schwarz' && !isRed(card));
  }
  if (step === 1) {
    return evaluateHigherLower(guess, valueToNum(card.value), valueToNum(hand[0].value));
  }
  if (step === 2) {
    return evaluateInsideOutside(guess, valueToNum(card.value), valueToNum(hand[0].value), valueToNum(hand[1].value));
  }
  const suits = hand.slice(0, 3).map(c => c.suit);
  const has = suits.includes(card.suit);
  return (guess === 'Habe ich schon' && has) || (guess === 'Habe ich noch nicht' && !has);
}
