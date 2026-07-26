"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { poseState } from "@/components/poseStore";
import { hrStore } from "@/components/hrStore";

interface GameProps {
  onGameOver: (score: number) => void; // We will only call this when the 10 rounds are fully done
}

export default function SquatSurferTraining({ onGameOver }: GameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // HUD DOM Refs
  const scoreRef = useRef<HTMLDivElement>(null);
  const distanceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    let rafId: number; 

    // --- Audio System ---
    let audioCtx: AudioContext | null = null;
    const playSynthSound = (type: string) => {
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        if (type === 'coin') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(659.25, now);
          osc.frequency.setValueAtTime(987.77, now + 0.07);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.start(now); osc.stop(now + 0.2);
        } else if (type === 'jump') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(200, now);
          osc.frequency.exponentialRampToValueAtTime(700, now + 0.18);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now); osc.stop(now + 0.22);
        } else if (type === 'squat') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(450, now);
          osc.frequency.exponentialRampToValueAtTime(100, now + 0.22);
          gain.gain.setValueAtTime(0.18, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
          osc.start(now); osc.stop(now + 0.26);
        } else if (type === 'crash') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(150, now);
          osc.frequency.linearRampToValueAtTime(20, now + 0.6);
          gain.gain.setValueAtTime(0.35, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
          osc.start(now); osc.stop(now + 0.6);
        } else if (type === 'side') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(350, now);
          osc.frequency.linearRampToValueAtTime(450, now + 0.08);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.start(now); osc.stop(now + 0.12);
        }
      } catch(e) {}
    };

    // --- Three.js Setup (Identical to Standard) ---
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0f172a, 0.015);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 120);
    camera.position.set(0, 4.2, 7.0);
    camera.lookAt(0, 1.4, -5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x1e1b4b, 1.4));
    const dirLight = new THREE.DirectionalLight(0xa78bfa, 0.9);
    dirLight.position.set(5, 15, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const neonLight = new THREE.PointLight(0xec4899, 2.0, 40);
    neonLight.position.set(0, 6, -10);
    scene.add(neonLight);

    const matTrack = new THREE.MeshStandardMaterial({ color: 0x151233, roughness: 0.8 });
    const matTrain = new THREE.MeshStandardMaterial({ color: 0xdb2777, emissive: 0x610c3b, roughness: 0.3 });
    const matBarricadeHigh = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.4 });
    const matBarricadeLow = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
    const matCoin = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.9, roughness: 0.1 });
    const matPlayer = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.2 });
    
    // Material to flash when hit
    const matHit = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000 });

    const clock = new THREE.Clock();
    const laneWidth = 2.5;
    const trackLength = 100;
    
    let trackSegments: THREE.Group[] = [];
    let obstacles: any[] = [];
    let coins: any[] = [];
    let playerObj: THREE.Group;

    const state = {
      score: 0,
      distance: 0,
      baseSpeed: 14, // Constant base speed
      currentLane: 0,
      playerState: "run" as "run" | "jump" | "slide",
      playerJumpY: 0,
      playerJumpTime: 0,
      playerSlideTime: 0,
      wasSquatting: false,
      wasJumping: false,
      baselineNoseY: 0,
      isInvincible: false,
      invincibilityTime: 0
    };

    // --- World Building (Identical) ---
    const buildTrack = (zPos: number) => {
      const group = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.BoxGeometry(laneWidth * 3 + 1, 0.2, trackLength), matTrack);
      floor.receiveShadow = true;
      group.add(floor);
      
      for (let j = -trackLength/2; j < trackLength/2; j += 15) {
        const pMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0x1e1b4b });
        const pl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), pMat);
        pl.position.set(-(laneWidth * 1.5 + 0.8), 2, j);
        const pr = pl.clone();
        pr.position.x = (laneWidth * 1.5 + 0.8);
        group.add(pl, pr);
      }
      group.position.set(0, 0, zPos);
      scene.add(group);
      trackSegments.push(group);
    };

    const buildPlayer = () => {
      playerObj = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.5), matPlayer);
      body.position.y = 1.0;
      body.castShadow = true;
      body.name = "body";
      playerObj.add(body);

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      head.position.set(0, 1.6, 0);
      head.name = "head";
      playerObj.add(head);

      const legGeo = new THREE.BoxGeometry(0.2, 0.5, 0.25);
      const leftLeg = new THREE.Mesh(legGeo, new THREE.MeshStandardMaterial({ color: 0x4f46e5 }));
      leftLeg.position.set(-0.22, 0.35, 0); leftLeg.name = "leftLeg";
      const rightLeg = leftLeg.clone(); rightLeg.position.x = 0.22; rightLeg.name = "rightLeg";
      playerObj.add(leftLeg, rightLeg);

      const armGeo = new THREE.BoxGeometry(0.16, 0.5, 0.16);
      const leftArm = new THREE.Mesh(armGeo, new THREE.MeshStandardMaterial({ color: 0x8b5cf6 }));
      leftArm.position.set(-0.45, 1.0, 0); leftArm.name = "leftArm";
      const rightArm = leftArm.clone(); rightArm.position.x = 0.45; rightArm.name = "rightArm";
      playerObj.add(leftArm, rightArm);

      playerObj.position.set(0, 0.1, 1.5);
      scene.add(playerObj);
    };

    const createObstacle = (type: string, lane: number, zPos: number) => {
      let obsMesh = new THREE.Group();
      let bWidth = laneWidth, bHeight = 1.0, bDepth = 0.6, yPos = 0;

      if (type === "TRAIN") {
        obsMesh.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.2, 8.0), matTrain));
        yPos = 1.6; bWidth = 1.9; bHeight = 3.2; bDepth = 8.0;
      } else if (type === "BARRICADE_HIGH") {
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.0, 0.15), matBarricadeHigh); left.position.set(-laneWidth/2, 1.5, 0);
        const right = left.clone(); right.position.x = laneWidth/2;
        const bar = new THREE.Mesh(new THREE.BoxGeometry(laneWidth + 0.1, 0.4, 0.3), matBarricadeHigh); bar.position.set(0, 2.5, 0);
        obsMesh.add(left, right, bar);
        yPos = 0; bHeight = 0.5;
      } else {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(laneWidth, 0.3, 0.2), matBarricadeLow); cross.position.set(0, 0.8, 0);
        obsMesh.add(cross);
      }

      obsMesh.position.set(lane * laneWidth, yPos, zPos);
      scene.add(obsMesh);
      obstacles.push({ mesh: obsMesh, type, lane, z: zPos, width: bWidth, height: bHeight, depth: bDepth, box: new THREE.Box3() });
    };

    const createCoin = (lane: number, zPos: number, yPos: number) => {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), matCoin);
      coin.rotation.x = Math.PI / 2;
      coin.position.set(lane * laneWidth, yPos, zPos);
      scene.add(coin);
      coins.push({ mesh: coin, collected: false });
    };

    const spawnHazards = (zStart: number) => {
      [0, -33, -66].forEach(offset => {
        const currentZ = zStart + offset;
        const r = Math.random();
        if (r < 0.4) {
          createObstacle("TRAIN", Math.floor(Math.random() * 3) - 1, currentZ);
        } else if (r < 0.7) {
          createObstacle("BARRICADE_HIGH", Math.floor(Math.random() * 3) - 1, currentZ);
        } else {
          createObstacle("BARRICADE_LOW", Math.floor(Math.random() * 3) - 1, currentZ);
        }
        const coinLane = Math.floor(Math.random() * 3) - 1;
        for (let c = 0; c < 3; c++) createCoin(coinLane, currentZ - (c * 3), 0.7);
      });
    };

    for (let i = 0; i < 3; i++) buildTrack(i * trackLength - trackLength);
    buildPlayer();
    spawnHazards(-50); spawnHazards(-150);

    // --- Main Game Loop (Training Adjusted) ---
    const animate = () => {
      const delta = clock.getDelta();

      // 1. Pose Controls
      let targetLane = 0;
      if (poseState.lateralPosition === "LEFT") targetLane = -1;
      else if (poseState.lateralPosition === "RIGHT") targetLane = 1;
      
      if (targetLane !== state.currentLane) {
        state.currentLane = targetLane;
        playSynthSound("side");
      }

      if (poseState.isSquatting && !state.wasSquatting && state.playerState === "run") {
        state.playerState = "slide";
        state.playerSlideTime = 0;
        playSynthSound("squat");
      }
      state.wasSquatting = poseState.isSquatting;

      if (!state.baselineNoseY && poseState.nose.y > 0) state.baselineNoseY = poseState.nose.y;
      const jumpThreshold = window.innerHeight * 0.15; 
      const isJumpingNow = poseState.nose.y < (state.baselineNoseY - jumpThreshold);

      if (isJumpingNow && !state.wasJumping && state.playerState === "run") {
        state.playerState = "jump";
        state.playerJumpTime = 0;
        playSynthSound("jump");
      }
      state.wasJumping = isJumpingNow;
      if (poseState.nose.y > 0 && !poseState.isSquatting && !isJumpingNow) {
        state.baselineNoseY = (state.baselineNoseY * 0.95) + (poseState.nose.y * 0.05);
      }

      // 2. Player Kinematics
      playerObj.position.x = THREE.MathUtils.lerp(playerObj.position.x, state.currentLane * laneWidth, 18 * delta);
      
      if (state.playerState === "jump") {
        state.playerJumpTime += delta;
        state.playerJumpY = (1 - Math.pow((state.playerJumpTime - 0.325)/0.325, 2)) * 2.1;
        playerObj.position.y = 0.1 + state.playerJumpY;
        if (state.playerJumpTime >= 0.65) state.playerState = "run";
      } else if (state.playerState === "slide") {
        state.playerSlideTime += delta;
        playerObj.scale.set(1, 0.45, 1);
        playerObj.position.y = 0.1;
        if (state.playerSlideTime >= 0.8) {
          playerObj.scale.set(1, 1, 1);
          state.playerState = "run";
        }
      } else {
        playerObj.position.y = 0.1;
      }

      // Handle Invincibility Flashing after a crash
      if (state.isInvincible) {
        state.invincibilityTime -= delta;
        const body = playerObj.getObjectByName("body") as THREE.Mesh;
        body.material = Math.floor(state.invincibilityTime * 10) % 2 === 0 ? matHit : matPlayer;
        
        if (state.invincibilityTime <= 0) {
          state.isInvincible = false;
          body.material = matPlayer;
        }
      }

      // READ BLUETOOTH MULTIPLIER FOR ANIMATION AND MOVEMENT SPEED
      const currentMultiplier = hrStore.intensityMultiplier;
      const animTime = clock.getElapsedTime() * 14 * currentMultiplier;

      const lLeg = playerObj.getObjectByName("leftLeg") as THREE.Mesh;
      const rLeg = playerObj.getObjectByName("rightLeg") as THREE.Mesh;
      const lArm = playerObj.getObjectByName("leftArm") as THREE.Mesh;
      const rArm = playerObj.getObjectByName("rightArm") as THREE.Mesh;

      if (state.playerState === "run") {
        lLeg.rotation.x = Math.sin(animTime) * 0.75; rLeg.rotation.x = -Math.sin(animTime) * 0.75;
        lArm.rotation.x = -Math.sin(animTime) * 0.65; rArm.rotation.x = Math.sin(animTime) * 0.65;
      } else {
        lLeg.rotation.x = -0.6; rLeg.rotation.x = -0.3;
        lArm.rotation.x = 0.9; rArm.rotation.x = 0.9;
      }

      // 3. Move World (Driven purely by HR multiplier, NO passive acceleration)
      const moveStep = state.baseSpeed * currentMultiplier * delta;
      state.distance += moveStep * 0.55;
      
      if (distanceRef.current) distanceRef.current.innerText = `${Math.floor(state.distance)}m`;

      trackSegments.forEach(segment => {
        segment.position.z += moveStep;
        if (segment.position.z > 35) {
          segment.position.z -= trackLength * 3;
          spawnHazards(segment.position.z - (trackLength / 2));
        }
      });

      // 4. Collision & Updates
      const playerBox = new THREE.Box3().setFromObject(playerObj);

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.mesh.position.z += moveStep;
        
        let boxY = obs.type === "BARRICADE_HIGH" ? 2.5 : (obs.type === "BARRICADE_LOW" ? 0.6 : obs.mesh.position.y);
        obs.box.setFromCenterAndSize(
          new THREE.Vector3(obs.mesh.position.x, boxY, obs.mesh.position.z),
          new THREE.Vector3(obs.width, obs.height, obs.depth)
        );

        if (!state.isInvincible && playerBox.intersectsBox(obs.box)) {
          playSynthSound("crash");
          
          // TRAINING MODE CHANGE: Lose points and flash red, but KEEP RUNNING!
          state.score = Math.max(0, state.score - 5);
          if (scoreRef.current) scoreRef.current.innerText = state.score.toString();
          
          state.isInvincible = true;
          state.invincibilityTime = 1.5; // 1.5 seconds of invincibility
          
          // Destroy the obstacle so it doesn't double-trigger
          scene.remove(obs.mesh);
          obstacles.splice(i, 1);
          continue;
        }

        if (obs.mesh.position.z > 25) {
          scene.remove(obs.mesh);
          obstacles.splice(i, 1);
        }
      }

      for (let i = coins.length - 1; i >= 0; i--) {
        const coin = coins[i];
        coin.mesh.position.z += moveStep;
        coin.mesh.rotation.z += 4.5 * delta;

        if (!coin.collected && playerBox.containsPoint(coin.mesh.position)) {
          coin.collected = true;
          scene.remove(coin.mesh);
          coins.splice(i, 1);
          state.score += 1;
          playSynthSound("coin");
          if (scoreRef.current) scoreRef.current.innerText = state.score.toString();
        }

        if (coin.mesh.position.z > 25) {
          scene.remove(coin.mesh);
          coins.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      scene.clear();
      if (containerRef.current) containerRef.current.innerHTML = '';
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
      
      // When the component unmounts (Timer hits 0 and orchestrator shifts to "REST"), 
      // we save the score accumulated in that round.
      onGameOver(state.score);
    };
  }, [onGameOver]);

  // Notice we removed the "Speed" display, because the Orchestrator's HUD 
  // on the right side already displays the AI Multiplier!
  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-10 pointer-events-none" />
      
      <div className="absolute top-4 left-4 z-30 flex gap-4 pointer-events-none">
        <div className="bg-slate-900/80 border border-purple-500/50 rounded-xl p-4 flex gap-6 items-center shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-yellow-500/20 border border-yellow-500 flex items-center justify-center text-yellow-400">
               <span className="text-2xl font-bold">💰</span>
            </div>
            <div>
              <div className="text-xs text-slate-400 font-semibold tracking-wider">SCORE</div>
              <div ref={scoreRef} className="text-3xl font-bold text-yellow-300 font-mono">0</div>
            </div>
          </div>
          <div className="w-px h-10 bg-slate-700/50"></div>
          <div className="flex items-center gap-3">
            <div>
              <div className="text-xs text-slate-400 font-semibold tracking-wider">DISTANCE</div>
              <div ref={distanceRef} className="text-xl font-bold text-emerald-300 font-mono">0m</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}