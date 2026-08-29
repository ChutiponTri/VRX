"use client";

import React, { useEffect, useRef } from "react";
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { poseState } from "../poseStore";

interface EngineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onReady?: () => void; // <-- เพิ่มตรงนี้ค่ะ
}

export default function FitQuestPoseEngine({ videoRef, canvasRef, onReady }: EngineProps) {
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
          
          drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: "rgba(0, 229, 255, 0.6)", lineWidth: 4 });
          drawingUtils.drawLandmarks(lm, { color: "rgba(170, 255, 0, 0.8)", lineWidth: 2, radius: 4 });

          const w = window.innerWidth;
          const h = window.innerHeight;

          // Map all necessary joints
          poseState.leftShoulder = { x: (1 - lm[11].x) * w, y: lm[11].y * h };
          poseState.rightShoulder = { x: (1 - lm[12].x) * w, y: lm[12].y * h };
          poseState.leftWrist = { x: (1 - lm[15].x) * w, y: lm[15].y * h };
          poseState.rightWrist = { x: (1 - lm[16].x) * w, y: lm[16].y * h };
          poseState.leftHip = { x: (1 - lm[23].x) * w, y: lm[23].y * h };
          poseState.rightHip = { x: (1 - lm[24].x) * w, y: lm[24].y * h };
          poseState.leftKnee = { x: (1 - lm[25].x) * w, y: lm[25].y * h };
          poseState.rightKnee = { x: (1 - lm[26].x) * w, y: lm[26].y * h };
          poseState.leftAnkle = { x: (1 - lm[27].x) * w, y: lm[27].y * h };
          poseState.rightAnkle = { x: (1 - lm[28].x) * w, y: lm[28].y * h };
          poseState.nose = { x: (1 - lm[0].x) * w, y: lm[0].y * h };

          // Peace Sign Detection (Give Up) - Wrists raised above nose
          poseState.isPeaceSign = lm[15].y < lm[0].y - 0.05 || lm[16].y < lm[0].y - 0.05;
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