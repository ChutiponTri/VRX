"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

import { hrStore } from "@/components/hrStore";
import TouchlessCursor from "@/components/TouchlessCursor";
import DwellButton from "@/components/DwellButton";

import SquatSurferPoseEngine from "@/components/engines/SquatSurferPoseEngine";
import MuayThaiPoseEngine from "@/components/engines/MuayThaiPoseEngine";
import RichOrMessPoseEngine from "@/components/engines/RichOrMessPoseEngine";
import FitQuestPoseEngine from "@/components/engines/FitQuestPoseEngine";
import RPGFitQuestPoseEngine from "@/components/engines/RPGFitQuestPoseEngine";
import MediaPipeEngine from "@/components/engines/MediaPipeEngine";

import SquatSurferTraining from "@/components/games/SquatSurferTraining";
import RPGFitQuestTraining from "@/components/games/RPGFitQuestTraining";
import RichOrMessTraining from "@/components/games/RichOrMessTraining";
import MuayThaiArenaTraining from "@/components/games/MuayThaiArenaTraining";
import FitQuestTraining from "@/components/games/FitQuestTraining";

// Added "CALIBRATING" to the phases
type RoundPhase = "AWAITING_CONNECTION" | "CALIBRATING" | "PLAYING" | "REST" | "RESULTS";

export default function TrainingArena() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const userId = searchParams.get("userId") as Id<"users">;
  const gameName = searchParams.get("game") || "Squat Surfer";
  const diff = searchParams.get("diff") || "Medium";

  const activeUser = useQuery(api.users.getUserStats, userId ? { userId } : "skip");
  const saveScore = useMutation(api.users.saveScore);

  const [phase, setPhase] = useState<RoundPhase>("AWAITING_CONNECTION");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // --- NEW RHR CALIBRATION STATE ---
  const [rhr, setRhr] = useState<number>(0);
  const [rhrSamples, setRhrSamples] = useState<number[]>([]);

  const [round, setRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(60); // 1 min per round
  const [cumulativeScore, setCumulativeScore] = useState(0);

  const [targetMin, setTargetMin] = useState(0);
  const [targetMax, setTargetMax] = useState(0);

  // Force React to re-render the HUD with the Bluetooth HR
  const [displayHR, setDisplayHR] = useState(0);

  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const isFullScreenCamera = ["Muay Thai Arena", "Rich Or Mess", "FitQuest"].includes(gameName);

  // Clean up Bluetooth on unmount
  useEffect(() => {
    return () => {
      hrStore.disconnect();
    };
  }, []);

  // 1. Calculate Target HR Zone (Waits until RHR is calibrated)
  useEffect(() => {
    if (!activeUser?.user || rhr === 0) return;

    // Fixed destructuring to match what calculateTHRZone actually returns
    const { targetMin, targetMax } = calculateTHRZone(activeUser.user.age, rhr, activeUser.user.profile, diff)
    setTargetMax(targetMax);
    setTargetMin(targetMin);
  }, [activeUser, diff, rhr]);

  // 2. Real-time HR Display Sync
  useEffect(() => {
    const interval = setInterval(() => setDisplayHR(hrStore.currentHR), 1000);
    return () => clearInterval(interval);
  }, []);

  // --- NEW: CALIBRATION ENGINE ---
  useEffect(() => {
    if (phase !== "CALIBRATING") return;

    // Sample the HR once a second
    const interval = setInterval(() => {
      const currentHR = hrStore.currentHR;

      // Only collect valid, non-zero HR readings
      if (currentHR > 0) {
        setRhrSamples(prev => {
          const newSamples = [...prev, currentHR];

          // Once we have 5 samples, average them and start the game
          if (newSamples.length >= 5) {
            const sum = newSamples.reduce((a, b) => a + b, 0);
            const avgRhr = Math.round(sum / newSamples.length);

            setRhr(avgRhr);
            setPhase("PLAYING");
            clearInterval(interval);
          }
          return newSamples;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  // 3. Round Timers (1 min play, 5 sec rest, 10 rounds)
  useEffect(() => {
    if (phase !== "PLAYING" && phase !== "REST") return;

    const timerId = setInterval(() => {
      setTimeLeft(prev => prev - 1); // pure: just decrement
    }, 1000);

    return () => clearInterval(timerId);
  }, [phase]);

  // New effect: react to timeLeft hitting 0, do phase/round transitions here
  useEffect(() => {
    if (phase !== "PLAYING" && phase !== "REST") return;
    if (timeLeft > 0) return;

    if (phase === "PLAYING") {
      if (round >= 10) {
        setPhase("RESULTS");
      } else {
        setPhase("REST");
        setTimeLeft(5);
      }
    } else {
      // phase === "REST"
      setPhase("PLAYING");
      setRound(r => r + 1);
      setTimeLeft(60);
    }
  }, [timeLeft, phase, round]);

  // 4. DYNAMIC HR OPTIMIZATION ENGINE
  useEffect(() => {
    if (phase !== "PLAYING" || targetMin === 0) return;

    const optimizeInterval = setInterval(() => {
      const hr = hrStore.currentHR;
      if (hr === 0) return;

      if (hr < targetMin) {
        hrStore.intensityMultiplier = Math.min(2.5, hrStore.intensityMultiplier + 0.15);
      } else if (hr > targetMax) {
        hrStore.intensityMultiplier = Math.max(0.5, hrStore.intensityMultiplier - 0.15);
      }
    }, 5000);

    return () => clearInterval(optimizeInterval);
  }, [phase, targetMin, targetMax]);

  // 1. Wrap handleGameOver in useCallback so its reference never changes
  const handleGameOver = React.useCallback((roundScore: number) => {
    setCumulativeScore(prev => prev + roundScore);
  }, []);

  // 2. Shield the Game component from UI state changes (Timer/HR)
  const renderedGame = React.useMemo(() => {
    switch (gameName) {
      case "Squat Surfer": return <SquatSurferTraining onGameOver={handleGameOver} />;
      case "Muay Thai Arena": return <MuayThaiArenaTraining onGameOver={handleGameOver} />;
      case "Rich Or Mess": return <RichOrMessTraining onGameOver={handleGameOver} />;
      case "FitQuest": return <FitQuestTraining onGameOver={handleGameOver} />;
      case "RPG Fit Quest": return <RPGFitQuestTraining onGameOver={handleGameOver} />;
      default: return null;
    }
  }, [gameName, handleGameOver]);

  // 3. Shield the Engine component from UI state changes
  const renderedEngine = React.useMemo(() => {
    switch (gameName) {
      case "Squat Surfer": return <SquatSurferPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} />;
      case "Muay Thai Arena": return <MuayThaiPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} />;
      case "Rich Or Mess": return <RichOrMessPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} />;
      case "FitQuest": return <FitQuestPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} />;
      case "RPG Fit Quest": return <RPGFitQuestPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} />;
      default: return null;
    }
  }, [gameName]);

  const handlePhysicalConnect = async () => {
    setConnectionError(null);
    try {
      const success = await hrStore.connectPolar();
      if (success) {
        setPhase("CALIBRATING"); // Transition to calibration first
      } else {
        setConnectionError("Failed to connect. Ensure device is ON.");
      }
    } catch (err: any) {
      setConnectionError("Connection cancelled or failed.");
    }
  };

  // Test mode bypass (No physical hardware needed)
  const skipConnection = () => {
    hrStore.currentHR = 75; // Mock data for testing
    setPhase("CALIBRATING"); // Go through calibration to test the UI flow
  };

  function calculateTHRZone(age: number, rhr: number, profile: "General" | "Patient", difficulty: string) {
    const hrMax = 208 - (0.7 * age);
    let targetMin = 0;
    let targetMax = 0;

    if (profile === "General") {
      if (difficulty.includes("Easy")) {
        targetMin = 0.57 * hrMax;
        targetMax = 0.63 * hrMax;
      } else if (difficulty.includes("Medium")) {
        targetMin = 0.64 * hrMax;
        targetMax = 0.76 * hrMax;
      } else { // Hard (Vigorous)
        targetMin = 0.77 * hrMax;
        targetMax = 0.95 * hrMax;
      }
    } else {
      const hrr = hrMax - rhr;
      if (difficulty.includes("Easy")) {
        targetMin = (0.30 * hrr) + rhr;
        targetMax = (0.39 * hrr) + rhr;
      } else if (difficulty.includes("Medium")) {
        targetMin = (0.40 * hrr) + rhr;
        targetMax = (0.59 * hrr) + rhr;
      } else { // Hard (Vigorous)
        targetMin = (0.60 * hrr) + rhr;
        targetMax = (0.89 * hrr) + rhr;
      }
    }

    return { targetMin, targetMax };
  }

  function getHRZoneStyle(hr: number, min: number, max: number) {
    if (hr === 0) {
      return { color: "text-slate-500", bg: "bg-slate-800/50", border: "border-slate-700", label: "--" };
    }

    const dangerHigh = max * 1.15; // ~15% over target = danger territory

    if (hr < min * 0.85) {
      // Well below target — too easy, needs to push harder
      return { color: "text-blue-400", bg: "bg-blue-950/40", border: "border-blue-500", label: "LOW" };
    }
    if (hr < min) {
      return { color: "text-cyan-400", bg: "bg-cyan-950/40", border: "border-cyan-500", label: "WARMING UP" };
    }
    if (hr <= max) {
      return { color: "text-emerald-400", bg: "bg-emerald-950/40", border: "border-emerald-500", label: "IN ZONE" };
    }
    if (hr <= dangerHigh) {
      return { color: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-500", label: "HIGH" };
    }
    return { color: "text-red-500", bg: "bg-red-950/50", border: "border-red-600", label: "DANGER" };
  }

  // 1. Add the mutation hook at the top
  const saveTraining = useMutation(api.users.saveTrainingSession);

  // 2. Add a ref to hold the array of heart rates locally
  const hrTimelineRef = useRef<number[]>([]);

  // 3. Update the existing DYNAMIC HR OPTIMIZATION ENGINE useEffect
  // We will simply push the current HR to the array every 5 seconds.
  useEffect(() => {
    if (phase !== "PLAYING" || targetMin === 0) return;

    const optimizeInterval = setInterval(() => {
      const hr = hrStore.currentHR;

      // Save to our local timeline array (1 data point every 5 seconds)
      hrTimelineRef.current.push(hr);

      if (hr === 0) return;

      if (hr < targetMin) {
        hrStore.intensityMultiplier = Math.min(2.5, hrStore.intensityMultiplier + 0.15);
      } else if (hr > targetMax) {
        hrStore.intensityMultiplier = Math.max(0.5, hrStore.intensityMultiplier - 0.15);
      }
    }, 5000);

    return () => clearInterval(optimizeInterval);
  }, [phase, targetMin, targetMax]);


  // 4. Update the RESULTS phase transition to trigger the database save
  useEffect(() => {
    if (phase !== "PLAYING" && phase !== "REST") return;

    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (phase === "PLAYING") {
            if (round >= 10) {

              // WE FINISHED ALL 10 ROUNDS! SAVE TO DATABASE HERE:
              saveTraining({
                userId,
                gameName,
                difficulty: diff,
                totalScore: cumulativeScore, // Ensure you are updating cumulativeScore on round ends
                roundsCompleted: 10,
                hrTargetMin: targetMin,
                hrTargetMax: targetMax,
                hrTimeline: hrTimelineRef.current, // Pass the array of ~120 numbers
              });

              setPhase("RESULTS");
              return 0;
            }
            setPhase("REST");
            return 5;
          } else {
            setPhase("PLAYING");
            setRound(r => r + 1);
            return 60;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [phase, round, cumulativeScore, targetMin, targetMax, userId, gameName, diff, saveTraining]);

  if (!activeUser?.user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="relative w-full h-full min-h-screen bg-slate-950 overflow-hidden font-sans select-none text-white">

      {/* Global Touchless Cursor - Active on all screens */}
      {phase === "AWAITING_CONNECTION" || phase === "RESULTS" &&
        <>

          <MediaPipeEngine />
          <TouchlessCursor />
        </>
      }

      {/* PHASE 1: HARDWARE CONNECTION */}
      {phase === "AWAITING_CONNECTION" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-0">
          <div className="w-full max-w-xl text-center bg-slate-900 border-2 border-cyan-500 rounded-2xl p-10 shadow-[0_0_40px_rgba(34,211,238,0.3)]">
            <h1 className="text-4xl font-extrabold text-cyan-400 mb-6 uppercase">Pro Training Mode</h1>
            <p className="text-slate-300 text-lg mb-8">
              Browser security requires a physical hardware click to authorize Bluetooth devices.
              Please click the button below with your mouse or trackpad.
            </p>

            <button
              onClick={handlePhysicalConnect}
              className="px-10 py-5 bg-cyan-600 hover:bg-cyan-500 active:scale-95 transition-all rounded-xl font-black text-2xl tracking-widest shadow-lg text-white mb-6"
            >
              CONNECT POLAR SENSE
            </button>

            {connectionError && (
              <p className="text-red-400 mb-6 font-bold">{connectionError}</p>
            )}

            <div className="flex gap-4 justify-center mt-8">
              <DwellButton
                onClick={skipConnection}
                className="w-48 h-16 bg-slate-800 border border-slate-600 text-slate-300 font-bold hover:border-yellow-500"
                activeColor="bg-yellow-500"
              >
                SKIP (TEST MODE)
              </DwellButton>
              <DwellButton
                onClick={() => router.push("/")}
                className="w-48 h-16 bg-slate-800 border border-slate-600 text-slate-300 font-bold hover:border-red-500"
                activeColor="bg-red-500"
              >
                CANCEL & RETURN
              </DwellButton>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 1.5: CALIBRATION */}
      {phase === "CALIBRATING" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-50">
          <div className="text-6xl mb-4 animate-bounce">⏱️</div>
          <h2 className="text-4xl font-black text-cyan-400 uppercase tracking-widest mb-6">Calibrating RHR</h2>
          <p className="text-slate-300 text-lg mb-8 text-center max-w-md">
            Please stand still and relax while we measure your baseline heart rate.
          </p>

          <div className="flex items-center gap-4 text-rose-500 mt-4 text-6xl bg-rose-950/20 px-10 py-6 rounded-3xl border border-rose-900/50">
            <span className="animate-pulse">♥</span>
            <span className="font-mono font-black">{displayHR || "--"}</span>
          </div>

          <div className="mt-8 flex gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`w-12 h-4 rounded-full transition-all duration-300 ${i < rhrSamples.length ? "bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.8)]" : "bg-slate-800"}`}
              />
            ))}
          </div>
          <p className="text-slate-500 font-bold mt-4 tracking-widest text-sm uppercase">Collecting Samples</p>
        </div>
      )}

      {/* PHASE 2: GAMEPLAY */}
      {phase === "PLAYING" && (
        <>
          {isFullScreenCamera && (
            <>
              <video ref={bgVideoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1] opacity-30 z-0" autoPlay playsInline muted />
              <canvas ref={poseCanvasRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-10 pointer-events-none" />
            </>
          )}

          {/* Render Memoized Game Here */}
          <div className="absolute inset-0 z-20 pointer-events-none">
            {renderedGame}
          </div>

          <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-4 pointer-events-none">
            {!isFullScreenCamera && (
              <div className="relative w-64 aspect-video bg-slate-900 border-2 border-purple-500 rounded-2xl overflow-hidden shadow-[0_0_15px_rgba(139,92,246,0.6)]">
                <video ref={bgVideoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" autoPlay playsInline muted />
                <canvas ref={poseCanvasRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-10" />
              </div>
            )}

            {/* <div className="bg-slate-900/90 border border-cyan-500/50 rounded-xl p-4 w-64 shadow-2xl backdrop-blur-md">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Training</span>
                <span className="text-cyan-400 font-bold">Round {round}/10</span>
              </div>

              <div className="text-4xl font-mono font-black text-white mb-4 text-right">00:{String(timeLeft).padStart(2, '0')}</div>

              <div className="border-t border-slate-700 pt-3 flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Target</p>
                  <p className="text-xs text-slate-300">{Math.round(targetMin)} - {Math.round(targetMax)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Polar HR</p>
                  <div className="flex items-center gap-2 text-rose-500">
                    <span className="animate-pulse">♥</span>
                    <span className="text-3xl font-black font-mono">{displayHR || "--"}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex justify-between text-[10px] text-slate-500 border-t border-slate-800 pt-2">
                <div>RHR: <span className="text-white">{rhr}</span></div>
                <div>AI Mul: <span className="text-yellow-400">{hrStore.intensityMultiplier.toFixed(2)}x</span></div>
              </div>
            </div> */}

            <div className="bg-slate-900/90 border border-cyan-500/50 rounded-xl p-4 w-64 shadow-2xl backdrop-blur-md">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Training</span>
                <span className="text-cyan-400 font-bold">Round {round}/10</span>
              </div>

              <div className="text-4xl font-mono font-black text-white mb-4 text-right">
                00:{String(timeLeft).padStart(2, '0')}
              </div>

              {/* HEART RATE - big, color-coded */}
              {(() => {
                const zone = getHRZoneStyle(displayHR, targetMin, targetMax);
                return (
                  <div className={`border-2 ${zone.border} ${zone.bg} rounded-xl p-3 mb-3 transition-colors duration-500`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Heart Rate</span>
                      <span className={`text-[10px] font-black uppercase tracking-wider ${zone.color}`}>{zone.label}</span>
                    </div>
                    <div className={`flex items-center gap-2 ${zone.color} transition-colors duration-500`}>
                      <span className="animate-pulse text-2xl">♥</span>
                      <span className="text-4xl font-black font-mono">{displayHR || "--"}</span>
                      <span className="text-xs text-slate-400 font-bold mb-1">BPM</span>
                    </div>
                  </div>
                );
              })()}

              {/* TARGET ZONE */}
              <div className="border border-slate-700 bg-slate-800/50 rounded-lg p-2 mb-3 flex justify-between items-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Target Zone</span>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  {Math.round(targetMin)}–{Math.round(targetMax)}
                </span>
              </div>

              {/* RHR + AI MULTIPLIER */}
              <div className="flex justify-between gap-2">
                <div className="flex-1 border border-slate-700 bg-slate-800/50 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Resting HR</p>
                  <p className="text-lg font-mono font-black text-slate-200">{rhr}</p>
                </div>
                <div className={`flex-1 border rounded-lg p-2 text-center ${hrStore.intensityMultiplier > 1.5
                  ? "border-red-600 bg-red-950/40"
                  : hrStore.intensityMultiplier > 1.0
                    ? "border-amber-500 bg-amber-950/40"
                    : "border-cyan-500 bg-cyan-950/40"
                  }`}>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">AI Multiplier</p>
                  <p className={`text-lg font-mono font-black ${hrStore.intensityMultiplier > 1.5
                    ? "text-red-400"
                    : hrStore.intensityMultiplier > 1.0
                      ? "text-amber-400"
                      : "text-cyan-400"
                    }`}>
                    {hrStore.intensityMultiplier.toFixed(2)}x
                  </p>
                </div>
              </div>
            </div>
          </div>



          {/* Render Memoized Engine Here */}
          {renderedEngine}
        </>
      )}

      {/* PHASE 3: REST PHASE OVERLAY */}
      {phase === "REST" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-50">
          <div className="text-6xl mb-4">😮‍💨</div>
          <h2 className="text-4xl font-black text-cyan-400 uppercase tracking-widest mb-6">Recover</h2>
          <div className="text-[150px] font-mono font-black text-white leading-none">{timeLeft}</div>
          <div className="flex items-center gap-3 text-rose-500 mt-8 text-2xl border border-rose-900 bg-rose-950/30 px-6 py-3 rounded-full">
            <span className="animate-pulse">♥</span>
            <span className="font-mono font-bold">HR: {displayHR} BPM</span>
          </div>

          {gameName === "FitQuest" && <FitQuestPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} />}
        </div>
      )}

      {/* PHASE 4: RESULTS PHASE */}
      {phase === "RESULTS" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-0 text-white">
          <h2 className="text-5xl font-black text-emerald-400 uppercase mb-4">Training Complete</h2>
          <p className="text-slate-400 mb-8">10 Rounds Completed Successfully</p>

          <DwellButton
            onClick={() => { router.push("/"); }}
            className="w-80 h-24 bg-slate-800 border-2 border-emerald-500 text-2xl font-bold tracking-widest text-white hover:border-emerald-400"
            activeColor="bg-emerald-500"
          >
            RETURN TO MENU
          </DwellButton>
        </div>
      )}

    </div>
  );
}

// Ensure your hrStore export remains here at the bottom of the file exactly as you had it.