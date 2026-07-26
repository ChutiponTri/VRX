"use client";

import React, { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { poseState } from "@/components/poseStore";

interface GameProps {
  onGameOver: (score: number) => void;
}

export default function RichOrMess({ onGameOver }: GameProps) {
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
    let spawnInterval = 1200; // ms between spawns
    let fallSpeedMultiplier = 1.0;
    
    if (difficultyStr.includes("Easy")) {
      spawnInterval = 1600;
      fallSpeedMultiplier = 0.7;
    } else if (difficultyStr.includes("Hard")) {
      spawnInterval = 800;
      fallSpeedMultiplier = 1.4;
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
      fail: () => playSfx(100, 'sawtooth', 0.6)
    };

    // --- Game Entities ---
    class Item {
      x: number; y: number; speed: number; type: string; emoji: string; value: number; size: number;
      constructor() {
        this.x = Math.random(); // Normalized width (0 to 1)
        this.y = -0.1; // Start slightly above screen
        // Base fall speed + random variance, multiplied by difficulty
        this.speed = (0.35 + Math.random() * 0.4) * fallSpeedMultiplier; 
        
        const rand = Math.random();
        if (rand < 0.1) {
          this.type = 'gold'; this.emoji = '💰'; this.value = 10000; this.size = 80;
        } else if (rand < 0.7) {
          this.type = 'money'; this.emoji = '💵'; this.value = Math.floor(Math.random() * 980) + 20; this.size = 65;
        } else {
          this.type = 'poop'; this.emoji = '💩'; this.value = 0; this.size = 70;
        }
      }
    }

    const state = {
      score: 0,
      lastSpawn: 0,
      items: [] as Item[],
      floatingTexts: [] as { x: number, y: number, text: string, color: string, life: number }[]
    };

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

      // 1. Spawner Logic (Accelerates slightly over time)
      if (time - state.lastSpawn > spawnInterval) {
        state.items.push(new Item());
        state.lastSpawn = time;
        spawnInterval = Math.max(300, spawnInterval - 5); // Slowly gets harder
      }

      // 2. Basket Logic
      // Calculate basket X using the midpoint between the two wrists
      let basketX = w / 2; // Default center
      if (poseState.leftWrist.x > 0 && poseState.rightWrist.x > 0) {
        basketX = (poseState.leftWrist.x + poseState.rightWrist.x) / 2;
      }
      const basketY = h * 0.85;

      // Draw Basket
      ctx.save();
      ctx.font = "130px Arial";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = 30;
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.fillText("🧺", basketX, basketY);
      
      // Basket Floor Glow
      const grad = ctx.createRadialGradient(basketX, basketY + 50, 5, basketX, basketY + 50, 100);
      grad.addColorStop(0, "rgba(234, 179, 8, 0.4)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(basketX, basketY + 50, 100, 25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3. Update & Draw Items
      for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i];
        
        // Convert normalized speed to screen pixels per second
        item.y += (item.speed * dt); 

        const itemScreenX = item.x * w;
        const itemScreenY = item.y * h;

        // Draw Item
        ctx.font = `${item.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.emoji, itemScreenX, itemScreenY);

        // Collision Check (Basket bounding box)
        const dx = Math.abs(itemScreenX - basketX);
        const dy = Math.abs(itemScreenY - basketY);

        if (dy < h * 0.06 && dx < w * 0.08) {
          if (item.type === 'poop') {
            sounds.fail();
            isRunning = false;
            onGameOver(state.score);
            return; // Exit loop
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

        // Clean up if it falls off screen
        if (item.y > 1.1) state.items.splice(i, 1);
      }

      // 4. Floating Text Animations
      for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
        const ft = state.floatingTexts[i];
        ft.life -= dt * 1.5;
        ft.y -= h * 0.1 * dt; // Float up

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
    };
  }, [difficultyStr, onGameOver]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" />

      {/* Rich or Mess HUD */}
      <div className="absolute top-4 left-4 z-30 flex flex-col gap-4 pointer-events-none">
        <div className="bg-slate-900/80 border border-yellow-500/50 rounded-xl p-6 min-w-[250px] shadow-lg backdrop-blur-md">
          <div className="text-xs text-yellow-400 font-bold tracking-widest uppercase mb-1">ยอดเงินสะสม</div>
          <div ref={scoreRef} className="text-5xl font-black text-white">฿0</div>
        </div>
      </div>
    </>
  );
}