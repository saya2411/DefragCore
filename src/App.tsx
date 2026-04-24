/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { 
  Hexagon, 
  Orbit, 
  Database, 
  Cpu, 
  Zap, 
  Aperture, 
  Component, 
  Boxes,
  Trophy, 
  RotateCcw, 
  Play, 
  Bomb, 
  Heart, 
  Target,
  Activity,
  Shield,
  Volume2,
  VolumeX,
  LogOut,
  X
} from 'lucide-react';
import React, { useState, useEffect, useCallback, useRef } from 'react';

// --- Constants ---
const CANVAS_WIDTH = 800;
const MAX_AMMO = 3;
const BASE_SPEED = 1.2;
const SPEED_INCREMENT = 0.08;
const AMMO_ACTIVATION_THRESHOLD = 10; // Fragments neutralized before ammo starts draining

type GameState = 'START' | 'PLAYING' | 'GAME_OVER';

interface Fragment {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: string; // Icon identifier
  isHit: boolean;
  isEscaped: boolean;
  color: string;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [fragmentsHit, setFragmentsHit] = useState(0);
  const [ammo, setAmmo] = useState(MAX_AMMO);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [flash, setFlash] = useState(false);
  const [systemAction, setSystemAction] = useState<'IDLE' | 'FAILURE' | 'SUCCESS' | 'START'>('IDLE');
  const [isCompact, setIsCompact] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioInitialized, setIsAudioInitialized] = useState(false);
  const pipWindowRef = useRef<any>(null);
  
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio Context and Background Music
  const initAudio = () => {
    if (!audioRef.current) {
      const audio = new Audio('/background-music.wav');
      // Use manual looping for more immediate restart and to respect the 0:12 start point
      audio.loop = false; 
      audio.addEventListener('ended', () => {
        audio.currentTime = 12;
        audio.play();
      });
      audio.currentTime = 12; // Start from 0:12
      audio.volume = isMuted ? 0 : 0.4;
      audioRef.current = audio;
      
      // Attempt to play only if not muted
      if (!isMuted) {
        audio.play().catch(e => console.log("Audio play blocked until interaction:", e));
      }
      setIsAudioInitialized(true);
    }

    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioCtxRef.current = ctx;
    }
    
    if (audioCtxRef.current.state === 'suspended' && !isMuted) {
      audioCtxRef.current.resume();
    }
  };

  // Sync music to game state and mute
  useEffect(() => {
    const handleGlobalInteraction = (e: KeyboardEvent) => {
      if (gameState === 'START' || gameState === 'GAME_OVER') {
        // Allow starting game with any key (except escape/system keys)
        if (e.key.length === 1 || e.key === 'Enter' || e.key === ' ') {
          startGame();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalInteraction);
    return () => window.removeEventListener('keydown', handleGlobalInteraction);
  }, [gameState]);

  useEffect(() => {
    if (!audioRef.current) return;
    
    if (isMuted) {
      audioRef.current.volume = 0;
      audioRef.current.pause();
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        audioCtxRef.current.suspend();
      }
    } else {
      audioRef.current.volume = 0.4;
      if (isAudioInitialized) {
        audioRef.current.play().catch(() => {});
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    }
  }, [isMuted, isAudioInitialized]);

  const playSound = (type: 'shoot' | 'hit' | 'gameover' | 'click') => {
    if (isMuted || !audioCtxRef.current || audioCtxRef.current.state === 'suspended') return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'shoot':
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'hit':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'gameover':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.6);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
        break;
      case 'click':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2000, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
    }
  };

  // Initialize Game
  const startGame = () => {
    initAudio();
    playSound('click');
    setScore(0);
    setFragmentsHit(0);
    setAmmo(MAX_AMMO);
    setGameState('PLAYING');
    startContinuousRun();
  };

  const startContinuousRun = () => {
    setSystemAction('IDLE');
    spawnFragment();
  };

  const spawnFragment = useCallback(() => {
    const side = Math.random() > 0.5 ? -50 : CANVAS_WIDTH + 50;
    // Speed increases every hit
    const currentSpeed = BASE_SPEED + (fragmentsHit * SPEED_INCREMENT);
    
    const icons = ['Hexagon', 'Orbit', 'Database', 'Cpu', 'Zap', 'Aperture', 'Component', 'Boxes'];
    const randomIcon = icons[Math.floor(Math.random() * icons.length)];

    const newFragment: Fragment = {
      id: Date.now(),
      x: side,
      y: 100 + Math.random() * 400,
      vx: (side < 0 ? 1 : -1) * (currentSpeed + Math.random() * 3),
      vy: (Math.random() - 0.5) * 6,
      type: randomIcon,
      isHit: false,
      isEscaped: false,
      color: Math.random() < 0.2 ? 'text-pink-400' : 'text-sky-400'
    };

    setFragments([newFragment]);
    setAmmo(MAX_AMMO);
  }, [fragmentsHit]);

  const shoot = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== 'PLAYING') return;
    initAudio();

    // Only drain ammo after threshold
    if (fragmentsHit >= AMMO_ACTIVATION_THRESHOLD) {
      if (ammo <= 0) return;
      setAmmo(prev => prev - 1);
    }
    
    setFlash(true);
    playSound('shoot');
    setTimeout(() => setFlash(false), 50);

    const rect = gameAreaRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    let hitOccurred = false;
    setFragments(prevFragments => {
      const next = prevFragments.map(fragment => {
        if (!fragment.isHit && !fragment.isEscaped) {
          const dx = Math.abs(fragment.x - x);
          const dy = Math.abs(fragment.y - y);
          if (dx < 60 && dy < 60) {
            hitOccurred = true;
            return { ...fragment, isHit: true, vy: 12, vx: 0 };
          }
        }
        return fragment;
      });

      if (hitOccurred) {
         setFragmentsHit(prev => prev + 1);
         setScore(prev => prev + 150 + (fragmentsHit * 10)); // Scaling score
         setSystemAction('SUCCESS');
         playSound('hit');
         spawnFragment(); // Immediate spawn next
         setTimeout(() => setSystemAction('IDLE'), 400);
      }

      return next;
    });

    if (!hitOccurred && fragmentsHit >= AMMO_ACTIVATION_THRESHOLD && ammo === 1) { 
      // Missed last shot -> Game Over
      setGameState('GAME_OVER');
      setSystemAction('FAILURE');
      playSound('gameover');
    }
  };

  const handleExit = () => {
    playSound('click');
    setGameState('START');
    setFragments([]);
    setScore(0);
    setFragmentsHit(0);
    setSystemAction('IDLE');
  };

  const enterPiP = async () => {
    if (!('documentPictureInPicture' in window)) {
      alert("Your browser doesn't support Overlay Mode yet. Try opening in a small window instead!");
      return;
    }

    if (window.self !== window.top) {
      alert("Overlay Mode requires the app to be opened in a new tab first. Click the 'Open in new tab' arrow in the top right, then try again!");
      return;
    }

    // Toggle Exit if already open
    if (pipWindowRef.current) {
      pipWindowRef.current.close();
      return;
    }

    try {
      // @ts-ignore - Document PiP is a modern API
      const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: 400,
        height: 300,
      });

      pipWindowRef.current = pipWindow;

      // Move styles to the PIP window
      [...document.styleSheets].forEach((styleSheet) => {
        try {
          const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
          const style = document.createElement('style');
          style.textContent = cssRules;
          pipWindow.document.head.appendChild(style);
        } catch (e) {
          const link = document.createElement('link');
          if (styleSheet.href) {
            link.rel = 'stylesheet';
            link.href = styleSheet.href;
            pipWindow.document.head.appendChild(link);
          }
        }
      });

      // Move the game container
      const container = document.getElementById('game-root');
      if (container) {
        pipWindow.document.body.appendChild(container);
        setIsCompact(true);
      }

      pipWindow.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
        const root = document.getElementById('pip-source');
        if (root && container) {
          root.appendChild(container);
          setIsCompact(false);
        }
      });
    } catch (err) {
      console.error('Failed to enter PiP:', err);
    }
  };

  useEffect(() => {
    let animationFrameId: number;
    const update = (time: number) => {
      setFragments(prevFragments => {
        return prevFragments.map(fragment => {
          if (fragment.isHit) {
            if (fragment.y < 800) return { ...fragment, y: fragment.y + fragment.vy };
          } else if (fragment.isEscaped) {
            if (fragment.y > -100) return { ...fragment, y: fragment.y + fragment.vy, x: fragment.x + fragment.vx };
          } else {
            let newX = fragment.x + fragment.vx;
            let newY = fragment.y + fragment.vy;
            let newVx = fragment.vx;
            let newVy = fragment.vy;

            // Bounce limits or escape?
            if (newX < -100 || newX > CANVAS_WIDTH + 100) {
                setGameState('GAME_OVER');
                playSound('gameover');
                return { ...fragment, isEscaped: true };
            }

            if (newY < 50 || newY > 550) newVy *= -1;
            return { ...fragment, x: newX, y: newY, vx: newVx, vy: newVy };
          }
          return fragment;
        });
      });
      animationFrameId = requestAnimationFrame(update);
    };
    animationFrameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  useEffect(() => {
    if (score > highScore) setHighScore(score);
  }, [score, highScore]);

  const renderFragmentIcon = (type: string, color: string) => {
    const props = { size: 60, className: `${color} filter drop-shadow-[0_0_10px_currentColor] transition-colors`, fill: "currentColor" };
    switch (type) {
      case 'Hexagon': return <Hexagon {...props} />;
      case 'Orbit': return <Orbit {...props} />;
      case 'Database': return <Database {...props} />;
      case 'Cpu': return <Cpu {...props} />;
      case 'Zap': return <Zap {...props} />;
      case 'Aperture': return <Aperture {...props} />;
      case 'Component': return <Component {...props} />;
      case 'Boxes': return <Boxes {...props} />;
      default: return <Hexagon {...props} />;
    }
  };

  return (
    <div 
      className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 font-sans select-none overflow-hidden" 
      id="pip-source"
    >
      <div 
        id="game-root"
        className={`relative w-full ${isCompact ? 'max-w-full aspect-auto min-h-screen' : 'max-w-[1024px] aspect-[4/3]'} bg-gradient-to-b from-[#1e293b] to-[#0f172a] overflow-hidden border border-white/10 rounded-xl shadow-2xl cursor-crosshair grid-bg transition-all duration-500`}
        ref={gameAreaRef}
        onClick={shoot}
      >
        {/* Flash Effect */}
        <AnimatePresence>
          {flash && (
            <motion.div 
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              className="absolute inset-0 bg-white/20 z-50 pointer-events-none blur-xl"
            />
          )}
        </AnimatePresence>

        {/* HUD Top */}
        <div className={`absolute top-0 w-full ${isCompact ? 'p-4' : 'p-10'} flex justify-between items-start z-30 pointer-events-none`}>
          <div className="flex flex-col gap-4">
            <div className={`glass-panel ${isCompact ? 'min-w-[120px] p-2' : 'min-w-[200px] p-4'} rounded-xl flex flex-col gap-1`}>
              <div className={`text-[#38bdf8] ${isCompact ? 'text-[8px]' : 'text-[10px]'} font-tech font-bold uppercase tracking-[0.2em]`}>Efficiency</div>
              <div className="flex justify-between items-baseline">
                <span className={`text-white/60 font-tech font-medium ${isCompact ? 'text-[9px]' : 'text-xs uppercase tracking-wider'}`}>{isCompact ? 'Hits' : 'Neutralized'}</span>
                <span className={`text-white font-mono ${isCompact ? 'text-sm' : 'text-xl font-bold'}`}>{fragmentsHit}</span>
              </div>
            </div>

            {/* In-Game Global Controls (Moved here to prevent overlap) */}
            {isAudioInitialized && gameState !== 'START' && (
              <div className="flex gap-2 pointer-events-auto">
                <button 
                  onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); playSound('click'); }}
                  className={`p-2 rounded-lg transition-all duration-300 border backdrop-blur-md flex items-center justify-center gap-2 group ${
                    isMuted 
                      ? 'bg-red-500/10 border-red-500/30 text-red-500' 
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <span className="font-tech text-[8px] uppercase tracking-widest leading-none">
                    {isMuted ? 'Muted' : 'Audio_On'}
                  </span>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleExit(); }}
                  className="p-2 bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-300 backdrop-blur-md flex items-center justify-center gap-2"
                >
                  <LogOut size={14} />
                  <span className="font-tech text-[8px] uppercase tracking-widest leading-none">Exit</span>
                </button>
              </div>
            )}
          </div>

          <div className={`glass-panel ${isCompact ? 'p-2' : 'p-4'} rounded-xl text-right flex flex-col gap-1`}>

            <div className={`text-[#38bdf8] ${isCompact ? 'text-[8px]' : 'text-[10px]'} font-tech font-bold uppercase tracking-[0.2em]`}>Score</div>
            <div className={`text-white font-mono ${isCompact ? 'text-lg' : 'text-3xl'} font-bold tracking-widest`}>
                {isCompact ? score : score.toLocaleString().padStart(6, '0')}
            </div>
          </div>
        </div>

        {/* HUD Bottom */}
        <div className={`absolute bottom-14 w-full ${isCompact ? 'p-4' : 'p-10'} flex justify-between items-end z-30 pointer-events-none`}>
           <div className={`glass-panel flex items-center ${isCompact ? 'gap-4 p-2' : 'gap-10 p-4'} rounded-xl`}>
              <div className="flex flex-col gap-1.5">
                 <div className={`text-[#38bdf8] ${isCompact ? 'text-[7px]' : 'text-[10px]'} font-tech font-bold uppercase tracking-[0.2em] leading-none flex items-center gap-1.5`}>
                    {fragmentsHit < AMMO_ACTIVATION_THRESHOLD ? (
                      <>
                        <Activity size={isCompact ? 8 : 12} />
                        SYSTEM_CALIBRATED
                      </>
                    ) : (
                      <>
                        <Shield size={isCompact ? 8 : 12} />
                        CORE_INTEGRITY
                      </>
                    )}
                 </div>
                 <div className="flex gap-1.5">
                    {fragmentsHit < AMMO_ACTIVATION_THRESHOLD ? (
                       <div className="flex gap-1 items-center">
                          <Heart size={isCompact ? 10 : 14} className="text-sky-400/40 animate-pulse" />
                          <span className={`text-white/40 ${isCompact ? 'text-[7px]' : 'text-[10px]'} uppercase font-tech tracking-wider font-medium`}>Stable_Lock_Active</span>
                       </div>
                    ) : (
                      [...Array(MAX_AMMO)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`${isCompact ? 'w-4 h-1.5' : 'w-10 h-3'} rounded-full transition-all duration-500 border border-white/5 ${
                            i < ammo 
                              ? 'bg-gradient-to-r from-sky-400 to-sky-600 shadow-[0_0_15px_rgba(56,189,248,0.5)]' 
                              : 'bg-white/5 opacity-20'
                          }`} 
                        >
                          {i < ammo && (
                            <motion.div 
                              animate={{ opacity: [0.5, 1, 0.5] }}
                              transition={{ repeat: Infinity, duration: 2 }}
                              className="w-full h-full bg-white/20 rounded-full"
                            />
                          )}
                        </div>
                      ))
                    )}
                 </div>
              </div>
              <div className={`w-px ${isCompact ? 'h-6' : 'h-10'} bg-white/10`} />
              {!isCompact && (
                <>
                  <div className="flex flex-col gap-1">
                     <div className="text-[#38bdf8] text-[10px] font-tech font-bold uppercase tracking-[0.2em] leading-none">Peak Record</div>
                     <div className="text-white font-mono text-xl font-bold">{highScore.toLocaleString()}</div>
                  </div>
                  <div className="w-px h-10 bg-white/10" />
                </>
              )}
              
              <button 
                onClick={(e) => { e.stopPropagation(); enterPiP(); }}
                className={`pointer-events-auto px-3 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 border ${
                  isCompact 
                    ? 'bg-pink-500/10 border-pink-500/30 text-pink-400 hover:bg-pink-500/20' 
                    : 'bg-sky-400/10 border-sky-400/30 text-sky-400 hover:bg-sky-400/20'
                }`}
                title={isCompact ? 'Exit Overlay Mode' : 'Enter Overlay Mode'}
              >
                <Aperture size={isCompact ? 14 : 18} className={isCompact ? 'animate-pulse' : ''} />
                <span className={`font-mono font-bold tracking-tight ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>
                  {isCompact ? 'OVERLAY_ON' : 'OVERLAY_OFF'}
                </span>
              </button>
           </div>
        </div>

        {/* Game Entities */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          {fragments.map(fragment => (
            <div 
              key={fragment.id}
              className={`absolute flex items-center justify-center`}
              style={{ 
                transform: `translate(${fragment.x}px, ${fragment.y}px) scaleX(${fragment.vx > 0 ? 1 : -1})`,
                width: 100,
                height: 100,
                left: -50,
                top: -50
              }}
            >
              <div className="relative">
                {renderFragmentIcon(fragment.type, fragment.color)}
                {!fragment.isHit && (
                  <motion.div 
                    animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="absolute inset-0 bg-white/10 rounded-full blur-md"
                  />
                )}
              </div>
              {fragment.isHit && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5, y: 0 }}
                  animate={{ opacity: 1, scale: 1, y: -40 }}
                  className="absolute text-sky-400 font-tech text-xl font-black italic tracking-tighter"
                >
                  DEFRAG_OK
                </motion.div>
              )}
            </div>
          ))}

          {/* System Messages */}
          <AnimatePresence>
            {systemAction !== 'IDLE' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-40"
              >
                {systemAction === 'FAILURE' && (
                  <div className="glass-panel p-6 rounded-2xl border border-pink-500/30 flex flex-col items-center">
                    <span className="text-5xl mb-4 group-hover:scale-125 transition-transform duration-500">🚫</span>
                    <span className="text-pink-400 font-tech text-xs font-black uppercase tracking-[0.3em]">Buffer Underflow</span>
                  </div>
                )}
                {systemAction === 'SUCCESS' && (
                   <div className="glass-panel p-6 rounded-2xl border border-sky-400/30 flex flex-col items-center">
                      <div className="text-sky-400 font-mono text-xl font-black mb-1">150pts</div>
                      <span className="text-white/60 font-tech text-[10px] font-bold uppercase tracking-[0.2em]">Fragment Neutralized</span>
                   </div>
                )}
                {systemAction === 'START' && (
                   <div className="glass-panel px-10 py-6 rounded-2xl flex flex-col items-center gap-1">
                      <span className="text-sky-400 font-tech text-[10px] font-black tracking-[0.4em] uppercase mb-1">Sequence Initiate</span>
                      <span className="text-white font-display text-4xl leading-tight">SYSTEM_UPDATING</span>
                   </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Screen Overlays */}
        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-40 bg-[#0f172a]/95 flex flex-col items-center justify-center text-white"
            >
              <div className="grid-bg absolute inset-0 opacity-20" />
              
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative flex flex-col items-center"
              >
                <h1 className="text-8xl md:text-9xl font-display tracking-tight mb-2 text-white">
                  DEFRAG<span className="text-sky-400">CORE</span>
                </h1>
                <p className="text-white/40 font-tech text-xs md:text-sm tracking-[0.6em] mb-12 uppercase font-bold">Neutralize Fragments / Optimize Latency</p>
                
                <div className="flex flex-col items-center gap-6">
                  <motion.button 
                    onClick={(e) => { e.stopPropagation(); startGame(); }}
                    animate={{ scale: [1, 1.05, 1], boxShadow: ['0 0 20px rgba(56,189,248,0.2)', '0 0 40px rgba(56,189,248,0.5)', '0 0 20px rgba(56,189,248,0.2)'] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    className="group relative px-16 py-6 bg-sky-400 text-[#0f172a] font-tech font-black text-sm tracking-[0.3em] rounded-sm hover:scale-110 active:scale-95 transition-all uppercase"
                  >
                    Initiate Defrag
                  </motion.button>
                  
                  {/* Audio Control on Start Screen */}
                  <button 
                    onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); if (!isAudioInitialized) initAudio(); }}
                    className={`px-8 py-3 rounded-md border transition-all duration-300 flex items-center justify-center gap-3 group backdrop-blur-sm ${
                      isMuted 
                        ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20' 
                        : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    <span className="font-tech text-xs uppercase tracking-[0.2em] font-bold">
                      {isMuted ? 'System_Muted' : 'Audio_Active'}
                    </span>
                  </button>

                </div>
                <div className="mt-16 text-white/20 font-mono text-[10px] tracking-[0.1em] uppercase">SYSTEM STATUS: NEURAL_LINK_ESTABLISHED // TARGETING_OS_V4.2</div>
              </motion.div>
            </motion.div>
          )}

          {gameState === 'GAME_OVER' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-40 bg-[#0f172a]/98 flex flex-col items-center justify-center text-white p-8"
            >
              <h1 className="text-7xl md:text-8xl font-display mb-12 tracking-tight uppercase text-pink-500 underline decoration-white/10 underline-offset-8">System Failure</h1>
              
              <div className="flex gap-4 mb-16">
                <div className="glass-panel p-8 rounded-xl text-center min-w-[200px] border-white/5">
                  <div className="text-[#38bdf8] font-tech uppercase text-xs font-bold mb-2 tracking-widest">Efficiency</div>
                  <div className="text-5xl font-mono font-bold tracking-tighter">{score}</div>
                </div>
                <div className="glass-panel p-8 rounded-xl text-center min-w-[200px] border-white/5">
                   <div className="text-pink-400 font-tech uppercase text-xs font-bold mb-2 tracking-widest">High Score</div>
                  <div className="text-5xl font-mono font-bold tracking-tighter">{highScore}</div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 w-full max-w-md">
                <button 
                  onClick={(e) => { e.stopPropagation(); startGame(); }}
                  className="w-full py-6 bg-white text-black font-tech font-black text-sm tracking-[0.3em] rounded-sm hover:bg-sky-400 transition-colors uppercase shadow-xl"
                >
                  Reboot System
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleExit(); }}
                  className="w-full py-4 bg-white/5 border border-white/10 text-white/40 font-tech font-bold text-xs tracking-[0.2em] rounded-sm hover:bg-white/10 hover:text-white transition-all uppercase"
                >
                  Exit to Menu
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* System Message Overlay */}
        <div className="absolute bottom-6 left-6 font-mono text-[9px] text-white/30 z-30 tracking-widest pointer-events-none uppercase">
           NEURAL_LINK: OK // LATENCY: 24MS // BUFFER: 1024KB
        </div>
      </div>
    </div>
  );
}
