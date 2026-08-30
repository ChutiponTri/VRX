"use client";

import React, { useState } from "react";
import DwellButton from "./DwellButton";

interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  mode?: "text" | "number";
}

const LAYOUTS = {
  lowercase: [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"],
  ],
  uppercase: [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ],
  symbols: [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
    ["-", "_", "=", "+", "[", "]", "{", "}", ";", ":"],
    ["'", '"', ",", ".", "<", ">", "/", "?", "\\", "|"],
  ],
  // ⚡ เพิ่ม Layout ตัวเลขสำหรับหน้า Age โดยเฉพาะ
  numericPad: [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["0"],
  ],
};

export default function VirtualKeyboard({
  onKeyPress,
  onBackspace,
  onEnter,
  mode = "text",
}: VirtualKeyboardProps) {
  const [isShifted, setIsShifted] = useState(false);
  const [isCapsLock, setIsCapsLock] = useState(false);
  const [showSymbols, setShowSymbols] = useState(false);

  const handleKeyClick = (char: string) => {
    onKeyPress(char);
    if (isShifted) {
      setIsShifted(false);
    }
  };

  const getCurrentLayout = () => {
    if (mode === "number") return LAYOUTS.numericPad;
    if (showSymbols) return LAYOUTS.symbols;
    if (isCapsLock || isShifted) return LAYOUTS.uppercase;
    return LAYOUTS.lowercase;
  };

  const currentLayout = getCurrentLayout();

  return (
    <div className="w-full max-w-5xl mx-auto p-4 bg-slate-900/60 rounded-2xl border border-slate-700 backdrop-blur-md shadow-2xl flex flex-col items-center">
      {/* ส่วนปุ่มกด */}
      <div className="flex flex-col gap-2 w-full items-center">
        {currentLayout.map((row, rowIndex) => (
          <div key={rowIndex} className="flex justify-center gap-2">
            {row.map((key) => (
              <DwellButton
                key={key}
                onClick={() => handleKeyClick(key)}
                dwellTimeMs={1200}
                className={`${
                  mode === "number" ? "w-20 h-16 text-2xl" : "w-14 h-14 text-xl"
                } bg-slate-800 border-2 border-slate-600 font-bold text-white rounded-xl shadow-lg hover:border-cyan-400 transition-colors`}
                activeColor="bg-cyan-500"
              >
                {key}
              </DwellButton>
            ))}
          </div>
        ))}
      </div>

      {/* แถวปุ่มควบคุม */}
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {mode === "text" && (
          <>
            <DwellButton
              onClick={() => setShowSymbols(!showSymbols)}
              dwellTimeMs={1200}
              className={`h-14 px-4 border-2 text-base font-bold text-white rounded-xl shadow-lg ${
                showSymbols
                  ? "bg-amber-600 border-amber-400"
                  : "bg-slate-700 border-slate-500"
              }`}
            >
              {showSymbols ? "ABC" : "?123"}
            </DwellButton>

            {!showSymbols && (
              <>
                <DwellButton
                  onClick={() => setIsShifted(!isShifted)}
                  dwellTimeMs={1200}
                  className={`h-14 px-4 border-2 text-base font-bold text-white rounded-xl shadow-lg ${
                    isShifted
                      ? "bg-cyan-600 border-cyan-300"
                      : "bg-slate-700 border-slate-500"
                  }`}
                >
                  ⇧ SHIFT
                </DwellButton>

                <DwellButton
                  onClick={() => setIsCapsLock(!isCapsLock)}
                  dwellTimeMs={1200}
                  className={`h-14 px-4 border-2 text-base font-bold text-white rounded-xl shadow-lg ${
                    isCapsLock
                      ? "bg-cyan-500 border-cyan-200"
                      : "bg-slate-700 border-slate-500"
                  }`}
                >
                  ⇪ CAPS
                </DwellButton>
              </>
            )}

            <DwellButton
              onClick={() => onKeyPress(" ")}
              dwellTimeMs={1200}
              className="w-44 h-14 bg-slate-800 border-2 border-slate-600 text-base font-bold text-white rounded-xl shadow-lg"
            >
              SPACE
            </DwellButton>
          </>
        )}

        {/* ปุ่ม Backspace และ Enter แสดงทั้งสองโหมด */}
        <DwellButton
          onClick={onBackspace}
          dwellTimeMs={1200}
          className="h-14 px-6 bg-red-900/80 border-2 border-red-600 text-base font-bold text-white rounded-xl shadow-lg"
          activeColor="bg-red-500"
        >
          ⌫ DEL
        </DwellButton>

        <DwellButton
          onClick={onEnter}
          dwellTimeMs={1500}
          className="h-14 px-8 bg-green-900/80 border-2 border-green-600 text-base font-bold text-white rounded-xl shadow-lg"
          activeColor="bg-green-500"
        >
          ↵ ENTER
        </DwellButton>
      </div>
    </div>
  );
}