"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

import TouchlessCursor from "../components/TouchlessCursor";
import DwellButton from "../components/DwellButton";
import VirtualKeyboard from "../components/VirtualKeyboard";
import MediaPipeEngine from "../components/engines/MediaPipeEngine";
import HeartRateScanner from "../components/HeartRateScanner";
import { hrStore } from "@/components/hrStore";

type FlowStep =
  | "SELECT_USER"
  | "CREATE_NAME"
  | "CREATE_AGE"
  | "CREATE_PROFILE"
  | "DASHBOARD"
  | "SELECT_GAME"
  | "DIFFICULTY"
  | "PRE_GAME_RHR";

export default function AppEntry() {
  const router = useRouter();
  const [step, setStep] = useState<FlowStep>("SELECT_USER");

  // Data State
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<string | null>(null);
  const [sessionRounds, setSessionRounds] = useState<5 | 10>(5);
  const [newName, setNewName] = useState("");
  const [newAge, setNewAge] = useState("");

  // Convex DB Hooks
  const users = useQuery(api.users.getAllUsers);
  const createUser = useMutation(api.users.createUser);
  const activeUserStats = useQuery(api.users.getUserStats, selectedUserId ? { userId: selectedUserId } : "skip");

  // Is Training Mode Set
  const [isProMode, setIsProMode] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Toggle Mode (UI Only)
  const toggleProMode = () => {
    // Simply toggle the state. We will do the actual hardware connection 
    // on the /training route where we can force a physical click.
    setIsProMode((prev) => !prev);

    // If turning off, we can safely disconnect programmatically
    if (isProMode) {
      hrStore.disconnect();
    }
  };

  // --- Navigation Handlers ---
  const goBack = () => {
    switch (step) {
      case "CREATE_NAME": setStep("SELECT_USER"); break;
      case "CREATE_AGE": setStep("CREATE_NAME"); break;
      case "CREATE_PROFILE": setStep("CREATE_AGE"); break;
      case "DASHBOARD":
        setStep("SELECT_USER");
        setSelectedUserId(null);
        break;
      case "SELECT_GAME": setStep("DASHBOARD"); break;
      case "DIFFICULTY": setStep("SELECT_GAME"); break;
      case "PRE_GAME_RHR": setStep("DIFFICULTY"); break;
      default: break;
    }
  };

  const handleKeyPress = (key: string) => {
    if (step === "CREATE_NAME") setNewName((prev) => prev + key);
    if (step === "CREATE_AGE") setNewAge((prev) => prev + key);
  };
  const handleBackspace = () => {
    if (step === "CREATE_NAME") setNewName((prev) => prev.slice(0, -1));
    if (step === "CREATE_AGE") setNewAge((prev) => prev.slice(0, -1));
  };
  const handleEnter = () => {
    if (step === "CREATE_NAME" && newName.length > 0) setStep("CREATE_AGE");
    if (step === "CREATE_AGE" && newAge.length > 0) setStep("CREATE_PROFILE");
  };

  const handleCreateProfile = async (profile: "General" | "Patient") => {
    const id = await createUser({ name: newName, age: parseInt(newAge), profile });
    setSelectedUserId(id);
    setStep("DASHBOARD");
  };

  const selectDifficultyAndScan = (difficulty: string) => {
    setSelectedDiff(difficulty);
    if (!isProMode) {
      // Normal mode: ถ้าเป็นเกมที่ไม่มีเวลา (Block Jump) ให้ไปเลย, เกมอื่น scan RHR ก่อน
      setStep("PRE_GAME_RHR");
    } else {
      if (!selectedUserId || !selectedGame) return;

      // FIX: Use 'difficulty' parameter directly, not 'selectedDiff' state, 
      // because setState is asynchronous and will be null on this exact render cycle.
      const mockBpm = 75;
      const query = new URLSearchParams({
        userId: selectedUserId,
        game: selectedGame,
        diff: difficulty,
        rhr: mockBpm.toString(),
        rounds: sessionRounds.toString(),
        duration: "180"
      });

      // Push to the dedicated training route
      router.push(`/training?${query.toString()}`);

    }
  };

  const launchGameRoute = (bpm: number) => {
    if (!selectedUserId || !selectedGame || !selectedDiff) return;

    // Construct the URL with required game parameters
    // Normal mode: always 1 round, 3 min. User can replay themselves.
    const query = new URLSearchParams({
      userId: selectedUserId,
      game: selectedGame,
      diff: selectedDiff,
      rhr: bpm.toString(),
      rounds: "1",
      duration: "180"
    });

    // Push to the dedicated game route
    router.push(`/game?${query.toString()}`);
  };

  // --- Heart Rate Stats (Dashboard View) ---
  const calculateHRStats = (age: number, profile: string) => {
    const hrMax = Math.round(208 - (0.7 * age));
    if (profile === "General") {
      const targetMin = Math.round(0.77 * hrMax);
      const targetMax = Math.round(0.95 * hrMax);
      return `HR Max: ${hrMax} BPM | Target (Hard): ${targetMin} - ${targetMax} BPM`;
    }
    return `HR Max: ${hrMax} BPM | (Target will calculate after Pre-Game Scan)`;
  };

  return (
    <>
      {/* Hide Hand Tracker when running the Face/Heart Rate Scanner */}
      {step !== "PRE_GAME_RHR" && (
        <>
          <MediaPipeEngine />
          <TouchlessCursor />
        </>
      )}

      <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8">

        {/* Universal Back Button */}
        {step !== "SELECT_USER" && step !== "PRE_GAME_RHR" && (
          <div className="fixed top-8 left-8 z-30">
            <DwellButton
              onClick={goBack}
              dwellTimeMs={1000}
              className="w-32 h-16 bg-slate-800 border-2 border-slate-600 text-xl font-bold text-slate-300 hover:border-cyan-400"
              activeColor="bg-slate-600"
            >
              ← BACK
            </DwellButton>
          </div>
        )}

        {/* TOP RIGHT: Pro Training Mode Toggle */}
        {step !== "PRE_GAME_RHR" && (
          <div className="fixed top-8 right-8 z-30">
            <DwellButton
              onClick={toggleProMode}
              disabled={isConnecting}
              dwellTimeMs={1500}
              className={`w-56 h-16 border-2 flex items-center justify-center rounded-xl text-lg font-bold transition-all duration-300 ${isConnecting
                ? "bg-yellow-900/50 border-yellow-500 text-yellow-400 animate-pulse"
                : isProMode
                  ? "bg-blue-900/40 border-blue-400 text-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                  : "bg-slate-800 border-slate-600 text-slate-400 hover:border-blue-500 hover:text-blue-200"
                }`}
              activeColor={isProMode ? "bg-blue-500" : "bg-slate-500"}
            >
              {isConnecting
                ? "CONNECTING..."
                : isProMode
                  ? "⚡ PRO MODE: ON"
                  : "PRO MODE: OFF"}
            </DwellButton>
          </div>
        )}

        <div className="absolute top-10 text-center">
          <h1 className="text-5xl font-extrabold tracking-widest text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-600 mb-2">
            VRX
          </h1>
          {step !== "PRE_GAME_RHR" && (
            <p className="text-slate-400 text-lg uppercase tracking-wider">Web-Based Fitness AI</p>
          )}
        </div>

        {/* STEP 1: Select User or Create New */}
        {step === "SELECT_USER" && (
          <div className="w-full max-w-4xl h-auto flex flex-col items-center">
            <h2 className="text-3xl mb-3">WHO IS PLAYING?</h2>
            <p className="text-xs text-slate-400 mb-5 flex items-center gap-2">
              <span>🤏 Pinch & drag to scroll (จีบนิ้วค้างไว้เพื่อเลื่อน)</span>
              <span>•</span>
              <span>⏱️ Hover to select (ชี้ค้างเพื่อเลือก)</span>
            </p>

            {/* Scrollable Container: ใช้ max-h-[300px] แถวเดียวสูงพอดี 1 แถว ถ้ามากกว่า 2 แถวจะล็อกไว้ที่ 2 แถวแล้ว scroll */}
            <div
              id="player-scroll-container"
              className="w-full max-h-75 overflow-y-auto p-3 flex gap-6 flex-wrap justify-center mb-6 scrollbar-thin scrollbar-thumb-cyan-500 scrollbar-track-slate-800"
            >
              {users?.map((user) => (
                <DwellButton
                  key={user._id}
                  onClick={() => { setSelectedUserId(user._id); setStep("DASHBOARD"); }}
                  className="w-48 h-32 bg-slate-800 border-2 border-slate-600 flex flex-col items-center justify-center hover:border-cyan-400 shrink-0"
                  activeColor="bg-cyan-500"
                >
                  <span className="text-2xl font-bold text-cyan-400">{user.name}</span>
                  <span className="text-slate-400">Age: {user.age}</span>
                </DwellButton>
              ))}
            </div>

            {/* ปุ่มสร้างผู้เล่นใหม่ */}
            <div className="w-full flex justify-center pt-2 border-t border-slate-800">
              <DwellButton
                onClick={() => { setNewName(""); setNewAge(""); setStep("CREATE_NAME"); }}
                className="w-80 h-20 bg-emerald-900/50 border-2 border-emerald-500 text-xl font-bold hover:border-emerald-400"
                activeColor="bg-emerald-500"
              >
                + CREATE NEW PLAYER
              </DwellButton>
            </div>
          </div>
        )}

        {/* STEPS: Create Flow */}
        {(step === "CREATE_NAME" || step === "CREATE_AGE") && (
          <div className="w-full max-w-3xl flex flex-col items-center">
            <h2 className="text-3xl mb-8">
              {step === "CREATE_NAME" ? "ENTER NEW NAME" : "ENTER AGE"}
            </h2>
            <div className="text-5xl font-mono bg-slate-900 border-b-4 border-cyan-500 min-w-75 text-center p-4 mb-12 min-h-20">
              {step === "CREATE_NAME" ? newName : newAge}
              <span className="animate-pulse">_</span>
            </div>

            {/* กำหนด mode ตาม step อย่างถูกหลัก */}
            <VirtualKeyboard
              mode={step === "CREATE_NAME" ? "text" : "number"}
              onKeyPress={handleKeyPress}
              onBackspace={handleBackspace}
              onEnter={handleEnter}
            />
          </div>
        )}

        {step === "CREATE_PROFILE" && (
          <div className="flex flex-col items-center">
            <h2 className="text-3xl mb-8 uppercase">Select Health Profile</h2>
            <div className="flex gap-8">
              <DwellButton onClick={() => handleCreateProfile("General")} className="w-80 h-64 bg-slate-800 border-2 border-cyan-600 hover:border-cyan-400 p-8 text-left" activeColor="bg-cyan-500">
                <h3 className="text-3xl font-bold text-cyan-400 mb-4">GENERAL</h3>
                <p className="text-slate-300">Standard difficulty curves for healthy individuals.</p>
              </DwellButton>
              <DwellButton onClick={() => handleCreateProfile("Patient")} className="w-80 h-64 bg-slate-800 border-2 border-purple-600 hover:border-purple-400 p-8 text-left" activeColor="bg-purple-500">
                <h3 className="text-3xl font-bold text-purple-400 mb-4">PATIENT</h3>
                <p className="text-slate-300">Safer exertion limits using Heart Rate Reserve.</p>
              </DwellButton>
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {step === "DASHBOARD" && activeUserStats?.user && (
          <div className="w-full max-w-5xl flex flex-col items-center">
            <h2 className="text-4xl font-bold text-cyan-400 mb-2">WELCOME BACK, {activeUserStats.user.name.toUpperCase()}</h2>
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl mb-12 w-full max-w-2xl text-center shadow-lg">
              <p className="text-lg text-slate-300 mb-2">Profile: {activeUserStats.user.profile} | Age: {activeUserStats.user.age}</p>
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 mt-4">
                <p className="text-xl font-mono text-emerald-400">
                  {calculateHRStats(activeUserStats.user.age, activeUserStats.user.profile)}
                </p>
              </div>
              <div className="mt-6 border-t border-slate-700 pt-4">
                <h4 className="text-sm text-slate-500 mb-2">RECENT SCORES</h4>
                {activeUserStats.scores.length === 0 ? <p className="text-slate-400">No games played yet.</p> : (
                  <div className="flex justify-center gap-4 flex-wrap">
                    {activeUserStats.scores.map(s => (
                      <span key={s._id} className="bg-slate-800 px-3 py-1 rounded text-sm text-yellow-400 border border-slate-600">
                        {s.gameName} ({s.mode}): {s.score}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DwellButton onClick={() => setStep("SELECT_GAME")} className="w-96 h-24 bg-cyan-900 border-2 border-cyan-500 text-3xl font-bold hover:border-cyan-400" activeColor="bg-cyan-500">
              SELECT GAME
            </DwellButton>
          </div>
        )}

        {/* GAME SELECTION */}
        {step === "SELECT_GAME" && (
          <div className="w-full max-w-6xl flex flex-col items-center mt-12">
            <h2 className="text-3xl mb-8 uppercase">Choose Your Workout</h2>
            <div className="flex gap-6 w-full justify-center">
              <DwellButton onClick={() => { setSelectedGame("Muay Thai Game"); setStep("DIFFICULTY"); }} className="w-72 h-64 bg-slate-800 border-2 border-red-600/50 hover:border-red-500 p-6 flex flex-col justify-center items-center" activeColor="bg-red-500">
                <h3 className="text-2xl font-bold text-red-400 mb-2 text-center">MUAY THAI GAME</h3>
                <p className="text-slate-400 text-center text-sm">Focus: Arm actions, Punches, Targets</p>
              </DwellButton>
              <DwellButton onClick={() => { setSelectedGame("Block Jump Game"); setStep("DIFFICULTY"); }} className="w-72 h-64 bg-slate-800 border-2 border-blue-600/50 hover:border-blue-500 p-6 flex flex-col justify-center items-center" activeColor="bg-blue-500">
                <h3 className="text-2xl font-bold text-blue-400 mb-2 text-center">BLOCK JUMP GAME</h3>
                <p className="text-slate-400 text-center text-sm">Focus: Lateral steps, Jump & Duck Obstacles</p>
              </DwellButton>
              <DwellButton onClick={() => { setSelectedGame("Squat Game"); setStep("DIFFICULTY"); }} className="w-72 h-64 bg-slate-800 border-2 border-yellow-600/50 hover:border-yellow-500 p-6 flex flex-col justify-center items-center" activeColor="bg-yellow-500">
                <h3 className="text-2xl font-bold text-yellow-400 mb-2 text-center">SQUAT GAME</h3>
                <p className="text-slate-400 text-center text-sm">Focus: Squats, Coin Collection, Core Control</p>
              </DwellButton>
              <DwellButton onClick={() => { setSelectedGame("Walking Game"); setStep("DIFFICULTY"); }} className="w-72 h-64 bg-slate-800 border-2 border-green-600/50 hover:border-green-500 p-6 flex flex-col justify-center items-center" activeColor="bg-green-500">
                <h3 className="text-2xl font-bold text-green-400 mb-2 text-center">WALKING GAME</h3>
                <p className="text-slate-400 text-center text-sm">Focus: March in place, Lateral Leg Raise, Squat</p>
              </DwellButton>
            </div>

            {/* FitQuest Special Button */}
            <div className="mt-12 gap-6 flex justify-center w-full">
              <DwellButton
                onClick={() => { setSelectedGame("FitQuest"); setStep("DIFFICULTY"); }}
                className="w-32 h-32 rounded-full bg-slate-900 border-4 border-cyan-600/50 hover:border-cyan-400 flex flex-col justify-center items-center shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all"
                activeColor="bg-cyan-500"
              >
                <span className="text-4xl mb-1">🏃</span>
                <span className="text-xs font-bold text-cyan-400 tracking-widest">FITQUEST</span>
              </DwellButton>
            </div>
          </div>
        )}

        {/* DIFFICULTY */}
        {step === "DIFFICULTY" && (
          <div className="w-full max-w-5xl flex flex-col items-center mt-8">
            <h2 className="text-3xl mb-2 uppercase">Select Intensity{isProMode ? " & Duration" : ""}</h2>
            <p className="text-slate-400 mb-6">Game: <span className="text-cyan-400 font-bold">{selectedGame}</span></p>

            {/* Info banners for normal mode */}
            {!isProMode && selectedGame === "Block Jump Game" && (
              <div className="w-full max-w-2xl bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 mb-8 text-center">
                <span className="text-sm text-slate-400">🏃 โหมดปกติ: วิ่งไม่มีกำหนดเวลา — เกมจบเมื่อชนสิ่งกีดขวาง</span>
              </div>
            )}
            {!isProMode && selectedGame === "FitQuest" && (
              <div className="w-full max-w-2xl bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 mb-8 text-center">
                <span className="text-sm text-slate-400">🏋️ FitQuest นับตามจำนวนครั้ง — ทำครบ 4 ท่าจึงจะจบ (ไม่มีกำหนดเวลา)</span>
              </div>
            )}
            {!isProMode && selectedGame !== "Block Jump Game" && selectedGame !== "FitQuest" && (
              <div className="w-full max-w-2xl bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 mb-8 text-center">
                <span className="text-sm text-slate-400">⏱️ โหมดปกติ: เล่น 1 รอบ 3 นาที — กด Replay เพื่อเล่นซ้ำได้</span>
              </div>
            )}

            {/* Session Duration Selector: only shown in Pro mode, and only for time-based games */}
            {isProMode && selectedGame !== "FitQuest" && (
            <div className="w-full max-w-2xl bg-slate-900/80 border border-slate-700/80 rounded-2xl p-4 mb-8 backdrop-blur-md flex flex-col items-center">
              <span className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">
                Workout Duration (เลือกระยะเวลาการเล่น)
              </span>
              <div className="flex gap-4 w-full justify-center">
                <DwellButton
                  onClick={() => setSessionRounds(5)}
                  className={`flex-1 h-20 border-2 rounded-xl flex items-center justify-center gap-3 transition-all ${
                    sessionRounds === 5
                      ? "bg-cyan-950/80 border-cyan-400 text-white shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                      : "bg-slate-800/80 border-slate-600 text-slate-400 hover:border-slate-400"
                  }`}
                  activeColor="bg-cyan-500"
                >
                  <span className={`text-2xl ${sessionRounds === 5 ? "text-cyan-400" : "text-slate-500"}`}>
                    {sessionRounds === 5 ? "☑" : "☐"}
                  </span>
                  <div className="text-left">
                    <div className="text-base font-bold text-white leading-tight">3 Min x 5 Rounds</div>
                    <div className="text-xs text-cyan-300 font-medium">3 นาที x 5 รอบ (15 นาที)</div>
                  </div>
                </DwellButton>

                <DwellButton
                  onClick={() => setSessionRounds(10)}
                  className={`flex-1 h-20 border-2 rounded-xl flex items-center justify-center gap-3 transition-all ${
                    sessionRounds === 10
                      ? "bg-cyan-950/80 border-cyan-400 text-white shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                      : "bg-slate-800/80 border-slate-600 text-slate-400 hover:border-slate-400"
                  }`}
                  activeColor="bg-cyan-500"
                >
                  <span className={`text-2xl ${sessionRounds === 10 ? "text-cyan-400" : "text-slate-500"}`}>
                    {sessionRounds === 10 ? "☑" : "☐"}
                  </span>
                  <div className="text-left">
                    <div className="text-base font-bold text-white leading-tight">3 Min x 10 Rounds</div>
                    <div className="text-xs text-cyan-300 font-medium">3 นาที x 10 รอบ (30 นาที)</div>
                  </div>
                </DwellButton>
              </div>
            </div>
            )}
            {isProMode && selectedGame === "FitQuest" && (
              <div className="w-full max-w-2xl bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 mb-8 text-center">
                <span className="text-sm text-slate-400">🏋️ FitQuest Pro: นับ reps ตลอด session — Polar HR จะปรับความเข้มให้อัตโนมัติ</span>
              </div>
            )}


            {/* Intensity Selection Buttons */}
            <div className="flex gap-6 w-full justify-center">
              <DwellButton onClick={() => selectDifficultyAndScan("Easy")} className="w-72 h-44 bg-slate-800 border-2 border-green-600/50 hover:border-green-400 flex flex-col justify-center items-center" activeColor="bg-green-500">
                <h3 className="text-3xl font-bold text-green-400 text-center leading-tight">START EASY<br /><span className="text-lg text-slate-300 font-normal">Level 1 (ระดับเริ่มต้น)</span></h3>
              </DwellButton>
              <DwellButton onClick={() => selectDifficultyAndScan("Medium")} className="w-72 h-44 bg-slate-800 border-2 border-yellow-600/50 hover:border-yellow-400 flex flex-col justify-center items-center" activeColor="bg-yellow-500">
                <h3 className="text-3xl font-bold text-yellow-400 text-center leading-tight">START MEDIUM<br /><span className="text-lg text-slate-300 font-normal">Level 2 (ระดับปานกลาง)</span></h3>
              </DwellButton>
              <DwellButton onClick={() => selectDifficultyAndScan("Hard")} className="w-72 h-44 bg-slate-800 border-2 border-red-600/50 hover:border-red-400 flex flex-col justify-center items-center" activeColor="bg-red-500">
                <h3 className="text-3xl font-bold text-red-400 text-center leading-tight">START HARD<br /><span className="text-lg text-slate-300 font-normal">Level 3 (ระดับท้าทาย)</span></h3>
              </DwellButton>
            </div>
          </div>
        )}

        {/* PRE-GAME RHR SCANNER */}
        {step === "PRE_GAME_RHR" && (
          <div className="w-full animate-fade-in flex flex-col items-center">
            <h2 className="text-3xl mb-6 text-yellow-400">PRE-GAME VITALS CHECK</h2>
            <p className="text-slate-400 mb-8 max-w-lg text-center">
              Capturing baseline Heart Rate before beginning <span className="text-cyan-400">{selectedGame}</span> ({selectedDiff}). Sit still and face the camera.
            </p>
            <HeartRateScanner onComplete={launchGameRoute} />

            <button onClick={() => launchGameRoute(75)} className="mt-8 text-slate-500 underline text-sm">
              Skip & Use Mock HR (Test Mode)
            </button>
            <button onClick={goBack} className="mt-4 text-slate-500 hover:text-white font-bold text-lg">
              Cancel Setup
            </button>
          </div>
        )}
      </main>
    </>
  );
}