import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Chest, ChestType, ChestStatus, GamePhase, GameState, RoundResult, LeaderboardEntry } from './types';
import { INITIAL_SCORE, getChestCount, COST_PER_HINT, TREASURE_REWARD, TRAP_PENALTY, EMPTY_PENALTY, MAX_ROUNDS } from './constants';
import { generateFlavorText, generateHint } from './services/geminiService';
import { ChestItem } from './components/ChestItem';
import { TreasureIcon, SkullIcon } from './components/Icons';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    chests: [],
    selectedChestId: null,
    phase: GamePhase.START,
    score: INITIAL_SCORE,
    round: 1,
    hintsUsed: 0,
    history: [],
    gameHistory: [],
    difficulty: 1,
  });
  
  const [hostMessage, setHostMessage] = useState<string>("Welcome player!");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [scoreSaved, setScoreSaved] = useState(false);
  
  // Ref to track the current round to prevent stale AI responses from overwriting new rounds
  const currentRoundRef = useRef(1);
  // Ref to track phase to prevent stale messages
  const currentPhaseRef = useRef(GamePhase.START);

  // Load leaderboard on mount
  useEffect(() => {
    const saved = localStorage.getItem('chest_roulette_leaderboard');
    if (saved) {
      try {
        setLeaderboard(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load leaderboard", e);
      }
    }
  }, []);

  // Update refs when state changes
  useEffect(() => {
    currentRoundRef.current = gameState.round;
    currentPhaseRef.current = gameState.phase;
  }, [gameState.round, gameState.phase]);

  // Helper to safely update host message if we are still in the same context
  const safeSetHostMessage = (text: string, intendedRound: number, intendedPhase: GamePhase) => {
    if (currentRoundRef.current === intendedRound && currentPhaseRef.current === intendedPhase) {
      setHostMessage(text);
    }
  };

  // Initialize a new round
  const initializeRound = useCallback((round: number, score: number, existingHistory: RoundResult[]) => {
    const count = getChestCount(round);
    
    // Simple Logic: 1 Treasure, some traps, rest empty
    const trapCount = Math.max(1, Math.floor(round / 1.5));
    const treasureCount = 1;
    const emptyCount = count - treasureCount - trapCount;

    let types = [
      ...Array(treasureCount).fill(ChestType.TREASURE),
      ...Array(trapCount).fill(ChestType.TRAP),
      ...Array(emptyCount).fill(ChestType.EMPTY)
    ];

    // Shuffle
    types = types.sort(() => Math.random() - 0.5);

    const newChests: Chest[] = types.map((type, index) => ({
      id: index + 1,
      type,
      status: ChestStatus.CLOSED
    }));

    // INSTANT UPDATE
    setGameState({
      chests: newChests,
      selectedChestId: null,
      phase: GamePhase.SELECTION,
      round,
      score,
      hintsUsed: 0,
      history: [],
      gameHistory: existingHistory,
      difficulty: 1
    });

    // Instant feedback
    const msg = round === MAX_ROUNDS ? "FINAL ROUND! Make it count!" : `Round ${round} begins! Pick a chest.`;
    setHostMessage(msg);

    // Background AI
    generateFlavorText(GamePhase.SELECTION, round)
      .then(text => safeSetHostMessage(text, round, GamePhase.SELECTION));
  }, []);

  const startGame = () => {
    setScoreSaved(false);
    setPlayerName("");
    initializeRound(1, INITIAL_SCORE, []);
  };

  const handleSelectChest = (id: number) => {
    if (gameState.phase === GamePhase.SELECTION || gameState.phase === GamePhase.DECISION) {
      setGameState(prev => ({
        ...prev,
        selectedChestId: id
      }));
    }
  };

  const handleConfirmSelection = () => {
    if (!gameState.selectedChestId) return;

    // Reveal some empty chests (not the selected one, not the treasure)
    const { chests, selectedChestId, round } = gameState;
    
    const availableToReveal = chests.filter(c => 
      c.id !== selectedChestId && 
      c.type !== ChestType.TREASURE && 
      c.status === ChestStatus.CLOSED
    );

    const numToReveal = Math.max(1, Math.floor(availableToReveal.length / 2));
    const toReveal = availableToReveal.sort(() => Math.random() - 0.5).slice(0, numToReveal);
    const revealIds = toReveal.map(c => c.id);

    const updatedChests = chests.map(c => 
      revealIds.includes(c.id) ? { ...c, status: ChestStatus.REVEALED } : c
    );

    // INSTANT UPDATE
    setGameState(prev => ({
      ...prev,
      chests: updatedChests,
      phase: GamePhase.DECISION 
    }));

    // Instant feedback
    setHostMessage("Revealing empty chests... Stick with your choice or switch?");

    // Background AI
    generateFlavorText(GamePhase.REVEAL, round)
      .then(text => safeSetHostMessage(text, round, GamePhase.DECISION));
  };

  const handleFinalDecision = () => {
    if (!gameState.selectedChestId) return;

    const { chests, selectedChestId, round, score, gameHistory } = gameState;
    const chest = chests.find(c => c.id === selectedChestId);
    if (!chest) return;

    let outcome = "";
    let resultType: 'WIN' | 'LOSS' | 'EMPTY' = 'EMPTY';
    let scoreChange = 0;

    if (chest.type === ChestType.TREASURE) {
      outcome = "TREASURE!";
      resultType = 'WIN';
      scoreChange = TREASURE_REWARD;
    } else if (chest.type === ChestType.TRAP) {
      outcome = "TRAP!";
      resultType = 'LOSS';
      scoreChange = -TRAP_PENALTY;
    } else {
      outcome = "DUST.";
      resultType = 'EMPTY';
      scoreChange = -EMPTY_PENALTY;
    }

    const newScore = Math.max(0, score + scoreChange);
    
    const roundResult: RoundResult = {
      round: round,
      outcome: resultType,
      scoreChange: scoreChange
    };

    // Open chosen chest first - INSTANT UPDATE
    const chosenOpenedChests = chests.map(c => 
       c.id === selectedChestId ? { ...c, status: ChestStatus.OPENED } : c
    );

    setGameState(prev => ({
      ...prev,
      chests: chosenOpenedChests,
      score: newScore,
      phase: GamePhase.RESULT,
      gameHistory: [...gameHistory, roundResult]
    }));

    // Instant feedback based on result
    const initialMsg = resultType === 'WIN' ? "AMAZING! You found the treasure!" : 
                       resultType === 'LOSS' ? "Oh no! It's a trap!" : "Nothing but dust...";
    setHostMessage(initialMsg);

    // Background AI
    generateFlavorText(GamePhase.RESULT, round, undefined, outcome)
      .then(text => safeSetHostMessage(text, round, GamePhase.RESULT));

    // Reveal the rest after a short dramatic delay (visual only, state is already RESULT)
    setTimeout(() => {
      setGameState(prev => {
        // Only update if we are still in the same round/phase context
        if (prev.round !== round) return prev;

        const fullyOpenedChests = prev.chests.map(c => ({...c, status: ChestStatus.OPENED}));
        if (prev.score <= 0) {
           setHostMessage("Game Over! You're broke!");
           return {...prev, chests: fullyOpenedChests, phase: GamePhase.GAME_OVER};
        }
        return {...prev, chests: fullyOpenedChests};
      });
    }, 1000);
  };

  const handleNextRound = () => {
    if (gameState.round >= MAX_ROUNDS) {
      // Victory condition (or just survival)
      setGameState(prev => ({ ...prev, phase: GamePhase.GAME_OVER }));
      setHostMessage("Congratulations! You've survived the dungeon!");
    } else {
      initializeRound(gameState.round + 1, gameState.score, gameState.gameHistory);
    }
  };

  const handleBuyHint = () => {
    if (gameState.score < COST_PER_HINT || !gameState.selectedChestId) return;
    
    // INSTANT UPDATE
    setGameState(prev => ({
      ...prev,
      score: prev.score - COST_PER_HINT,
      hintsUsed: prev.hintsUsed + 1
    }));
    
    // Instant feedback
    setHostMessage("Consulting the spirits... (30 gold paid)");
    
    // Background AI
    generateHint(gameState.chests, gameState.selectedChestId)
      .then(hintText => {
         // Only show hint if we are still in the decision phase of the same round
         if (currentRoundRef.current === gameState.round && currentPhaseRef.current === GamePhase.DECISION) {
             setHostMessage(`Hint: "${hintText}"`);
         }
      });
  };

  const handleSaveScore = () => {
    if (!playerName.trim() || scoreSaved) return;

    const newEntry: LeaderboardEntry = {
      id: Date.now().toString(),
      name: playerName.trim(),
      score: gameState.score,
      date: new Date().toLocaleDateString()
    };

    const updatedLeaderboard = [...leaderboard, newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 50); // Keep top 50

    setLeaderboard(updatedLeaderboard);
    localStorage.setItem('chest_roulette_leaderboard', JSON.stringify(updatedLeaderboard));
    setScoreSaved(true);
    setShowLeaderboard(true); // Switch sidebar to leaderboard
    
    // Reset to start screen after a delay
    setTimeout(() => {
      setGameState(prev => ({ ...prev, phase: GamePhase.START }));
    }, 1500);
  };

  // --- Render Helpers ---

  if (gameState.phase === GamePhase.START) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 font-display text-white relative overflow-hidden">
        {/* Decorative background blobs */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-32 left-20 w-96 h-96 bg-pink-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

        <div className="relative z-10 max-w-2xl w-full bg-slate-800/80 backdrop-blur-lg p-8 rounded-3xl border border-slate-700 shadow-2xl text-center">
           <div className="flex justify-center mb-6">
             <div className="w-20 h-20 bg-yellow-500 rounded-2xl flex items-center justify-center shadow-lg rotate-12 transform hover:rotate-0 transition-transform duration-300">
               <TreasureIcon className="w-12 h-12 text-white" />
             </div>
           </div>
           
           <h1 className="text-4xl md:text-6xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-yellow-600">
             Treasure Chest Roulette
           </h1>
           
           <p className="text-xl text-slate-300 mb-8">
             Survive 5 Rounds. Trust your gut. Win the gold.
           </p>

           <div className="grid md:grid-cols-3 gap-4 mb-10 text-left">
              <div className="bg-slate-700/50 p-4 rounded-xl">
                <span className="block text-2xl mb-2">🎯</span>
                <h3 className="font-bold text-yellow-400">Pick a Chest</h3>
                <p className="text-sm text-slate-400">One holds treasure. Others hold traps or dust.</p>
              </div>
              <div className="bg-slate-700/50 p-4 rounded-xl">
                <span className="block text-2xl mb-2">👀</span>
                <h3 className="font-bold text-cyan-400">Watch & Wait</h3>
                <p className="text-sm text-slate-400">Empty chests will be revealed to help you.</p>
              </div>
              <div className="bg-slate-700/50 p-4 rounded-xl">
                <span className="block text-2xl mb-2">🤔</span>
                <h3 className="font-bold text-emerald-400">Stick or Switch</h3>
                <p className="text-sm text-slate-400">Change your mind to improve your odds!</p>
              </div>
           </div>

           <button 
             onClick={startGame}
             className="w-full md:w-auto px-10 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-bold text-xl rounded-full shadow-xl transform hover:scale-105 active:scale-95 transition-all"
           >
             START GAME
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-body flex flex-col md:flex-row overflow-hidden">
      {/* Sidebar Scoreboard */}
      <div className="w-full md:w-72 bg-slate-800 border-r border-slate-700 flex flex-col shadow-2xl z-20 relative shrink-0">
        <div className="p-6 border-b border-slate-700 bg-slate-800/80 backdrop-blur-sm">
           <h2 className="font-display text-2xl font-bold text-yellow-400 tracking-wide">Scoreboard</h2>
           <div className="mt-4 flex justify-between items-end bg-slate-900/50 p-3 rounded-lg border border-slate-700">
             <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Current Gold</span>
             <span className={`text-3xl font-bold ${gameState.score < 50 ? 'text-red-400' : 'text-yellow-300'}`}>
               {gameState.score}
             </span>
           </div>
           
           {/* Toggle Buttons */}
           <div className="flex mt-4 bg-slate-900/50 p-1 rounded-lg">
             <button 
               onClick={() => setShowLeaderboard(false)}
               className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${!showLeaderboard ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
             >
               Current Run
             </button>
             <button 
               onClick={() => setShowLeaderboard(true)}
               className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${showLeaderboard ? 'bg-slate-700 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
             >
               Leaderboard
             </button>
           </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-600">
           {!showLeaderboard ? (
             <>
                {gameState.gameHistory.length === 0 && (
                  <div className="text-center text-slate-600 italic mt-10 flex flex-col items-center">
                    <span className="text-4xl mb-2 opacity-20">📜</span>
                    <p>Your legends will appear here...</p>
                  </div>
                )}
                {[...gameState.gameHistory].reverse().map((round, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-slate-700/30 border border-slate-700/50 rounded-lg text-sm hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-xs border border-slate-600">
                          {round.round}
                        </div>
                        <div className="flex flex-col">
                          {round.outcome === 'WIN' && <span className="text-yellow-400 font-bold">Treasure Found</span>}
                          {round.outcome === 'LOSS' && <span className="text-red-400 font-bold">Trap Triggered</span>}
                          {round.outcome === 'EMPTY' && <span className="text-gray-400 font-bold">Empty Chest</span>}
                          <span className="text-xs text-slate-500">Round {round.round}</span>
                        </div>
                      </div>
                      <span className={`font-mono font-bold ${round.scoreChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {round.scoreChange > 0 ? '+' : ''}{round.scoreChange}
                      </span>
                  </div>
                ))}
             </>
           ) : (
             <>
               {leaderboard.length === 0 && (
                  <div className="text-center text-slate-600 italic mt-10 flex flex-col items-center">
                    <span className="text-4xl mb-2 opacity-20">🏆</span>
                    <p>No high scores yet.</p>
                  </div>
               )}
               {leaderboard.map((entry, idx) => (
                 <div key={entry.id} className="flex items-center justify-between p-3 bg-slate-700/30 border border-slate-700/50 rounded-lg text-sm">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs 
                        ${idx === 0 ? 'bg-yellow-500 text-black' : 
                          idx === 1 ? 'bg-gray-400 text-black' : 
                          idx === 2 ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                        {idx + 1}
                      </div>
                      <div className="flex flex-col">
                         <span className="font-bold text-white">{entry.name}</span>
                         <span className="text-[10px] text-slate-500">{entry.date}</span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-yellow-400">{entry.score}</span>
                 </div>
               ))}
             </>
           )}
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 to-slate-900">
        {/* Mobile Top Bar */}
        <div className="p-4 flex justify-between items-center md:hidden bg-slate-800 shadow-lg z-30">
          <span className="font-bold text-yellow-400">Gold: {gameState.score}</span>
          <span className="text-slate-400 text-sm font-bold">ROUND {gameState.round} / {MAX_ROUNDS}</span>
        </div>

        <div className="flex-1 flex flex-col items-center p-4 md:p-8 max-w-6xl mx-auto w-full">
           
           {gameState.phase === GamePhase.GAME_OVER ? (
             <div className="text-center flex flex-col items-center justify-center h-full animate-pop my-auto max-w-md w-full">
                <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 animate-pulse ${gameState.score > 0 ? 'bg-yellow-900/20' : 'bg-red-900/20'}`}>
                  {gameState.score > 0 ? (
                    <TreasureIcon className="w-20 h-20 text-yellow-500" />
                  ) : (
                    <SkullIcon className="w-20 h-20 text-red-500" />
                  )}
                </div>
                <h2 className="text-5xl md:text-6xl font-display font-bold text-white mb-2 tracking-tight">
                  {gameState.score > 0 ? "VICTORY!" : "GAME OVER"}
                </h2>
                <p className="text-2xl text-slate-400 mb-8">
                  {gameState.score > 0 ? `You survived with ${gameState.score} gold!` : "The dungeon claimed another soul."}
                </p>

                {gameState.score > 0 && !scoreSaved && (
                   <div className="w-full bg-slate-800 p-6 rounded-2xl border border-slate-700 mb-6 animate-pop">
                      <label className="block text-sm font-bold text-slate-400 mb-2 uppercase">Enter Your Name</label>
                      <input 
                        type="text" 
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        placeholder="Legendary Hero"
                        className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500 mb-4 text-center font-bold text-xl placeholder-slate-600"
                        maxLength={12}
                      />
                      <button 
                        onClick={handleSaveScore}
                        disabled={!playerName.trim()}
                        className="w-full px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-black font-bold rounded-xl transition-colors"
                      >
                        Save to Leaderboard
                      </button>
                   </div>
                )}

                <div className="flex gap-4">
                  <button 
                    onClick={() => setGameState(prev => ({ ...prev, phase: GamePhase.START }))}
                    className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-full font-bold shadow-lg transition-all"
                  >
                    Return to Title
                  </button>
                  
                  {/* If they didn't win or already saved, allow restart directly */}
                  {(gameState.score <= 0 || scoreSaved) && (
                    <button 
                      onClick={() => initializeRound(1, INITIAL_SCORE, [])}
                      className="px-8 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white rounded-full font-bold shadow-lg transform hover:-translate-y-1 transition-all"
                    >
                      Play Again
                    </button>
                  )}
                </div>
             </div>
           ) : (
             <>
                {/* Host Message Bubble */}
                <div className="w-full max-w-3xl mb-8 relative mt-4">
                  <div className="bg-white text-slate-900 p-6 rounded-3xl rounded-bl-none shadow-xl border-4 border-slate-200 flex flex-col md:flex-row items-center gap-5 transition-all duration-300">
                    <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center shrink-0 shadow-md border-2 border-white">
                      <span className="text-2xl">🎤</span>
                    </div>
                    <div className="flex-1 w-full">
                      <p className="text-xs text-indigo-600 font-black uppercase tracking-widest mb-1">Game Host</p>
                      <p className="text-xl font-bold leading-tight text-slate-800 font-display">"{hostMessage}"</p>
                    </div>
                    <div className="hidden md:block text-right">
                      <div className="text-xs font-bold text-slate-400 uppercase">Round</div>
                      <div className="text-3xl font-black text-slate-200 leading-none">{gameState.round}/{MAX_ROUNDS}</div>
                    </div>
                  </div>
                </div>

                {/* Phase Stepper */}
                <div className="mb-8 flex items-center gap-1 md:gap-3 bg-slate-800/50 p-1.5 rounded-full border border-slate-700/50 backdrop-blur-sm">
                   <div className={`px-4 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all ${gameState.phase === GamePhase.SELECTION ? 'bg-cyan-500 text-black shadow-lg' : 'text-slate-500'}`}>1. PICK</div>
                   <div className="w-4 h-0.5 bg-slate-700"></div>
                   <div className={`px-4 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all ${gameState.phase === GamePhase.REVEAL || gameState.phase === GamePhase.DECISION ? 'bg-cyan-500 text-black shadow-lg' : 'text-slate-500'}`}>2. DECIDE</div>
                   <div className="w-4 h-0.5 bg-slate-700"></div>
                   <div className={`px-4 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all ${gameState.phase === GamePhase.RESULT ? 'bg-cyan-500 text-black shadow-lg' : 'text-slate-500'}`}>3. RESULT</div>
                </div>

                {/* Game Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 md:gap-6 mb-24 w-full max-w-4xl justify-items-center perspective-1000">
                  {gameState.chests.map(chest => (
                    <ChestItem 
                      key={chest.id}
                      chest={chest}
                      isSelected={gameState.selectedChestId === chest.id}
                      disabled={gameState.phase === GamePhase.RESULT}
                      isDimmed={
                        gameState.phase === GamePhase.DECISION && 
                        chest.status === ChestStatus.REVEALED
                      }
                      onClick={() => handleSelectChest(chest.id)}
                    />
                  ))}
                </div>

                {/* Floating Action Bar */}
                <div className="fixed bottom-6 left-0 right-0 flex justify-center px-4 z-40 pointer-events-none">
                  <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-700 shadow-2xl backdrop-blur-md flex flex-wrap justify-center gap-4 pointer-events-auto transform transition-all duration-300">
                    
                    {gameState.phase === GamePhase.SELECTION && (
                      <button
                        disabled={!gameState.selectedChestId}
                        onClick={handleConfirmSelection}
                        className={`px-8 py-3 rounded-xl font-bold text-lg transition-all shadow-lg min-w-[200px]
                          ${!gameState.selectedChestId 
                            ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50' 
                            : 'bg-cyan-500 hover:bg-cyan-400 text-black hover:-translate-y-1 active:translate-y-0'
                          }
                        `}
                      >
                        {gameState.selectedChestId ? `Lock In Chest #${gameState.selectedChestId}` : 'Select a Chest'}
                      </button>
                    )}

                    {gameState.phase === GamePhase.DECISION && (
                      <>
                        <button
                          onClick={handleFinalDecision}
                          className="px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-lg shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-1 active:translate-y-0 transition-all min-w-[180px]"
                        >
                          OPEN IT!
                        </button>
                        
                        <button
                          disabled={gameState.score < COST_PER_HINT}
                          onClick={handleBuyHint}
                          className={`px-6 py-3 rounded-xl border-2 font-bold flex items-center gap-2 transition-all
                            ${gameState.score < COST_PER_HINT
                              ? 'border-slate-700 text-slate-600 cursor-not-allowed bg-slate-800/50'
                              : 'border-purple-500 text-purple-300 hover:bg-purple-500/10 hover:border-purple-400'
                            }
                          `}
                        >
                          <span>Hint</span>
                          <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">-{COST_PER_HINT}g</span>
                        </button>
                      </>
                    )}

                    {gameState.phase === GamePhase.RESULT && (
                       <button
                         onClick={handleNextRound}
                         className="px-12 py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-lg shadow-lg hover:shadow-yellow-500/20 animate-bounce-short min-w-[200px]"
                       >
                         {gameState.round >= MAX_ROUNDS ? 'Finish Game 🏆' : `Start Round ${gameState.round + 1} ➜`}
                       </button>
                    )}
                  </div>
                </div>
             </>
           )}
        </div>
      </div>
    </div>
  );
};

export default App;