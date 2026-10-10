"use client";

import React, { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { poseState } from "./poseStore";

interface GiveUpManagerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onGiveUp: () => void;
  holdDuration?: number; // seconds, default 2.0
}

/**
 * Geometric check for genuine 2-finger Peace Sign (✌️):
 * - Index & Middle fingers extended
 * - Ring & Pinky fingers curled into palm
 * - Thumb folded (not extended up)
 * - Index and Middle tips separated
 */
function checkTwoFingerPeaceSign(lm: Array<{ x: number; y: number; z?: number }>): boolean {
  if (!lm || lm.length < 21) return false;

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const wrist = lm[0];
  const thumbTip = lm[4];
  const indexMcp = lm[5];
  const indexPip = lm[6];
  const indexTip = lm[8];
  const middleMcp = lm[9];
  const middlePip = lm[10];
  const middleTip = lm[12];
  const ringPip = lm[14];
  const ringTip = lm[16];
  const pinkyPip = lm[18];
  const pinkyTip = lm[20];

  const palmSize = dist(wrist, middleMcp);
  if (palmSize < 0.03) return false;

  const indexExtended =
    dist(wrist, indexTip) > dist(wrist, indexPip) * 1.15 &&
    dist(indexMcp, indexTip) > dist(indexMcp, indexPip) * 1.2;

  const middleExtended =
    dist(wrist, middleTip) > dist(wrist, middlePip) * 1.15 &&
    dist(middleMcp, middleTip) > dist(middleMcp, middlePip) * 1.2;

  const ringCurled = dist(wrist, ringTip) < dist(wrist, ringPip) * 1.15;
  const pinkyCurled = dist(wrist, pinkyTip) < dist(wrist, pinkyPip) * 1.15;
  const thumbFolded = dist(wrist, thumbTip) < dist(wrist, indexTip) * 0.95;
  const tipsSeparated = dist(indexTip, middleTip) > palmSize * 0.2;

  return indexExtended && middleExtended && ringCurled && pinkyCurled && thumbFolded && tipsSeparated;
}

const CIRCUMFERENCE = 2 * Math.PI * 42; // ~263.89

export default function GiveUpManager({
  videoRef,
  onGiveUp,
  holdDuration = 2.0,
}: GiveUpManagerProps) {
  // Only one bit of React state: whether the overlay is visible at all.
  // Everything inside the overlay is updated via direct DOM refs → 60fps smooth.
  const [isActive, setIsActive] = useState(false);

  const timerRef = useRef(0);
  const hasTriggeredRef = useRef(false);

  // DOM refs for direct 60fps mutation (no React re-render per frame)
  const ringRef = useRef<SVGCircleElement>(null);
  const countdownTextRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let isDisposed = false;
    let rafId: number;
    let lastFrameTime = performance.now();

    const initHandTracker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        if (isDisposed) return;
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
      } catch (err) {
        console.warn("GiveUpManager: HandLandmarker init warning:", err);
      }
    };

    initHandTracker();

    // --- Inference: ~8 FPS via setInterval (off the game render thread) ---
    const inferenceId = setInterval(() => {
      if (isDisposed || !handLandmarker || !videoRef.current) return;
      if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) return;
      try {
        const results = handLandmarker.detectForVideo(videoRef.current, performance.now());
        let peaceDetected = false;
        if (results.landmarks && results.landmarks.length > 0) {
          for (const lm of results.landmarks) {
            if (checkTwoFingerPeaceSign(lm)) { peaceDetected = true; break; }
          }
        }
        poseState.isPeaceSign = peaceDetected;
      } catch (e) { /* ignore transient glitches */ }
    }, 120);

    // --- RAF loop: ONLY updates DOM directly — zero React re-renders ---
    const loop = (now: number) => {
      if (isDisposed) return;
      const dt = Math.min(0.15, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      const prev = timerRef.current;

      if (poseState.isPeaceSign) {
        timerRef.current = Math.min(holdDuration, timerRef.current + dt);
      } else if (timerRef.current > 0) {
        timerRef.current = Math.max(0, timerRef.current - dt * 2.5);
      }

      const t = timerRef.current;
      const progress = t / holdDuration; // 0→1

      // Toggle React overlay visibility (only on 0↔active transitions)
      if (prev === 0 && t > 0) setIsActive(true);
      if (prev > 0 && t === 0) setIsActive(false);

      // Update ring + text directly in DOM — 60fps, no React overhead
      if (ringRef.current) {
        const offset = CIRCUMFERENCE - CIRCUMFERENCE * progress;
        ringRef.current.style.strokeDashoffset = offset.toFixed(3);
      }
      if (countdownTextRef.current) {
        const remaining = Math.max(0, holdDuration - t);
        countdownTextRef.current.textContent = `เหลืออีก ${remaining.toFixed(1)} วินาที`;
      }

      // Trigger give up
      if (t >= holdDuration && !hasTriggeredRef.current) {
        hasTriggeredRef.current = true;
        poseState.isPeaceSign = false;
        onGiveUp();
        return;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      isDisposed = true;
      clearInterval(inferenceId);
      cancelAnimationFrame(rafId);
      poseState.isPeaceSign = false;
      if (handLandmarker) {
        try { handLandmarker.close(); } catch (e) {}
      }
    };
  }, [videoRef, onGiveUp, holdDuration]);

  return (
    <>
      {/* Standby hint — only when inactive */}
      {!isActive && (
        <div className="fixed bottom-4 right-4 z-40 pointer-events-none opacity-60">
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/80 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg">
            <span className="text-base">✌️</span>
            <span className="text-[11px] font-medium text-slate-300">
              ชู 2 นิ้วค้างไว้ {holdDuration} วินาทีเพื่อยอมแพ้
            </span>
          </div>
        </div>
      )}

      {/* Active overlay — always mounted when active, content updated via DOM refs */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px]"
        style={{ display: isActive ? "flex" : "none" }}
      >
        <div className="bg-slate-900/95 border-2 border-rose-500 rounded-3xl p-6 flex flex-col items-center shadow-[0_0_40px_rgba(244,63,94,0.5)] min-w-[280px]">

          {/* Circular Progress Ring */}
          <div className="relative w-28 h-28 flex items-center justify-center mb-3">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {/* Track */}
              <circle cx="50" cy="50" r="42" stroke="rgba(244,63,94,0.2)" strokeWidth="8" fill="none" />
              {/* Progress arc — updated directly via ref, no CSS transition needed */}
              <circle
                ref={ringRef}
                cx="50"
                cy="50"
                r="42"
                stroke="#f43f5e"
                strokeWidth="8"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span className="absolute text-4xl animate-pulse">✌️</span>
          </div>

          <div className="text-2xl font-black text-rose-400 tracking-wide uppercase mb-1">
            GIVING UP...
          </div>
          <div ref={countdownTextRef} className="text-sm font-bold text-white font-mono mb-2">
            เหลืออีก {holdDuration.toFixed(1)} วินาที
          </div>
          <p className="text-xs text-rose-300/80 text-center">
            ชูสองนิ้วค้างไว้ต่อเนื่องเพื่อยอมแพ้
          </p>
        </div>
      </div>
    </>
  );
}
