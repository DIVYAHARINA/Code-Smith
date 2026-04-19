import React, { useState, useEffect, useRef, useMemo } from "react";
import { Participant } from "../types";
import { Trophy, Medal, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

function AnimatedNumber({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current === value) return;

    const start = prevValue.current;
    const end = value;
    const duration = 800;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (outQuad)
      const ease = progress * (2 - progress);
      
      const current = Math.floor(start + (end - start) * ease);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevValue.current = value;
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <>{displayValue}</>;
}

export default function Leaderboard({ participants, currentUserId }: { participants: Participant[], currentUserId?: string }) {
  const sorted = useMemo(() => [...participants].sort((a, b) => {
    const scoreA = (a.quizScore || 0) + (a.debugScore || 0) + (a.round3Score || 0);
    const scoreB = (b.quizScore || 0) + (b.debugScore || 0) + (b.round3Score || 0);
    return scoreB - scoreA;
  }), [participants]);
  const [rankChanges, setRankChanges] = useState<Record<string, 'up' | 'down' | 'none'>>({});
  const prevRanks = useRef<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newChanges: Record<string, 'up' | 'down' | 'none'> = {};
    const currentRanks: Record<string, number> = {};
    let rankImproved = false;

    sorted.forEach((p, i) => {
      currentRanks[p.userId] = i;
      const prevRank = prevRanks.current[p.userId];
      
      if (prevRank !== undefined) {
        if (i < prevRank) {
          newChanges[p.userId] = 'up';
          if (p.userId === currentUserId || i < 3) rankImproved = true;
        }
        else if (i > prevRank) newChanges[p.userId] = 'down';
        else newChanges[p.userId] = 'none';
      }
    });

    if (Object.keys(newChanges).length > 0) {
      setRankChanges(newChanges);
      
      if (rankImproved) {
        try {
          // Using a common system sound or a placeholder if rank-up.mp3 doesn't exist
          // In a real app, we'd ensure the asset exists.
          const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3");
          audio.volume = 0.3;
          audio.play().catch(e => console.log("Audio play blocked:", e));
        } catch (e) {
          console.error("Audio error:", e);
        }
      }

      // Auto scroll to top if current user is in top 3
      const currentUserRank = currentRanks[currentUserId || ''];
      if (currentUserRank !== undefined && currentUserRank < 3 && prevRanks.current[currentUserId || ''] >= 3) {
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }

      const timer = setTimeout(() => setRankChanges({}), 3000);
      return () => clearTimeout(timer);
    }

    prevRanks.current = currentRanks;
  }, [sorted, currentUserId]);

  return (
    <div ref={containerRef} className="min-h-screen bg-[#0a0a0a] text-white p-8 overflow-y-auto scroll-smooth">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="inline-flex p-4 bg-yellow-500/20 rounded-full text-yellow-500"
          >
            <Trophy size={48} />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-black tracking-tighter uppercase"
          >
            Final Standings
          </motion.h1>
        </div>

        <div className="grid gap-4 relative">
          <AnimatePresence mode="popLayout">
            {sorted.map((p, i) => {
              const change = rankChanges[p.userId];
              const rank = i + 1;
              
              return (
                <motion.div 
                  layout
                  key={p.userId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ 
                    opacity: 1, 
                    x: 0,
                    boxShadow: change === 'up' ? '0 0 20px rgba(34, 197, 94, 0.2)' : 
                               change === 'down' ? '0 0 20px rgba(239, 68, 68, 0.2)' : 
                               'none',
                    borderColor: change === 'up' ? 'rgba(34, 197, 94, 0.5)' : 
                                change === 'down' ? 'rgba(239, 68, 68, 0.5)' : 
                                i === 0 ? 'rgba(234, 179, 8, 0.5)' :
                                i === 1 ? 'rgba(148, 163, 184, 0.5)' :
                                i === 2 ? 'rgba(180, 83, 9, 0.5)' :
                                'rgba(255, 255, 255, 0.1)'
                  }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ 
                    layout: { duration: 0.6, type: "spring", stiffness: 100, damping: 20 },
                    borderColor: { duration: 0.3 }
                  }}
                  className={`flex items-center gap-6 p-6 rounded-2xl border transition-colors ${
                    p.isLocked ? "bg-red-900/40 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]" :
                    p.violations >= 3 ? "bg-red-500/10 border-red-500/30" :
                    p.violations > 0 ? "bg-yellow-500/10 border-yellow-500/30" :
                    p.userId === currentUserId ? "bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)] z-20" :
                    i === 0 ? "bg-yellow-500/10 scale-[1.02] z-10" :
                    i === 1 ? "bg-slate-400/10" :
                    i === 2 ? "bg-amber-700/10" :
                    "bg-[#1a1a1a]"
                  } ${p.isLocked ? "grayscale" : ""}`}
                >
                  <div className="w-16 flex flex-col items-center justify-center gap-1">
                    <div className={`text-3xl font-black ${
                      p.userId === currentUserId ? "text-blue-400" :
                      i === 0 ? "text-yellow-500 scale-125" : 
                      i < 3 ? "text-white" : "text-gray-500"
                    }`}>
                      {i === 0 ? <Medal className="mx-auto" size={32} /> : `#${rank}`}
                    </div>
                    <div className="flex items-center gap-1">
                      {change === 'up' && <ArrowUp size={12} className="text-green-500 animate-bounce" />}
                      {change === 'down' && <ArrowDown size={12} className="text-red-500 animate-bounce" />}
                      {(!change || change === 'none') && <Minus size={10} className="text-gray-700" />}
                    </div>
                  </div>

                  <div className="flex-1">
                    <h3 className={`text-xl flex items-center gap-2 ${i === 0 ? "font-black text-2xl" : "font-bold"}`}>
                      <div className={`w-2 h-2 rounded-full ${p.isOnline ? "bg-green-500 animate-pulse" : "bg-blue-500"}`} />
                      {p.username}
                      {p.userId === currentUserId && (
                        <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-tighter">You</span>
                      )}
                      {p.isLocked && <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded uppercase">Disqualified</span>}
                      <span className={`text-[10px] px-2 py-0.5 rounded uppercase ${p.isQualified !== false ? "bg-green-600/20 text-green-500" : "bg-red-600/20 text-red-500"}`}>
                        {p.isQualified !== false ? "Qualified ✅" : "Not Qualified ❌"}
                      </span>
                    </h3>
                    <p className="text-sm text-gray-400 flex items-center gap-1">
                      Violations: {p.violations}
                    </p>
                  </div>

                  <div className="text-right flex items-center gap-8">
                    <div className="flex flex-col items-center">
                      <div className="text-xl font-bold text-orange-400">
                        <AnimatedNumber value={p.quizScore || 0} />
                      </div>
                      <div className="text-[8px] uppercase font-bold text-gray-500 tracking-widest">Quiz</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="text-xl font-bold text-blue-400">
                        <AnimatedNumber value={p.debugScore || 0} />
                      </div>
                      <div className="text-[8px] uppercase font-bold text-gray-500 tracking-widest">Debug</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="text-xl font-bold text-purple-400">
                        <AnimatedNumber value={p.round3Score || 0} />
                      </div>
                      <div className="text-[8px] uppercase font-bold text-gray-500 tracking-widest">Logic</div>
                    </div>
                    <div className="flex flex-col items-end min-w-[100px]">
                      <div className={`text-3xl font-black ${p.userId === currentUserId ? "text-blue-400" : i === 0 ? "text-yellow-500" : "text-white"}`}>
                        <AnimatedNumber value={(p.quizScore || 0) + (p.debugScore || 0) + (p.round3Score || 0)} />
                      </div>
                      <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Total Score</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center pt-8"
        >
          <button 
            onClick={() => window.location.reload()}
            className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition shadow-lg hover:shadow-white/10"
          >
            Back to Home
          </button>
        </motion.div>
      </div>
    </div>
  );
}
