"use client";

import React, { useEffect, useRef, useState } from "react";
import { cursorState } from "./cursorStore";

interface DwellButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onClick: () => void;
  dwellTimeMs?: number;
  activeColor?: string;
}

export default function DwellButton({
  onClick,
  dwellTimeMs = 2000,
  activeColor = "bg-cyan-500",
  className = "",
  children,
  ...props
}: DwellButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // React state is ONLY used for visual changes (hovering on/off, progress bar)
  const [isHovering, setIsHovering] = useState(false);
  const [progress, setProgress] = useState(0);
  const isHoveringRef = useRef(false); // Ref used to prevent redundant state updates

  // 1. Collision Polling Engine (60FPS without React renders)
  useEffect(() => {
    let rafId: number;

    const checkCollision = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const isInside = 
          cursorState.x >= rect.left && 
          cursorState.x <= rect.right && 
          cursorState.y >= rect.top && 
          cursorState.y <= rect.bottom;

        // ONLY trigger a React re-render if the state actually toggled
        if (isInside !== isHoveringRef.current) {
          isHoveringRef.current = isInside;
          setIsHovering(isInside);
        }
      }
      rafId = requestAnimationFrame(checkCollision);
    };

    rafId = requestAnimationFrame(checkCollision);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // 2. Dwell Timer Logic (Unchanged)
  useEffect(() => {
    let animationFrameId: number;
    let startTime: number | null = null;

    const animateFill = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      
      setProgress(Math.min((elapsed / dwellTimeMs) * 100, 100));

      if (elapsed >= dwellTimeMs) {
        onClick();
        setIsHovering(false);
        isHoveringRef.current = false;
        setProgress(0);
      } else {
        animationFrameId = requestAnimationFrame(animateFill);
      }
    };

    if (isHovering) {
      animationFrameId = requestAnimationFrame(animateFill);
    } else {
      setProgress(0);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isHovering, dwellTimeMs, onClick]);

  return (
    <button
      ref={buttonRef}
      className={`relative overflow-hidden rounded-xl transition-transform ${
        isHovering ? "scale-105" : "scale-100"
      } ${className}`}
      {...props}
    >
      <div
        className={`absolute top-0 left-0 h-full ${activeColor} opacity-40 transition-none z-0`}
        style={{ width: `${progress}%`, willChange: "width" }}
      />
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center pointer-events-none">
        {children}
      </div>
    </button>
  );
}