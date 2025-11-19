import { GoogleGenAI } from "@google/genai";
import { Chest, ChestType, GamePhase } from '../types';

const getAI = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.warn("API Key not found in environment variables.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const generateFlavorText = async (
  phase: GamePhase,
  round: number,
  lastAction?: string,
  outcome?: string
): Promise<string> => {
  const ai = getAI();
  if (!ai) return "The Host smiles waiting for the game to start.";

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
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Choose wisely!";
  }
};

export const generateHint = async (
  chests: Chest[],
  selectedChestId: number
): Promise<string> => {
  const ai = getAI();
  if (!ai) return "I can't help you right now.";

  const selectedChest = chests.find(c => c.id === selectedChestId);
  const treasureChest = chests.find(c => c.type === ChestType.TREASURE);
  
  // Prepare a logical representation for the AI
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
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text.trim();
  } catch (error) {
    return "Trust your gut.";
  }
};