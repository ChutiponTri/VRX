"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

import HeartRateScanner from "../../components/HeartRateScanner";

import MediaPipeEngine from "../../components/engines/MediaPipeEngine"; // Hand Tracker for UI
import TouchlessCursor from "../../components/TouchlessCursor";
import DwellButton from "../../components/DwellButton";
import SquatSurfer from "@/components/games/SquatSurfer";
import MuayThaiArena from "@/components/games/MuayThaiArena";
import RichOrMess from "@/components/games/RichOrMess";
import SquatSurferPoseEngine from "@/components/engines/SquatSurferPoseEngine";
import MuayThaiPoseEngine from "@/components/engines/MuayThaiPoseEngine";
import RichOrMessPoseEngine from "@/components/engines/RichOrMessPoseEngine";
import FitQuest from "@/components/games/FitQuest";
import FitQuestPoseEngine from "@/components/engines/FitQuestPoseEngine";
import RPGFitQuest from "@/components/games/RPGFitQuest";
import RPGFitQuestPoseEngine from "@/components/engines/RPGFitQuestPoseEngine";

type GamePhase = "PLAYING" | "POST_GAME_SCAN" | "RESULTS" | "RESTART_SCAN" | "SAVING";

export default function GameArena({ searchParams }: {
  searchParams: {
    userId?: string;
    game?: string;
    diff?: string;
    rhr?: string;
  }
}) {
  const router = useRouter();

  const userId = searchParams.userId as Id<"users">;
  const gameName = searchParams.game || "Squat Surfer";
  const diff = searchParams.diff || "Easy";
  const [currentRHR, setCurrentRHR] = useState(parseInt(searchParams.rhr || "0"));

  const activeUser = useQuery(api.users.getUserStats, userId ? { userId } : "skip");
  const saveScore = useMutation(api.users.saveScore);

  const [phase, setPhase] = useState<GamePhase>("PLAYING");
  const [finalScore, setFinalScore] = useState(0);
  const [postGameHR, setPostGameHR] = useState(0);
  const [thrTarget, setThrTarget] = useState("Calculating...");

  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isEngineReady, setIsEngineReady] = useState(false);

  // รีเซ็ตสถานะ Engine เมื่อเริ่มเล่นใหม่
  useEffect(() => {
    if (phase === "PLAYING") {
      setIsEngineReady(false);
    }
  }, [phase]);

  const handleEngineReady = () => {
    setIsEngineReady(true);
  };

  // Check if current game needs full screen background camera
  const isFullScreenCamera =
    gameName === "Muay Thai Arena" ||
    gameName === "Rich Or Mess" ||
    gameName === "FitQuest";

  // Calculate Target Heart Rate
  useEffect(() => {
    if (!activeUser?.user) return;
    const { age, profile } = activeUser.user;
    const hrMax = Math.round(208 - (0.7 * age));
    let tMin = 0, tMax = 0;

    if (profile === "General") {
      if (diff.includes("Easy")) { tMin = 0.57 * hrMax; tMax = 0.63 * hrMax; }
      else if (diff.includes("Medium")) { tMin = 0.64 * hrMax; tMax = 0.76 * hrMax; }
      else { tMin = 0.77 * hrMax; tMax = 0.95 * hrMax; }
    } else {
      const hrr = hrMax - currentRHR;
      if (diff.includes("Easy")) { tMin = (0.30 * hrr) + currentRHR; tMax = (0.39 * hrr) + currentRHR; }
      else if (diff.includes("Medium")) { tMin = (0.40 * hrr) + currentRHR; tMax = (0.59 * hrr) + currentRHR; }
      else { tMin = (0.60 * hrr) + currentRHR; tMax = (0.89 * hrr) + currentRHR; }
    }
    setThrTarget(`${Math.round(tMin)} - ${Math.round(tMax)} BPM`);
  }, [activeUser, diff, currentRHR]);

  // Handlers
  const handleGameOver = (score: number) => {
    setFinalScore(score);
    setPhase("POST_GAME_SCAN");
  };

  const handlePostGameScan = async (bpm: number) => {
    setPostGameHR(bpm);
    await saveScore({
      userId, gameName, mode: diff, score: finalScore, preGameHR: currentRHR, postGameHR: bpm
    });
    setPhase("RESULTS");
  };

  const handleRestartScan = (bpm: number) => {
    setCurrentRHR(bpm);
    setPhase("PLAYING");
  };

  if (!activeUser?.user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="relative w-full h-full min-h-screen bg-slate-950 overflow-hidden font-sans select-none">

      {/* --- PLAYING PHASE --- */}
      {phase === "PLAYING" && (
        <>
          {/* 2. แสดง Loading Screen จนกว่า Camera/MediaPipe จะพร้อม */}
          {!isEngineReady && (
            <div className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center text-white">
              <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
              <h3 className="text-xl font-bold text-cyan-400">Initializing Camera & Pose Detection...</h3>
              <p className="text-sm text-slate-400 mt-2">Please stand in front of the camera</p>
            </div>
          )}

          {/* BACKGROUND CAMERA (For 2D Games) */}
          {isFullScreenCamera && (
            <>
              <video ref={bgVideoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1] opacity-30 z-0" autoPlay playsInline muted />
              <canvas ref={poseCanvasRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-10 pointer-events-none" />
            </>
          )}

          {/* GAME COMPONENTS (ส่ง isEngineReady หรือแสดงเฉพาะตอนที่ ready ก็ได้ค่ะ) */}
          {isEngineReady && (
            <>
              {gameName === "Squat Surfer" && <SquatSurfer onGameOver={handleGameOver} />}
              {gameName === "Muay Thai Arena" && <MuayThaiArena onGameOver={handleGameOver} />}
              {gameName === "Rich Or Mess" && <RichOrMess onGameOver={handleGameOver} />}
              {gameName === "FitQuest" && <FitQuest onGameOver={handleGameOver} />}
              {gameName === "RPG Fit Quest" && <RPGFitQuest onGameOver={handleGameOver} />}
            </>
          )}

          {/* HUD & PIP CAMERA */}
          <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-4 pointer-events-none">

            {/* PIP Webcam (Only for 3D Games like Squat Surfer) */}
            {!isFullScreenCamera && (
              <div className="relative w-64 aspect-video bg-slate-900 border-2 border-purple-500 rounded-2xl overflow-hidden shadow-[0_0_15px_rgba(139,92,246,0.6)]">
                <video ref={bgVideoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" autoPlay playsInline muted />
                <canvas ref={poseCanvasRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-10" />
              </div>
            )}

            <div className="bg-slate-900/80 border border-purple-500/30 rounded-xl p-3 text-right backdrop-blur-md">
              <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">Target Heart Rate</p>
              <p className="text-xl font-bold text-cyan-400">{thrTarget}</p>
            </div>
          </div>

          {/* AI ENGINES (Tracking logic) */}
          {gameName === "Squat Surfer" && <SquatSurferPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} onReady={handleEngineReady} />}
          {gameName === "Muay Thai Arena" && <MuayThaiPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} onReady={handleEngineReady} />}
          {gameName === "Rich Or Mess" && <RichOrMessPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} onReady={handleEngineReady} />}
          {gameName === "FitQuest" && <FitQuestPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} onReady={handleEngineReady} />}
          {gameName === "RPG Fit Quest" && <RPGFitQuestPoseEngine videoRef={bgVideoRef} canvasRef={poseCanvasRef} onReady={handleEngineReady} />}
        </>
      )}

      {/* --- POST-GAME SCAN PHASE --- */}
      {phase === "POST_GAME_SCAN" && (
        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center z-50 text-white p-8 backdrop-blur-lg">
          <h1 className="text-5xl font-extrabold text-rose-500 mb-4 uppercase">CRASHED!</h1>
          <h2 className="text-3xl mb-12">Final Score: {finalScore}</h2>

          <div className="w-full max-w-xl bg-slate-900 p-8 rounded-3xl border border-slate-700 mb-8 shadow-2xl">
            <h3 className="text-2xl text-yellow-400 mb-4 text-center">POST-GAME VITALS</h3>
            <p className="text-slate-400 text-center mb-8">Saving workout data... Please stay still for final Heart Rate scan.</p>
            <HeartRateScanner onComplete={handlePostGameScan} />
            <button onClick={() => handlePostGameScan(140)} className="w-full mt-6 text-slate-500 underline text-sm">Skip & Save (Test Mode)</button>
          </div>
        </div>
      )}

      {/* --- RESULTS & REPLAY PHASE --- */}
      {phase === "RESULTS" && (
        <>
          <MediaPipeEngine />
          <TouchlessCursor />

          <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center z-30 text-white p-8">
            <h2 className="text-5xl font-extrabold text-transparent bg-linear-to-r from-purple-400 to-cyan-400 bg-clip-text uppercase mb-2">Workout Complete</h2>

            <div className="flex gap-12 mt-8 mb-12 text-center">
              <div>
                <p className="text-slate-400 text-sm tracking-widest uppercase">Final Score</p>
                <p className="text-5xl font-bold text-yellow-400">{finalScore}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm tracking-widest uppercase">Final HR</p>
                <p className="text-5xl font-bold text-rose-400">{postGameHR} <span className="text-xl">BPM</span></p>
              </div>
            </div>

            <div className="flex gap-8 mt-4">
              <DwellButton
                onClick={() => setPhase("RESTART_SCAN")}
                className="w-72 h-32 bg-slate-800 border-2 border-green-600 hover:border-green-400 flex flex-col justify-center items-center shadow-lg"
                activeColor="bg-green-500"
              >
                <h3 className="text-3xl font-bold text-green-400">PLAY AGAIN</h3>
              </DwellButton>

              <DwellButton
                onClick={() => router.push("/")}
                className="w-72 h-32 bg-slate-800 border-2 border-slate-600 hover:border-slate-400 flex flex-col justify-center items-center shadow-lg"
                activeColor="bg-slate-500"
              >
                <h3 className="text-3xl font-bold text-slate-400">MAIN MENU</h3>
              </DwellButton>
            </div>

            <p className="mt-8 text-slate-500 text-sm">Hover over a button with your hand to select.</p>
          </div>
        </>
      )}

      {/* --- PRE-GAME RESTART SCAN --- */}
      {phase === "RESTART_SCAN" && (
        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center z-50 text-white p-8">
          <div className="w-full max-w-xl bg-slate-900 p-8 rounded-3xl border border-slate-700 shadow-2xl">
            <h3 className="text-2xl text-cyan-400 mb-4 text-center">NEW SESSION DETECTED</h3>
            <p className="text-slate-400 text-center mb-8">Capturing new baseline Resting Heart Rate for the next round...</p>
            <HeartRateScanner onComplete={handleRestartScan} />
            <button onClick={() => handleRestartScan(75)} className="w-full mt-6 text-slate-500 underline text-sm">Skip & Start (Test Mode)</button>
          </div>
        </div>
      )}

    </div>
  );
}