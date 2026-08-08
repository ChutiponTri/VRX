"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea,
  BarChart, Bar, Cell
} from "recharts";

type SessionType = "training" | "normal";
type FilterType = "all" | "training" | "normal";

export default function DataDashboard() {
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  
  // Track which session is selected and its type
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionType, setSelectedSessionType] = useState<SessionType | null>(null);
  
  // NEW: Filter State
  const [sessionFilter, setSessionFilter] = useState<FilterType>("all");

  // Queries
  const users = useQuery(api.users.getAllUsers);
  
  // 1. Fetch lightweight Training Summaries
  const sessionSummaries = useQuery(
    api.users.getTrainingSessionsSummary,
    selectedUserId ? { userId: selectedUserId } : "skip"
  );
  
  // 2. Fetch lightweight Normal Arcade Scores
  const normalSessions = useQuery(
    api.users.getNormalSessions,
    selectedUserId ? { userId: selectedUserId } : "skip"
  );

  // 3. Fetch Heavy Training Data ONLY if a training session is actively clicked
  const activeTrainingSession = useQuery(
    api.users.getSessionFullDetails,
    (selectedSessionId && selectedSessionType === "training") 
      ? { sessionId: selectedSessionId as Id<"training_sessions"> } 
      : "skip"
  );

  // The active Normal Session doesn't need a heavy query, it's already in the lightweight array
  const activeNormalSession = useMemo(() => {
    if (selectedSessionType === "normal" && normalSessions) {
      return normalSessions.find(s => s._id === selectedSessionId);
    }
    return null;
  }, [selectedSessionId, selectedSessionType, normalSessions]);

  // Merge and sort all sessions by Date
  const allSessions = useMemo(() => {
    if (!sessionSummaries || !normalSessions) return [];
    
    const training = sessionSummaries.map(s => ({ ...s, type: "training" as SessionType }));
    const normal = normalSessions.map(s => ({ ...s, type: "normal" as SessionType }));
    
    // Sort descending by time
    return [...training, ...normal].sort((a, b) => b.playedAt - a.playedAt);
  }, [sessionSummaries, normalSessions]);

  // Apply the selected filter
  const displayedSessions = useMemo(() => {
    if (sessionFilter === "all") return allSessions;
    return allSessions.filter(s => s.type === sessionFilter);
  }, [allSessions, sessionFilter]);

  // Transform Training Timeline for Recharts
  const trainingChartData = useMemo(() => {
    if (!activeTrainingSession?.hrTimeline) return [];
    return activeTrainingSession.hrTimeline.map((hr, index) => ({
      time: `${(index * 5)}s`,
      heartRate: hr,
      targetMin: activeTrainingSession.hrTargetMin,
      targetMax: activeTrainingSession.hrTargetMax,
    }));
  }, [activeTrainingSession]);

  // Transform Normal Data for Bar Chart
  const normalChartData = useMemo(() => {
    if (!activeNormalSession) return [];
    return [
      { name: "Pre-Game HR", heartRate: activeNormalSession.preGameHR, fill: "#3b82f6" },
      { name: "Post-Game HR", heartRate: activeNormalSession.postGameHR, fill: "#f43f5e" }
    ];
  }, [activeNormalSession]);

  // Dynamic CSV Export
  const exportToCSV = () => {
    if (selectedSessionType === "training" && activeTrainingSession && trainingChartData.length > 0) {
      let csvContent = "Time (seconds),Heart Rate (BPM),Target Min,Target Max\n";
      trainingChartData.forEach(row => {
        const timeInSeconds = parseInt(row.time.replace('s', ''));
        csvContent += `${timeInSeconds},${row.heartRate},${row.targetMin},${row.targetMax}\n`;
      });
      triggerDownload(csvContent, `TrainingData_${selectedUsername}_${activeTrainingSession.gameName}`);
    } 
    else if (selectedSessionType === "normal" && activeNormalSession) {
      let csvContent = "Game Name,Mode,Score,Pre-Game HR,Post-Game HR,Date\n";
      const dateString = new Date(activeNormalSession.playedAt).toLocaleString().replace(/,/g, '');
      csvContent += `${activeNormalSession.gameName},${activeNormalSession.mode},${activeNormalSession.score},${activeNormalSession.preGameHR},${activeNormalSession.postGameHR},${dateString}\n`;
      triggerDownload(csvContent, `ArcadeData_${selectedUsername}_${activeNormalSession.gameName}`);
    }
  };

  const triggerDownload = (csvContent: string, fileNamePrefix: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const date = new Date().toLocaleDateString().replace(/\//g, '-');
    link.setAttribute("download", `${fileNamePrefix}_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        
        {/* Header - Mobile Responsive */}
        <header className="flex flex-col md:flex-row md:justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-cyan-400 tracking-widest">CLINICAL DATA</h1>
            <p className="text-slate-500 uppercase tracking-wider text-xs md:text-sm mt-1">Training & Arcade Session Analytics</p>
          </div>
          
          <select 
            className="w-full md:w-auto bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-hidden focus:border-cyan-500 transition-colors"
            onChange={(e) => {
              const [userId, username] = JSON.parse(e.target.value);
              setSelectedUserId(userId as Id<"users">);
              setSelectedSessionId(null);
              setSelectedSessionType(null);
              setSelectedUsername(username);
            }}
            defaultValue=""
          >
            <option value="" disabled>Select User Profile...</option>
            {users?.map(user => (
              <option key={user._id} value={JSON.stringify([user._id, user.name])}>
                {user.name} ({user.profile})
              </option>
            ))}
          </select>
        </header>

        {selectedUserId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
            
            {/* Left Column: Unified Session History */}
            <div className="lg:col-span-1 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col h-112.5 lg:h-175">
              
              <div className="mb-4">
                <h2 className="text-xl font-bold text-white uppercase mb-3">Session History</h2>
                
                {/* NEW: Filter Toggle Segmented Control */}
                <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 shadow-inner">
                  <button 
                    onClick={() => setSessionFilter("all")}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${sessionFilter === "all" ? "bg-slate-700 text-white shadow-xs" : "text-slate-500 hover:text-slate-300"}`}
                  >
                    All
                  </button>
                  <button 
                    onClick={() => setSessionFilter("training")}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${sessionFilter === "training" ? "bg-cyan-900/40 text-cyan-400 shadow-xs" : "text-slate-500 hover:text-cyan-400/50"}`}
                  >
                    Pro
                  </button>
                  <button 
                    onClick={() => setSessionFilter("normal")}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${sessionFilter === "normal" ? "bg-purple-900/40 text-purple-400 shadow-xs" : "text-slate-500 hover:text-purple-400/50"}`}
                  >
                    Arcade
                  </button>
                </div>
              </div>
              
              {/* Scrollable List Area */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {!sessionSummaries || !normalSessions ? (
                  <div className="animate-pulse space-y-4"><div className="h-20 bg-slate-800 rounded-xl"></div><div className="h-20 bg-slate-800 rounded-xl"></div></div>
                ) : displayedSessions.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center mt-4">No data found for this filter.</p>
                ) : (
                  displayedSessions.map((session: any) => (
                    <button
                      key={session._id}
                      onClick={() => {
                        setSelectedSessionId(session._id);
                        setSelectedSessionType(session.type);
                      }}
                      className={`w-full text-left p-3 md:p-4 rounded-xl border transition-all ${
                        selectedSessionId === session._id 
                        ? (session.type === "training" ? "bg-cyan-900/20 border-cyan-500" : "bg-purple-900/20 border-purple-500") 
                        : "bg-slate-900 border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-bold text-white block line-clamp-1 text-sm md:text-base">{session.gameName}</span>
                          <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest ${session.type === "training" ? "text-cyan-500" : "text-purple-500"}`}>
                            {session.type === "training" ? "PRO TRAINING" : "ARCADE MODE"}
                          </span>
                        </div>
                        <span className="text-[10px] md:text-xs text-slate-500 shrink-0 ml-2">
                          {new Date(session.playedAt).toLocaleDateString()}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs md:text-sm mt-3">
                        <div>
                          <span className="text-slate-500 block text-[9px] md:text-[10px] uppercase">Score</span>
                          <span className="text-emerald-400 font-mono">{session.score || session.totalScore}</span>
                        </div>
                        {session.type === "training" ? (
                          <div>
                            <span className="text-slate-500 block text-[9px] md:text-[10px] uppercase">Avg HR</span>
                            <span className="text-white font-mono">{session.hrAverage} <span className="text-[9px]">BPM</span></span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-500 block text-[9px] md:text-[10px] uppercase">Post-Game HR</span>
                            <span className="text-rose-400 font-mono">{session.postGameHR} <span className="text-[9px]">BPM</span></span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right Column: Visualization & Export */}
            <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl p-4 md:p-6 flex flex-col min-h-125 lg:h-175">
              
              {!selectedSessionId ? (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-center text-sm md:text-base">
                  Select a session from the history panel to view analytics.
                </div>
              ) : selectedSessionType === "training" && !activeTrainingSession ? (
                <div className="flex-1 flex items-center justify-center text-cyan-500 animate-pulse text-sm md:text-base">
                  Loading telemetry...
                </div>
              ) : selectedSessionType === "training" && activeTrainingSession ? (
                
                /* --- TRAINING VISUALIZATION (Line Chart) --- */
                <>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6 md:mb-8">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-white line-clamp-1">{activeTrainingSession.gameName} Analysis</h2>
                      <p className="text-slate-400 text-xs md:text-sm">Pro Training Mode • 10 Rounds ({activeTrainingSession.difficulty})</p>
                    </div>
                    <button onClick={exportToCSV} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-xs md:text-sm font-bold text-white transition-colors">
                      <span>📥</span> EXPORT DATA
                    </button>
                  </div>
                  
                  <div className="flex-1 w-full min-h-75 bg-slate-950 rounded-xl border border-slate-800 p-2 md:p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trainingChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <YAxis domain={['dataMin - 10', 'dataMax + 10']} stroke="#64748b" tick={{ fill: '#64748b', fontSize: 10 }} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: '12px' }} />
                        <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }}/>
                        
                        <ReferenceArea y1={activeTrainingSession.hrTargetMin} y2={activeTrainingSession.hrTargetMax} fill="#06b6d4" fillOpacity={0.15} strokeOpacity={0}/>
                        <Line type="monotone" name="Target Min" dataKey="targetMin" stroke="#0891b2" strokeDasharray="5 5" dot={false} strokeWidth={2}/>
                        <Line type="monotone" name="Target Max" dataKey="targetMax" stroke="#0891b2" strokeDasharray="5 5" dot={false} strokeWidth={2}/>
                        <Line type="monotone" name="Live HR" dataKey="heartRate" stroke="#f43f5e" strokeWidth={3} dot={{ r: 1.5, fill: '#f43f5e', strokeWidth: 0 }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>

              ) : selectedSessionType === "normal" && activeNormalSession ? (
                
                /* --- NORMAL ARCADE VISUALIZATION (Bar Chart) --- */
                <>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6 md:mb-8">
                    <div>
                      <h2 className="text-xl md:text-2xl font-bold text-white line-clamp-1">{activeNormalSession.gameName} Analysis</h2>
                      <p className="text-slate-400 text-xs md:text-sm">Arcade Mode • Difficulty: {activeNormalSession.mode}</p>
                    </div>
                    <button onClick={exportToCSV} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-xs md:text-sm font-bold text-white transition-colors">
                      <span>📥</span> EXPORT DATA
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 md:gap-4 mb-6">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 md:p-4 text-center">
                      <p className="text-slate-500 text-[9px] md:text-xs font-bold uppercase tracking-widest mb-1">Final Score</p>
                      <p className="text-lg md:text-3xl font-mono text-emerald-400">{activeNormalSession.score}</p>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 md:p-4 text-center">
                      <p className="text-slate-500 text-[9px] md:text-xs font-bold uppercase tracking-widest mb-1">Resting HR</p>
                      <p className="text-lg md:text-3xl font-mono text-blue-400">{activeNormalSession.preGameHR}</p>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 md:p-4 text-center">
                      <p className="text-slate-500 text-[9px] md:text-xs font-bold uppercase tracking-widest mb-1">Exertion HR</p>
                      <p className="text-lg md:text-3xl font-mono text-rose-400">{activeNormalSession.postGameHR}</p>
                    </div>
                  </div>

                  <div className="flex-1 w-full min-h-75 bg-slate-950 rounded-xl border border-slate-800 p-2 md:p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={normalChartData} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#cbd5e1', fontWeight: 'bold', fontSize: 11 }} />
                        <YAxis stroke="#64748b" domain={[0, 'dataMax + 20']} tick={{ fontSize: 11 }} />
                        <Tooltip cursor={{ fill: '#1e293b' }} contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: '12px' }}/>
                        <Bar dataKey="heartRate" radius={[8, 8, 0, 0]} maxBarSize={150}>
                          {normalChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>

              ) : null}
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}