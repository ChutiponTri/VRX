"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea
} from "recharts";

export default function DataDashboard() {
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<Id<"training_sessions"> | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);

  // Queries
  const users = useQuery(api.users.getAllUsers);
  const sessionSummaries = useQuery(
    api.users.getTrainingSessionsSummary,
    selectedUserId ? { userId: selectedUserId } : "skip"
  );
  const activeSession = useQuery(
    api.users.getSessionFullDetails,
    selectedSessionId ? { sessionId: selectedSessionId } : "skip"
  );

  // Transform timeline array into objects for Recharts
  const chartData = React.useMemo(() => {
    if (!activeSession?.hrTimeline) return [];
    return activeSession.hrTimeline.map((hr, index) => ({
      time: `${(index * 5)}s`, // Data is logged every 5 seconds
      heartRate: hr,
      targetMin: activeSession.hrTargetMin,
      targetMax: activeSession.hrTargetMax,
    }));
  }, [activeSession]);

  // Vanilla JS CSV Export (Compatible with Excel)
  const exportToCSV = () => {
    if (!activeSession || chartData.length === 0) return;

    // Create CSV Header
    let csvContent = "Time (seconds),Heart Rate (BPM),Target Min,Target Max\n";
    
    // Add Rows
    chartData.forEach(row => {
      const timeInSeconds = parseInt(row.time.replace('s', ''));
      csvContent += `${timeInSeconds},${row.heartRate},${row.targetMin},${row.targetMax}\n`;
    });

    // Create a Blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const date = new Date(activeSession.playedAt).toLocaleDateString().replace(/\//g, '-');
    link.setAttribute("download", `TrainingData_${selectedUsername}_${activeSession.gameName}_${date}.csv`);
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex justify-between items-end border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-4xl font-black text-cyan-400 tracking-widest">CLINICAL DATA CENTER</h1>
            <p className="text-slate-500 uppercase tracking-wider text-sm mt-1">Training Session Analytics & Export</p>
          </div>
          
          {/* User Selector */}
          <select 
            className="bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-hidden focus:border-cyan-500 transition-colors"
            onChange={(e) => {
              const [userId, username] = JSON.parse(e.target.value);

              setSelectedUserId(userId as Id<"users">);
              setSelectedSessionId(null);
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Session History (Lightweight Query) */}
            <div className="lg:col-span-1 bg-slate-900/50 border border-slate-800 rounded-xl p-4 h-175 overflow-y-auto">
              <h2 className="text-xl font-bold text-white mb-4 uppercase">Session History</h2>
              
              {!sessionSummaries ? (
                <div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-4 py-1"><div className="h-20 bg-slate-800 rounded"></div></div></div>
              ) : sessionSummaries.length === 0 ? (
                <p className="text-slate-500">No training data found for this user.</p>
              ) : (
                <div className="space-y-3">
                  {sessionSummaries.map((session) => (
                    <button
                      key={session._id}
                      onClick={() => setSelectedSessionId(session._id)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedSessionId === session._id 
                        ? "bg-cyan-900/20 border-cyan-500" 
                        : "bg-slate-900 border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-white">{session.gameName}</span>
                        <span className="text-xs text-slate-500">{new Date(session.playedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Difficulty</span>
                          <span className={
                            session.difficulty.includes("Hard") ? "text-red-400" :
                            session.difficulty.includes("Medium") ? "text-yellow-400" : "text-green-400"
                          }>{session.difficulty}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Score</span>
                          <span className="text-emerald-400 font-mono">{session.totalScore}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Avg HR</span>
                          <span className="text-white font-mono">{session.hrAverage} BPM</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Peak HR</span>
                          <span className="text-rose-400 font-mono">{session.hrPeak} BPM</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Visualization & Export (Heavy Query) */}
            <div className="lg:col-span-2 bg-slate-900/50 border border-slate-800 rounded-xl p-6 flex flex-col h-175">
              
              {!selectedSessionId ? (
                <div className="flex-1 flex items-center justify-center text-slate-600">
                  Select a session from the history panel to view analytics.
                </div>
              ) : !activeSession ? (
                <div className="flex-1 flex items-center justify-center text-cyan-500 animate-pulse">
                  Loading telemetry...
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-white">{activeSession.gameName} Analysis</h2>
                      <p className="text-slate-400">Completed 10 Rounds ({activeSession.difficulty})</p>
                    </div>
                    
                    <button 
                      onClick={exportToCSV}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors"
                    >
                      <span>📥</span> EXPORT TO EXCEL
                    </button>
                  </div>

                  {/* Recharts HR Visualization */}
                  <div className="flex-1 w-full min-h-0 bg-slate-950 rounded-xl border border-slate-800 p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis 
                          dataKey="time" 
                          stroke="#64748b" 
                          tick={{ fill: '#64748b', fontSize: 12 }} 
                          tickMargin={10}
                        />
                        <YAxis 
                          domain={['dataMin - 10', 'dataMax + 10']}
                          stroke="#64748b" 
                          tick={{ fill: '#64748b', fontSize: 12 }}
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                          itemStyle={{ fontWeight: 'bold' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }}/>
                        
                        {/* Target HR Zone Highlighting */}
                        <ReferenceArea 
                          y1={activeSession.hrTargetMin} 
                          y2={activeSession.hrTargetMax} 
                          fill="#06b6d4" 
                          fillOpacity={0.15} 
                          strokeOpacity={0}
                        />

                        <Line 
                          type="monotone" 
                          name="Target Min"
                          dataKey="targetMin" 
                          stroke="#0891b2" 
                          strokeDasharray="5 5"
                          dot={false}
                          strokeWidth={2}
                        />
                        <Line 
                          type="monotone" 
                          name="Target Max"
                          dataKey="targetMax" 
                          stroke="#0891b2" 
                          strokeDasharray="5 5"
                          dot={false}
                          strokeWidth={2}
                        />
                        <Line 
                          type="monotone" 
                          name="Live Heart Rate (BPM)"
                          dataKey="heartRate" 
                          stroke="#f43f5e" 
                          strokeWidth={3}
                          dot={{ r: 2, fill: '#f43f5e', strokeWidth: 0 }}
                          activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}