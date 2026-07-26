"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type CursorContextType = {
  x: number;
  y: number;
  setCursorPosition: (x: number, y: number) => void;
};

const CursorContext = createContext<CursorContextType | undefined>(undefined);

export function VirtualCursorProvider({ children }: { children: React.ReactNode }) {
  const [position, setPosition] = useState({ x: -100, y: -100 });

  const setCursorPosition = (x: number, y: number) => {
    setPosition({ x, y });
  };

  // Fallback for testing: Update coordinates with standard mouse movement
  // When MediaPipe is integrated, we will disable this listener
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPosition(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <CursorContext.Provider value={{ x: position.x, y: position.y, setCursorPosition }}>
      {children}
    </CursorContext.Provider>
  );
}

export function useVirtualCursor() {
  const context = useContext(CursorContext);
  if (!context) {
    throw new Error("useVirtualCursor must be used within a VirtualCursorProvider");
  }
  return context;
}