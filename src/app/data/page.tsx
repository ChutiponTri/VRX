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

// --- Sub-component สำหรับแสดงตัวเลขสถิติใต้กราฟ ---
const StatCard = ({ label, value, unit, colorClass = "text-white" }: { label: string, value: string | number, unit?: string, colorClass?: string }) => (
  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 md:p-4 flex flex-col items-center justify-center text-center shadow-inner hover:border-slate-700 transition-colors">
    <span className="text-slate-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mb-1">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className={`text-xl md:text-3xl font-mono font-black ${colorClass}`}>{value}</span>
      {unit && <span className="text-slate-600 text-[10px] md:text-xs font-bold">{unit}</span>}
    </div>
  </div>
);

// --- Custom Dot สำหรับกราฟแยกสีตาม Target ---
const ColoredDot = (props: any) => {
  const { cx, cy, payload } = props;
  const { heartRate, targetMin, targetMax } = payload;
  
  // Logic แยกสี
  let fill = "#22c55e"; // Green (In Zone)
  if (heartRate < targetMin) fill = "#eab308"; // Yellow (Below Min)
  else if (heartRate > targetMax) fill = "#ef4444"; // Red (Above Max)

  return (
    <circle cx={cx} cy={cy} r={4} fill={fill} stroke="#0f172a" strokeWidth={1.5} className="transition-all duration-300 hover:r-6" />
  );
};

export default function DataDashboard() {
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionType, setSelectedSessionType] = useState<SessionType | null>(null);
  
  const [sessionFilter, setSessionFilter] = useState<FilterType>("all");

  const users = useQuery(api.users.getAllUsers);
  
  const sessionSummaries = useQuery(
    api.users.getTrainingSessionsSummary,
    selectedUserId ? { userId: selectedUserId } : "skip"
  );
  
  const normalSessions = useQuery(
    api.users.getNormalSessions,
    selectedUserId ? { userId: selectedUserId } : "skip"
  );

  const activeTrainingSession = useQuery(
    api.users.getSessionFullDetails,
    (selectedSessionId && selectedSessionType === "training") 
      ? { sessionId: selectedSessionId as Id<"training_sessions"> } 
      : "skip"
  );

  const activeNormalSession = useMemo(() => {
    if (selectedSessionType === "normal" && normalSessions) {
      return normalSessions.find(s => s._id === selectedSessionId);
    }
    return null;
  }, [selectedSessionId, selectedSessionType, normalSessions]);

  const allSessions = useMemo(() => {
    if (!sessionSummaries || !normalSessions) return [];
    const training = sessionSummaries.map(s => ({ ...s, type: "training" as SessionType }));
    const normal = normalSessions.map(s => ({ ...s, type: "normal" as SessionType }));
    return [...training, ...normal].sort((a, b) => b.playedAt - a.playedAt);
  }, [sessionSummaries, normalSessions]);

  const displayedSessions = useMemo(() => {
    if (sessionFilter === "all") return allSessions;
    return allSessions.filter(s => s.type === sessionFilter);
  }, [allSessions, sessionFilter]);

  const trainingChartData = useMemo(() => {
    if (!activeTrainingSession?.hrTimeline) return [];
    return activeTrainingSession.hrTimeline.map((hr, index) => ({
      time: `${(index * 5)}s`,
      heartRate: hr,
      targetMin: activeTrainingSession.hrTargetMin,
      targetMax: activeTrainingSession.hrTargetMax,
    }));
  }, [activeTrainingSession]);

  // คำนวณสถิติเพิ่มเติม (Min, Max, Mean, % In Zone)
  const trainingStats = useMemo(() => {
    if (!activeTrainingSession?.hrTimeline || activeTrainingSession.hrTimeline.length === 0) return null;
    const hr = activeTrainingSession.hrTimeline;
    
    const min = Math.min(...hr);
    const max = Math.max(...hr);
    const mean = Math.round(hr.reduce((a, b) => a + b, 0) / hr.length);
    const targetMin = activeTrainingSession.hrTargetMin;
    const targetMax = activeTrainingSession.hrTargetMax;
    
    // หาเปอร์เซ็นต์ที่อยู่ในโซนเป้าหมาย
    const inZoneCount = hr.filter(v => v >= targetMin && v <= targetMax).length;
    const zonePercent = Math.round((inZoneCount / hr.length) * 100);

    return { min, max, mean, targetMin, targetMax, zonePercent };
  }, [activeTrainingSession]);

  const normalChartData = useMemo(() => {
    if (!activeNormalSession) return [];
    return [
      { name: "Pre-Game HR", heartRate: activeNormalSession.preGameHR, fill: "#3b82f6" },
      { name: "Post-Game HR", heartRate: activeNormalSession.postGameHR, fill: "#f43f5e" }
    ];
  }, [activeNormalSession]);

  const exportToCSV = () => {
    if (selectedSessionType === "training" && activeTrainingSession && trainingChartData.length > 0) {
      let csvContent = "Time (seconds),Heart Rate (BPM),Target Min,Target Max\n";
      trainingChartData.forEach(row => {
        const timeInSeconds = parseInt(row.time.replace('s', ''));
        csvContent += `${timeInSeconds},${row.heartRate},${row.targetMin},${row.targetMax}\n`;
      });
      triggerDownload(csvContent, `ClinicalData_${selectedUsername}_${activeTrainingSession.gameName}`);
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
    <div className="min-h-screen bg-slate-950 text-slate-300 p-3 md:p-6 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header - Mobile Responsive */}
        <header className="flex flex-col md:flex-row md:justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-cyan-400 tracking-widest drop-shadow-md">CLINICAL DATA</h1>
            <p className="text-slate-500 uppercase tracking-wider text-xs md:text-sm mt-1">Advanced Telemetry Dashboard</p>
          </div>
          
          <div className="w-full md:w-72">
            <select 
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-hidden focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all shadow-md"
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
          </div>
        </header>

        {selectedUserId && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Column: Session History (Responsive: span 4 on Desktop) */}
            <div className="lg:col-span-4 xl:col-span-3 bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex flex-col h-[60vh] lg:h-[80vh] backdrop-blur-xs">
              
              <div className="mb-4">
                <h2 className="text-lg md:text-xl font-bold text-white uppercase mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
                  Session Log
                </h2>
                
                {/* Filter Toggle Segmented Control */}
                <div className="flex bg-slate-950 rounded-lg p-1 border border-slate-800 shadow-inner">
                  {["all", "training", "normal"].map((type) => (
                    <button 
                      key={type}
                      onClick={() => setSessionFilter(type as FilterType)}
                      className={`flex-1 py-1.5 text-xs font-bold uppercase rounded-md transition-all ${
                        sessionFilter === type 
                          ? type === "training" ? "bg-cyan-900/40 text-cyan-400 shadow-xs" 
                          : type === "normal" ? "bg-purple-900/40 text-purple-400 shadow-xs" 
                          : "bg-slate-700 text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {type === "training" ? "Pro" : type === "normal" ? "Arcade" : type}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Scrollable List Area */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {!sessionSummaries || !normalSessions ? (
                  <div className="animate-pulse space-y-4"><div className="h-24 bg-slate-800/50 rounded-xl"></div><div className="h-24 bg-slate-800/50 rounded-xl"></div></div>
                ) : displayedSessions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
                    <span className="text-2xl mb-2">📂</span>
                    <p>No records found</p>
                  </div>
                ) : (
                  displayedSessions.map((session: any) => (
                    <button
                      key={session._id}
                      onClick={() => {
                        setSelectedSessionId(session._id);
                        setSelectedSessionType(session.type);
                      }}
                      className={`w-full text-left p-3 md:p-4 rounded-xl border transition-all duration-200 ${
                        selectedSessionId === session._id 
                        ? (session.type === "training" ? "bg-cyan-950/40 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.15)]" : "bg-purple-950/40 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)]") 
                        : "bg-slate-900/50 border-slate-800 hover:border-slate-600 hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-bold text-slate-200 block line-clamp-1 text-sm">{session.gameName}</span>
                          <span className={`text-[9px] md:text-[10px] font-bold uppercase tracking-widest ${session.type === "training" ? "text-cyan-500" : "text-purple-400"}`}>
                            {session.type === "training" ? "PRO TRAINING" : "ARCADE MODE"}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0 ml-2 mt-0.5">
                          {new Date(session.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/50">
                          <span className="text-slate-500 block text-[9px] uppercase">Score</span>
                          <span className="text-emerald-400 font-mono text-xs md:text-sm font-bold">{session.score || session.totalScore}</span>
                        </div>
                        {session.type === "training" ? (
                          <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/50">
                            <span className="text-slate-500 block text-[9px] uppercase">Avg HR</span>
                            <span className="text-white font-mono text-xs md:text-sm font-bold">{session.hrAverage} <span className="text-[9px] text-slate-500">BPM</span></span>
                          </div>
                        ) : (
                          <div className="bg-slate-950/50 p-1.5 rounded-lg border border-slate-800/50">
                            <span className="text-slate-500 block text-[9px] uppercase">Peak Exertion</span>
                            <span className="text-rose-400 font-mono text-xs md:text-sm font-bold">{session.postGameHR} <span className="text-[9px] text-slate-500">BPM</span></span>
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right Column: Visualization & Export (Responsive: span 8 on Desktop) */}
            <div className="lg:col-span-8 xl:col-span-9 bg-slate-900/40 border border-slate-800 rounded-2xl p-4 md:p-6 flex flex-col min-h-[60vh] lg:h-[80vh] backdrop-blur-xs relative overflow-y-auto">
              
              {!selectedSessionId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm md:text-base">
                  <div className="w-16 h-16 border-4 border-dashed border-slate-700 rounded-full flex items-center justify-center mb-4">
                    <span className="text-2xl">📊</span>
                  </div>
                  <p>Select a session from the log to view telemetry</p>
                </div>
              ) : selectedSessionType === "training" && !activeTrainingSession ? (
                <div className="flex-1 flex flex-col items-center justify-center text-cyan-500 text-sm md:text-base animate-pulse">
                  <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  Loading Clinical Telemetry...
                </div>
              ) : selectedSessionType === "training" && activeTrainingSession && trainingStats ? (
                
                /* --- PRO TRAINING VISUALIZATION --- */
                <div className="flex flex-col h-full">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-4">
                    <div>
                      <h2 className="text-xl md:text-3xl font-black text-white tracking-wide">{activeTrainingSession.gameName}</h2>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="bg-cyan-950 text-cyan-400 border border-cyan-900 px-2 py-0.5 rounded text-[10px] md:text-xs font-bold uppercase tracking-wider">PRO MODE</span>
                        <span className="text-slate-400 text-[10px] md:text-xs">Level: {activeTrainingSession.difficulty} • 10 Rounds</span>
                      </div>
                    </div>
                    <button onClick={exportToCSV} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold text-white transition-all shadow-lg hover:shadow-xl active:scale-95">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      EXPORT CSV
                    </button>
                  </div>
                  
                  {/* Line Chart */}
                  <div className="flex-1 w-full min-h-[250px] md:min-h-[350px] bg-slate-950/80 rounded-2xl border border-slate-800 p-2 md:p-5 shadow-inner mb-4 relative">
                    <div className="absolute top-2 right-4 flex gap-3 text-[10px] md:text-xs font-bold text-slate-500 z-10 bg-slate-950/80 p-1.5 rounded-lg border border-slate-800">
                       <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500"></div>Below</div>
                       <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div>Target</div>
                       <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div>Above</div>
                    </div>

                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trainingChartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="time" stroke="#475569" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} dy={10} />
                        <YAxis domain={['dataMin - 15', 'dataMax + 15']} stroke="#475569" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', color: '#fff', fontSize: '12px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }} 
                          itemStyle={{ fontWeight: 'bold' }}
                        />
                        
                        {/* Highlight Target Zone Area */}
                        <ReferenceArea y1={activeTrainingSession.hrTargetMin} y2={activeTrainingSession.hrTargetMax} fill="#22c55e" fillOpacity={0.08} strokeOpacity={0}/>
                        
                        {/* Target Bounds Lines (Subtle) */}
                        <Line type="step" name="Target Min" dataKey="targetMin" stroke="#22c55e" strokeOpacity={0.4} strokeDasharray="3 3" dot={false} strokeWidth={1} activeDot={false}/>
                        <Line type="step" name="Target Max" dataKey="targetMax" stroke="#22c55e" strokeOpacity={0.4} strokeDasharray="3 3" dot={false} strokeWidth={1} activeDot={false}/>
                        
                        {/* Realtime HR Line with Dynamic Colored Dots */}
                        <Line type="monotone" name="Heart Rate" dataKey="heartRate" stroke="#334155" strokeWidth={2} dot={<ColoredDot />} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} animationDuration={1000}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Calculated Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-auto">
                    <StatCard label="Target Zone" value={`${Math.floor(trainingStats.targetMin)}-${Math.floor(trainingStats.targetMax)}`} unit="BPM" colorClass="text-cyan-400" />
                    <StatCard label="Mean HR" value={trainingStats.mean} unit="BPM" />
                    <StatCard label="Peak HR" value={trainingStats.max} unit="BPM" colorClass="text-rose-400" />
                    <StatCard label="Lowest HR" value={trainingStats.min} unit="BPM" colorClass="text-blue-400" />
                    <StatCard label="In-Zone %" value={trainingStats.zonePercent} unit="%" colorClass={trainingStats.zonePercent > 70 ? "text-emerald-400" : "text-yellow-400"} />
                  </div>
                </div>

              ) : selectedSessionType === "normal" && activeNormalSession ? (
                
                /* --- ARCADE VISUALIZATION --- */
                <div className="flex flex-col h-full">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-6">
                    <div>
                      <h2 className="text-xl md:text-3xl font-black text-white tracking-wide">{activeNormalSession.gameName}</h2>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="bg-purple-950 text-purple-400 border border-purple-900 px-2 py-0.5 rounded text-[10px] md:text-xs font-bold uppercase tracking-wider">ARCADE MODE</span>
                        <span className="text-slate-400 text-[10px] md:text-xs">Level: {activeNormalSession.mode}</span>
                      </div>
                    </div>
                    <button onClick={exportToCSV} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold text-white transition-all shadow-lg active:scale-95">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                      EXPORT CSV
                    </button>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-3 gap-3 md:gap-4 mb-4">
                    <StatCard label="Final Score" value={activeNormalSession.score} colorClass="text-emerald-400" />
                    <StatCard label="Resting HR" value={activeNormalSession.preGameHR} unit="BPM" colorClass="text-blue-400" />
                    <StatCard label="Exertion HR" value={activeNormalSession.postGameHR} unit="BPM" colorClass="text-rose-400" />
                  </div>

                  <div className="flex-1 w-full min-h-[250px] bg-slate-950/80 rounded-2xl border border-slate-800 p-2 md:p-5 shadow-inner">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={normalChartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontWeight: 'bold', fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
                        <YAxis stroke="#475569" domain={[0, 'dataMax + 30']} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{ fill: '#1e293b', opacity: 0.4 }} contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', color: '#fff', borderRadius: '8px' }}/>
                        <Bar dataKey="heartRate" radius={[6, 6, 0, 0]} maxBarSize={120} animationDuration={1000}>
                          {normalChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              ) : null}
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}