"use client";

import React, { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { poseState } from "@/components/poseStore";

interface GameProps {
  onGameOver: (score: number) => void;
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
    let targetsPerMin = 80;
    let baseSpeed = 2;
    if (difficulty.includes("Medium")) { targetsPerMin = 100; baseSpeed = 3; }
    if (difficulty.includes("Hard")) { targetsPerMin = 150; baseSpeed = 5; }
    
    const spawnInterval = 60000 / targetsPerMin;

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
      punch: () => playSound(150, 'square', 0.1),
      kick: () => playSound(80, 'sawtooth', 0.2),
      knee: () => playSound(400, 'triangle', 0.3),
      spawn: () => playSound(800, 'sine', 0.05)
    };

    // --- Game State ---
    const state = {
      score: 0,
      timeLeft: 60,
      lastSpawn: 0,
    };

    const targets: { x: number, y: number, radius: number, speed: number, color: string, active: boolean }[] = [];
    const hitEffects: { x: number, y: number, life: number, text: string }[] = [];
    const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

    let lastTime = performance.now();

    // Timer Interval
    const timerId = setInterval(() => {
      state.timeLeft -= 1;
      if (timeRef.current) timeRef.current.innerText = `${state.timeLeft}s`;
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

      // Delta time for smooth frame-rate independent physics
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      ctx.clearRect(0, 0, w, h);

      // 1. Spawn Targets
      if (time - state.lastSpawn > spawnInterval) {
        targets.push({
          radius: 50,
          x: Math.random() * (w - 100) + 50,
          y: -50,
          speed: baseSpeed * 60, // pixels per second roughly
          color: colors[Math.floor(Math.random() * colors.length)],
          active: true
        });
        state.lastSpawn = time;
        sounds.spawn();
      }

      // 2. Draw & Update Tracking Visuals (Glowing Player Limbs)
      const drawLimb = (limb: {x: number, y: number}, color: string) => {
        if (limb.x < 0 || limb.y < 0) return;
        ctx.beginPath();
        ctx.arc(limb.x, limb.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowBlur = 25;
        ctx.shadowColor = color;
        ctx.fill();
        ctx.shadowBlur = 0; // reset
      };

      drawLimb(poseState.leftWrist, 'rgba(239, 68, 68, 0.8)');   // Red
      drawLimb(poseState.rightWrist, 'rgba(59, 130, 246, 0.8)'); // Blue
      drawLimb(poseState.leftKnee, 'rgba(16, 185, 129, 0.8)');   // Green
      drawLimb(poseState.rightKnee, 'rgba(16, 185, 129, 0.8)');
      drawLimb(poseState.leftAnkle, 'rgba(245, 158, 11, 0.8)');  // Yellow
      drawLimb(poseState.rightAnkle, 'rgba(245, 158, 11, 0.8)');

      // 3. Collision Logic helper
      const checkHit = (limb: {x: number, y: number}, t: any, points: number, type: 'punch'|'kick'|'knee', text: string) => {
        const dist = Math.hypot(limb.x - t.x, limb.y - t.y);
        if (dist < t.radius + 25) { // 25px forgiveness
          state.score += points;
          t.active = false;
          sounds[type]();
          hitEffects.push({ x: t.x, y: t.y, life: 1.0, text: `+${points} ${text}` });
          if (scoreRef.current) scoreRef.current.innerText = state.score.toString();
        }
      };

      // 4. Update and Draw Targets
      for (let i = targets.length - 1; i >= 0; i--) {
        const t = targets[i];
        t.y += t.speed * dt;

        if (t.active) {
          // Check Collisions (Points from your HTML logic)
          checkHit(poseState.rightWrist, t, 10, 'punch', 'PUNCH');
          if (t.active) checkHit(poseState.leftWrist, t, 20, 'punch', 'PUNCH');
          if (t.active) checkHit(poseState.rightAnkle, t, 50, 'kick', 'KICK');
          if (t.active) checkHit(poseState.leftAnkle, t, 100, 'kick', 'KICK');
          if (t.active) checkHit(poseState.rightKnee, t, 500, 'knee', 'KNEE');
          if (t.active) checkHit(poseState.leftKnee, t, 500, 'knee', 'KNEE');

          // Draw Target
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
          ctx.fillStyle = t.color;
          ctx.shadowBlur = 20;
          ctx.shadowColor = t.color;
          ctx.fill();
          
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.radius * 0.7, 0, Math.PI * 2);
          ctx.strokeStyle = "white";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        if (t.y > h + t.radius || !t.active) targets.splice(i, 1);
      }

      // 5. Draw Hit Effects (Exploding Text)
      for (let i = hitEffects.length - 1; i >= 0; i--) {
        const hfx = hitEffects[i];
        hfx.life -= dt * 2; // fade out speed
        hfx.y -= 50 * dt;   // float up

        ctx.globalAlpha = Math.max(0, hfx.life);
        ctx.fillStyle = "#fff";
        ctx.font = "900 36px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        
        // Scale effect based on life (starts small, gets bigger)
        const scale = 1 + (1 - hfx.life); 
        ctx.translate(hfx.x, hfx.y);
        ctx.scale(scale, scale);
        ctx.fillText(hfx.text, 0, 0);
        ctx.scale(1/scale, 1/scale);
        ctx.translate(-hfx.x, -hfx.y);
        
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
          <div ref={timeRef} className="text-3xl font-bold text-red-400 font-mono">60s</div>
        </div>

        <div className="bg-slate-900/80 border border-red-500/50 rounded-xl p-4 w-48 shadow-lg backdrop-blur-md">
          <div className="text-xs text-slate-400 font-bold tracking-wider">MODE</div>
          <div className="text-xl font-bold text-white">{difficulty}</div>
        </div>

      </div>
    </>
  );
}