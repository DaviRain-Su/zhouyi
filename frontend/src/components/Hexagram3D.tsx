"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { isYang, isChanging } from "@/lib/zhouyi";

interface Hexagram3DProps {
  yaos: number[];
  derivedYaos?: number[];
}

const BAR_WIDTH = 3.0;
const BAR_HEIGHT = 0.22;
const BAR_DEPTH = 0.5;
const SEGMENT_WIDTH = 1.2;
const GAP_WIDTH = 0.6;
const Y_SPACING = 0.55;

const COLOR_STATIC = "#e0d8c8";
const COLOR_CHANGING = "#ff9944";
const COLOR_DERIVED = "#88aacc";
const EMISSIVE_CHANGING = "#ff6600";
const EMISSIVE_STRENGTH = 0.8;

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
  const emissive = changing ? EMISSIVE_CHANGING : derived ? "#224488" : "#000000";
  const emissiveIntensity = changing ? EMISSIVE_STRENGTH : derived ? 0.3 : 0;

  useFrame(({ clock }) => {
    if (meshRef.current && changing) {
      const pulse = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 3.0);
      meshRef.current.children.forEach((child) => {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.4 + pulse * 0.6;
      });
    }
  });

  const barHeight = changing ? BAR_HEIGHT * 1.3 : BAR_HEIGHT;
  const radius = 0.04;

  if (yang) {
    return (
      <group ref={meshRef} position={position}>
        <RoundedBox
          args={[BAR_WIDTH, barHeight, BAR_DEPTH]}
          radius={radius}
          smoothness={2}
        >
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            metalness={0.1}
            roughness={0.6}
          />
        </RoundedBox>
      </group>
    );
  }

  // Yin: two segments with gap
  const segX = (SEGMENT_WIDTH + GAP_WIDTH) / 2;
  return (
    <group ref={meshRef} position={position}>
      <RoundedBox
        args={[SEGMENT_WIDTH, barHeight, BAR_DEPTH]}
        radius={radius}
        smoothness={2}
        position={[-segX, 0, 0]}
      >
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          metalness={0.1}
          roughness={0.6}
        />
      </RoundedBox>
      <RoundedBox
        args={[SEGMENT_WIDTH, barHeight, BAR_DEPTH]}
        radius={radius}
        smoothness={2}
        position={[segX, 0, 0]}
      >
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          metalness={0.1}
          roughness={0.6}
        />
      </RoundedBox>
    </group>
  );
}

function Hexagram({ yaos }: { yaos: number[] }) {
  return (
    <group>
      {yaos.map((yao, i) => {
        // yao 1 = bottom, yao 6 = top
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
      <group position={[-2.2, 0, 0]}>
        <Hexagram yaos={yaos} />
      </group>
      <group position={[2.2, 0, 0]}>
        {derivedYaos.map((yao, i) => {
          const y = (i - 2.5) * Y_SPACING;
          return (
            <YaoBar key={i} yao={yao} position={[0, y, 0]} derived />
          );
        })}
      </group>
      {/* Arrow between hexagrams */}
      <mesh position={[0, 0, 0]}>
        <coneGeometry args={[0.12, 0.3, 8]} />
        <meshStandardMaterial color={COLOR_CHANGING} emissive={EMISSIVE_CHANGING} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function Scene({ yaos, derivedYaos }: Hexagram3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const hasChanges = yaos.some(isChanging);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.3) * 0.15;
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} color="#ffeedd" />
      <directionalLight position={[-3, 4, -3]} intensity={0.3} color="#aaccff" />

      <group ref={groupRef}>
        {hasChanges && derivedYaos ? (
          <DualHexagram yaos={yaos} derivedYaos={derivedYaos} />
        ) : (
          <Hexagram yaos={yaos} />
        )}
      </group>

      {/* Base platform */}
      <mesh position={[0, -1.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.5, 64]} />
        <meshStandardMaterial
          color="#111111"
          metalness={0.5}
          roughness={0.3}
          transparent
          opacity={0.6}
        />
      </mesh>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={3}
        maxDistance={12}
        autoRotate
        autoRotateSpeed={0.8}
        maxPolarAngle={Math.PI * 0.75}
        minPolarAngle={Math.PI * 0.15}
      />
    </>
  );
}

export default function Hexagram3D({ yaos, derivedYaos }: Hexagram3DProps) {
  return (
    <div className="w-full aspect-square rounded-xl overflow-hidden border border-ink-700 bg-[#050505]">
      <Canvas
        camera={{ position: [0, 1, 5.5], fov: 40 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#050505"]} />
        <fog attach="fog" args={["#050505", 8, 18]} />
        <Scene yaos={yaos} derivedYaos={derivedYaos} />
      </Canvas>
    </div>
  );
}
