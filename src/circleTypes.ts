import type { CardValue, CardSuit, Player } from './types';

export type CircleStatus = 'lobby' | 'playing' | 'finished';

export type CircleActionType =
  | 'number'
  | 'jack'
  | 'queen'
  | 'king'
  | 'ace_normal'
  | 'ace_ex';

export interface CircleCard {
  value: CardValue;
  suit: CardSuit;
  drawn: boolean;
}

export interface PendingCircleAction {
  type: CircleActionType;
  playerName: string;
  playerId: string;
  cardIndex: number;
  card: { value: CardValue; suit: CardSuit };
  sips?: number;
  distribute?: boolean;
  createdGap?: boolean;
  /** Timestamp when the card was drawn (host may confirm for an absent player after a while). */
  at?: number;
}

export interface CircleRoom {
  id: string;
  status: CircleStatus;
  hostId: string;
  players: Record<string, Player>;
  playerOrder: string[];
  currentPlayerIndex: number;

  cards: CircleCard[];
  cardAngles: number[];

  acesDrawn: number;

  daumenKingId: string | null;
  daumenKingUses: number;

  lastQueenId: string | null;
  lastQueenName: string | null;

  gapBroken: boolean;

  customRules: string[];
  cardRules: Record<string, string>;

  pendingAction: PendingCircleAction | null;
  /** Index of the player who starts the round (rotates on restart). */
  startIndex?: number;
  isLocal?: boolean;
  createdAt: number;
  expireAt?: unknown;
}
