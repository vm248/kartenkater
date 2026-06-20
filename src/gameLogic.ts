import type { Card, CardValue, CardSuit, GameSettings, PyramidCell } from './types';

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

export function evaluateGuess(guess: string, step: number, card: Card, hand: Card[]): boolean {
  if (step === 0) {
    return (guess === 'Rot' && isRed(card)) || (guess === 'Schwarz' && !isRed(card));
  }
  if (step === 1) {
    return (
      (guess === 'Höher' && valueToNum(card.value) > valueToNum(hand[0].value)) ||
      (guess === 'Tiefer' && valueToNum(card.value) < valueToNum(hand[0].value))
    );
  }
  if (step === 2) {
    const v1 = valueToNum(hand[0].value);
    const v2 = valueToNum(hand[1].value);
    const min = Math.min(v1, v2);
    const max = Math.max(v1, v2);
    const cv = valueToNum(card.value);
    return (
      (guess === 'Innerhalb' && cv > min && cv < max) ||
      (guess === 'Außerhalb' && (cv < min || cv > max))
    );
  }
  const suits = hand.slice(0, 3).map(c => c.suit);
  const has = suits.includes(card.suit);
  return (guess === 'Habe ich schon' && has) || (guess === 'Habe ich noch nicht' && !has);
}
