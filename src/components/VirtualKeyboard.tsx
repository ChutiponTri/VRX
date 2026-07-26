"use client";

import React from "react";
import DwellButton from "./DwellButton";

interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  mode: "text" | "number";
}

export default function VirtualKeyboard({ onKeyPress, onBackspace, onEnter, mode }: VirtualKeyboardProps) {
  const letters = "QWERTYUIOPASDFGHJKLZXCVBNM".split("");
  const numbers = "1234567890".split("");

  const keys = mode === "text" ? letters : numbers;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 bg-slate-900/50 rounded-2xl border border-slate-700 backdrop-blur-sm">
      <div className="flex flex-wrap justify-center gap-3">
        {keys.map((key) => (
          <DwellButton
            key={key}
            onClick={() => onKeyPress(key)}
            dwellTimeMs={1200} // Slightly faster dwell for typing
            className="w-16 h-16 bg-slate-800 border-2 border-slate-600 text-2xl font-bold text-white shadow-lg hover:border-cyan-400"
            activeColor="bg-cyan-500"
          >
            {key}
          </DwellButton>
        ))}
      </div>
      
      <div className="flex justify-center gap-4 mt-6">
        {mode === "text" && (
          <DwellButton
            onClick={() => onKeyPress(" ")}
            dwellTimeMs={1200}
            className="w-48 h-16 bg-slate-800 border-2 border-slate-600 text-xl font-bold text-white shadow-lg"
          >
            SPACE
          </DwellButton>
        )}
        <DwellButton
          onClick={onBackspace}
          dwellTimeMs={1200}
          className="w-32 h-16 bg-red-900/80 border-2 border-red-600 text-xl font-bold text-white shadow-lg"
          activeColor="bg-red-500"
        >
          DEL
        </DwellButton>
        <DwellButton
          onClick={onEnter}
          dwellTimeMs={1500}
          className="w-48 h-16 bg-green-900/80 border-2 border-green-600 text-xl font-bold text-white shadow-lg"
          activeColor="bg-green-500"
        >
          ENTER
        </DwellButton>
      </div>
    </div>
  );
}