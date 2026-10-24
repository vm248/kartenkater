import type { CardSuit, CardValue } from './types';
import type { CircleCard, CircleActionType } from './circleTypes';

const SUITS: CardSuit[] = ['♥', '♦', '♣', '♠'];
const VALUES: CardValue[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'B', 'D', 'K', 'A'];

export function createCircleDeck(): CircleCard[] {
  const cards: CircleCard[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      cards.push({ value, suit, drawn: false });
    }
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

// Max spacing (degrees) between adjacent cards so the circle is always visually closed.
// At R=88 a 22px card spans ~14.3°, so 13.5° guarantees at least a tiny overlap everywhere.
const MAX_SPACING = 13.5;

// Generate 52 angular positions that guarantee a closed circle while still varying density.
// - 65 % dense slots (tight overlap, safe to draw)
// - 35 % sparse slots (barely touching, risky to draw)
// After normalization any spacing above MAX_SPACING is capped and redistributed.
export function generateCardAngles(): number[] {
  const raw = Array.from({ length: 52 }, () =>
    Math.random() < 0.65
      ? Math.random() * 5 + 0.5   // dense:  0.5–5.5°
      : Math.random() * 7 + 4,    // sparse: 4–11°
  );

  // Normalize to 360° then cap at MAX_SPACING
  const factor = 360 / raw.reduce((s, x) => s + x, 0);
  const spacings = raw.map(s => Math.min(s * factor, MAX_SPACING));

  // Capping may leave total < 360°; distribute deficit to the smallest spacings
  let deficit = 360 - spacings.reduce((s, x) => s + x, 0);
  const bySize = spacings.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  for (const { i } of bySize) {
    if (deficit <= 0.001) break;
    const add = Math.min(deficit, MAX_SPACING - spacings[i]);
    spacings[i] += add;
    deficit -= add;
  }

  const startOffset = Math.random() * 360;
  const angles: number[] = [];
  let cursor = startOffset;
  for (let i = 0; i < 52; i++) {
    angles.push(cursor % 360);
    cursor += spacings[i];
  }
  return angles;
}

export function isRedSuit(suit: CardSuit): boolean {
  return suit === '♥' || suit === '♦';
}

export function cardNumericValue(value: CardValue): number {
  if (value === 'B') return 11;
  if (value === 'D') return 12;
  if (value === 'K') return 13;
  if (value === 'A') return 14;
  return value as number;
}

// Threshold: gap is "visible" when remaining neighbors are >20° apart after removal.
// At R=88 a card is ~14.3°, so 20° = ~1.4 card-widths of empty arc.
// Dense pairs (avg ~5°): safe for single draws. Sparse pairs (avg ~12°): triggers on 1st draw.
const GAP_THRESHOLD_DEG = 20;

// Gap check based on actual angular positions.
// Finds the nearest remaining cards to the left and right (by angle),
// and checks if their total angular separation after removal exceeds the threshold.
// Dense regions → small gaps → safe. Sparse regions → large gaps → risky.
export function checkGap(
  removeIdx: number,
  cards: CircleCard[],
  angles: number[],
): boolean {
  const myAngle = angles[removeIdx];
  let leftDelta = 360;
  let rightDelta = 360;
  let leftIdx = -1;
  let rightIdx = -1;

  // Find the nearest cards that are still on the table, clockwise and counter-clockwise.
  // Drawn cards are skipped, so the gap grows as more cards are removed from an area.
  for (let i = 0; i < cards.length; i++) {
    if (i === removeIdx || cards[i].drawn) continue;
    const a = angles[i];
    const cw  = (a - myAngle + 360) % 360;
    const ccw = (myAngle - a + 360) % 360;
    if (cw  < rightDelta) { rightDelta = cw;  rightIdx = i; }
    if (ccw < leftDelta)  { leftDelta  = ccw; leftIdx  = i; }
  }

  // No neighbors or only one card left → no gap
  if (leftIdx === -1 || rightIdx === -1 || leftIdx === rightIdx) return false;
  return (leftDelta + rightDelta) > GAP_THRESHOLD_DEG;
}

export function getCardEffect(
  value: CardValue,
  suit: CardSuit,
  acesDrawn: number,
): CircleActionType {
  if (value === 'B') return 'jack';
  if (value === 'D') return 'queen';
  if (value === 'K') return 'king';
  if (value === 'A') return acesDrawn + 1 >= 4 ? 'ace_ex' : 'ace_normal';
  return 'number';
}

export function getSipsForCard(value: CardValue): number {
  if (typeof value === 'number') return value;
  return 0;
}

// Angle in degrees for card at index i from the stored absolute angles
export function cardAngle(index: number, angles: number[]): number {
  return angles[index] ?? index * (360 / 52);
}

// Convert polar (angle in degrees, radius) to cartesian {x, y} from circle center
export function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg - 90) * (Math.PI / 180); // -90 so 0° is at top
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}
