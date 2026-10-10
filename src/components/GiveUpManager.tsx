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

  // 1. Index finger EXTENDED (tip further from wrist than PIP)
  const indexExtended =
    dist(wrist, indexTip) > dist(wrist, indexPip) * 1.15 &&
    dist(indexMcp, indexTip) > dist(indexMcp, indexPip) * 1.2;

  // 2. Middle finger EXTENDED
  const middleExtended =
    dist(wrist, middleTip) > dist(wrist, middlePip) * 1.15 &&
    dist(middleMcp, middleTip) > dist(middleMcp, middlePip) * 1.2;

  // 3. Ring finger CURLED towards palm
  const ringCurled = dist(wrist, ringTip) < dist(wrist, ringPip) * 1.15;

  // 4. Pinky finger CURLED towards palm
  const pinkyCurled = dist(wrist, pinkyTip) < dist(wrist, pinkyPip) * 1.15;

  // 5. Thumb folded (not held up with fingers)
  const thumbFolded = dist(wrist, thumbTip) < dist(wrist, indexTip) * 0.95;

  // 6. Tips of index and middle separated (V shape)
  const tipsSeparated = dist(indexTip, middleTip) > palmSize * 0.2;

  return indexExtended && middleExtended && ringCurled && pinkyCurled && thumbFolded && tipsSeparated;
}

export default function GiveUpManager({
  videoRef,
  onGiveUp,
  holdDuration = 2.0,
}: GiveUpManagerProps) {
  const [timer, setTimer] = useState(0);
  const timerRef = useRef(0);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    let handLandmarker: HandLandmarker | null = null;
    let isDisposed = false;
    let rafId: number;
    let lastInferenceTime = 0;
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

    const loop = (now: number) => {
      if (isDisposed) return;
      const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
      lastFrameTime = now;

      // Run Hand Landmark inference ~15 FPS (every 65ms) to save CPU/GPU
      if (
        handLandmarker &&
        videoRef.current &&
        videoRef.current.readyState >= 2 &&
        videoRef.current.videoWidth > 0 &&
        now - lastInferenceTime > 65
      ) {
        lastInferenceTime = now;
        try {
          const results = handLandmarker.detectForVideo(videoRef.current, now);
          let peaceDetected = false;

          if (results.landmarks && results.landmarks.length > 0) {
            for (const lm of results.landmarks) {
              if (checkTwoFingerPeaceSign(lm)) {
                peaceDetected = true;
                break;
              }
            }
          }

          poseState.isPeaceSign = peaceDetected;
        } catch (e) {
          // ignore transient video frame read glitches
        }
      }

      // Update timer based on peace sign state
      if (poseState.isPeaceSign) {
        timerRef.current = Math.min(holdDuration, timerRef.current + dt);
        setTimer(timerRef.current);

        if (timerRef.current >= holdDuration && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          poseState.isPeaceSign = false;
          onGiveUp();
          return;
        }
      } else {
        if (timerRef.current > 0) {
          timerRef.current = Math.max(0, timerRef.current - dt * 2.5);
          setTimer(timerRef.current);
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(rafId);
      poseState.isPeaceSign = false;
      if (handLandmarker) {
        try {
          handLandmarker.close();
        } catch (e) {}
      }
    };
  }, [videoRef, onGiveUp, holdDuration]);

  const progress = Math.min(1, timer / holdDuration);
  const circumference = 2 * Math.PI * 42; // ~263.89
  const dashOffset = circumference - circumference * progress;

  return (
    <>
      {/* 1. Subtle Inactive/Standby Reminder HUD (Bottom-Right) */}
      {timer === 0 && (
        <div className="fixed bottom-4 right-4 z-40 pointer-events-none opacity-60 hover:opacity-100 transition-opacity">
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/80 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg">
            <span className="text-base">✌️</span>
            <span className="text-[11px] font-medium text-slate-300">
              ชู 2 นิ้วค้างไว้ {holdDuration} วินาทีเพื่อยอมแพ้
            </span>
          </div>
        </div>
      )}

      {/* 2. Active Surrender Progress Overlay (Centered) */}
      {timer > 0 && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-slate-950/40 backdrop-blur-[2px] animate-fade-in">
          <div className="bg-slate-900/95 border-2 border-rose-500 rounded-3xl p-6 flex flex-col items-center shadow-[0_0_40px_rgba(244,63,94,0.5)] min-w-[280px]">
            {/* Circular Progress Ring */}
            <div className="relative w-28 h-28 flex items-center justify-center mb-3">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="rgba(244, 63, 94, 0.2)"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  stroke="#f43f5e"
                  strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  fill="none"
                  className="transition-all duration-75 ease-linear"
                />
              </svg>
              <span className="absolute text-4xl animate-pulse">✌️</span>
            </div>

            <div className="text-2xl font-black text-rose-400 tracking-wide uppercase mb-1">
              GIVING UP...
            </div>
            <div className="text-sm font-bold text-white font-mono mb-2">
              เหลืออีก {Math.max(0, holdDuration - timer).toFixed(1)} วินาที
            </div>
            <p className="text-xs text-rose-300/80 text-center">
              ชูสองนิ้วค้างไว้ต่อเนื่องเพื่อยอมแพ้
            </p>
          </div>
        </div>
      )}
    </>
  );
}
