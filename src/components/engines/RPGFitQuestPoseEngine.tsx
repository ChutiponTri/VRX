"use client";

import React, { useEffect, useRef } from "react";
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import { poseState } from "../poseStore";

interface EngineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onReady?: () => void; // <-- เพิ่มตรงนี้ค่ะ
}

// Minimum confidence MediaPipe must have in a landmark before we trust it.
const VISIBILITY_THRESHOLD = 0.6;

type Pt = { x: number; y: number; visibility?: number };

/**
 * Angle (in degrees) at vertex `p2`, between rays p2->p1 and p2->p3.
 * This is scale-invariant by construction: it only depends on the
 * *direction* of the two vectors, never their length, so it doesn't
 * matter how far the person is from the camera or how big they appear
 * in frame. That's the key property distance-ratio methods don't have.
 */
function angleAt(p2: Pt, p1: Pt, p3: Pt): number | null {
  const v1x = p1.x - p2.x, v1y = p1.y - p2.y;
  const v2x = p3.x - p2.x, v2y = p3.y - p2.y;
  const mag1 = Math.hypot(v1x, v1y);
  const mag2 = Math.hypot(v2x, v2y);
  if (mag1 < 1e-5 || mag2 < 1e-5) return null; // degenerate, landmarks overlapping
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (mag1 * mag2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function isVisible(...pts: Pt[]) {
  return pts.every((p) => (p.visibility ?? 1) > VISIBILITY_THRESHOLD);
}

export default function RPGFitQuestPoseEngine({ videoRef, canvasRef, onReady }: EngineProps) {
  const initialized = useRef(false);
  const hasTriggeredReady = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    let poseLandmarker: PoseLandmarker;
    let rafId: number;
    let drawingUtils: DrawingUtils | null = null;

    // Discrete states, with hysteresis handled via separate enter/exit angle thresholds
    let leftKneeRaised = false;
    let rightKneeRaised = false;
    let leftSideLegRaised = false;
    let rightSideLegRaised = false;
    let isSquattingState = false;
    let lastStepTime = 0;
    let squatTimestamp = -Infinity;

    // Smoothed (EMA) angles — reduces frame-to-frame jitter from noisy tracking.
    // null = "no reading yet", so the first real frame seeds it instead of blending.
    let smoothedLKneeAngle: number | null = null;
    let smoothedRKneeAngle: number | null = null;
    let smoothedLHipAngle: number | null = null;
    let smoothedRHipAngle: number | null = null;
    let smoothedLLegAngle: number | null = null;
    let smoothedRLegAngle: number | null = null;
    const SMOOTHING = 0.35; // 0-1, lower = smoother but slower to react

    const ema = (prev: number | null, next: number) => (prev === null ? next : prev + SMOOTHING * (next - prev));

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

          drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: "rgba(234, 179, 8, 0.6)", lineWidth: 4 });
          drawingUtils.drawLandmarks(lm, { color: "rgba(250, 204, 21, 0.8)", lineWidth: 2, radius: 4 });

          const lShoulder = lm[11], rShoulder = lm[12];
          const lHip = lm[23], rHip = lm[24];
          const lKnee = lm[25], rKnee = lm[26];
          const lAnkle = lm[27], rAnkle = lm[28];

          const now = performance.now();

          // --- Squat detection: knee bend angle (hip - knee - ankle) --------------
          if (isVisible(lHip, lKnee, lAnkle) && isVisible(rHip, rKnee, rAnkle)) {
            const rawL = angleAt(lKnee, lHip, lAnkle);
            const rawR = angleAt(rKnee, rHip, rAnkle);

            if (rawL !== null && rawR !== null) {
              smoothedLKneeAngle = ema(smoothedLKneeAngle, rawL);
              smoothedRKneeAngle = ema(smoothedRKneeAngle, rawR);

              const SQUAT_ENTER = 140; // both knee angles must drop below this to START a squat
              const SQUAT_EXIT = 160;  // must rise above this to STOP being a squat
              const squatThreshold = isSquattingState ? SQUAT_EXIT : SQUAT_ENTER;

              const bothBent = smoothedLKneeAngle < squatThreshold && smoothedRKneeAngle < squatThreshold;

              if (bothBent) squatTimestamp = now;
              isSquattingState = now - squatTimestamp < 250;
            }
          } else {
            isSquattingState = false;
          }

          // --- High-knee detection: hip angle (shoulder - hip - knee) -------------
          // Raising a knee swings the thigh forward/up (march in place) -> UP
          if (isVisible(lShoulder, lHip, lKnee)) {
            const raw = angleAt(lHip, lShoulder, lKnee);
            if (raw !== null) {
              smoothedLHipAngle = ema(smoothedLHipAngle, raw);
              const enterT = 135, exitT = 150;
              const t = leftKneeRaised ? exitT : enterT;
              const isUp = smoothedLHipAngle < t;
              if (isUp && !leftKneeRaised) { leftKneeRaised = true; lastStepTime = now; }
              else if (!isUp) leftKneeRaised = false;
            }
          } else {
            leftKneeRaised = false;
          }

          if (isVisible(rShoulder, rHip, rKnee)) {
            const raw = angleAt(rHip, rShoulder, rKnee);
            if (raw !== null) {
              smoothedRHipAngle = ema(smoothedRHipAngle, raw);
              const enterT = 135, exitT = 150;
              const t = rightKneeRaised ? exitT : enterT;
              const isUp = smoothedRHipAngle < t;
              if (isUp && !rightKneeRaised) { rightKneeRaised = true; lastStepTime = now; }
              else if (!isUp) rightKneeRaised = false;
            }
          } else {
            rightKneeRaised = false;
          }

          const isMarching = (now - lastStepTime < 800) || leftKneeRaised || rightKneeRaised;

          // --- Side Leg Raise Detection (Lateral Abduction) -----------------------
          // Note: The camera view is mirrored with CSS scale-x-[-1].
          // - When user lifts their LEFT leg outwards (as in user photo 1):
          //   In raw camera coords (facing user), user's left is towards +x.
          //   In mirror reflection, user's left leg points to screen-left.
          //   -> Controls LEFT.
          // - When user lifts their RIGHT leg outwards (as in user photo 2):
          //   In raw camera coords (facing user), user's right is towards -x.
          //   In mirror reflection, user's right leg points to screen-right.
          //   -> Controls RIGHT.
          if (isVisible(lHip, lKnee) && isVisible(rHip, rKnee)) {
            const SIDE_ENTER_ANGLE = 22; // degrees outward from vertical
            const SIDE_EXIT_ANGLE = 14;

            // 1. Left leg outward angle & lift
            const lAnkleX = isVisible(lAnkle) ? lAnkle.x : lKnee.x;
            const lAnkleY = isVisible(lAnkle) ? lAnkle.y : lKnee.y;
            const rAnkleY = isVisible(rAnkle) ? rAnkle.y : rKnee.y;

            const dxL = Math.max(lAnkleX - lHip.x, lKnee.x - lHip.x);
            const dyL = Math.max(0.01, lAnkleY - lHip.y);
            const rawLAngle = (Math.atan2(dxL, dyL) * 180) / Math.PI;
            smoothedLLegAngle = ema(smoothedLLegAngle, rawLAngle);

            // Left leg lifted higher than right support leg or knee lifted
            const isLLifted = (lAnkleY < rAnkleY - 0.04) || (lKnee.y < rKnee.y - 0.03);
            const tLeft = leftSideLegRaised ? SIDE_EXIT_ANGLE : SIDE_ENTER_ANGLE;
            leftSideLegRaised = (smoothedLLegAngle > tLeft) && isLLifted;

            // 2. Right leg outward angle & lift
            const rAnkleX = isVisible(rAnkle) ? rAnkle.x : rKnee.x;
            const dxR = Math.max(rHip.x - rAnkleX, rHip.x - rKnee.x);
            const dyR = Math.max(0.01, rAnkleY - rHip.y);
            const rawRAngle = (Math.atan2(dxR, dyR) * 180) / Math.PI;
            smoothedRLegAngle = ema(smoothedRLegAngle, rawRAngle);

            // Right leg lifted higher than left support leg or knee lifted
            const isRLifted = (rAnkleY < lAnkleY - 0.04) || (rKnee.y < lKnee.y - 0.03);
            const tRight = rightSideLegRaised ? SIDE_EXIT_ANGLE : SIDE_ENTER_ANGLE;
            rightSideLegRaised = (smoothedRLegAngle > tRight) && isRLifted;
          } else {
            leftSideLegRaised = false;
            rightSideLegRaised = false;
          }

          // Prioritize side raises and squatting over walking forward
          const isWalkingUp = isMarching && !isSquattingState && !leftSideLegRaised && !rightSideLegRaised;

          poseState.rpg.runUp = isWalkingUp;
          poseState.rpg.squatDown = isSquattingState;
          poseState.rpg.turnLeft = leftSideLegRaised && !isSquattingState;
          poseState.rpg.turnRight = rightSideLegRaised && !isSquattingState;
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
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [canvasRef, videoRef, onReady]);

  return null;
}