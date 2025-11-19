export const INITIAL_SCORE = 100;
export const COST_PER_HINT = 30;
export const TREASURE_REWARD = 100;
export const TRAP_PENALTY = 50;
export const EMPTY_PENALTY = 10; // Small penalty for wasting time on empty
export const MAX_ROUNDS = 5;

// Determine chest count based on round/difficulty
// Formula: 3 + Math.floor(round / 2)
export const getChestCount = (round: number) => Math.min(9, 3 + Math.floor((round - 1) / 2));

export const THEME_COLORS = {
  gold: 'text-amber-400',
  trap: 'text-red-500',
  empty: 'text-gray-400',
  accent: 'text-cyan-400'
};