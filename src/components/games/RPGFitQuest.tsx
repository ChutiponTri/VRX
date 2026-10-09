"use client";

import React, { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { poseState } from "../poseStore";

interface GameProps {
  onGameOver: (score: number) => void;
}

export default function RPGFitQuest({ onGameOver }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const searchParams = useSearchParams();
  const difficulty = searchParams.get("diff") || "Medium";

  const timeRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const coinsRef = useRef<HTMLSpanElement>(null);
  const mushRef = useRef<HTMLSpanElement>(null);
  const heartsRef = useRef<HTMLSpanElement>(null);
  const starsRef = useRef<HTMLSpanElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let isRunning = true;
    const MAP_SIZE = 1600;

    const customDuration = searchParams.get("duration");
    let baseTime = customDuration ? parseInt(customDuration) : 180; // 3 minutes default
    let baseSpeed = 4.5;
    if (difficulty.includes("Easy")) { baseSpeed = 5.5; }
    if (difficulty.includes("Hard")) { baseSpeed = 3.5; }

    const state = {
      score: 0, combo: 0, comboTimer: 0, timeLeft: baseTime,
      coins: 0, mushrooms: 0, hearts: 0, stars: 0,
      speedBoostTime: 0, doubleScoreTime: 0, animTime: 0,
      cameraX: 800, cameraY: 800,
      player: { x: 800, y: 900, vx: 0, vy: 0, speed: baseSpeed, animState: 'idle', direction: 'down' },
      collectibles: [] as any[], obstacles: [] as any[], paths: [] as any[], particles: [] as any[], terrainFeatures: [] as any[],
      fountain: { x: 800, y: 800, outerRadius: 90, basinRadius: 75, solid: true },
      topLeftPond: { x: 180, y: 180, width: 280, height: 180, rockX: 280, rockY: 260, rockRadius: 28 },
      bottomRightPond: { x: 1050, y: 1050, width: 320, height: 320, bridgeX: 1220, bridgeY: 1030, bridgeW: 90, bridgeH: 280 },
      house: { x: 200, y: 1050, w: 240, h: 180, solid: true },
      slide: { x: 1200, y: 200, w: 160, h: 140 }
    };

    let lastTime = performance.now();

    // Map Generation
    const populateWorld = () => {
      state.paths = [
        { x1: 100, y1: 800, x2: 1500, y2: 800, width: 140 },
        { x1: 800, y1: 100, x2: 800, y2: 1500, width: 140 },
        { type: 'circle', x: 800, y: 800, radius: 220, width: 90 },
        { x1: 300, y1: 1300, x2: 1300, y2: 1300, width: 90 },
        { x1: 300, y1: 350, x2: 300, y2: 1300, width: 90 },
        { x1: 1300, y1: 350, x2: 1300, y2: 1300, width: 90 },
        { x1: 300, y1: 350, x2: 1300, y2: 350, width: 90 }
      ];

      state.obstacles.push({ type: 'fountain', x: state.fountain.x, y: state.fountain.y, radius: state.fountain.basinRadius, solid: true });
      state.obstacles.push({ type: 'pond-left', x: state.topLeftPond.x + state.topLeftPond.width/2, y: state.topLeftPond.y + state.topLeftPond.height/2, radius: state.topLeftPond.width/2, slowRate: 0.35, solid: false });
      state.obstacles.push({ type: 'rock', x: state.topLeftPond.rockX, y: state.topLeftPond.rockY, radius: state.topLeftPond.rockRadius, solid: true });
      state.obstacles.push({ type: 'pond-right', x: state.bottomRightPond.x + state.bottomRightPond.width/2, y: state.bottomRightPond.y + state.bottomRightPond.height/2, radius: state.bottomRightPond.width*0.6, slowRate: 0.35, solid: false });
      state.obstacles.push({ type: 'house', x: state.house.x + state.house.w/2, y: state.house.y + state.house.h/2, radius: 110, solid: true });
      state.obstacles.push({ type: 'slide', x: state.slide.x + state.slide.w/2, y: state.slide.y + state.slide.h/2, radius: 80, solid: true });

      const decorations = [
        { type: 'bench', x: 280, y: 140 }, { type: 'bench', x: 1280, y: 380 }, { type: 'bench', x: 320, y: 880 }, { type: 'bench', x: 1280, y: 1060 },
        { type: 'fence', x: 480, y: 140, w: 100, h: 20 }, { type: 'fence', x: 180, y: 1350, w: 160, h: 20 },
        { type: 'lamp', x: 550, y: 110 }, { type: 'lamp', x: 1120, y: 350 }, { type: 'lamp', x: 580, y: 730 }, { type: 'lamp', x: 1020, y: 730 }, { type: 'lamp', x: 440, y: 1050 }, { type: 'lamp', x: 1120, y: 1250 }
      ];

      decorations.forEach(d => {
        state.obstacles.push({ type: d.type, x: d.x, y: d.y, radius: d.type === 'lamp' ? 12 : (d.type === 'bench' ? 32 : 18), solid: d.type !== 'lamp', w: d.w || 0, h: d.h || 0 });
      });

      for (let x = 0; x <= MAP_SIZE; x += 90) {
        if (x < 700 || x > 900) state.obstacles.push({ type: 'tree', x, y: 40, radius: 45, solid: true });
        if (x < 700 || x > 900) state.obstacles.push({ type: 'tree', x, y: MAP_SIZE - 40, radius: 45, solid: true });
      }
      for (let y = 0; y <= MAP_SIZE; y += 90) {
        if (y < 700 || y > 900) state.obstacles.push({ type: 'tree', x: 40, y, radius: 45, solid: true });
        if (y < 700 || y > 900) state.obstacles.push({ type: 'tree', x: MAP_SIZE - 40, y, radius: 45, solid: true });
      }
      state.obstacles.push({ type: 'tree', x: 540, y: 460, radius: 50, solid: true });
      state.obstacles.push({ type: 'tree', x: 1060, y: 460, radius: 50, solid: true });
      state.obstacles.push({ type: 'tree', x: 580, y: 1160, radius: 50, solid: true });

      for (let i = 0; i < 220; i++) {
        state.terrainFeatures.push({
          type: Math.random() > 0.45 ? 'grass-tuft' : 'flower',
          x: Math.random() * (MAP_SIZE - 120) + 60, y: Math.random() * (MAP_SIZE - 120) + 60,
          size: Math.random() * 8 + 4, color: Math.random() > 0.5 ? '#f472b6' : '#67e8f9'
        });
      }
      spawnCollectibles(40);
    };

    const spawnCollectibles = (count: number) => {
      const types = ['coin', 'coin', 'coin', 'mushroom', 'heart', 'star'];
      for (let i = 0; i < count; i++) {
        let valid = false; let x=0, y=0;
        while (!valid) {
          x = Math.random() * (MAP_SIZE - 140) + 70; y = Math.random() * (MAP_SIZE - 140) + 70;
          let col = false;
          for (const obs of state.obstacles) {
            if (obs.solid && Math.hypot(x - obs.x, y - obs.y) < obs.radius + 20) { col = true; break; }
          }
          if (!col) valid = true;
        }
        state.collectibles.push({ type: types[Math.floor(Math.random() * types.length)], x, y, pulseSeed: Math.random() * 100 });
      }
    };

    populateWorld();

    const drawCharacter = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, animState: string, time: number, dir: string) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(dir === 'left' ? -1 : 1, 1);
      let bobY = animState !== 'idle' ? Math.abs(Math.sin(time * 0.015)) * -(size * 0.12) : Math.sin(time * 0.005) * (size * 0.03);
      let legSwing = animState !== 'idle' ? Math.sin(time * 0.02) : 0;
      let runAngle = animState !== 'idle' ? 0.15 : 0;
      ctx.rotate(runAngle);

      ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.roundRect(-size*0.28, -size*0.35 + bobY, size*0.4, size*0.45, size*0.1); ctx.fill();
      
      ctx.save(); ctx.translate(-size*0.12, size*0.2); if(animState!=='idle') ctx.rotate(legSwing);
      ctx.fillStyle = '#1e293b'; ctx.fillRect(-size*0.08, 0, size*0.16, size*0.2);
      ctx.fillStyle = '#ffe4e6'; ctx.fillRect(-size*0.04, size*0.08, size*0.08, size*0.03);
      ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.roundRect(-size*0.1, size*0.18, size*0.22, size*0.12, [5,5,0,0]); ctx.fill();
      ctx.restore();

      ctx.save(); ctx.translate(size*0.12, size*0.2); if(animState!=='idle') ctx.rotate(-legSwing);
      ctx.fillStyle = '#1e293b'; ctx.fillRect(-size*0.08, 0, size*0.16, size*0.2);
      ctx.fillStyle = '#ffe4e6'; ctx.fillRect(-size*0.04, size*0.08, size*0.08, size*0.03);
      ctx.fillStyle = '#78350f'; ctx.beginPath(); ctx.roundRect(-size*0.08, size*0.18, size*0.22, size*0.12, [5,5,0,0]); ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.roundRect(-size*0.25, -size*0.3 + bobY, size*0.5, size*0.5, size*0.15); ctx.fill();
      
      ctx.save(); ctx.translate(-size*0.25, -size*0.2 + bobY); ctx.rotate(animState!=='idle' ? 0.5+Math.sin(time*0.02)*0.5 : 0.2);
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.roundRect(-size*0.07, 0, size*0.14, size*0.28, size*0.06); ctx.fill();
      ctx.fillStyle = '#fbcfe8'; ctx.beginPath(); ctx.arc(0, size*0.28, size*0.07, 0, Math.PI*2); ctx.fill(); ctx.restore();

      ctx.save(); ctx.translate(size*0.25, -size*0.2 + bobY); ctx.rotate(animState!=='idle' ? -0.5-Math.sin(time*0.02)*0.5 : -0.2);
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.roundRect(-size*0.07, 0, size*0.14, size*0.28, size*0.06); ctx.fill();
      ctx.fillStyle = '#fbcfe8'; ctx.beginPath(); ctx.arc(0, size*0.28, size*0.07, 0, Math.PI*2); ctx.fill(); ctx.restore();

      ctx.save(); ctx.translate(0, -size*0.38 + bobY);
      ctx.fillStyle = '#fbcfe8'; ctx.beginPath(); ctx.arc(0, 0, size*0.26, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.roundRect(-size*0.14, -size*0.08, size*0.08, size*0.12, size*0.03); ctx.roundRect(size*0.06, -size*0.08, size*0.08, size*0.12, size*0.03); ctx.fill();
      ctx.fillStyle = '#18181b'; ctx.beginPath(); ctx.moveTo(-size*0.3, -size*0.1); ctx.quadraticCurveTo(0, -size*0.5, size*0.3, -size*0.1); ctx.fill();
      ctx.restore(); ctx.restore();
    };

    // Main Loop
    const animate = (time: number) => {
      if (!isRunning) return;
      const dt = time - lastTime;
      lastTime = time;

      const w = window.innerWidth;
      const h = window.innerHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      state.animTime += dt;
      state.timeLeft -= dt / 1000;
      
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        isRunning = false;
        onGameOver(state.score);
        return;
      }

      if (timeRef.current) {
        const mins = Math.floor(state.timeLeft / 60);
        const secs = Math.floor(state.timeLeft % 60);
        timeRef.current.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }

      // 1. Controls (Orthogonal D-Pad Logic)
      let moveX = 0; 
      let moveY = 0;
      const rpg = poseState.rpg;

      if (rpg.runUp) moveY -= 1;
      if (rpg.squatDown) moveY += 1;
      if (rpg.turnLeft) moveX -= 1;
      if (rpg.turnRight) moveX += 1;

      let actualSpeed = state.player.speed;
      if (state.speedBoostTime > 0) { actualSpeed *= 1.7; state.speedBoostTime -= dt; }
      if (state.doubleScoreTime > 0) state.doubleScoreTime -= dt;
      if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) {
          state.combo = 0;
          if (comboRef.current) comboRef.current.classList.add('hidden');
        }
      }

      // Physics & Water Slowdown
      let currentSlow = 1.0;
      const onBridge = (state.player.x > state.bottomRightPond.bridgeX - state.bottomRightPond.bridgeW/2 && state.player.x < state.bottomRightPond.bridgeX + state.bottomRightPond.bridgeW/2 && state.player.y > state.bottomRightPond.bridgeY && state.player.y < state.bottomRightPond.bridgeY + state.bottomRightPond.bridgeH);
      if (!onBridge) {
        state.obstacles.forEach(obs => {
          if (obs.type.startsWith('pond') && Math.hypot(state.player.x - obs.x, state.player.y - obs.y) < obs.radius) {
            currentSlow = obs.slowRate;
          }
        });
      }
      actualSpeed *= currentSlow;

      // Apply Movement Velocity
      if (moveX !== 0 || moveY !== 0) {
        const len = Math.hypot(moveX, moveY);
        state.player.vx = (moveX / len) * actualSpeed;
        state.player.vy = (moveY / len) * actualSpeed;
        state.player.animState = state.speedBoostTime > 0 ? 'run' : (actualSpeed < 2.8 ? 'walk' : 'jog');
        
        // Character facing direction
        if (Math.abs(moveX) > Math.abs(moveY)) {
          state.player.direction = moveX < 0 ? 'left' : 'right';
        } else {
          state.player.direction = moveY < 0 ? 'up' : 'down';
        }
      } else {
        state.player.vx *= 0.7; state.player.vy *= 0.7;
        if (Math.hypot(state.player.vx, state.player.vy) < 0.2) {
          state.player.vx = 0; state.player.vy = 0; state.player.animState = 'idle';
        }
      }

      state.player.x = Math.max(45, Math.min(MAP_SIZE - 45, state.player.x + state.player.vx));
      state.player.y = Math.max(45, Math.min(MAP_SIZE - 45, state.player.y + state.player.vy));

      // Collisions
      state.obstacles.forEach(obs => {
        if (obs.solid) {
          const dist = Math.hypot(state.player.x - obs.x, state.player.y - obs.y);
          if (dist < obs.radius + 18) {
            const angle = Math.atan2(state.player.y - obs.y, state.player.x - obs.x);
            state.player.x = obs.x + Math.cos(angle) * (obs.radius + 18);
            state.player.y = obs.y + Math.sin(angle) * (obs.radius + 18);
          }
        }
      });

      // Items
      for (let i = state.collectibles.length - 1; i >= 0; i--) {
        const item = state.collectibles[i];
        if (Math.hypot(state.player.x - item.x, state.player.y - item.y) < 35) {
          state.combo++; state.comboTimer = 3500;
          if (comboRef.current) { comboRef.current.classList.remove('hidden'); comboRef.current.innerText = `X${state.combo}`; }

          let pts = 10;
          if (item.type === 'mushroom') { pts = 20; state.speedBoostTime = 5000; state.mushrooms++; if(mushRef.current) mushRef.current.innerText = state.mushrooms.toString(); }
          if (item.type === 'heart') { pts = 15; state.timeLeft += 5; state.hearts++; if(heartsRef.current) heartsRef.current.innerText = state.hearts.toString(); }
          if (item.type === 'star') { pts = 30; state.doubleScoreTime = 5000; state.stars++; if(starsRef.current) starsRef.current.innerText = state.stars.toString(); }
          if (item.type === 'coin') { state.coins++; if(coinsRef.current) coinsRef.current.innerText = state.coins.toString(); }

          state.score += (pts * (state.doubleScoreTime > 0 ? 2 : 1)) + (state.combo * 2);
          if (scoreRef.current) scoreRef.current.innerText = state.score.toString().padStart(5, '0');
          state.collectibles.splice(i, 1);
        }
      }

      if (state.collectibles.length < 15) spawnCollectibles(12);

      // Render
      state.cameraX += (state.player.x - state.cameraX) * 0.1;
      state.cameraY += (state.player.y - state.cameraY) * 0.1;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#3f6212';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2 - state.cameraX, h / 2 - state.cameraY);

      // Draw Paths
      ctx.fillStyle = '#eab308';
      state.paths.forEach(p => {
        if (p.type === 'circle') {
          ctx.strokeStyle = '#eab308'; ctx.lineWidth = p.width; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.strokeStyle = '#eab308'; ctx.lineWidth = p.width; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        }
      });
      state.paths.forEach(p => {
        if (p.type !== 'circle') {
          ctx.strokeStyle = '#facc15'; ctx.lineWidth = p.width * 0.78; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        }
      });

      // Draw Ponds
      const tp = state.topLeftPond;
      ctx.fillStyle = '#115e59'; ctx.beginPath(); ctx.roundRect(tp.x-12, tp.y-12, tp.width+24, tp.height+24, 28); ctx.fill();
      ctx.fillStyle = '#0f766e'; ctx.beginPath(); ctx.roundRect(tp.x, tp.y, tp.width, tp.height, 20); ctx.fill();
      ctx.fillStyle = 'rgba(20, 184, 166, 0.25)'; ctx.beginPath(); ctx.roundRect(tp.x+10, tp.y+10, tp.width-20, tp.height-20, 15); ctx.fill();
      
      const bp = state.bottomRightPond;
      ctx.fillStyle = '#115e59'; ctx.beginPath(); ctx.roundRect(bp.x-12, bp.y-12, bp.width+24, bp.height+24, 32); ctx.fill();
      ctx.fillStyle = '#0f766e'; ctx.beginPath(); ctx.roundRect(bp.x, bp.y, bp.width, bp.height, 24); ctx.fill();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.2)'; ctx.beginPath(); ctx.roundRect(bp.x+15, bp.y+15, bp.width-30, bp.height-30, 20); ctx.fill();
      
      // Bridge
      ctx.fillStyle = '#78350f'; ctx.fillRect(bp.bridgeX - bp.bridgeW/2, bp.bridgeY, bp.bridgeW, bp.bridgeH);
      ctx.fillStyle = '#a16207';
      for (let py = bp.bridgeY + 4; py < bp.bridgeY + bp.bridgeH; py += 18) ctx.fillRect(bp.bridgeX - bp.bridgeW/2 + 6, py, bp.bridgeW - 12, 14);
      ctx.fillStyle = '#451a03'; ctx.fillRect(bp.bridgeX - bp.bridgeW/2, bp.bridgeY, 6, bp.bridgeH); ctx.fillRect(bp.bridgeX + bp.bridgeW/2 - 6, bp.bridgeY, 6, bp.bridgeH);

      // House
      const hs = state.house;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.35)'; ctx.fillRect(hs.x - 10, hs.y + hs.h - 15, hs.w + 20, 30);
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(hs.x, hs.y + 50, hs.w, hs.h - 50);
      ctx.fillStyle = '#1d4ed8'; ctx.fillRect(hs.x + hs.w/2 - 20, hs.y + hs.h - 60, 40, 60);
      ctx.fillStyle = '#0ea5e9'; ctx.fillRect(hs.x + 30, hs.y + 70, 40, 40); ctx.fillRect(hs.x + hs.w - 70, hs.y + 70, 40, 40);
      ctx.fillStyle = '#ea580c'; ctx.beginPath(); ctx.moveTo(hs.x-15, hs.y+55); ctx.lineTo(hs.x+hs.w/2, hs.y); ctx.lineTo(hs.x+hs.w+15, hs.y+55); ctx.closePath(); ctx.fill();

      // Slide
      const sl = state.slide;
      ctx.fillStyle = '#64748b'; ctx.fillRect(sl.x+10, sl.y+40, 8, sl.h-40); ctx.fillRect(sl.x+sl.w-18, sl.y+40, 8, sl.h-40);
      ctx.fillStyle = '#dc2626'; ctx.fillRect(sl.x, sl.y+10, sl.w, 30);
      ctx.fillStyle = '#f87171'; ctx.fillRect(sl.x+10, sl.y, sl.w-20, 12);
      ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.moveTo(sl.x+sl.w-30, sl.y+40); ctx.bezierCurveTo(sl.x+sl.w+10, sl.y+sl.h-40, sl.x+sl.w+40, sl.y+sl.h, sl.x+sl.w+60, sl.y+sl.h); ctx.lineTo(sl.x+sl.w+50, sl.y+sl.h); ctx.bezierCurveTo(sl.x+sl.w+30, sl.y+sl.h-10, sl.x+sl.w, sl.y+45, sl.x+sl.w-40, sl.y+40); ctx.closePath(); ctx.fill();

      // Fountain
      const ft = state.fountain;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(ft.x, ft.y+10, ft.outerRadius, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.arc(ft.x, ft.y, ft.outerRadius, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(ft.x, ft.y, ft.outerRadius*0.9, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#0ea5e9'; ctx.beginPath(); ctx.arc(ft.x, ft.y, ft.basinRadius, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#e0f2fe'; ctx.beginPath(); ctx.arc(ft.x, ft.y, 20 + Math.sin(state.animTime*0.008)*4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ft.x, ft.y, 10, 0, Math.PI*2); ctx.fill();

      // Decor
      state.terrainFeatures.forEach(t => {
        if (t.type === 'grass-tuft') {
          ctx.fillStyle = '#4d7c0f'; ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x-4, t.y-t.size); ctx.lineTo(t.x, t.y-t.size*0.4); ctx.lineTo(t.x+4, t.y-t.size); ctx.fill();
        } else {
          ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(t.x, t.y-t.size, t.size*0.4, 0, Math.PI*2); ctx.arc(t.x-t.size*0.5, t.y, t.size*0.4, 0, Math.PI*2); ctx.arc(t.x+t.size*0.5, t.y, t.size*0.4, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(t.x, t.y, t.size*0.3, 0, Math.PI*2); ctx.fill();
        }
      });

      state.obstacles.forEach(obs => {
        if (!obs.solid) return;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(obs.x, obs.y + obs.radius*0.4, obs.radius*0.9, obs.radius*0.4, 0, 0, Math.PI*2); ctx.fill();
        if (obs.type === 'rock') {
          ctx.fillStyle = '#475569'; ctx.beginPath(); ctx.roundRect(obs.x-obs.radius, obs.y-obs.radius, obs.radius*2, obs.radius*1.6, obs.radius*0.4); ctx.fill();
        } else if (obs.type === 'tree') {
          ctx.fillStyle = '#0f5132'; ctx.beginPath(); ctx.arc(obs.x, obs.y - obs.radius*0.4, obs.radius*0.9, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#198754'; ctx.beginPath(); ctx.arc(obs.x, obs.y - obs.radius*0.7, obs.radius*0.68, 0, Math.PI*2); ctx.fill();
        } else if (obs.type === 'bench') {
          ctx.fillStyle = '#451a03'; ctx.fillRect(obs.x-obs.radius, obs.y-12, obs.radius*2, 8);
          ctx.fillStyle = '#78350f'; ctx.fillRect(obs.x-obs.radius, obs.y-4, obs.radius*2, 10);
        } else if (obs.type === 'fence') {
          ctx.fillStyle = '#78350f'; ctx.fillRect(obs.x-obs.w/2, obs.y-4, obs.w, 8);
          for (let fx = obs.x-obs.w/2; fx <= obs.x+obs.w/2; fx += 25) ctx.fillRect(fx, obs.y-15, 6, 26);
        }
      });

      // Items
      state.collectibles.forEach(item => {
        const floatY = Math.sin(state.animTime * 0.008 + item.pulseSeed) * 6;
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(item.x, item.y + 16, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(item.x, item.y + floatY);
        if (item.type === 'coin') {
          ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#fffbeb'; ctx.font = 'bold 11px Arial'; ctx.fillText('$', -3, 4);
        } else if (item.type === 'mushroom') {
          ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0, -2, 13, Math.PI, 0); ctx.fill();
        } else if (item.type === 'heart') {
          ctx.fillStyle = '#db2777'; ctx.font = '20px Arial'; ctx.fillText('❤️', -10, 6);
        } else if (item.type === 'star') {
          ctx.fillStyle = '#fbbf24'; ctx.font = '24px Arial'; ctx.fillText('⭐', -12, 8);
        }
        ctx.restore();
      });

      drawCharacter(ctx, state.player.x, state.player.y, 50, state.player.animState, state.animTime, state.player.direction);
      ctx.restore();

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      isRunning = false;
      cancelAnimationFrame(rafId);
    };
  }, [difficulty, onGameOver]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 z-20 pointer-events-none" style={{ imageRendering: "pixelated" }} />

      {/* Top HUD (Matches HTML Exactly) */}
      <div className="absolute top-0 inset-x-0 bg-slate-900/95 border-b-2 border-slate-700/70 p-3 z-30 flex justify-between items-center gap-2 backdrop-blur-sm pointer-events-none">
        
        <div className="flex items-center gap-4">
          <div className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1 flex items-center gap-2">
            <span className="text-xl animate-pulse">⏰</span>
            <div>
              <div className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold leading-none">TIME LEFT</div>
              <div ref={timeRef} className="font-mono text-base text-white mt-0.5 font-bold">01:00</div>
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-1 flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <div>
              <div className="text-[9px] text-slate-400 uppercase tracking-widest font-extrabold leading-none">SCORE</div>
              <div ref={scoreRef} className="font-mono text-base text-yellow-400 mt-0.5 font-bold">00000</div>
            </div>
          </div>
          <div ref={comboRef} className="hidden bg-red-950/80 border border-red-700/50 rounded-xl px-3 py-1 items-center gap-1.5 animate-bounce">
            <span className="text-xs">🔥</span>
            <div className="font-mono font-bold text-xs text-red-400">X2</div>
          </div>
        </div>

        {/* Inventory */}
        <div className="flex items-center gap-2 mr-72"> {/* Margin right to avoid PIP camera overlap */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 flex items-center gap-1.5"><span className="text-sm">🪙</span><span ref={coinsRef} className="text-xs font-bold text-slate-300">0</span></div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 flex items-center gap-1.5"><span className="text-sm">🍄</span><span ref={mushRef} className="text-xs font-bold text-slate-300">0</span></div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 flex items-center gap-1.5"><span className="text-sm">❤️</span><span ref={heartsRef} className="text-xs font-bold text-slate-300">0</span></div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 flex items-center gap-1.5"><span className="text-sm">⭐</span><span ref={starsRef} className="text-xs font-bold text-slate-300">0</span></div>
        </div>
      </div>

      {/* Controls Overlay Guide (Updated for 4-way direction) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-900/80 border border-slate-600 rounded-2xl p-4 backdrop-blur-md flex gap-6 shadow-2xl pointer-events-none">
        <div className="flex flex-col items-center"><div className="text-2xl">🏃</div><div className="text-[10px] font-bold text-yellow-400 mt-1 uppercase">Knees Up</div><div className="text-xs text-white font-mono">Move UP</div></div>
        <div className="w-px bg-slate-700"></div>
        <div className="flex flex-col items-center"><div className="text-2xl">🏋️</div><div className="text-[10px] font-bold text-yellow-400 mt-1 uppercase">Squat Down</div><div className="text-xs text-white font-mono">Move DOWN</div></div>
        <div className="w-px bg-slate-700"></div>
        <div className="flex flex-col items-center"><div className="text-2xl">🦵</div><div className="text-[10px] font-bold text-yellow-400 mt-1 uppercase">Left Leg Raise</div><div className="text-xs text-white font-mono">Move LEFT</div></div>
        <div className="w-px bg-slate-700"></div>
        <div className="flex flex-col items-center"><div className="text-2xl">🦵</div><div className="text-[10px] font-bold text-yellow-400 mt-1 uppercase">Right Leg Raise</div><div className="text-xs text-white font-mono">Move RIGHT</div></div>
      </div>
    </>
  );
}