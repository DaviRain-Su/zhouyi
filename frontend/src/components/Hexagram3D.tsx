"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox, Html } from "@react-three/drei";
import * as THREE from "three";
import { isYang, isChanging, YAO_CN } from "@/lib/zhouyi";

interface Hexagram3DProps {
  yaos: number[];
  derivedYaos?: number[];
}

const BAR_WIDTH = 3.2;
const BAR_HEIGHT = 0.18;
const BAR_HEIGHT_CHANGING = 0.3;
const BAR_DEPTH = 0.45;
const SEGMENT_WIDTH = 1.25;
const GAP_WIDTH = 0.7;
const Y_SPACING = 0.6;

// Colors
const COLOR_STATIC = "#c8bfa8";
const COLOR_CHANGING = "#ff7722";
const COLOR_CHANGING_HOT = "#ffaa00";
const COLOR_DERIVED = "#6699cc";
const COLOR_RING = "#ff9944";

function ChangingRing({ position }: { position: [number, number, number] }) {
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      const t = clock.getElapsedTime();
      const scale = 1.0 + 0.15 * Math.sin(t * 4.0);
      ringRef.current.scale.set(scale, scale, scale);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + 0.2 * Math.sin(t * 3.0);
    }
  });

  return (
    <mesh ref={ringRef} position={position} rotation={[Math.PI / 2, 0, 0]}>
      <ringGeometry args={[BAR_WIDTH * 0.52, BAR_WIDTH * 0.62, 6]} />
      <meshBasicMaterial
        color={COLOR_RING}
        transparent
        opacity={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function YaoBar({
  yao,
  position,
  derived,
}: {
  yao: number;
  position: [number, number, number];
  derived?: boolean;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const yang = isYang(yao);
  const changing = isChanging(yao);

  const color = derived
    ? COLOR_DERIVED
    : changing
      ? COLOR_CHANGING
      : COLOR_STATIC;
  const emissive = changing ? COLOR_CHANGING : derived ? "#113355" : "#000000";
  const baseEmissive = changing ? 1.0 : derived ? 0.15 : 0;
  const barHeight = changing ? BAR_HEIGHT_CHANGING : BAR_HEIGHT;
  const radius = changing ? 0.06 : 0.04;
  const metalness = changing ? 0.4 : 0.1;
  const roughness = changing ? 0.2 : 0.6;

  useFrame(({ clock }) => {
    if (meshRef.current && changing) {
      const t = clock.getElapsedTime();
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.5);
      meshRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.emissiveIntensity !== undefined) {
            mat.emissiveIntensity = 0.6 + pulse * 1.0;
          }
        }
      });
    }
  });

  const matProps = {
    color,
    emissive,
    emissiveIntensity: baseEmissive,
    metalness,
    roughness,
  };

  // Label position
  const labelSide = derived ? 1 : -1;
  const labelX = labelSide * (BAR_WIDTH * 0.5 + 0.6);

  if (yang) {
    return (
      <group>
        <group ref={meshRef} position={position}>
          <RoundedBox
            args={[BAR_WIDTH, barHeight, BAR_DEPTH]}
            radius={radius}
            smoothness={2}
          >
            <meshStandardMaterial {...matProps} />
          </RoundedBox>
          {/* Changing line: add a second inner glow bar */}
          {changing && (
            <RoundedBox
              args={[BAR_WIDTH * 0.85, barHeight * 0.5, BAR_DEPTH * 1.2]}
              radius={0.02}
              smoothness={2}
            >
              <meshStandardMaterial
                color={COLOR_CHANGING_HOT}
                emissive={COLOR_CHANGING_HOT}
                emissiveIntensity={1.5}
                transparent
                opacity={0.6}
                metalness={0.6}
                roughness={0.1}
              />
            </RoundedBox>
          )}
        </group>
        {/* Label */}
        <Html position={[labelX, position[1], 0]} center style={{ pointerEvents: "none" }}>
          <div className={`text-xs font-mono whitespace-nowrap ${changing ? "text-amber-400 font-bold" : "text-ink-500"}`}>
            {YAO_CN[yao]} {changing ? "○" : ""}
          </div>
        </Html>
        {/* Halo ring for changing */}
        {changing && <ChangingRing position={position} />}
      </group>
    );
  }

  // Yin: two segments with gap
  const segX = (SEGMENT_WIDTH + GAP_WIDTH) / 2;
  return (
    <group>
      <group ref={meshRef} position={position}>
        <RoundedBox
          args={[SEGMENT_WIDTH, barHeight, BAR_DEPTH]}
          radius={radius}
          smoothness={2}
          position={[-segX, 0, 0]}
        >
          <meshStandardMaterial {...matProps} />
        </RoundedBox>
        <RoundedBox
          args={[SEGMENT_WIDTH, barHeight, BAR_DEPTH]}
          radius={radius}
          smoothness={2}
          position={[segX, 0, 0]}
        >
          <meshStandardMaterial {...matProps} />
        </RoundedBox>
        {/* Changing: inner glow segments */}
        {changing && (
          <>
            <RoundedBox
              args={[SEGMENT_WIDTH * 0.85, barHeight * 0.5, BAR_DEPTH * 1.2]}
              radius={0.02}
              smoothness={2}
              position={[-segX, 0, 0]}
            >
              <meshStandardMaterial
                color={COLOR_CHANGING_HOT}
                emissive={COLOR_CHANGING_HOT}
                emissiveIntensity={1.5}
                transparent
                opacity={0.6}
                metalness={0.6}
                roughness={0.1}
              />
            </RoundedBox>
            <RoundedBox
              args={[SEGMENT_WIDTH * 0.85, barHeight * 0.5, BAR_DEPTH * 1.2]}
              radius={0.02}
              smoothness={2}
              position={[segX, 0, 0]}
            >
              <meshStandardMaterial
                color={COLOR_CHANGING_HOT}
                emissive={COLOR_CHANGING_HOT}
                emissiveIntensity={1.5}
                transparent
                opacity={0.6}
                metalness={0.6}
                roughness={0.1}
              />
            </RoundedBox>
          </>
        )}
      </group>
      {/* Label */}
      <Html position={[labelX, position[1], 0]} center style={{ pointerEvents: "none" }}>
        <div className={`text-xs font-mono whitespace-nowrap ${changing ? "text-amber-400 font-bold" : "text-ink-500"}`}>
          {YAO_CN[yao]} {changing ? "○" : ""}
        </div>
      </Html>
      {/* Halo ring for changing */}
      {changing && <ChangingRing position={position} />}
    </group>
  );
}

function Hexagram({ yaos }: { yaos: number[] }) {
  return (
    <group>
      {yaos.map((yao, i) => {
        const y = (i - 2.5) * Y_SPACING;
        return <YaoBar key={i} yao={yao} position={[0, y, 0]} />;
      })}
    </group>
  );
}

function DualHexagram({
  yaos,
  derivedYaos,
}: {
  yaos: number[];
  derivedYaos: number[];
}) {
  return (
    <group>
      {/* 本卦 (original) */}
      <group position={[-2.4, 0, 0]}>
        <Hexagram yaos={yaos} />
        <Html position={[0, -2.2, 0]} center>
          <div className="text-xs text-gold-400 font-han">本卦</div>
        </Html>
      </group>
      {/* Arrow */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.12, 0.5, 6]} />
        <meshStandardMaterial
          color={COLOR_CHANGING}
          emissive={COLOR_CHANGING}
          emissiveIntensity={0.8}
        />
      </mesh>
      {/* 之卦 (derived) */}
      <group position={[2.4, 0, 0]}>
        {derivedYaos.map((yao, i) => {
          const y = (i - 2.5) * Y_SPACING;
          return (
            <YaoBar key={i} yao={yao} position={[0, y, 0]} derived />
          );
        })}
        <Html position={[0, -2.2, 0]} center>
          <div className="text-xs text-blue-400 font-han">之卦</div>
        </Html>
      </group>
    </group>
  );
}

function Scene({ yaos, derivedYaos }: Hexagram3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const hasChanges = yaos.some(isChanging);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y =
        Math.sin(clock.getElapsedTime() * 0.25) * 0.12;
    }
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 8, 5]} intensity={0.9} color="#ffeedd" />
      <directionalLight position={[-3, 4, -3]} intensity={0.3} color="#aaccff" />
      {/* Extra point light near center for glow effect */}
      <pointLight position={[0, 0, 2]} intensity={0.4} color="#ff8844" distance={6} />

      <group ref={groupRef}>
        {hasChanges && derivedYaos ? (
          <DualHexagram yaos={yaos} derivedYaos={derivedYaos} />
        ) : (
          <Hexagram yaos={yaos} />
        )}
      </group>

      {/* Base platform */}
      <mesh position={[0, -2.0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.0, 64]} />
        <meshStandardMaterial
          color="#0a0a0a"
          metalness={0.6}
          roughness={0.2}
          transparent
          opacity={0.7}
        />
      </mesh>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={3}
        maxDistance={14}
        autoRotate
        autoRotateSpeed={0.6}
        maxPolarAngle={Math.PI * 0.75}
        minPolarAngle={Math.PI * 0.15}
      />
    </>
  );
}

export default function Hexagram3D({ yaos, derivedYaos }: Hexagram3DProps) {
  const hasChanges = yaos.some(isChanging);
  const height = hasChanges && derivedYaos ? "aspect-[16/10]" : "aspect-square";

  return (
    <div className={`w-full ${height} rounded-xl overflow-hidden border border-ink-700 bg-[#050505]`}>
      <Canvas
        camera={{ position: [0, 1, 6], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#050505", 10, 22]} />
        <Scene yaos={yaos} derivedYaos={derivedYaos} />
      </Canvas>
    </div>
  );
}
