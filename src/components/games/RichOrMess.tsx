"use client";

import React, { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { poseState } from "@/components/poseStore";

interface GameProps {
  onGameOver: (score: number) => void;
  initialScore?: number; // รับคะแนนสะสมต่อเนื่องจากรอบที่แล้ว
}

export default function RichOrMess({ onGameOver, initialScore = 0 }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const difficultyStr = searchParams.get("diff") || "Medium";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let isRunning = true;
    
    const customDuration = searchParams.get("duration");
    const GAME_DURATION = (customDuration ? parseInt(customDuration) : 180) * 1000; // 3 minutes default
    let startTime: number | null = null;

    // --- Difficulty Adjustments (คงความเร็วปกติ ไม่ปรับลดลง) ---
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
      fail: () => playSfx(150, 'sawtooth', 0.4),
      squat: () => playSfx(350, 'triangle', 0.2)
    };

    // --- Game Entities ---
    class Item {
      x: number; y: number; speed: number; type: string; emoji: string; value: number; size: number;
      constructor() {
        this.x = Math.random(); 
        this.y = -0.1; 
        
        // ความเร็วปกติ (ไม่ช้าเกินไป)
        this.speed = (0.35 + Math.random() * 0.4) * fallSpeedMultiplier; 
        
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
      items: [] as Item[],
      floatingTexts: [] as { x: number, y: number, text: string, color: string, life: number }[],
      // ตัวแปรจับระบบ Squat จาก SquatSurfer
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
      if (startTime === null) startTime = time;
      
      // 0. Time Tracking
      const elapsed = time - startTime;
      const remainingTime = Math.max(0, GAME_DURATION - elapsed);
      const secondsLeft = Math.ceil(remainingTime / 1000);

      if (timerRef.current) {
        timerRef.current.innerText = `${secondsLeft}s`;
      }

      // Check Time Over
      if (remainingTime <= 0) {
        isRunning = false;
        onGameOver(state.score);
        return;
      }
      
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      const dt = (time - lastTime) / 1000;
      lastTime = time;

      ctx.clearRect(0, 0, w, h);

      // --- Squat Detection Logic (SquatSurfer Style) ---
      if (!state.baselineNoseY && poseState.nose.y > 0) {
        state.baselineNoseY = poseState.nose.y;
      }
      
      const squatThreshold = h * 0.15;
      const isSquattingNow = poseState.nose.y > 0 && poseState.nose.y > (state.baselineNoseY + squatThreshold);

      if (isSquattingNow && !state.wasSquatting) {
        sounds.squat();
      }
      state.wasSquatting = isSquattingNow;
      state.isCurrentlySquatting = isSquattingNow;

      if (poseState.nose.y > 0 && !isSquattingNow) {
        state.baselineNoseY = (state.baselineNoseY * 0.95) + (poseState.nose.y * 0.05);
      }

      // 1. Spawner Logic (Accelerates slightly over time)
      if (time - state.lastSpawn > spawnInterval) {
        state.items.push(new Item());
        state.lastSpawn = time;
        spawnInterval = Math.max(300, spawnInterval - 5); 
      }

      // 2. Basket Logic & Dynamic Squat Scaling
      let basketX = w / 2; 
      if (poseState.leftWrist.x > 0 && poseState.rightWrist.x > 0) {
        basketX = (poseState.leftWrist.x + poseState.rightWrist.x) / 2;
      }
      const basketY = h * 0.85;

      // ปรับระยะขอบเขตรับไอเทม (ขยาย 1.6 เท่าเมื่อย่อ Squat)
      const baseBasketWidthRatio = 0.12; 
      const currentWidthRatio = state.isCurrentlySquatting ? baseBasketWidthRatio * 1.6 : baseBasketWidthRatio;

      // Draw Basket
      ctx.save();
      ctx.font = state.isCurrentlySquatting ? "160px Arial" : "130px Arial";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowBlur = state.isCurrentlySquatting ? 45 : 30;
      ctx.shadowColor = state.isCurrentlySquatting ? "rgba(74, 222, 128, 0.8)" : "rgba(0,0,0,0.5)";
      ctx.fillText("🧺", basketX, basketY);
      
      // Basket Floor Glow
      const glowWidth = w * currentWidthRatio;
      const grad = ctx.createRadialGradient(basketX, basketY + 50, 5, basketX, basketY + 50, glowWidth);
      grad.addColorStop(0, state.isCurrentlySquatting ? "rgba(74, 222, 128, 0.6)" : "rgba(234, 179, 8, 0.4)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(basketX, basketY + 50, glowWidth, 25, 0, 0, Math.PI * 2);
      ctx.fill();

      // MEGA BASKET UI: Show bracket markers + text when squatting
      if (state.isCurrentlySquatting) {
        const catchZoneLeft = basketX - glowWidth;
        const catchZoneRight = basketX + glowWidth;
        const bracketY = basketY - 80;
        const bracketLen = 30;
        const bracketThick = 4;

        // Left bracket [
        ctx.strokeStyle = "rgba(74, 222, 128, 0.9)";
        ctx.lineWidth = bracketThick;
        ctx.lineCap = "round";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(74, 222, 128, 1)";
        ctx.beginPath();
        ctx.moveTo(catchZoneLeft + bracketLen, bracketY - bracketLen);
        ctx.lineTo(catchZoneLeft, bracketY - bracketLen);
        ctx.lineTo(catchZoneLeft, bracketY + bracketLen);
        ctx.lineTo(catchZoneLeft + bracketLen, bracketY + bracketLen);
        ctx.stroke();

        // Right bracket ]
        ctx.beginPath();
        ctx.moveTo(catchZoneRight - bracketLen, bracketY - bracketLen);
        ctx.lineTo(catchZoneRight, bracketY - bracketLen);
        ctx.lineTo(catchZoneRight, bracketY + bracketLen);
        ctx.lineTo(catchZoneRight - bracketLen, bracketY + bracketLen);
        ctx.stroke();

        // Center badge: ✨ 1.6X MEGA BASKET ✨
        ctx.shadowBlur = 20;
        ctx.shadowColor = "rgba(74, 222, 128, 0.8)";
        ctx.font = "bold 26px 'Kanit', sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(74, 222, 128, 1)";
        ctx.fillText("✨ SQUAT BONUS: ตะกร้าขยาย 1.6× ✨", basketX, bracketY - bracketLen - 18);
      }
      ctx.restore();

      // 3. Update & Draw Items
      for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i];
        
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

      // 4. Floating Text Animations
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
    };
  }, [difficultyStr, initialScore, onGameOver]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" />

      {/* Rich or Mess HUD */}
      <div className="absolute top-4 left-4 z-30 flex flex-col gap-4 pointer-events-none">
        
        {/* กล่องแสดงเวลา (Timer) */}
        <div className="bg-slate-900/80 border border-blue-500/50 rounded-xl p-4 min-w-37.5 shadow-lg backdrop-blur-md">
          <div className="text-xs text-blue-400 font-bold tracking-widest uppercase mb-1">เวลาที่เหลือ</div>
          <div ref={timerRef} className="text-4xl font-black text-white">60s</div>
        </div>

        {/* กล่องแสดงคะแนน (Score) */}
        <div className="bg-slate-900/80 border border-yellow-500/50 rounded-xl p-6 min-w-62.5 shadow-lg backdrop-blur-md">
          <div className="text-xs text-yellow-400 font-bold tracking-widest uppercase mb-1">ยอดเงินสะสม</div>
          <div ref={scoreRef} className="text-5xl font-black text-white">฿{initialScore.toLocaleString()}</div>
        </div>
        
      </div>
    </>
  );
}