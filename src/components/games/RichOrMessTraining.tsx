"use client";

import React, { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { poseState } from "@/components/poseStore";
import { hrStore } from "@/components/hrStore";

interface GameProps {
  onGameOver: (score: number) => void;
  initialScore?: number; // คะแนนสะสมจากรอบก่อนหน้า
}

export default function RichOrMessTraining({ onGameOver, initialScore = 0 }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const difficultyStr = searchParams.get("diff") || "Medium";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let isRunning = true;

    // --- Difficulty Adjustments ---
    let baseSpawnInterval = 1800; 
    let baseFallSpeedMultiplier = 0.6; 
    
    if (difficultyStr.includes("Easy")) {
      baseSpawnInterval = 2200;
      baseFallSpeedMultiplier = 0.45;
    } else if (difficultyStr.includes("Hard")) {
      baseSpawnInterval = 1400;
      baseFallSpeedMultiplier = 0.8;
    }

    // --- Audio System ---
    let audioCtx: AudioContext | null = null;
    const playSfx = (freq: number, type: OscillatorType = 'sine', duration = 0.2) => {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch(e) {}
    };

    const sounds = {
      money: () => playSfx(800, 'sine', 0.1),
      gold: () => { playSfx(1000, 'sine', 0.1); setTimeout(() => playSfx(1200, 'sine', 0.1), 50); },
      fail: () => playSfx(150, 'sawtooth', 0.4),
      squat: () => playSfx(350, 'triangle', 0.2)
    };

    // --- Game Entities ---
    class Item {
      x: number; y: number; baseSpeed: number; type: string; emoji: string; value: number; size: number;
      
      constructor(basketXNormalized: number, spreadFactor: number) {
        this.y = -0.1; 
        
        if (Math.random() < spreadFactor) {
          const offset = 0.25 + Math.random() * 0.45; 
          this.x = Math.random() < 0.5 
            ? Math.max(0.1, basketXNormalized - offset) 
            : Math.min(0.9, basketXNormalized + offset);
        } else {
          this.x = 0.1 + Math.random() * 0.8;
        }

        this.baseSpeed = (0.15 + Math.random() * 0.15) * baseFallSpeedMultiplier; 
        
        const rand = Math.random();
        if (rand < 0.1) {
          this.type = 'gold'; this.emoji = '💰'; this.value = 50; this.size = 80;
        } else if (rand < 0.7) {
          this.type = 'money'; this.emoji = '💵'; this.value = (Math.floor(Math.random() * 3) + 1) * 10; this.size = 65;
        } else {
          this.type = 'poop'; this.emoji = '💩'; this.value = 0; this.size = 70;
        }
      }
    }

    const state = {
      score: initialScore,
      lastSpawn: 0,
      spawnCount: 0,
      items: [] as Item[],
      floatingTexts: [] as { x: number, y: number, text: string, color: string, life: number }[],
      // ตัวแปรสำหรับระบบตรวจจับท่า Squat แบบ SquatSurfer
      baselineNoseY: 0,
      wasSquatting: false,
      isCurrentlySquatting: false
    };

    if (scoreRef.current) {
      scoreRef.current.innerText = `฿${state.score.toLocaleString()}`;
    }

    let lastTime = performance.now();

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

      // --- Squat Detection Logic (Ported from SquatSurfer) ---
      if (!state.baselineNoseY && poseState.nose.y > 0) {
        state.baselineNoseY = poseState.nose.y;
      }
      
      // ใช้เกณฑ์ความต่างของตำแหน่งจมูกตกลงมาจากจุดยืนปกติ (ประมาณ 15% ของความสูงจอ)
      const squatThreshold = h * 0.15;
      const isSquattingNow = poseState.nose.y > 0 && poseState.nose.y > (state.baselineNoseY + squatThreshold);

      if (isSquattingNow && !state.wasSquatting) {
        sounds.squat();
      }
      state.wasSquatting = isSquattingNow;
      state.isCurrentlySquatting = isSquattingNow;

      // ปรับค่า baselineNoseY อย่างนุ่มนวลเมื่อผู้เล่นยืนตรงปกติ
      if (poseState.nose.y > 0 && !isSquattingNow) {
        state.baselineNoseY = (state.baselineNoseY * 0.95) + (poseState.nose.y * 0.05);
      }

      // --- Basket Logic ---
      let basketX = w / 2;
      if (poseState.leftWrist.x > 0 && poseState.rightWrist.x > 0) {
        basketX = (poseState.leftWrist.x + poseState.rightWrist.x) / 2;
      }
      const basketY = h * 0.85;

      // ตะกร้าตั้งต้นกว้างขึ้นนิดหน่อย (0.12) และถ้า Squat จะยืดออกไปชั่วคราว (1.6 เท่า)
      const baseBasketWidthRatio = 0.12; 
      const currentWidthRatio = state.isCurrentlySquatting ? baseBasketWidthRatio * 1.6 : baseBasketWidthRatio;

      // --- 2-Step Dynamic Difficulty (HR & Spread) ---
      const hrMult = hrStore.intensityMultiplier || 1.0;
      const spreadFactor = Math.min(0.85, state.spawnCount * 0.03);
      const effectiveSpeedMult = hrMult < 1.15 ? 1.0 : hrMult; 
      const currentSpawnInterval = baseSpawnInterval / Math.max(1, effectiveSpeedMult * 0.8);

      if (time - state.lastSpawn > currentSpawnInterval) {
        state.items.push(new Item(basketX / w, spreadFactor));
        state.lastSpawn = time;
        state.spawnCount++;
      }

      // --- Draw Basket & Visual Feedback ---
      ctx.save();
      ctx.font = state.isCurrentlySquatting ? "160px Arial" : "130px Arial";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = state.isCurrentlySquatting ? 45 : 30;
      ctx.shadowColor = state.isCurrentlySquatting ? "rgba(74, 222, 128, 0.8)" : "rgba(0,0,0,0.5)";
      ctx.fillText("🧺", basketX, basketY);
      
      const glowWidth = w * currentWidthRatio;
      const grad = ctx.createRadialGradient(basketX, basketY + 50, 5, basketX, basketY + 50, glowWidth);
      grad.addColorStop(0, state.isCurrentlySquatting ? "rgba(74, 222, 128, 0.6)" : "rgba(234, 179, 8, 0.4)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(basketX, basketY + 50, glowWidth, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- 3. Update & Draw Items ---
      for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i];
        
        item.y += (item.baseSpeed * effectiveSpeedMult * dt); 

        const itemScreenX = item.x * w;
        const itemScreenY = item.y * h;

        ctx.font = `${item.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.emoji, itemScreenX, itemScreenY);

        const dx = Math.abs(itemScreenX - basketX);
        const dy = Math.abs(itemScreenY - basketY);

        if (dy < h * 0.07 && dx < w * currentWidthRatio) {
          if (item.type === 'poop') {
            sounds.fail();
            const penalty = 20; 
            state.score = Math.max(0, state.score - penalty);
            if (scoreRef.current) scoreRef.current.innerText = `฿${state.score.toLocaleString()}`;
            
            state.floatingTexts.push({ x: itemScreenX, y: basketY, text: `-฿${penalty}`, color: '#ef4444', life: 1.0 }); 
          } else {
            state.score += item.value;
            if (scoreRef.current) scoreRef.current.innerText = `฿${state.score.toLocaleString()}`;
            
            if (item.type === 'gold') {
              sounds.gold();
              state.floatingTexts.push({ x: itemScreenX, y: basketY, text: `+฿${item.value}`, color: '#facc15', life: 1.0 });
            } else {
              sounds.money();
              state.floatingTexts.push({ x: itemScreenX, y: basketY, text: `+฿${item.value}`, color: '#4ade80', life: 1.0 });
            }
          }
          state.items.splice(i, 1);
          continue;
        }

        if (item.y > 1.1) state.items.splice(i, 1);
      }

      // --- 4. Floating Text Animations ---
      for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        ft.life -= dt * 1.5;
        ft.y -= h * 0.1 * dt; 

        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.fillStyle = ft.color;
        ctx.font = "900 40px 'Kanit', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.globalAlpha = 1.0;

        if (ft.life <= 0) state.floatingTexts.splice(i, 1);
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
  }, [difficultyStr, initialScore, onGameOver]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" />

      <div className="absolute top-4 left-4 z-30 flex flex-col gap-4 pointer-events-none">
        <div className="bg-slate-900/80 border border-yellow-500/50 rounded-xl p-6 min-w-62.5 shadow-lg backdrop-blur-md">
          <div className="text-xs text-yellow-400 font-bold tracking-widest uppercase mb-1">ยอดเงินสะสม</div>
          <div ref={scoreRef} className="text-5xl font-black text-white">฿{initialScore.toLocaleString()}</div>
        </div>
      </div>
    </>
  );
}