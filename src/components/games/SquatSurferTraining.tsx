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
          osc.type = 'sine';
          osc.frequency.setValueAtTime(659.25, now);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'jump') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(250, now);
          osc.frequency.exponentialRampToValueAtTime(500, now + 0.18);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc.start(now); osc.stop(now + 0.22);
        } else if (type === 'squat') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(350, now);
          osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);
          gain.gain.setValueAtTime(0.12, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
          osc.start(now); osc.stop(now + 0.24);
        } else if (type === 'crash') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(100, now);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
          osc.start(now); osc.stop(now + 0.4);
        } else if (type === 'side') {
          osc.type = 'sine';
          osc.frequency.setValueAtTime(300, now);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.start(now); osc.stop(now + 0.08);
        }
      } catch(e) {}
    };

    // --- Three.js Engine Setup (Bright Style) ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb3e5fc); 
    scene.fog = new THREE.FogExp2(0xb3e5fc, 0.008); 

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 3.2, 5.5); 
    camera.lookAt(0, 1.2, -5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff8e7, 1.1);
    sunLight.position.set(15, 25, 10);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // --- Materials ---
    const matMeadow = new THREE.MeshStandardMaterial({ color: 0x81c784, roughness: 0.8 }); 
    const matPath = new THREE.MeshStandardMaterial({ color: 0xffcc80, roughness: 0.7 }); 
    const matPathLine = new THREE.MeshBasicMaterial({ color: 0xffb74d, transparent: true, opacity: 0.6 }); 
    const matTruck = new THREE.MeshStandardMaterial({ color: 0xef5350, roughness: 0.5 }); 
    const matTruckCab = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 }); 
    const matHighFence = new THREE.MeshStandardMaterial({ color: 0x795548, roughness: 0.7 }); 
    const matLowBush = new THREE.MeshStandardMaterial({ color: 0x388e3c, roughness: 0.9 }); 
    const matCoin = new THREE.MeshStandardMaterial({ color: 0xffca28, metalness: 0.8, roughness: 0.2 });
    
    // Player Materials
    const matPlayerBody = new THREE.MeshStandardMaterial({ color: 0x1e88e5, roughness: 0.5 }); 
    const matPlayerAcc = new THREE.MeshStandardMaterial({ color: 0xffa726, roughness: 0.3 });
    const matPlayerSkin = new THREE.MeshStandardMaterial({ color: 0xffe0b2, roughness: 0.4 });
    const matPlayerLegs = new THREE.MeshStandardMaterial({ color: 0x424242 }); 
    
    // Material to flash when hit
    const matHit = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x880000 });

    const clock = new THREE.Clock();
    const laneWidth = 2.6;
    const trackLength = 100;
    const numSegments = 4;
    
    let trackSegments: THREE.Group[] = [];
    let obstacles: any[] = [];
    let coins: any[] = [];
    let playerObj: THREE.Group;

    const state = {
      score: 0,
      distance: 0,
      baseSpeed: 14, // Training mode constant base speed
      currentLane: 0,
      playerState: "run" as "run" | "jump" | "slide",
      playerJumpY: 0,
      playerJumpTime: 0,
      playerSlideTime: 0,
      wasSquatting: false,
      wasJumping: false,
      baselineNoseY: 0,
      noseFilterY: 0,
      isInvincible: false,
      invincibilityTime: 0
    };

    // --- World Creation ---
    const buildTrack = (zPos: number) => {
      const group = new THREE.Group();
      
      const meadow = new THREE.Mesh(new THREE.BoxGeometry(laneWidth * 12, 0.1, trackLength), matMeadow);
      meadow.position.y = -0.05;
      meadow.receiveShadow = true;
      group.add(meadow);

      const path = new THREE.Mesh(new THREE.BoxGeometry(laneWidth * 3 + 0.6, 0.12, trackLength), matPath);
      path.position.y = -0.04;
      path.receiveShadow = true;
      group.add(path);

      [-laneWidth * 0.5, laneWidth * 0.5].forEach(x => {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, trackLength), matPathLine);
        line.position.set(x, -0.03, 0);
        group.add(line);
      });

      for (let j = -trackLength/2; j < trackLength/2; j += 20) {
        const postMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.9 });
        const postL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.0, 0.25), postMat);
        postL.position.set(-(laneWidth * 1.5 + 1.2), 1.0, j);
        postL.castShadow = true;
        const postR = postL.clone();
        postR.position.x = (laneWidth * 1.5 + 1.2);
        group.add(postL, postR);
      }

      group.position.set(0, 0, zPos);
      scene.add(group);
      trackSegments.push(group);
    };

    // Helper to create body parts and store original material
    const createBodyPart = (geo: THREE.BufferGeometry, mat: THREE.Material, name?: string) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.userData.origMat = mat; // เก็บ material เดิมไว้ใช้ตอนหายกระพริบแดง
      if (name) mesh.name = name;
      return mesh;
    };

    // --- Player Creation (Grounded) ---
    const buildPlayer = () => {
      playerObj = new THREE.Group();

      const characterMesh = new THREE.Group();
      characterMesh.name = "characterMesh";

      const head = createBodyPart(new THREE.BoxGeometry(0.4, 0.4, 0.4), matPlayerSkin, "head");
      head.position.set(0, 1.45, 0);

      const cap = createBodyPart(new THREE.BoxGeometry(0.42, 0.15, 0.42), matPlayerAcc);
      cap.position.set(0, 1.6, 0.05);
      
      const brim = createBodyPart(new THREE.BoxGeometry(0.3, 0.05, 0.25), matPlayerAcc);
      brim.position.set(0, 1.55, -0.2);
      
      characterMesh.add(head, cap, brim);

      const torso = createBodyPart(new THREE.BoxGeometry(0.65, 0.8, 0.45), matPlayerBody, "torso");
      torso.position.y = 0.85;
      characterMesh.add(torso);

      const leftLeg = createBodyPart(new THREE.BoxGeometry(0.2, 0.45, 0.2), matPlayerLegs, "leftLeg"); 
      leftLeg.position.set(-0.2, 0.225, 0);
      const rightLeg = createBodyPart(new THREE.BoxGeometry(0.2, 0.45, 0.2), matPlayerLegs, "rightLeg");
      rightLeg.position.set(0.2, 0.225, 0);
      characterMesh.add(leftLeg, rightLeg);

      const leftArm = createBodyPart(new THREE.BoxGeometry(0.18, 0.5, 0.18), matPlayerAcc, "leftArm"); 
      leftArm.position.set(-0.45, 0.9, 0);
      const rightArm = createBodyPart(new THREE.BoxGeometry(0.18, 0.5, 0.18), matPlayerAcc, "rightArm");
      rightArm.position.set(0.45, 0.9, 0);
      characterMesh.add(leftArm, rightArm);

      playerObj.add(characterMesh);
      playerObj.position.set(0, 0, 1.5);
      scene.add(playerObj);
    };

    // --- Obstacles with Exact Hitboxes ---
    const createObstacle = (type: string, lane: number, zPos: number) => {
      const obsMesh = new THREE.Group();
      let hitW = 1, hitH = 1, hitD = 1, hitY = 0; 

      if (type === "TRUCK") { 
        const truckBody = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.8, 6.0), matTruck);
        truckBody.position.y = 1.4;
        truckBody.castShadow = true;
        obsMesh.add(truckBody);

        const truckCab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 1.5), matTruckCab);
        truckCab.position.set(0, 0.75, -2.5);
        obsMesh.add(truckCab);

        hitW = 2.0; hitH = 2.8; hitD = 6.0; hitY = 1.4;

      } else if (type === "HIGH_FENCE") { 
        const fence = new THREE.Mesh(new THREE.BoxGeometry(laneWidth + 0.2, 0.3, 0.25), matHighFence);
        fence.position.y = 1.2; // สูงพอดีก้ม
        fence.castShadow = true;
        
        const postL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.35, 0.15), matHighFence);
        postL.position.set(-laneWidth/2, 0.675, 0);
        const postR = postL.clone(); postR.position.x = laneWidth/2;
        
        obsMesh.add(fence, postL, postR);
        hitW = laneWidth; hitH = 0.35; hitD = 0.3; hitY = 1.2;

      } else { 
        const bush = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 10), matLowBush);
        bush.position.y = 0.4;
        bush.scale.y = 0.6;
        bush.castShadow = true;
        obsMesh.add(bush);
        hitW = 1.4; hitH = 0.8; hitD = 1.4; hitY = 0.4;
      }

      obsMesh.position.set(lane * laneWidth, 0, zPos);
      scene.add(obsMesh);
      obstacles.push({ mesh: obsMesh, type, lane, z: zPos, hitW, hitH, hitD, hitY });
    };

    const createCoin = (lane: number, zPos: number, yPos: number) => {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), matCoin);
      coin.rotation.x = Math.PI / 2;
      coin.castShadow = true;
      coin.position.set(lane * laneWidth, yPos, zPos);
      scene.add(coin);
      coins.push({ mesh: coin, collected: false });
    };

    const spawnHazards = (zStart: number) => {
      [-20, -50, -80].forEach(offset => {
        const currentZ = zStart + offset;
        const r = Math.random();
        const lane = Math.floor(Math.random() * 3) - 1;

        if (r < 0.35) createObstacle("TRUCK", lane, currentZ);
        else if (r < 0.7) createObstacle("HIGH_FENCE", lane, currentZ);
        else createObstacle("LOW_BUSH", lane, currentZ);

        const coinLane = Math.floor(Math.random() * 3) - 1;
        for (let c = 0; c < 3; c++) createCoin(coinLane, currentZ - (c * 2.5), 0.7);
      });
    };

    for (let i = 0; i < numSegments; i++) {
      buildTrack(-i * trackLength);
    }
    buildPlayer();
    spawnHazards(-30); spawnHazards(-130); spawnHazards(-230);

    // --- Main Game Loop (Training Mode) ---
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

      // 2. Player Movement 
      const targetX = state.currentLane * laneWidth;
      playerObj.position.x = THREE.MathUtils.lerp(playerObj.position.x, targetX, 18 * delta);

      const charMesh = playerObj.getObjectByName("characterMesh") as THREE.Group;

      if (state.playerState === "jump") {
        state.playerJumpTime += delta;
        state.playerJumpY = (1 - Math.pow((state.playerJumpTime - 0.325)/0.325, 2)) * 2.1;
        playerObj.position.y = state.playerJumpY;
        if (state.playerJumpTime >= 0.65) state.playerState = "run";
      } 
      else if (state.playerState === "slide") {
        state.playerSlideTime += delta;
        if (charMesh) charMesh.scale.set(1, 0.45, 1); 
        playerObj.position.y = 0;
        if (state.playerSlideTime >= 0.8) {
          if (charMesh) charMesh.scale.set(1, 1, 1);
          state.playerState = "run";
        }
      } 
      else {
        if (charMesh) charMesh.scale.set(1, 1, 1);
        playerObj.position.y = 0;
      }

      // --- Invincibility Flashing Logic ---
      if (state.isInvincible && charMesh) {
        state.invincibilityTime -= delta;
        const isFlashRed = Math.floor(state.invincibilityTime * 10) % 2 === 0;
        
        charMesh.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            child.material = isFlashRed ? matHit : child.userData.origMat;
          }
        });

        if (state.invincibilityTime <= 0) {
          state.isInvincible = false;
          charMesh.children.forEach(child => {
            if (child instanceof THREE.Mesh) child.material = child.userData.origMat;
          });
        }
      }

      // READ BLUETOOTH MULTIPLIER FOR ANIMATION AND MOVEMENT SPEED
      const currentMultiplier = hrStore.intensityMultiplier;
      const animTime = clock.getElapsedTime() * 14 * currentMultiplier;

      const lArm = playerObj.getObjectByName("leftArm") as THREE.Mesh;
      const rArm = playerObj.getObjectByName("rightArm") as THREE.Mesh;
      const lLeg = playerObj.getObjectByName("leftLeg") as THREE.Mesh;
      const rLeg = playerObj.getObjectByName("rightLeg") as THREE.Mesh;

      if (lArm && rArm && lLeg && rLeg) {
        if (state.playerState === "run") {
          const swing = Math.sin(animTime) * 0.6;
          lArm.rotation.x = -swing; rArm.rotation.x = swing;
          lLeg.rotation.x = swing; rLeg.rotation.x = -swing;
        } else {
          lArm.rotation.x = 0.8; rArm.rotation.x = 0.8;
          lLeg.rotation.x = -0.4; rLeg.rotation.x = -0.4;
        }
      }

      // 3. Move World (Driven purely by HR multiplier)
      const moveStep = state.baseSpeed * currentMultiplier * delta;
      state.distance += moveStep * 0.55;
      
      if (distanceRef.current) distanceRef.current.innerText = `${Math.floor(state.distance)}m`;

      trackSegments.forEach(segment => {
        segment.position.z += moveStep;
        if (segment.position.z > trackLength) {
          segment.position.z -= trackLength * numSegments;
          spawnHazards(segment.position.z);
        }
      });

      // 4. Exact Collision Logic
      const playerBox = new THREE.Box3().setFromObject(playerObj);
      playerBox.expandByScalar(-0.05);

      for (let i = obstacles.length - 1; i >= 0; i--) {
        const obs = obstacles[i];
        obs.mesh.position.z += moveStep;
        
        const obsBox = new THREE.Box3().setFromCenterAndSize(
          new THREE.Vector3(obs.mesh.position.x, obs.hitY, obs.mesh.position.z),
          new THREE.Vector3(obs.hitW, obs.hitH, obs.hitD)
        );

        // CHECK COLLISION (Only if not invincible)
        if (!state.isInvincible && playerBox.intersectsBox(obsBox)) {
          playSynthSound("crash");
          
          // TRAINING MODE CHANGE: Lose points and flash red, but KEEP RUNNING
          state.score = Math.max(0, state.score - 5);
          if (scoreRef.current) scoreRef.current.innerText = state.score.toString();
          
          state.isInvincible = true;
          state.invincibilityTime = 1.5; // Flash for 1.5 secs
          
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
        coin.mesh.rotation.y += 4.5 * delta;

        if (!coin.collected && playerObj.position.distanceTo(coin.mesh.position) < 1.4) {
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
      
      // CALL ONGAMEOVER ONLY ON UNMOUNT (Training session ends)
      onGameOver(state.score);
    };
  }, [onGameOver]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-10 pointer-events-none" />
      
      <div className="absolute top-6 w-full z-30 flex justify-center pointer-events-none px-4">
        {/* Glassmorphism UI - Removed Speed for Training Mode */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-[2rem] px-8 py-4 flex gap-8 items-center shadow-[0_8px_32px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/30">
               <span className="text-2xl font-bold">💎</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] text-slate-500 font-bold tracking-widest uppercase">SCORE</span>
              <span ref={scoreRef} className="text-3xl font-black text-slate-800 font-mono tracking-tight leading-none">0</span>
            </div>
          </div>
          
          <div className="w-px h-12 bg-slate-300/60 rounded-full"></div>

          <div className="flex flex-col items-center px-2">
            <span className="text-[11px] text-slate-500 font-bold tracking-widest uppercase">DISTANCE</span>
            <span ref={distanceRef} className="text-xl font-bold text-emerald-500 font-mono">0m</span>
          </div>
        </div>
      </div>
    </>
  );
}