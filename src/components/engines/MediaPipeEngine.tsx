"use client";

import React, { useEffect, useRef, useState } from "react";
import { HandLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { cursorState } from "../cursorStore";

const CONNECTOR_STYLE = { color: "#00FF00", lineWidth: 3 };
const LANDMARK_STYLE = { color: "#FF0000", lineWidth: 2 };

export default function MediaPipeEngine() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const initialized = useRef(false); 

  // --- Draggable Panel State ---
  // Fallback position is y:120 (safely below the back button)
  const [position, setPosition] = useState({ x: 20, y: 120 }); 
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Move camera to Top-Right corner dynamically on client load
  useEffect(() => {
    if (typeof window !== "undefined") {
      // 240px (panel width) + 40px (padding) = 280px from the right edge
      setPosition({ x: window.innerWidth - 280, y: 32 });
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let handLandmarker: HandLandmarker;
    let animationFrameId: number;
    let drawingUtils: DrawingUtils | null = null; 

    const initializeMediaPipe = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480, facingMode: "user" } 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => {
              setIsLoaded(true);
              predictWebcam();
            };
          }
        } catch (err) {
          console.error("Webcam error:", err);
        }
      }
    };

    const predictWebcam = () => {
      if (!videoRef.current || !canvasRef.current || !handLandmarker) return;

      if (canvasRef.current.width !== videoRef.current.videoWidth) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) drawingUtils = new DrawingUtils(ctx);
      }
      
      const startTimeMs = performance.now();
      const results = handLandmarker.detectForVideo(videoRef.current, startTimeMs);
      const canvasCtx = canvasRef.current.getContext("2d");

      if (canvasCtx && drawingUtils) {
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (results.landmarks && results.landmarks.length > 0) {
          drawingUtils.drawConnectors(results.landmarks[0], HandLandmarker.HAND_CONNECTIONS, CONNECTOR_STYLE);
          drawingUtils.drawLandmarks(results.landmarks[0], LANDMARK_STYLE);

          const indexFinger = results.landmarks[0][8];
          cursorState.x = (1 - indexFinger.x) * window.innerWidth;
          cursorState.y = indexFinger.y * window.innerHeight;
          cursorState.isActive = true;
        }
      }

      animationFrameId = requestAnimationFrame(predictWebcam);
    };

    initializeMediaPipe();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (handLandmarker) handLandmarker.close();
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // --- Drag & Drop Handlers ---
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    let newX = e.clientX - dragOffset.current.x;
    let newY = e.clientY - dragOffset.current.y;

    const panelWidth = 240; 
    const panelHeight = 160;
    newX = Math.max(0, Math.min(newX, window.innerWidth - panelWidth));
    newY = Math.max(0, Math.min(newY, window.innerHeight - panelHeight));

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <>
      {!isLoaded && (
        <div className="fixed top-4 right-4 bg-slate-800 text-cyan-400 px-4 py-2 rounded-lg border border-cyan-400/50 z-50 animate-pulse">
          Initializing Camera & AI...
        </div>
      )}

      <div
        className="fixed z-40 flex flex-col bg-slate-900 border-2 border-slate-700 rounded-xl overflow-hidden shadow-2xl transition-shadow"
        style={{ 
          transform: `translate(${position.x}px, ${position.y}px)`,
          width: '240px',
          boxShadow: isDragging ? '0 0 20px rgba(34,211,238,0.4)' : '0 10px 15px -3px rgba(0,0,0,0.5)',
          touchAction: 'none' 
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="w-full bg-slate-800 h-6 flex items-center justify-center cursor-move">
          <div className="w-8 h-1 bg-slate-600 rounded-full" />
        </div>
        
        <div className="relative w-full aspect-video bg-black">
          <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" 
            autoPlay 
            playsInline 
            muted 
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1] pointer-events-none"
          />
        </div>
      </div>
    </>
  );
}