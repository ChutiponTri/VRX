"use client";

import React, { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { poseState } from "@/components/poseStore";
import { hrStore } from "@/components/hrStore";

interface GameProps {
  onGameOver: (score: number) => void;
}

interface BalloonTarget {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: string;
  active: boolean;
  spawnTime: number;
  lifespan: number; // เวลาที่จะหายไปถ้าไม่โดนต่อย
  floatOffset: number;
  floatSpeed: number;
}

export default function MuayThaiArenaTraining({ onGameOver }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchParams = useSearchParams();
  const difficulty = searchParams.get("diff") || "Easy";

  const scoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let isRunning = true;

    // --- Config based on Difficulty (จำกัดแค่ 4-5 ลูกตามโจทย์) ---
    let maxTargets = 4;
    let baseLifespan = 4.5; // วินาที
    let missPenalty = 5;     // หักคะแนนถ้าปล่อยหมดเวลา

    if (difficulty.includes("Medium")) { 
      maxTargets = 5; 
      baseLifespan = 3.5; 
      missPenalty = 10;
    }
    if (difficulty.includes("Hard")) { 
      maxTargets = 5; 
      baseLifespan = 2.5; 
      missPenalty = 15;
    }

    // --- Audio System ---
    let audioCtx: AudioContext | null = null;
    const playSound = (freq: number, type: OscillatorType = 'sine', duration = 0.1) => {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch(e) {}
    };

    const sounds = {
      punch: () => playSound(200, 'square', 0.1),
      elbow: () => playSound(350, 'square', 0.12),
      knee: () => playSound(120, 'triangle', 0.2),
      kick: () => playSound(80, 'sawtooth', 0.25),
      spawn: () => playSound(600, 'sine', 0.05),
      miss: () => playSound(100, 'sawtooth', 0.15) // เสียงตอนหมดเวลา/พลาด
    };

    // --- Game State ---
    const state = {
      score: 0,
    };

    const targets: BalloonTarget[] = [];
    const hitEffects: { x: number, y: number, life: number, text: string, color: string }[] = [];
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

    let lastTime = performance.now();
    let targetIdCounter = 0;

    // Helper: สุ่มลูกโป่งในระยะที่หลากหลาย (ไม่ให้กองกัน และกระจายทั่วจอ)
    const createBalloon = (w: number, h: number, time: number, lifespan: number): BalloonTarget => {
      const radius = 55;
      const marginX = 120;
      const marginY = 140;

      return {
        id: targetIdCounter++,
        x: Math.random() * (w - marginX * 2) + marginX,
        y: Math.random() * (h - marginY * 2) + marginY,
        radius,
        color: colors[Math.floor(Math.random() * colors.length)],
        active: true,
        spawnTime: time,
        lifespan: lifespan * 1000,
        floatOffset: Math.random() * Math.PI * 2,
        floatSpeed: 1 + Math.random() * 1.5
      };
    };

    // --- Main Loop ---
    const animate = (time: number) => {
      if (!isRunning) return;
      
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const dt = (time - lastTime) / 1000;
      lastTime = time;

      ctx.clearRect(0, 0, w, h);

      // --- TRAINING MODE AI MULTIPLIER ---
      const hrMult = hrStore.intensityMultiplier || 1.0;
      
      // นำ HR Multiplier มาปรับลด Lifespan (หัวใจเต้นดี ลูกโป่งยิ่งหายไว ต้องไวขึ้น)
      const currentLifespan = Math.max(1.2, baseLifespan / hrMult);

      // 1. Maintain Balloon Count (จำกัดแค่ maxTargets 4-5 ลูก)
      while (targets.length < maxTargets) {
        const newBalloon = createBalloon(w, h, time, currentLifespan);
        targets.push(newBalloon);
        sounds.spawn();
      }

      // 2. Draw Tracking Limbs
      const drawLimb = (limb: {x: number, y: number} | undefined, color: string, radius = 20) => {
        if (!limb || limb.x < 0 || limb.y < 0) return;
        ctx.beginPath();
        ctx.arc(limb.x, limb.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowBlur = 25;
        ctx.shadowColor = color;
        ctx.fill();
        ctx.shadowBlur = 0;
      };

      drawLimb(poseState.leftWrist, 'rgba(239, 68, 68, 0.85)');
      drawLimb(poseState.rightWrist, 'rgba(239, 68, 68, 0.85)');
      drawLimb((poseState as any).leftElbow, 'rgba(168, 85, 247, 0.85)', 18);
      drawLimb((poseState as any).rightElbow, 'rgba(168, 85, 247, 0.85)', 18);
      drawLimb(poseState.leftKnee, 'rgba(16, 185, 129, 0.85)');
      drawLimb(poseState.rightKnee, 'rgba(16, 185, 129, 0.85)');
      drawLimb(poseState.leftAnkle, 'rgba(245, 158, 11, 0.85)');
      drawLimb(poseState.rightAnkle, 'rgba(245, 158, 11, 0.85)');

      // 3. Collision Logic helper
      const checkHit = (
        limb: {x: number, y: number} | undefined, 
        t: BalloonTarget, 
        points: number, 
        type: 'punch' | 'elbow' | 'knee' | 'kick', 
        text: string,
        textColor: string
      ) => {
        if (!limb || limb.x < 0 || limb.y < 0) return false;
        const dist = Math.hypot(limb.x - t.x, limb.y - t.y);
        if (dist < t.radius + 30) {
          state.score += points;
          t.active = false;
          sounds[type]();
          hitEffects.push({ x: t.x, y: t.y, life: 1.0, text: `+${points} ${text}`, color: textColor });
          if (scoreRef.current) scoreRef.current.innerText = state.score.toString();
          return true;
        }
        return false;
      };

      // 4. Update and Draw Balloon Targets
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        const age = time - t.spawnTime;

        // ถ้าหมดเวลา (Lifespan) แล้วผู้เล่นยังไม่ต่อย -> ถือว่าพลาด หักคะแนน แล้วสุ่มใหม่
        if (age >= t.lifespan && t.active) {
          t.active = false;
          state.score = Math.max(0, state.score - missPenalty); // หักคะแนนแต่ไม่ให้ติดลบ
          sounds.miss();
          hitEffects.push({ 
            x: t.x, 
            y: t.y, 
            life: 1.0, 
            text: `-${missPenalty} MISS`, 
            color: '#ef4444' 
          });
          if (scoreRef.current) scoreRef.current.innerText = state.score.toString();
        }

        if (t.active) {
          // ขยับลอยตัวสั่นนิดหน่อยตามสปีดตัวคูณหัวใจ
          const driftSpeed = t.floatSpeed * hrMult;
          const floatY = Math.sin((time / 300) * driftSpeed + t.floatOffset) * 8;
          const currentY = t.y + floatY;

          // Check Hit Logic (ตามเกณฑ์คะแนนที่คุณต้นกำหนด)
          checkHit(poseState.rightWrist, t, 10, 'punch', 'PUNCH!', '#f87171');
          if (t.active) checkHit(poseState.leftWrist, t, 10, 'punch', 'PUNCH!', '#f87171');
          if (t.active) checkHit((poseState as any).rightElbow, t, 20, 'elbow', 'ELBOW!', '#c084fc');
          if (t.active) checkHit((poseState as any).leftElbow, t, 20, 'elbow', 'ELBOW!', '#c084fc');
          if (t.active) checkHit(poseState.rightKnee, t, 50, 'knee', 'KNEE!', '#34d399');
          if (t.active) checkHit(poseState.leftKnee, t, 50, 'knee', 'KNEE!', '#34d399');
          if (t.active) checkHit(poseState.rightAnkle, t, 100, 'kick', 'KICK!', '#fbbf24');
          if (t.active) checkHit(poseState.leftAnkle, t, 100, 'kick', 'KICK!', '#fbbf24');

          // Draw Balloon
          const scaleRatio = Math.min(1, age / 200);
          const activeRadius = t.radius * scaleRatio;

          ctx.beginPath();
          ctx.arc(t.x, currentY, activeRadius, 0, Math.PI * 2);
          ctx.fillStyle = t.color;
          ctx.shadowBlur = 20;
          ctx.shadowColor = t.color;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(t.x - activeRadius * 0.3, currentY - activeRadius * 0.3, activeRadius * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.fill();
          ctx.shadowBlur = 0;

          ctx.beginPath();
          ctx.moveTo(t.x, currentY + activeRadius);
          ctx.lineTo(t.x, currentY + activeRadius + 15);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // ลบเป้าหมายที่หมดสภาพออก เพื่อให้ระบบ while ด้านบนสุ่มเกิดใหม่ในตำแหน่งใหม่ทันที
        if (!t.active) {
          targets.splice(i, 1);
        }
      }

      // 5. Draw Hit Effects (Floating Text)
      for (let i = hitEffects.length - 1; i >= 0; i--) {
        const hfx = hitEffects[i];
        hfx.life -= dt * 2;
        hfx.y -= 40 * dt;

        ctx.globalAlpha = Math.max(0, hfx.life);
        ctx.fillStyle = hfx.color;
        ctx.font = "900 30px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        
        ctx.fillText(hfx.text, hfx.x, hfx.y);
        ctx.globalAlpha = 1.0;

        if (hfx.life <= 0) hitEffects.splice(i, 1);
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
      onGameOver(state.score);
    };
  }, [difficulty, onGameOver]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" />

      {/* Muay Thai Training HUD */}
      <div className="absolute top-4 left-4 z-30 flex flex-col gap-4 pointer-events-none">
        <div className="bg-slate-900/80 border border-red-500/50 rounded-xl p-4 w-48 shadow-lg backdrop-blur-md">
          <div className="text-xs text-slate-400 font-bold tracking-wider">TRAINING SCORE</div>
          <div ref={scoreRef} className="text-4xl font-black text-yellow-400">0</div>
        </div>

        <div className="bg-slate-900/80 border border-red-500/50 rounded-xl p-4 w-48 shadow-lg backdrop-blur-md">
          <div className="text-xs text-slate-400 font-bold tracking-wider">MODE</div>
          <div className="text-xl font-bold text-white">{difficulty}</div>
        </div>
      </div>
    </>
  );
}