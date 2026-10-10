"use client";

import React, { useEffect, useRef } from "react";
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { poseState } from "../poseStore";

interface EngineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onReady?: () => void; // <-- เพิ่มตรงนี้ค่ะ
}

export default function RichOrMessPoseEngine({ videoRef, canvasRef, onReady }: EngineProps) {
  const initialized = useRef(false);
  const hasTriggeredReady = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let poseLandmarker: PoseLandmarker;
    let rafId: number;
    let drawingUtils: DrawingUtils | null = null;

    const setupAI = async () => {
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => processWebcam();
        }
      }
    };

    const processWebcam = () => {
      if (!videoRef.current || !canvasRef.current || !poseLandmarker) return;
      if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
        rafId = requestAnimationFrame(processWebcam);
        return;
      }

      if (canvasRef.current.width !== videoRef.current.videoWidth) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        drawingUtils = new DrawingUtils(canvasRef.current.getContext("2d")!);
      }

      const results = poseLandmarker.detectForVideo(videoRef.current, performance.now());
      const ctx = canvasRef.current.getContext("2d");

      if (!hasTriggeredReady.current && onReady) {
        hasTriggeredReady.current = true;
        onReady();
      }

      if (ctx && drawingUtils) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (results.landmarks && results.landmarks.length > 0) {
          const lm = results.landmarks[0];
          const w = window.innerWidth;
          const h = window.innerHeight;

          // Extract Wrists for the Basket
          poseState.leftWrist = { x: (1 - lm[15].x) * w, y: lm[15].y * h };
          poseState.rightWrist = { x: (1 - lm[16].x) * w, y: lm[16].y * h };

          // Track nose for squat detection (nose drops when squatting)
          poseState.nose = { x: (1 - lm[0].x) * w, y: lm[0].y * h };

          // Visual Feedback: Draw a glowing string between wrists (The Basket Handle)
          if (lm[15].visibility > 0.5 && lm[16].visibility > 0.5) {
            ctx.beginPath();
            ctx.moveTo(poseState.leftWrist.x, poseState.leftWrist.y);
            ctx.lineTo(poseState.rightWrist.x, poseState.rightWrist.y);
            ctx.strokeStyle = "rgba(234, 179, 8, 0.6)"; // Yellow glow
            ctx.lineWidth = 6;
            ctx.shadowBlur = 15;
            ctx.shadowColor = "rgba(234, 179, 8, 1)";
            ctx.stroke();
            ctx.shadowBlur = 0;
          }

          poseState.isActive = true;
        }
      }
      rafId = requestAnimationFrame(processWebcam);
    };

    setupAI();

    return () => {
      cancelAnimationFrame(rafId);
      if (poseLandmarker) poseLandmarker.close();
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [canvasRef, videoRef, onReady]);

  return null;
}