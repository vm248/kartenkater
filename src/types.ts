export type CardValue = number | 'B' | 'D' | 'K' | 'A';
export type CardSuit = '♥' | '♦' | '♣' | '♠';

export interface Card {
  value: CardValue;
  suit: CardSuit;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  joinedAt: number;
}

export type GameStatus =
  | 'lobby'
  | 'phase1'
  | 'phase2start'
  | 'phase2'
  | 'results'
  | 'phase3'
  | 'finished';

export interface GameSettings {
  deckType: 'skat' | 'full';
  guessDeckCount: number;
  busDeckCount: number;
  pyramidRows: number;
  cardsPerRound: number;
  busDifficulty: 'easy' | 'normal' | 'schwer';
}

export interface PyramidCell {
  card: Card;
  revealed: boolean;
}

export interface ActionResult {
  playerId: string;
  playerName: string;
  correct: boolean;
  card: Card;
  step: number;
  message: string;
}

export interface GameRoom {
  id: string;
  status: GameStatus;
  hostId: string;
  settings: GameSettings;
  players: Record<string, Player>;
  playerOrder: string[];
  deck: Card[];
  currentStep: number;
  currentPlayerIndex: number;
  pyramid: PyramidCell[];
  revealOrder: number[];
  pyramidIndex: number;
  busfahrerId: string | null;
  busfahrerName: string | null;
  tiebreakCandidates: string[] | null;
  busCards: (Card | null)[];
  previousBusCards: (Card | null)[];
  busIndex: number;
  useHigherLower: boolean;
  awaitingContinue: boolean;
  lastFailedIndex: number;
  lastAction: ActionResult | null;
  pyramidMatchText: string | null;
  createdAt: number;
}
