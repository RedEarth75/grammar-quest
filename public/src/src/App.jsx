import React, { useState, useEffect, useCallback } from 'react';
import { 
  Trophy, Star, ArrowRight, AlertCircle, Volume2, VolumeX, MessageSquare,
  Loader2, Sparkles, RefreshCcw, Zap, Target, Info, Play, ShieldAlert
} from 'lucide-react';

// --- Audio Synthesis Engine ---
let audioCtx = null;
const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
};

const playSFX = (type) => {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.5);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.start(); osc.stop(now + 0.5);
    } else if (type === 'fail') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.3);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(); osc.stop(now + 0.3);
    } else if (type === 'click') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.05);
      osc.start(); osc.stop(now + 0.05);
    }
  } catch (e) {
    console.error('Audio error:', e);
  }
};

// --- API Helpers (Now using Netlify Functions) ---
const generateText = async (userQuery, systemPrompt) => {
  const response = await fetch('/.netlify/functions/generate-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userQuery, systemPrompt })
  });
  
  if (!response.ok) throw new Error('AI request failed');
  const data = await response.json();
  return data.result;
};

const playTTS = async (text) => {
  try {
    const response = await fetch('/.netlify/functions/generate-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    
    if (!response.ok) throw new Error('TTS request failed');
    const { audioData } = await response.json();
    
    const audioBlob = pcmToWav(audioData, 24000);
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    audio.play();
  } catch (e) {
    console.error("TTS failed", e);
  }
};

const pcmToWav = (base64Pcm, sampleRate) => {
  const pcmBuffer = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0)).buffer;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  view.setUint32(0, 0x46464952, true); view.setUint32(4, 36 + pcmBuffer.byteLength, true);
  view.setUint32(8, 0x45564157, true); view.setUint32(12, 0x20746d66, true);
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  view.setUint32(36, 0x61746164, true); view.setUint32(40, pcmBuffer.byteLength, true);
  const combined = new Uint8Array(header.byteLength + pcmBuffer.byteLength);
  combined.set(new Uint8Array(header), 0); 
  combined.set(new Uint8Array(pcmBuffer), header.byteLength);
  return new Blob([combined], { type: 'audio/wav' });
};

// --- Level Configuration ---
const levelConfig = {
  'er': {
    title: "Rule: +ER",
    brief: "Most short adjectives add -er.",
    examples: ["Tall → Taller", "Small → Smaller", "Fast → Faster"],
    questions: [
      { adj: "tall", sent: "Marko is ____ than his brother.", ans: "taller" },
      { adj: "small", sent: "A mouse is ____ than a rat.", ans: "smaller" },
      { adj: "long", sent: "The Vardar is ____ than the Treska.", ans: "longer" },
      { adj: "fast", sent: "A car is ____ than a bike.", ans: "faster" }
    ]
  },
  'ier': {
    title: "Rule: Y to IER",
    brief: "If the word ends in Y, remove Y and add -ier.",
    examples: ["Happy → Happier", "Funny → Funnier"],
    questions: [
      { adj: "happy", sent: "I am ____ today than yesterday.", ans: "happier" },
      { adj: "funny", sent: "This joke is ____ than that one.", ans: "funnier" },
      { adj: "heavy", sent: "An elephant is ____ than a horse.", ans: "heavier" },
      { adj: "easy", sent: "English is ____ than Maths.", ans: "easier" }
    ]
  },
  'r': {
    title: "Rule: +R",
    brief: "If the word ends in E, just add -r.",
    examples: ["Nice → Nicer", "Large → Larger", "Safe → Safer"],
    questions: [
      { adj: "nice", sent: "My teacher is ____ than yours!", ans: "nicer" },
      { adj: "large", sent: "Skopje is ____ than Tetovo.", ans: "larger" },
      { adj: "safe", sent: "A helmet makes you ____.", ans: "safer" },
      { adj: "late", sent: "He was ____ than me today.", ans: "later" }
    ]
  },
  'more': {
    title: "Rule: MORE + Long",
    brief: "For long adjectives (2+ syllables), use MORE before the word.",
    examples: ["Beautiful → More beautiful", "Expensive → More expensive"],
    questions: [
      { adj: "beautiful", sent: "Lake Ohrid is ____ than this pool.", ans: "more beautiful" },
      { adj: "expensive", sent: "A phone is ____ than a book.", ans: "more expensive" },
      { adj: "intelligent", sent: "Dolphins are ____ than sharks.", ans: "more intelligent" },
      { adj: "difficult", sent: "Physics is ____ than English.", ans: "more difficult" }
    ]
  },
  'comp_irregular': {
    title: "Comparative Irregulars",
    brief: "These words are special. Good and Bad change completely!",
    examples: ["Good → Better", "Bad → Worse"],
    questions: [
      { adj: "good", sent: "This pizza is ____ than the last one.", ans: "better" },
      { adj: "bad", sent: "My cold is ____ today.", ans: "worse" },
      { adj: "good", sent: "Your English is ____ every day!", ans: "better" },
      { adj: "bad", sent: "The weather is ____ than on Monday.", ans: "worse" }
    ]
  },
  'than': {
    title: "The 'Than' Bridge",
    brief: "In comparative sentences, we usually need 'is/are' + 'than'.",
    examples: ["Apples ARE sweeter THAN lemons."],
    questions: [
      { adj: "cheap", sent: "Apples / be / ____ / oranges.", ans: "are cheaper than" },
      { adj: "tall", sent: "My father / be / ____ / me.", ans: "is taller than" },
      { adj: "hot", sent: "August / be / ____ / May.", ans: "is hotter than" }
    ]
  },
  'est': {
    title: "Rule: THE +EST",
    brief: "For short superlatives, add -est at the end.",
    examples: ["Tall → The Tallest", "Small → The Smallest"],
    questions: [
      { adj: "tall", sent: "Ivan is the ____ boy in class.", ans: "tallest" },
      { adj: "fast", sent: "The cheetah is the ____ animal.", ans: "fastest" },
      { adj: "old", sent: "My grandma is the ____ in the family.", ans: "oldest" }
    ]
  },
  'iest': {
    title: "Rule: THE +IEST",
    brief: "For Y words, remove Y and add -iest.",
    examples: ["Funny → The Funniest", "Happy → The Happiest"],
    questions: [
      { adj: "funny", sent: "That movie was the ____ ever!", ans: "funniest" },
      { adj: "happy", sent: "She is the ____ person I know.", ans: "happiest" },
      { adj: "heavy", sent: "This is the ____ suitcase.", ans: "heaviest" }
    ]
  },
  'st': {
    title: "Rule: THE +ST",
    brief: "If it ends in E, just add -st for the superlative.",
    examples: ["Nice → The Nicest", "Large → The Largest"],
    questions: [
      { adj: "nice", sent: "He is the ____ boy I've met.", ans: "nicest" },
      { adj: "large", sent: "Jupiter is the ____ planet.", ans: "largest" },
      { adj: "wide", sent: "The Vardar is ____ here.", ans: "widest" }
    ]
  },
  'most': {
    title: "Rule: THE MOST + Long",
    brief: "For long adjectives (2+ syllables), use THE MOST.",
    examples: ["Beautiful → The most beautiful", "Interesting → The most interesting"],
    questions: [
      { adj: "beautiful", sent: "She is the ____ girl in school.", ans: "most beautiful" },
      { adj: "expensive", sent: "This is the ____ car in the shop.", ans: "most expensive" },
      { adj: "interesting", sent: "This is the ____ book I have.", ans: "most interesting" }
    ]
  },
  'super_irregular': {
    title: "Superlative Irregulars",
    brief: "Good and Bad in their ultimate forms!",
    examples: ["Good → The Best", "Bad → The Worst"],
    questions: [
      { adj: "good", sent: "This is the ____ day of my life!", ans: "best" },
      { adj: "bad", sent: "That was the ____ pizza ever.", ans: "worst" },
      { adj: "good", sent: "She is the ____ singer in school.", ans: "best" }
    ]
  },
  'mixed_boss': {
    title: "FINAL BOSS: Mixed Forms",
    brief: "Decide: Is it 2 people (Comparative) or a whole group (Superlative)? Choose the rule!",
    examples: ["Comparing 2? (+er/more)", "Comparing 3+? (+est/most)"],
    questions: [
      { adj: "small", sent: "A cat is ____ than a dog.", ans: "smaller" },
      { adj: "good", sent: "I am the ____ player in the team.", ans: "best" },
      { adj: "funny", sent: "This is the ____ joke in the book.", ans: "funniest" },
      { adj: "expensive", sent: "Gold is ____ than silver.", ans: "more expensive" },
      { adj: "bad", sent: "Yesterday was ____ than today.", ans: "worse" },
      { adj: "tall", sent: "He is the ____ boy in the world.", ans: "tallest" }
    ]
  }
};

const levelOrder = ['er', 'ier', 'r', 'more', 'comp_irregular', 'than', 'est', 'iest', 'st', 'most', 'super_irregular', 'mixed_boss'];

const App = () => {
  const [gameState, setGameState] = useState('menu');
  const [currentLevelKey, setCurrentLevelKey] = useState('');
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHint, setAiHint] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [audioInitialized, setAudioInitialized] = useState(false);

  // Load progress from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('grammarQuestScore');
    if (saved) setScore(parseInt(saved));
  }, []);

  // Save progress
  useEffect(() => {
    localStorage.setItem('grammarQuestScore', score.toString());
  }, [score]);

  // Initialize audio on first interaction
  const initAudio = useCallback(() => {
    if (!audioInitialized) {
      getAudioContext()?.resume();
      setAudioInitialized(true);
    }
  }, [audioInitialized]);

  const currentLevelData = levelConfig[currentLevelKey] || { questions: [] };
  const currentQ = currentLevelData.questions[currentQuestionIdx];

  const startMission = (key) => {
    initAudio();
    if (audioEnabled) playSFX('click');
    setCurrentLevelKey(key);
    setGameState('brief');
    setCurrentQuestionIdx(0);
    setInput('');
    setFeedback(null);
    setAiHint('');
  };

  const deploy = () => {
    if (audioEnabled) playSFX('click');
    setGameState('play');
  };

  const checkAnswer = () => {
    initAudio();
    const isCorrect = input.toLowerCase().trim() === currentQ.ans.toLowerCase();
    if (isCorrect) {
      if (audioEnabled) playSFX('success');
      setScore(s => s + 50);
      setFeedback({ type: 'success', text: 'CRITICAL HIT! +50 XP' });
      setAiHint('');
      setTimeout(() => {
        if (currentQuestionIdx < currentLevelData.questions.length - 1) {
          setCurrentQuestionIdx(idx => idx + 1);
          setInput('');
          setFeedback(null);
        } else {
          const nextIdx = levelOrder.indexOf(currentLevelKey) + 1;
          if (nextIdx < levelOrder.length) {
            startMission(levelOrder[nextIdx]);
          } else {
            setGameState('final');
          }
        }
      }, 1200);
    } else {
      if (audioEnabled) playSFX('fail');
      setFeedback({ type: 'error', text: 'MISS! TRY AGAIN' });
    }
  };

  const getAiHint = async () => {
    initAudio();
    setAiLoading(true);
    if (audioEnabled) playSFX('click');
    try {
      const prompt = `Student needs a hint for "<span class="math-placeholder" data-math-id="MATHINLINE0"></span>{currentQ.sent}". Correct is "${currentQ.ans}". 
      HINT GUIDELINES:
      1. IF Irregular (good/bad): Tell them it's a legendary drop they must memorize (no -er/-est).
      2. IF ends in Y: Mention peeling off the Y and dropping an I instead.
      3. IF long (2+ syllables): Mention "Heavy Loot" needs "More/Most" support.
      4. IF short: Mention standard "er" or "est" attachments.
      ACT AS: Either Peely (using banana/fruit puns like "A-peel-ing" or "Going Bananas") OR Agent Jonesy (using tactical terms like "Mission Objective", "Squad", "Deploy"). Start the hint by identifying who you are. Keep it under 40 words.`;
      
      const systemPrompt = "You are a Fortnite Grammar Coach (Jonesy or Peely). Provide short, funny, but grammatically precise hints for 6th grade English students. Use Fortnite lingo. Return JSON: {\"explanation\":\"your hint\"}";
      
      const res = await generateText(prompt, systemPrompt);
      const textHint = res.explanation || res.text || "Intel error. Check your briefing, soldier!";
      setAiHint(textHint);
      if (audioEnabled) playTTS(textHint);
    } catch (e) {
      console.error('AI hint error:', e);
      setAiHint("Jonesy here: Check your gear and the spelling rule!");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f1b] p-4 font-sans text-white selection:bg-yellow-400 selection:text-black">
      <div className="max-w-xl mx-auto bg-[#1a1a2e] border-4 border-[#2d2d44] rounded-[2rem] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="relative bg-[#21213b] p-6 border-b-4 border-[#3b3b5c]">
          <div className="flex justify-between items-center relative z-10">
            <div>
              <h1 className="text-3xl font-[900] tracking-tighter uppercase italic skew-x-[-10deg] text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 leading-none">
                Grammar Quest
              </h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 italic">Comparison Royale</p>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => { initAudio(); setAudioEnabled(!audioEnabled); }} 
                aria-label={audioEnabled ? "Mute sound" : "Enable sound"}
                className={`p-2 rounded-xl border-2 transition-all ${audioEnabled ? 'bg-blue-600 border-blue-400' : 'bg-slate-800 border-slate-700'}`}
              >
                {audioEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
              <div className="bg-[#11111f] border-2 border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2">
                <Zap className="text-yellow-400 fill-yellow-400" size={16} />
                <span className="font-mono font-black text-xl tracking-tighter">{score}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 min-h-[400px]">
          {gameState === 'menu' && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <h2 className="text-4xl font-black italic skew-x-[-5deg] mb-2">BATTLE PASS</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Complete missions to unlock rewards</p>
              </div>
              <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {levelOrder.map((key, idx) => {
                  const isLocked = score < idx * 50;
                  return (
                    <button 
                      key={key} 
                      disabled={isLocked}
                      onClick={() => startMission(key)}
                      aria-label={`<span class="math-placeholder" data-math-id="MATHINLINE1"></span>{isLocked ? `Locked, need ${idx * 50} XP` : 'Available'}`}
                      className={`w-full p-4 flex justify-between items-center rounded-2xl border-b-4 transition-all focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-400 ${isLocked ? 'bg-slate-800/50 border-slate-900 opacity-40 cursor-not-allowed' : (key === 'mixed_boss' ? 'bg-orange-600 border-orange-800 hover:scale-[1.02] animate-pulse' : 'bg-indigo-600 border-indigo-800 hover:scale-[1.02]')}`}
                    >
                      <span className="font-black italic flex items-center gap-3 uppercase text-sm">
                         {key === 'mixed_boss' ? <ShieldAlert size={20} className="text-yellow-300" /> : (idx < 6 ? <Target size={20} /> : <Star size={20} className="text-yellow-400" />)}
                         {levelConfig[key].title}
                      </span>
                      {isLocked ? <span className="text-[10px] font-black">{idx * 50} XP</span> : <ArrowRight size={20} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {gameState === 'brief' && (
            <div className="animate-in fade-in zoom-in-95 duration-300">
               <div className="bg-blue-600/20 border-2 border-blue-500 rounded-3xl p-6 mb-6">
                 <div className="flex items-center gap-3 mb-4">
                   <Info className="text-blue-400" />
                   <h2 className="text-2xl font-black italic tracking-tighter uppercase underline decoration-blue-500 underline-offset-4">Intel Briefing</h2>
                 </div>
                 <h3 className="text-xl font-bold text-blue-300 mb-2">{currentLevelData.title}</h3>
                 <p className="text-slate-300 mb-6 font-bold">{currentLevelData.brief}</p>
                 
                 <div className="bg-[#11111f] p-4 rounded-xl border border-slate-700">
                   <p className="text-[10px] font-black text-slate-500 uppercase mb-2 italic tracking-widest">Target Data:</p>
                   <ul className="space-y-2">
                     {currentLevelData.examples.map((ex, i) => (
                       <li key={i} className="flex items-center gap-3 font-black text-yellow-400 italic text-lg">
                         <div className="w-2 h-2 bg-yellow-400 rounded-sm rotate-45" /> {ex}
                       </li>
                     ))}
                   </ul>
                 </div>
               </div>
               <button 
                 onClick={deploy} 
                 className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-2xl italic skew-x-[-5deg] border-b-8 border-blue-800 hover:brightness-110 active:border-b-0 active:translate-y-2 transition-all flex items-center justify-center gap-3 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-400"
               >
                 DEPLOY MISSION <Play fill="white" />
               </button>
            </div>
          )}

          {gameState === 'play' && (
            <div className="animate-in slide-in-from-right-4 duration-300">
              <div className="mb-8 flex justify-between items-center gap-4">
                <div className="flex-1 bg-slate-800 h-4 rounded-full border-2 border-slate-700 p-0.5">
                   <div 
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500" 
                    style={{ width: `${((currentQuestionIdx + 1) / currentLevelData.questions.length) * 100}%` }}
                    role="progressbar"
                    aria-valuenow={currentQuestionIdx + 1}
                    aria-valuemax={currentLevelData.questions.length}
                   />
                </div>
                <button 
                  onClick={() => { initAudio(); playTTS(currentQ.sent.replace('____', currentQ.ans)); }} 
                  aria-label="Read question aloud"
                  className="p-3 bg-white text-black rounded-xl hover:scale-110 transition-transform focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-400"
                >
                  <Volume2 size={24} />
                </button>
              </div>

              <div className="bg-[#21213b] p-8 rounded-[2rem] border-4 border-[#3b3b5c] shadow-2xl mb-8 relative">
                <div className="absolute -top-4 left-8 bg-blue-500 px-4 py-1 rounded text-[10px] font-black italic uppercase skew-x-[-15deg]">Active Zone</div>
                <p className="text-blue-400 font-black text-sm mb-4 tracking-widest uppercase italic">Adjective: {currentQ.adj}</p>
                <h3 id="question-text" className="text-2xl font-black leading-tight mb-4 tracking-tighter">
                  {currentQ.sent.split('____').map((p, i) => (
                    <span key={i}>
                      {p}
                      {i === 0 && (
                        <input 
                          autoFocus 
                          className="border-b-4 border-yellow-400 w-56 mx-2 bg-transparent text-center outline-none text-yellow-400 font-black focus-visible:border-yellow-300" 
                          placeholder="..." 
                          value={input} 
                          onChange={e => setInput(e.target.value)} 
                          onKeyDown={e => e.key === 'Enter' && checkAnswer()}
                          aria-label="Type your answer here"
                          aria-describedby="question-text"
                        />
                      )}
                    </span>
                  ))}
                </h3>
              </div>

              {aiHint && (
                <div className="bg-indigo-900/50 border-2 border-indigo-500/50 p-4 rounded-2xl mb-6 flex gap-3 animate-in slide-in-from-top-2">
                  <MessageSquare className="text-indigo-400 shrink-0" size={20} />
                  <p className="text-indigo-100 font-black italic text-sm leading-snug">{aiHint}</p>
                </div>
              )}

              <div className="flex gap-4">
                <button 
                  onClick={checkAnswer} 
                  className="flex-1 bg-yellow-400 text-black py-5 rounded-2xl font-black text-xl italic skew-x-[-5deg] border-b-4 border-yellow-700 hover:brightness-110 active:border-b-0 active:translate-y-1 transition-all uppercase tracking-tighter focus-visible:outline focus-visible:outline-4 focus-visible:outline-white"
                >
                  Confirm Loot
                </button>
                <button 
                  onClick={getAiHint} 
                  disabled={aiLoading} 
                  aria-label="Get AI hint"
                  className="px-6 bg-[#2d2d44] border-2 border-slate-600 rounded-2xl hover:bg-slate-700 transition-colors disabled:opacity-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-400"
                >
                  {aiLoading ? <Loader2 className="animate-spin text-yellow-400" /> : <Sparkles className="text-yellow-400" />}
                </button>
              </div>

              {feedback && (
                <div 
                  className={`text-center mt-6 font-black italic text-2xl animate-pulse ${feedback.type === 'success' ? 'text-green-400' : 'text-red-500'}`}
                  role="alert"
                  aria-live="assertive"
                >
                  {feedback.type === 'success' ? '✅ ' : '❌ '}{feedback.text}
                </div>
              )}
            </div>
          )}

          {gameState === 'final' && (
            <div className="text-center py-10">
              <Trophy size={100} className="mx-auto text-yellow-400 mb-8 drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]" />
              <h2 className="text-5xl font-black italic skew-x-[-10deg] mb-2 tracking-tighter">VICTORY ROYALE</h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest mb-8">You finished the entire Battle Pass!</p>
              <div className="flex flex-col gap-3 max-w-[300px] mx-auto">
                <button 
                  onClick={() => { setGameState('menu'); setScore(0); localStorage.removeItem('grammarQuestScore'); }} 
                  className="w-full p-5 bg-white text-black rounded-2xl font-black text-xl italic flex items-center justify-center gap-3 hover:scale-105 transition-transform focus-visible:outline focus-visible:outline-4 focus-visible:outline-yellow-400"
                >
                  <RefreshCcw size={24} /> REPLAY SEASON
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tactical Status Bar */}
        {gameState !== 'menu' && gameState !== 'final' && (
          <div className="p-3 bg-black/40 flex justify-center gap-1">
            {levelOrder.map(k => (
              <div 
                key={k} 
                className={`h-2 flex-1 rounded-full transition-all ${currentLevelKey === k ? 'bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.5)]' : 'bg-slate-700'}`}
                aria-label={`Level ${levelConfig[k].title}`} 
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #11111f; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3b3b5c; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4b4b7c; }
        
        button:focus-visible {
          outline-offset: 2px;
        }
        
        @keyframes slide-in-from-right-4 {
          from { transform: translateX(1rem); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        
        @keyframes slide-in-from-top-2 {
          from { transform: translateY(-0.5rem); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        .animate-in {
          animation-duration: 0.3s;
          animation-fill-mode: both;
        }
        
        .fade-in { animation-name: fadeIn; }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .zoom-in-95 { animation-name: zoomIn95; }
        @keyframes zoomIn95 {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        
        .slide-in-from-right-4 { animation-name: slide-in-from-right-4; }
        .slide-in-from-top-2 { animation-name: slide-in-from-top-2; }
      `}</style>
    </div>
  );
};

export default App;
