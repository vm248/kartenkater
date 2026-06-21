import type { Card, Player } from './types';

export type QCellType = 'C' | 'S' | 'M' | 'I';

export interface QCell {
  index: number;
  type: QCellType | null;
  card: Card | null;
  revealed: boolean;
}

export interface QLastAction {
  playerName: string;
  cellIndex: number;
  guess: string;
  correct: boolean;
  card: Card;
  drinkCount: number;
}

export interface QuadratRoom {
  id: string;
  status: 'lobby' | 'playing' | 'distributing' | 'finished';
  hostId: string;
  players: Record<string, Player>;
  playerOrder: string[];
  grid: QCell[];
  deck: Card[];
  discard: Card[];
  currentPlayerIndex: number;
  streak: number;
  lastAction: QLastAction | null;
  winnerId: string | null;
  winnerName: string | null;
  sipsRemaining: number;
  sipsGiven: Record<string, number>;
  awaitingDrinkConfirm: boolean;
  createdAt: number;
}
