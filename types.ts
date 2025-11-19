export enum ChestType {
  TREASURE = 'TREASURE',
  EMPTY = 'EMPTY',
  TRAP = 'TRAP'
}

export enum ChestStatus {
  CLOSED = 'CLOSED',
  REVEALED = 'REVEALED', // Shown by the host (cannot be chosen)
  OPENED = 'OPENED' // Final result
}

export interface Chest {
  id: number;
  type: ChestType;
  status: ChestStatus;
}

export enum GamePhase {
  START = 'START',
  SELECTION = 'SELECTION', // Player picks a chest
  REVEAL = 'REVEAL', // Host reveals empty chests
  DECISION = 'DECISION', // Player sticks or switches
  RESULT = 'RESULT', // Outcome shown
  GAME_OVER = 'GAME_OVER'
}

export interface RoundResult {
  round: number;
  outcome: 'WIN' | 'LOSS' | 'EMPTY';
  scoreChange: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  date: string;
}

export interface GameState {
  chests: Chest[];
  selectedChestId: number | null;
  phase: GamePhase;
  score: number;
  round: number;
  hintsUsed: number;
  history: string[]; // Chat history
  gameHistory: RoundResult[]; // Scoreboard history
  difficulty: number; 
}