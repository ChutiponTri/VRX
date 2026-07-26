"use client";

import React, { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { calculateBPM } from "../lib/rPPG";

interface HeartRateScannerProps {
  onComplete: (bpm: number) => void;
}

const BUFFER_SIZE = 256; // Power of 2 for FFT

export default function HeartRateScanner({ onComplete }: HeartRateScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const extractRef = useRef<HTMLCanvasElement>(null); // Tiny canvas for pixel extraction

  const [progress, setProgress] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [status, setStatus] = useState("Loading AI Model...");

  const initialized = useRef(false);

  // Data Buffers
  const rBuffer = useRef<number[]>([]);
  const gBuffer = useRef<number[]>([]);
  const bBuffer = useRef<number[]>([]);
  const timeBuffer = useRef<number[]>([]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let faceLandmarker: FaceLandmarker;
    let rafId: number;

    const setupMediaPipe = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => {
              setStatus("Sit still and face the camera...");
              processFrame();
            };
          }
        } catch (err) {
          setStatus("Camera access denied.");
        }
      }
    };

    const processFrame = () => {
      if (!videoRef.current || !overlayRef.current || !extractRef.current || !faceLandmarker) return;

      const video = videoRef.current;
      if (video.readyState < 2 || video.videoWidth === 0) {
        rafId = requestAnimationFrame(processFrame);
        return;
      }

      // Sync overlay canvas
      if (overlayRef.current.width !== video.videoWidth) {
        overlayRef.current.width = video.videoWidth;
        overlayRef.current.height = video.videoHeight;
      }

      const startTimeMs = performance.now();
      const results = faceLandmarker.detectForVideo(video, startTimeMs);
      const ctx = overlayRef.current.getContext("2d");

      if (ctx) {
        ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);

        if (results.faceLandmarks && results.faceLandmarks.length > 0) {
          const landmarks = results.faceLandmarks[0];
          
          // Landmark 10 is top of forehead, 151 is between eyes
          const foreheadTop = landmarks[10];
          const foreheadBottom = landmarks[151];
          const foreheadLeft = landmarks[67];
          const foreheadRight = landmarks[297];

          // Calculate bounding box in pixels
          const x = foreheadLeft.x * video.videoWidth;
          const y = foreheadTop.y * video.videoHeight;
          const w = (foreheadRight.x - foreheadLeft.x) * video.videoWidth;
          const h = (foreheadBottom.y - foreheadTop.y) * video.videoHeight;

          // Draw targeting box
          ctx.strokeStyle = "#00FF00";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);

          // Extract ROI pixels using a tiny off-screen canvas for speed
          const extCtx = extractRef.current.getContext("2d");
          if (extCtx && w > 0 && h > 0) {
            // Draw only the forehead portion of the video to a 50x50 canvas
            extCtx.drawImage(video, x, y, w, h, 0, 0, 50, 50);
            const imgData = extCtx.getImageData(0, 0, 50, 50).data;
            
            let rSum = 0, gSum = 0, bSum = 0;
            for (let i = 0; i < imgData.length; i += 4) {
              rSum += imgData[i];
              gSum += imgData[i + 1];
              bSum += imgData[i + 2];
            }
            
            const pixelCount = 50 * 50;
            rBuffer.current.push(rSum / pixelCount);
            gBuffer.current.push(gSum / pixelCount);
            bBuffer.current.push(bSum / pixelCount);
            timeBuffer.current.push(performance.now());

            const currentLength = rBuffer.current.length;
            setProgress(Math.min((currentLength / BUFFER_SIZE) * 100, 100));

            // Buffer Full -> Calculate BPM
            if (currentLength === BUFFER_SIZE) {
              const durationSeconds = (timeBuffer.current[BUFFER_SIZE - 1] - timeBuffer.current[0]) / 1000;
              const fps = BUFFER_SIZE / durationSeconds;
              
              const calculatedBpm = calculateBPM(rBuffer.current, gBuffer.current, bBuffer.current, fps);
              setBpm(calculatedBpm);
              setStatus("Measurement Complete");
              
              setTimeout(() => {
                onComplete(calculatedBpm);
              }, 3000);
              
              return; // Stop the loop
            }
          }
        } else {
          setStatus("Face not detected. Look at the camera.");
        }
      }

      rafId = requestAnimationFrame(processFrame);
    };

    setupMediaPipe();

    return () => {
      cancelAnimationFrame(rafId);
      if (faceLandmarker) faceLandmarker.close();
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [onComplete]);

  return (
    <div className="flex flex-col items-center bg-slate-900 border-2 border-slate-700 p-6 rounded-2xl max-w-xl w-full mx-auto">
      <h3 className="text-2xl font-bold text-cyan-400 mb-2">Resting Heart Rate Monitor</h3>
      <p className="text-slate-400 mb-6">{status}</p>

      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-6">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" autoPlay playsInline muted />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full object-cover scale-x-[-1]" />
        
        {/* Hidden extraction canvas */}
        <canvas ref={extractRef} width="50" height="50" className="hidden" />
      </div>

      {bpm === null ? (
        <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-cyan-500 transition-all duration-100 ease-linear" style={{ width: `${progress}%` }} />
        </div>
      ) : (
        <div className="text-center animate-fade-in">
          <span className="text-6xl font-extrabold text-green-400">{bpm}</span>
          <span className="text-2xl text-green-500 ml-2">BPM</span>
        </div>
      )}
    </div>
  );
}