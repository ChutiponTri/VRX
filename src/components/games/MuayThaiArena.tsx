"use client";

import React, { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { poseState } from "@/components/poseStore";

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
  lifespan: number; // วินาทีที่จะแสดงก่อนหายไป
  floatOffset: number;
  floatSpeed: number;
}

export default function MuayThaiArena({ onGameOver }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchParams = useSearchParams();
  const difficulty = searchParams.get("diff") || "Easy";

  // HUD Refs
  const scoreRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let isRunning = true;

    // --- Config based on Difficulty ---
    let maxSimultaneousTargets = 3;
    let targetLifespan = 4.0; // วินาที
    if (difficulty.includes("Medium")) { maxSimultaneousTargets = 4; targetLifespan = 3.2; }
    if (difficulty.includes("Hard")) { maxSimultaneousTargets = 6; targetLifespan = 2.5; }

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
      spawn: () => playSound(600, 'sine', 0.05)
    };

    const customDuration = searchParams.get("duration");
    const initialTime = customDuration ? parseInt(customDuration) : 180; // 3 minutes default

    // --- Game State ---
    const state = {
      score: 0,
      timeLeft: initialTime,
    };

    const targets: BalloonTarget[] = [];
    const hitEffects: { x: number, y: number, life: number, text: string, color: string }[] = [];
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

    let lastTime = performance.now();
    let targetIdCounter = 0;

    // Helper ในการสร้างลูกโป่งสุ่มตำแหน่ง
    const createBalloon = (w: number, h: number, time: number): BalloonTarget => {
      const radius = 55;
      const margin = 100;
      return {
        id: targetIdCounter++,
        x: Math.random() * (w - margin * 2) + margin,
        y: Math.random() * (h - margin * 2) + margin,
        radius,
        color: colors[Math.floor(Math.random() * colors.length)],
        active: true,
        spawnTime: time,
        lifespan: targetLifespan * 1000,
        floatOffset: Math.random() * Math.PI * 2,
        floatSpeed: 1 + Math.random() * 2
      };
    };

    // Timer Interval
    const timerId = setInterval(() => {
      state.timeLeft -= 1;
      if (timeRef.current) {
        const mins = Math.floor(state.timeLeft / 60);
        const secs = state.timeLeft % 60;
        timeRef.current.innerText = `${mins}:${String(secs).padStart(2, '0')}`;
      }
      if (state.timeLeft <= 0 && isRunning) {
        isRunning = false;
        onGameOver(state.score);
      }
    }, 1000);

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

      // 1. Maintain Balloon Count (สุ่มเกิดเมื่อลูกโป่งน้อยกว่าที่กำหนด)
      while (targets.length < maxSimultaneousTargets) {
        const newBalloon = createBalloon(w, h, time);
        targets.push(newBalloon);
        sounds.spawn();
      }

      // 2. Draw & Update Tracking Visuals (Glowing Player Limbs)
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

      // มือ/ข้อมือ (ต่อย)
      drawLimb(poseState.leftWrist, 'rgba(239, 68, 68, 0.85)');   // Red
      drawLimb(poseState.rightWrist, 'rgba(239, 68, 68, 0.85)');
      
      // ข้อศอก (ศอก)
      drawLimb((poseState as any).leftElbow, 'rgba(168, 85, 247, 0.85)', 18); // Purple
      drawLimb((poseState as any).rightElbow, 'rgba(168, 85, 247, 0.85)', 18);

      // เข่า (เข่า)
      drawLimb(poseState.leftKnee, 'rgba(16, 185, 129, 0.85)');   // Green
      drawLimb(poseState.rightKnee, 'rgba(16, 185, 129, 0.85)');
      
      // ข้อเท้า/ขา (เตะ)
      drawLimb(poseState.leftAnkle, 'rgba(245, 158, 11, 0.85)');  // Yellow
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
        if (dist < t.radius + 30) { // Collision Radius Forgiveness
          state.score += points;
          t.active = false;
          sounds[type]();
          hitEffects.push({ 
            x: t.x, 
            y: t.y, 
            life: 1.0, 
            text: `+${points} ${text}`,
            color: textColor 
          });
          if (scoreRef.current) scoreRef.current.innerText = state.score.toString();
          return true;
        }
        return false;
      };

      // 4. Update and Draw Balloon Targets
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        const age = time - t.spawnTime;

        // เช็คว่าหมดเวลาหรือยัง
        if (age >= t.lifespan) {
          t.active = false;
        }

        if (t.active) {
          // เอฟเฟกต์การลอยดุ๊กดิ๊กนิดหน่อย
          const floatY = Math.sin((time / 300) * t.floatSpeed + t.floatOffset) * 6;
          const currentY = t.y + floatY;

          // --- ตรวจจับการชนตามเกณฑ์คะแนนใหม่ ---
          // 1. ต่อย (10 คะแนน)
          checkHit(poseState.rightWrist, t, 10, 'punch', 'PUNCH!', '#f87171');
          if (t.active) checkHit(poseState.leftWrist, t, 10, 'punch', 'PUNCH!', '#f87171');

          // 2. ศอก (20 คะแนน)
          if (t.active) checkHit((poseState as any).rightElbow, t, 20, 'elbow', 'ELBOW!', '#c084fc');
          if (t.active) checkHit((poseState as any).leftElbow, t, 20, 'elbow', 'ELBOW!', '#c084fc');

          // 3. เข่า (50 คะแนน)
          if (t.active) checkHit(poseState.rightKnee, t, 50, 'knee', 'KNEE!', '#34d399');
          if (t.active) checkHit(poseState.leftKnee, t, 50, 'knee', 'KNEE!', '#34d399');

          // 4. เตะ (100 คะแนน)
          if (t.active) checkHit(poseState.rightAnkle, t, 100, 'kick', 'KICK!', '#fbbf24');
          if (t.active) checkHit(poseState.leftAnkle, t, 100, 'kick', 'KICK!', '#fbbf24');

          // Draw Balloon
          const scaleRatio = Math.min(1, age / 200); // Scale In Effect
          const activeRadius = t.radius * scaleRatio;

          ctx.beginPath();
          ctx.arc(t.x, currentY, activeRadius, 0, Math.PI * 2);
          ctx.fillStyle = t.color;
          ctx.shadowBlur = 20;
          ctx.shadowColor = t.color;
          ctx.fill();

          // Highlight / Inner Circle (Balloon String effect or shine)
          ctx.beginPath();
          ctx.arc(t.x - activeRadius * 0.3, currentY - activeRadius * 0.3, activeRadius * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.fill();
          ctx.shadowBlur = 0;

          // Draw Balloon Knot/String
          ctx.beginPath();
          ctx.moveTo(t.x, currentY + activeRadius);
          ctx.lineTo(t.x, currentY + activeRadius + 15);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

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
        ctx.font = "900 32px 'Segoe UI', sans-serif";
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
      clearInterval(timerId);
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    };
  }, [difficulty, onGameOver]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" />

      {/* Muay Thai HUD */}
      <div className="absolute top-4 left-4 z-30 flex flex-col gap-4 pointer-events-none">
        <div className="bg-slate-900/80 border border-red-500/50 rounded-xl p-4 w-48 shadow-lg backdrop-blur-md">
          <div className="text-xs text-slate-400 font-bold tracking-wider">SCORE</div>
          <div ref={scoreRef} className="text-4xl font-black text-yellow-400">0</div>
        </div>

        <div className="bg-slate-900/80 border border-red-500/50 rounded-xl p-4 w-48 shadow-lg backdrop-blur-md">
          <div className="text-xs text-slate-400 font-bold tracking-wider">TIME LEFT</div>
          <div ref={timeRef} className="text-3xl font-bold text-red-400 font-mono">3:00</div>
        </div>

        <div className="bg-slate-900/80 border border-red-500/50 rounded-xl p-4 w-48 shadow-lg backdrop-blur-md">
          <div className="text-xs text-slate-400 font-bold tracking-wider">MODE</div>
          <div className="text-xl font-bold text-white">{difficulty}</div>
        </div>
      </div>
    </>
  );
}