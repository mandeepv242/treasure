import { GoogleGenAI } from "@google/genai";
import { Chest, ChestType, GamePhase } from '../types';

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

const FALLBACK_MESSAGES = {
  [GamePhase.START]: [
    "Welcome! The dungeon awaits your choice.",
    "Ready to test your luck?",
    "Let the games begin!",
    "Fortune favors the bold."
  ],
  [GamePhase.SELECTION]: [
    "Choose wisely...",
    "Which chest calls to you?",
    "Trust your instincts.",
    "One contains gold, beware the traps."
  ],
  [GamePhase.REVEAL]: [
    "Let's clear some dust.",
    "Interesting choice. Stick or switch?",
    "The odds have changed...",
    "Are you sure about that one?"
  ],
  [GamePhase.RESULT]: [
    "The dust settles.",
    "Let's see what you found.",
  ],
  WIN: [
    "Incredible! You found the gold!",
    "Wealth and glory are yours!",
    "A master of luck!",
    "Jackpot!"
  ],
  LOSS: [
    "Ouch! That's a trap!",
    "The dungeon claims another victim.",
    "Better luck next round.",
    "A painful mistake."
  ],
  EMPTY: [
    "Just dust and cobwebs.",
    "Empty. At least it wasn't a trap.",
    "Nothing here.",
    "Wasted effort."
  ],
  HINT: [
    "The spirits are silent right now.",
    "My crystal ball is foggy.",
    "I cannot see the future clearly.",
    "You are on your own for this one."
  ]
};

const getRandomFallback = (key: string) => {
  // @ts-ignore - Dynamic access is safe with fallback
  const messages = FALLBACK_MESSAGES[key] || FALLBACK_MESSAGES[GamePhase.SELECTION];
  return messages[Math.floor(Math.random() * messages.length)];
};

export const generateFlavorText = async (
  phase: GamePhase,
  round: number,
  lastAction?: string,
  outcome?: string
): Promise<string> => {
  const ai = getAI();
  
  // Construct Prompt
  let prompt = `You are the Game Host of "Treasure Chest Roulette". You are exciting, friendly, and slightly suspenseful.
  Current Round: ${round}. Phase: ${phase}.`;

  if (phase === GamePhase.START) {
    prompt += " Welcome the player! Keep it short and exciting (max 15 words).";
  } else if (phase === GamePhase.SELECTION) {
    prompt += " Encourage the player to pick a lucky chest. Short (max 10 words).";
  } else if (phase === GamePhase.REVEAL) {
    prompt += " You just revealed some empty chests! Ask if they want to stick or switch? (max 15 words).";
  } else if (phase === GamePhase.RESULT) {
    prompt += ` The result is: ${outcome}. 
    If Treasure: Celebrate! 
    If Trap: Ouch, sympathetic but fun. 
    If Empty: Better luck next time. 
    Max 15 words.`;
  }

  try {
    if (!ai) throw new Error("No API Key");
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text.trim();
  } catch (error: any) {
    // Suppress error logging for Quota Exceeded (429) to keep console clean
    const isQuotaError = JSON.stringify(error).includes('429') || 
                         error?.status === 'RESOURCE_EXHAUSTED' ||
                         error?.message?.includes('quota');

    if (!isQuotaError) {
      console.warn("Gemini API Error (using fallback):", error);
    }

    // Smart Fallback Selection
    if (phase === GamePhase.RESULT && outcome) {
        const lowerOutcome = outcome.toLowerCase();
        if (lowerOutcome.includes("treasure")) return getRandomFallback('WIN');
        if (lowerOutcome.includes("trap")) return getRandomFallback('LOSS');
        return getRandomFallback('EMPTY');
    }
    
    return getRandomFallback(phase);
  }
};

export const generateHint = async (
  chests: Chest[],
  selectedChestId: number
): Promise<string> => {
  const ai = getAI();
  
  const selectedChest = chests.find(c => c.id === selectedChestId);
  const treasureChest = chests.find(c => c.type === ChestType.TREASURE);
  
  const chestSummary = chests.map(c => 
    `Chest ${c.id}: ${c.status === 'REVEALED' ? 'Revealed Empty' : c.type}`
  ).join('\n');

  const prompt = `You are the Game Host giving a paid hint. 
  Player picked Chest ${selectedChestId}.
  Treasure is in Chest ${treasureChest?.id}.
  
  Game State:
  ${chestSummary}
  
  Give a helpful but not obvious hint.
  Example: "I wouldn't pick Chest 2" or "Chest 5 feels lucky".
  Max 15 words.`;

  try {
    if (!ai) throw new Error("No API Key");
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text.trim();
  } catch (error: any) {
    // Suppress error logging for Quota Exceeded
    const isQuotaError = JSON.stringify(error).includes('429') || 
                         error?.status === 'RESOURCE_EXHAUSTED' ||
                         error?.message?.includes('quota');

    if (!isQuotaError) {
        console.warn("Gemini Hint Error (using fallback):", error);
    }
    return getRandomFallback('HINT');
  }
};