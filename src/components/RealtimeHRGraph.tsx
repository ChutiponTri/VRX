import { useRef, useState } from "react";

// --- NEW COMPONENT: Draggable Realtime HR Graph ---
export default function RealtimeHRGraph({ data, targetMin, targetMax }: { data: number[], targetMin: number, targetMax: number }) {
  const [viewMode, setViewMode] = useState<"window" | "full">("window");
  
  // Dragging State
  const [offset, setOffset] = useState({ x: 24, y: -24 }); // ตำแหน่งเริ่มต้นจากมุมซ้ายล่าง
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const displayData = viewMode === "window" ? data.slice(-60) : data;

  const yMax = Math.max(180, targetMax + 20, ...displayData);
  const yMin = Math.min(60, targetMin - 20, ...displayData);
  const yRange = yMax - yMin || 1;

  const getY = (val: number) => 100 - ((val - yMin) / yRange) * 100;
  const getX = (idx: number) => (idx / Math.max(1, displayData.length - 1)) * 100;

  const targetMinY = getY(targetMin);
  const targetMaxY = getY(targetMax);

  return (
    <div 
      className="absolute bottom-0 left-0 w-[400px] h-[160px] bg-slate-900/85 backdrop-blur-md border border-cyan-500/40 rounded-xl p-3 flex flex-col shadow-[0_0_20px_rgba(34,211,238,0.15)] z-40 pointer-events-auto select-none"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
    >
      {/* Draggable Header */}
      <div 
        className="flex justify-between items-center mb-2 cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <span className="text-xs text-slate-300 font-bold uppercase tracking-widest">HR Timeline</span>
          <span className="text-[9px] text-slate-500">(Drag)</span>
        </div>
        
        {/* View Mode Switches (ป้องกันการลากไปโดนปุ่ม) */}
        <div className="flex gap-1" onPointerDown={e => e.stopPropagation()}>
          <button
            onClick={() => setViewMode("window")}
            className={`text-[9px] px-2 py-1 rounded font-bold uppercase transition-colors ${viewMode === 'window' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-700'}`}
          >
            Last 60s
          </button>
          <button
            onClick={() => setViewMode("full")}
            className={`text-[9px] px-2 py-1 rounded font-bold uppercase transition-colors ${viewMode === 'full' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-700'}`}
          >
            Full
          </button>
        </div>
      </div>

      {/* Graph Area */}
      <div className="relative flex-1 w-full mt-2 pointer-events-none">
        {data.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-xs font-bold uppercase tracking-widest">
            Waiting for Data...
          </div>
        ) : (
          <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
            {/* Target Max Bound */}
            <line x1="0" y1={`${targetMaxY}%`} x2="100%" y2={`${targetMaxY}%`} stroke="#10b981" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
            <text x="0" y={`${targetMaxY}%`} dy="-4" fill="#10b981" fontSize="9" fontWeight="bold" opacity="0.8">{Math.round(targetMax)}</text>

            {/* Target Min Bound */}
            <line x1="0" y1={`${targetMinY}%`} x2="100%" y2={`${targetMinY}%`} stroke="#10b981" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
            <text x="0" y={`${targetMinY}%`} dy="11" fill="#10b981" fontSize="9" fontWeight="bold" opacity="0.8">{Math.round(targetMin)}</text>

            {/* Path Segments */}
            {displayData.map((hr, i) => {
              if (i === 0) return null;
              const prevHr = displayData[i - 1];
              
              // คำนวณสีตามโซนเป้าหมาย
              let strokeColor = "#10b981"; // สีเขียว (ในโซน)
              if (hr < targetMin) strokeColor = "#facc15"; // สีเหลือง (ต่ำกว่าเป้า)
              if (hr > targetMax) strokeColor = "#ef4444"; // สีแดง (สูงกว่าเป้า)

              return (
                <line
                  key={i}
                  x1={`${getX(i - 1)}%`}
                  y1={`${getY(prevHr)}%`}
                  x2={`${getX(i)}%`}
                  y2={`${getY(hr)}%`}
                  stroke={strokeColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}