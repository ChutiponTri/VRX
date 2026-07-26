"use client";

import React, { useEffect, useRef } from "react";
import { cursorState } from "./cursorStore";

export default function TouchlessCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Hardware-accelerated 60FPS render loop (Bypasses React Virtual DOM)
    let rafId: number;
    const renderLoop = () => {
      if (cursorRef.current && cursorState.isActive) {
        // translate3d forces the browser to use the GPU
        cursorRef.current.style.transform = `translate3d(${cursorState.x}px, ${cursorState.y}px, 0) translate(-50%, -50%)`;
        cursorRef.current.style.opacity = "1";
      } else if (cursorRef.current && !cursorState.isActive) {
        cursorRef.current.style.opacity = "0";
      }
      rafId = requestAnimationFrame(renderLoop);
    };
    rafId = requestAnimationFrame(renderLoop);

    // 2. Physical Mouse Fallback Listener
    const handleMouseMove = (e: MouseEvent) => {
      cursorState.x = e.clientX;
      cursorState.y = e.clientY;
      cursorState.isActive = true;
    };
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className="fixed top-0 left-0 z-50 pointer-events-none transition-opacity duration-200 opacity-0"
      style={{ willChange: "transform" }}
    >
      <div className="w-8 h-8 rounded-full border-4 border-cyan-400 bg-cyan-400/30 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.6)]">
        <div className="w-2 h-2 rounded-full bg-white shadow-lg" />
      </div>
    </div>
  );
}