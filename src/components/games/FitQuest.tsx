"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { poseState } from "../poseStore";

interface GameProps {
  onGameOver: (score: number) => void;
}

export default function FitQuest({ onGameOver }: GameProps) {
  const searchParams = useSearchParams();
  const diff = searchParams.get("diff") || "Easy";
  
  // Difficulty Multiplier
  const diffMult = diff.includes("Easy") ? 0.5 : diff.includes("Medium") ? 1.0 : 1.5;

  const EXERCISES = [
    { id: "marching", name: "High Knees", reps: Math.ceil(20 * diffMult), color: "#00e5ff" },
    { id: "squat", name: "Squats", reps: Math.ceil(15 * diffMult), color: "#aaff00" },
    { id: "squat-punch", name: "Squat + Punch", reps: Math.ceil(10 * diffMult), color: "#ff6b35" },
    { id: "squat-kick", name: "Squat + Kick", reps: Math.ceil(10 * diffMult), color: "#a78bfa" }
  ];

  // Game Phase State
  const [phase, setPhase] = useState<"COUNTDOWN" | "ACTIVE" | "REST" | "DONE">("COUNTDOWN");
  const [exIndex, setExIndex] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [restTime, setRestTime] = useState(5);

  // HUD Refs (For 60FPS DOM Updates)
  const repsRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null); // NEW: Score Ref
  const progressRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const giveUpRingRef = useRef<SVGCircleElement>(null);

  // Game Logic Ref Store
  const logic = useRef({
    currentReps: 0,
    score: 0,
    formPhase: "idle",
    giveUpTimer: 0,
  });

  // Calculate Angle between 3 points
  const getAngle = (a: any, b: any, c: any) => {
    if (a.x === -100 || b.x === -100 || c.x === -100) return 180;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  // Phase Timers
  useEffect(() => {
    if (phase === "COUNTDOWN") {
      if (countdown > 0) {
        const t = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(t);
      } else {
        setPhase("ACTIVE");
      }
    } else if (phase === "REST") {
      if (restTime > 0) {
        const t = setTimeout(() => setRestTime(c => c - 1), 1000);
        return () => clearTimeout(t);
      } else {
        setExIndex(prev => prev + 1);
        setPhase("COUNTDOWN");
        setCountdown(3);
        logic.current.currentReps = 0;
        logic.current.formPhase = "idle";
      }
    } else if (phase === "DONE") {
      setTimeout(() => onGameOver(logic.current.score), 2000);
    }
  }, [phase, countdown, restTime, onGameOver]);

  // Main Tracking Loop
  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      // 1. Give Up Logic (Peace Sign Held for 2 seconds)
      if (poseState.isPeaceSign) {
        logic.current.giveUpTimer += dt;
        if (giveUpRingRef.current) {
          const dash = 220 - (220 * (logic.current.giveUpTimer / 2.0));
          giveUpRingRef.current.style.strokeDashoffset = dash.toString();
        }
        if (logic.current.giveUpTimer >= 2.0) {
          onGameOver(logic.current.score); // Early Exit
          return;
        }
      } else {
        logic.current.giveUpTimer = Math.max(0, logic.current.giveUpTimer - dt * 2);
        if (giveUpRingRef.current) {
          giveUpRingRef.current.style.strokeDashoffset = "220";
        }
      }

      // 2. Exercise Detection Logic
      if (phase === "ACTIVE") {
        const ex = EXERCISES[exIndex];
        let repCompleted = false;
        let feedbackStr = "";

        if (ex.id === "marching") {
          const lAngle = getAngle(poseState.leftHip, poseState.leftKnee, poseState.leftAnkle);
          const rAngle = getAngle(poseState.rightHip, poseState.rightKnee, poseState.rightAnkle);
          const isLifted = lAngle < 140 || rAngle < 140;

          if (logic.current.formPhase === "idle" && isLifted) {
            logic.current.formPhase = "up";
            feedbackStr = "Good lift!";
          } else if (logic.current.formPhase === "up" && !isLifted) {
            logic.current.formPhase = "idle";
            repCompleted = true;
          } else if (!isLifted) {
            feedbackStr = "Lift knees higher!";
          }
        } 
        else if (ex.id.includes("squat")) {
          const lAngle = getAngle(poseState.leftHip, poseState.leftKnee, poseState.leftAnkle);
          const rAngle = getAngle(poseState.rightHip, poseState.rightKnee, poseState.rightAnkle);
          const kneeAngle = Math.min(lAngle, rAngle);
          
          const isDown = kneeAngle < 110;
          const isUp = kneeAngle > 160;

          // Check Modifiers
          const lPunch = poseState.leftWrist.y < poseState.leftShoulder.y;
          const rPunch = poseState.rightWrist.y < poseState.rightShoulder.y;
          const isPunching = ex.id === "squat-punch" ? (lPunch || rPunch) : true;

          const lKickAngle = getAngle(poseState.leftShoulder, poseState.leftHip, poseState.leftAnkle);
          const rKickAngle = getAngle(poseState.rightShoulder, poseState.rightHip, poseState.rightAnkle);
          const isKicking = ex.id === "squat-kick" ? (lKickAngle > 150 || rKickAngle > 150) : true;

          if (logic.current.formPhase === "idle" && isDown) {
            logic.current.formPhase = "down";
          } else if (logic.current.formPhase === "down") {
            if (ex.id === "squat-punch" && !isPunching) feedbackStr = "Punch at the bottom!";
            else if (ex.id === "squat-kick" && !isKicking) feedbackStr = "Kick forward!";
            else feedbackStr = "Now stand up!";
            
            if (isUp && isPunching && isKicking) {
              logic.current.formPhase = "idle";
              repCompleted = true;
            }
          } else {
            feedbackStr = kneeAngle > 110 && kneeAngle < 160 ? "Deeper!" : "Ready";
          }
        }

        // Apply Rep Completion
        if (repCompleted) {
          logic.current.currentReps += 1;
          logic.current.score += 10; // ปรับจาก +100 เป็น +10 สำหรับหลักสิบค่ะ
          
          // Update DOM
          if (repsRef.current) repsRef.current.innerText = logic.current.currentReps.toString();
          if (scoreRef.current) scoreRef.current.innerText = logic.current.score.toString(); // NEW: Update score
          if (progressRef.current) progressRef.current.style.width = `${(logic.current.currentReps / ex.reps) * 100}%`;
          
          if (logic.current.currentReps >= ex.reps) {
            if (exIndex === EXERCISES.length - 1) setPhase("DONE");
            else { setPhase("REST"); setRestTime(5); }
          }
        }
        if (feedbackRef.current && feedbackStr) feedbackRef.current.innerText = feedbackStr;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [phase, exIndex]);

  const currentEx = EXERCISES[exIndex];

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex p-8 justify-between">
      
      {/* Left HUD: Current Mission */}
      <div className="w-80 bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-6 backdrop-blur-md self-start flex flex-col gap-4">
        {phase === "ACTIVE" && currentEx && (
          <>
            <div className="text-xs text-cyan-400 font-bold tracking-widest uppercase mb-2">CURRENT MISSION</div>
            <h2 className="text-3xl font-black text-white">{currentEx.name}</h2>
            
            <div className="flex items-end justify-between w-full">
              <div className="flex items-baseline gap-2">
                <span ref={repsRef} className="text-6xl font-mono font-bold" style={{ color: currentEx.color }}>0</span>
                <span className="text-2xl text-slate-400 font-mono">/ {currentEx.reps}</span>
              </div>
              
              {/* NEW: Score Display */}
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Score</span>
                <span ref={scoreRef} className="text-3xl font-mono font-bold text-yellow-400">{logic.current.score}</span>
              </div>
            </div>

            <div className="h-4 bg-slate-800 rounded-full overflow-hidden w-full mt-2">
              <div ref={progressRef} className="h-full transition-all duration-300" style={{ width: "0%", background: currentEx.color }} />
            </div>
            
            <div ref={feedbackRef} className="mt-4 py-2 px-4 bg-slate-800/80 rounded-lg text-sm font-bold text-center text-white border border-slate-700" />
          </>
        )}
      </div>

      {/* Center Overlays */}
      {phase === "COUNTDOWN" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-30">
          <div className="text-cyan-400 font-bold tracking-[0.3em] uppercase mb-4">Get Ready</div>
          <div className="text-[150px] font-black font-mono leading-none text-white">{countdown > 0 ? countdown : "GO!"}</div>
          <div className="text-2xl text-slate-300 mt-4">{EXERCISES[exIndex]?.name}</div>
        </div>
      )}

      {phase === "REST" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-30">
          <div className="text-5xl mb-4">💧</div>
          <div className="text-green-400 font-bold text-3xl uppercase mb-4">Rest</div>
          <div className="text-[120px] font-black font-mono leading-none text-white">{restTime}s</div>
          <div className="text-xl text-slate-300 mt-4">Next up: <span className="font-bold text-cyan-400">{EXERCISES[exIndex + 1]?.name}</span></div>
        </div>
      )}

      {/* Right HUD: Skip / Give Up Mechanic */}
      <div className="self-end flex flex-col items-center">
        <div className="relative w-24 h-24 flex items-center justify-center mb-2">
          <svg viewBox="0 0 80 80" className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <circle ref={giveUpRingRef} cx="40" cy="40" r="35" fill="none" stroke="#ff5252" strokeWidth="6" strokeLinecap="round" strokeDasharray="220" strokeDashoffset="220" className="transition-all duration-100 ease-linear" />
          </svg>
          <span className="text-3xl">✌️</span>
        </div>
        <p className="text-xs text-slate-400 font-mono tracking-widest uppercase bg-slate-900/80 px-3 py-1 rounded-full border border-slate-800">
          Hold Peace Sign to Give Up
        </p>
      </div>

    </div>
  );
}