"use client";

import React, { useEffect, useRef } from "react";
import { cursorState } from "./cursorStore";

export default function TouchlessCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Hardware-accelerated 60FPS render loop (Bypasses React Virtual DOM)
    let rafId: number;
    const renderLoop = () => {
      if (cursorRef.current && cursorState.isActive) {
        // translate3d forces the browser to use the GPU
        cursorRef.current.style.transform = `translate3d(${cursorState.x}px, ${cursorState.y}px, 0) translate(-50%, -50%)`;
        cursorRef.current.style.opacity = "1";

        if (ringRef.current) {
          if (cursorState.isPinching) {
            ringRef.current.className =
              "w-8 h-8 rounded-full border-4 border-emerald-400 bg-emerald-400/40 flex items-center justify-center shadow-[0_0_20px_rgba(52,211,153,0.8)] scale-90 transition-transform duration-75";
          } else {
            ringRef.current.className =
              "w-8 h-8 rounded-full border-4 border-cyan-400 bg-cyan-400/30 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.6)] scale-100 transition-transform duration-75";
          }
        }
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
    const handleMouseDown = () => {
      cursorState.isPinching = true;
    };
    const handleMouseUp = () => {
      cursorState.isPinching = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // 3. Pinch-to-Scroll Controller (Drag to scroll with hand pinch)
  useEffect(() => {
    let isDragging = false;
    let lastY = 0;
    let wasPinching = false;

    const interval = setInterval(() => {
      const container = document.getElementById("player-scroll-container");
      if (!container || !cursorState.isActive) {
        isDragging = false;
        wasPinching = false;
        return;
      }

      const rect = container.getBoundingClientRect();
      const isOverContainer =
        cursorState.x >= rect.left - 50 &&
        cursorState.x <= rect.right + 50 &&
        cursorState.y >= rect.top - 50 &&
        cursorState.y <= rect.bottom + 50;

      if (cursorState.isPinching) {
        if (!wasPinching) {
          // Pinch gesture just started
          if (isOverContainer) {
            isDragging = true;
            lastY = cursorState.y;
            container.style.scrollBehavior = "auto"; // Disable smooth scroll lag while dragging
          }
        } else if (isDragging) {
          // Continue dragging while pinching
          const deltaY = cursorState.y - lastY;
          // Natural drag scroll: moving hand UP (deltaY < 0) pulls content up (scrollTop increases)
          // Moving hand DOWN (deltaY > 0) pulls content down (scrollTop decreases)
          container.scrollTop -= deltaY * 1.5;
          lastY = cursorState.y;
        }
        wasPinching = true;
      } else {
        if (isDragging) {
          container.style.scrollBehavior = "";
        }
        isDragging = false;
        wasPinching = false;
      }
    }, 16);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      ref={cursorRef}
      className="fixed top-0 left-0 z-50 pointer-events-none transition-opacity duration-200 opacity-0"
      style={{ willChange: "transform" }}
    >
      <div
        ref={ringRef}
        className="w-8 h-8 rounded-full border-4 border-cyan-400 bg-cyan-400/30 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.6)]"
      >
        <div className="w-2 h-2 rounded-full bg-white shadow-lg" />
      </div>
    </div>
  );
}