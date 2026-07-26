"use client";

import React, { useEffect, useState, useRef } from "react";
import { poseState } from "./poseStore";

export default function GestureCountdown({ onComplete, onTimeout }: { onComplete: () => void, onTimeout: () => void }) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  useEffect(() => {
    let startTime: number | null = null;
    let rafId: number;

    const loop = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      if (poseState.isPeaceSign) {
        progressRef.current = Math.min((elapsed / 3000) * 100, 100);
        setProgress(progressRef.current);
        if (progressRef.current >= 100) onComplete();
      } else {
        // Reset if they drop the pose
        startTime = timestamp;
        progressRef.current = 0;
        setProgress(0);
      }
      
      // Auto-timeout after 10 seconds of inactivity
      if (elapsed > 10000) onTimeout();
      
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [onComplete, onTimeout]);

  return (
    <div className="relative w-48 h-48 flex items-center justify-center">
      <svg className="w-full h-full rotate-[-90deg]">
        <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="8" className="text-slate-800" fill="transparent" />
        <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="8" className="text-cyan-400" fill="transparent" strokeDasharray="552" strokeDashoffset={552 - (552 * progress / 100)} strokeLinecap="round" />
      </svg>
      <div className="absolute text-center">
        <p className="text-sm text-slate-400">HOLD PEACE SIGN</p>
        <p className="text-4xl font-bold">{Math.round(3 - (progress * 0.03))}</p>
      </div>
    </div>
  );
}