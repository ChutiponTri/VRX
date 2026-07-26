"use client";

import React, { useEffect, useRef } from "react";
import { poseState } from "@/components/poseStore";
import { hrStore } from "@/components/hrStore";

interface GameProps {
  onGameOver: (score: number) => void;
}

const EXERCISES = [
  { id: "marching", name: "High Knees", color: "#00e5ff" },
  { id: "squat", name: "Squats", color: "#aaff00" },
  { id: "squat-punch", name: "Squat + Punch", color: "#ff6b35" },
  { id: "squat-kick", name: "Squat + Kick", color: "#a78bfa" }
];

export default function FitQuestTraining({ onGameOver }: GameProps) {
  // HUD Refs (For 60FPS DOM Updates without React re-renders)
  const titleRef = useRef<HTMLHeadingElement>(null);
  const repsRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const swapRingRef = useRef<SVGCircleElement>(null);

  // Game Logic Ref Store
  const logic = useRef({
    exIndex: Math.floor(Math.random() * EXERCISES.length),
    currentReps: 0,
    score: 0,
    formPhase: "idle",
    swapTimer: 0,
  });

  // Calculate Angle between 3 points
  const getAngle = (a: any, b: any, c: any) => {
    if (a.x === -100 || b.x === -100 || c.x === -100) return 180;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  // Main Tracking Loop
  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();

    // Initial DOM setup
    if (titleRef.current) titleRef.current.innerText = EXERCISES[logic.current.exIndex].name;
    if (repsRef.current) repsRef.current.style.color = EXERCISES[logic.current.exIndex].color;

    const loop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      
      const currentEx = EXERCISES[logic.current.exIndex];
      const hrMult = hrStore.intensityMultiplier;

      // 1. Swap Exercise Logic (Peace Sign Held for 2 seconds)
      if (poseState.isPeaceSign) {
        logic.current.swapTimer += dt;
        if (swapRingRef.current) {
          const dash = 220 - (220 * (logic.current.swapTimer / 2.0));
          swapRingRef.current.style.strokeDashoffset = dash.toString();
        }
        
        // Trigger Swap
        if (logic.current.swapTimer >= 2.0) {
          logic.current.exIndex = (logic.current.exIndex + 1) % EXERCISES.length;
          logic.current.currentReps = 0;
          logic.current.swapTimer = 0;
          logic.current.formPhase = "idle";
          
          // Update DOM directly
          const newEx = EXERCISES[logic.current.exIndex];
          if (titleRef.current) titleRef.current.innerText = newEx.name;
          if (repsRef.current) {
            repsRef.current.innerText = "0";
            repsRef.current.style.color = newEx.color;
          }
          if (feedbackRef.current) feedbackRef.current.innerText = "Exercise Swapped!";
        }
      } else {
        logic.current.swapTimer = Math.max(0, logic.current.swapTimer - dt * 2);
        if (swapRingRef.current) {
          swapRingRef.current.style.strokeDashoffset = "220";
        }
      }

      // 2. Exercise Detection Logic
      let repCompleted = false;
      let feedbackStr = "";

      if (currentEx.id === "marching") {
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
      else if (currentEx.id.includes("squat")) {
        const lAngle = getAngle(poseState.leftHip, poseState.leftKnee, poseState.leftAnkle);
        const rAngle = getAngle(poseState.rightHip, poseState.rightKnee, poseState.rightAnkle);
        const kneeAngle = Math.min(lAngle, rAngle);
        
        const isDown = kneeAngle < 110;
        const isUp = kneeAngle > 160;

        // Modifiers
        const lPunch = poseState.leftWrist.y < poseState.leftShoulder.y;
        const rPunch = poseState.rightWrist.y < poseState.rightShoulder.y;
        const isPunching = currentEx.id === "squat-punch" ? (lPunch || rPunch) : true;

        const lKickAngle = getAngle(poseState.leftShoulder, poseState.leftHip, poseState.leftAnkle);
        const rKickAngle = getAngle(poseState.rightShoulder, poseState.rightHip, poseState.rightAnkle);
        const isKicking = currentEx.id === "squat-kick" ? (lKickAngle > 150 || rKickAngle > 150) : true;

        if (logic.current.formPhase === "idle" && isDown) {
          logic.current.formPhase = "down";
        } else if (logic.current.formPhase === "down") {
          if (currentEx.id === "squat-punch" && !isPunching) feedbackStr = "Punch at the bottom!";
          else if (currentEx.id === "squat-kick" && !isKicking) feedbackStr = "Kick forward!";
          else feedbackStr = "Now stand up!";
          
          if (isUp && isPunching && isKicking) {
            logic.current.formPhase = "idle";
            repCompleted = true;
          }
        } else {
          feedbackStr = kneeAngle > 110 && kneeAngle < 160 ? "Deeper!" : "Ready";
        }
      }

      // Apply Rep Completion & Dynamic Score
      if (repCompleted) {
        logic.current.currentReps += 1;
        
        // Base points (100) multiplied by current HR intensity
        const pointsEarned = Math.round(100 * hrMult);
        logic.current.score += pointsEarned;
        
        if (repsRef.current) repsRef.current.innerText = logic.current.currentReps.toString();
        if (scoreRef.current) scoreRef.current.innerText = logic.current.score.toString();
      }

      // Update Feedback Text
      if (feedbackRef.current && feedbackStr) feedbackRef.current.innerText = feedbackStr;

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    
    return () => {
      cancelAnimationFrame(rafId);
      // Orchestrator unmounts this at the end of the 60s round -> save score
      onGameOver(logic.current.score);
    };
  }, [onGameOver]);

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex p-8 justify-between">
      
      {/* Left HUD: Current Mission */}
      <div className="w-80 bg-slate-900/80 border border-cyan-500/30 rounded-2xl p-6 backdrop-blur-md self-start flex flex-col gap-4">
        <div className="text-xs text-cyan-400 font-bold tracking-widest uppercase mb-2">CURRENT MISSION</div>
        
        <h2 ref={titleRef} className="text-3xl font-black text-white">Loading...</h2>
        
        <div className="flex items-baseline gap-4 mt-2">
          <div className="flex flex-col">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Reps</span>
            <span ref={repsRef} className="text-6xl font-mono font-bold">0</span>
          </div>
          <div className="w-px h-12 bg-slate-700/50"></div>
          <div className="flex flex-col">
            <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Score</span>
            <span ref={scoreRef} className="text-4xl font-mono font-bold text-yellow-400">0</span>
          </div>
        </div>

        <div ref={feedbackRef} className="mt-4 py-2 px-4 bg-slate-800/80 rounded-lg text-sm font-bold text-center text-white border border-slate-700" />
      </div>

      {/* Right HUD: Swap Mechanic */}
      <div className="self-end flex flex-col items-center mr-72"> {/* mr-72 clears the Orchestrator HUD */}
        <div className="relative w-24 h-24 flex items-center justify-center mb-2">
          <svg viewBox="0 0 80 80" className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
            <circle ref={swapRingRef} cx="40" cy="40" r="35" fill="none" stroke="#a78bfa" strokeWidth="6" strokeLinecap="round" strokeDasharray="220" strokeDashoffset="220" className="transition-all duration-100 ease-linear" />
          </svg>
          <span className="text-3xl">✌️</span>
        </div>
        <p className="text-xs text-slate-400 font-mono tracking-widest uppercase bg-slate-900/80 px-3 py-1 rounded-full border border-slate-800 text-center">
          Hold Peace Sign<br/>to Swap Exercise
        </p>
      </div>

    </div>
  );
}