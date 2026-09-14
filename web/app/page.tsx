'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';

interface ExplorerState {
  crosshair: [number, number, number];
  selectedOrgan: string | null;
  visibleOrgans: string[];
  meta: any;
  setCrosshair: (coords: [number, number, number]) => void;
  setSelectedOrgan: (organ: string | null) => void;
  setMeta: (meta: any) => void;
}

const useExplorerStore = create<ExplorerState>((set) => ({
  crosshair: [0, 0, 0],
  selectedOrgan: null,
  visibleOrgans: ['liver', 'spleen', 'stomach', 'kidney_right', 'kidney_left', 'aorta', 'inferior_vena_cava', 'spine'],
  meta: null,
  setCrosshair: (crosshair) => set({ crosshair }),
  setSelectedOrgan: (selectedOrgan) => set({ selectedOrgan }),
  setMeta: (meta) => set({ meta }),
}));

// Soft pastel radiology colors
const ORGAN_COLORS: Record<string, string> = {
  liver: '#E890A5',
  spleen: '#C2B0E8',
  stomach: '#F7B499',
  kidney_right: '#FF8878',
  kidney_left: '#F9736E',
  aorta: '#FF5E82',
  inferior_vena_cava: '#9CB9F8',
  spine: '#FFF6E8',
};

function OrganModel({ name }: { name: string }) {
  const { scene } = useGLTF(`/data/meshes/${name}.glb`);
  const { selectedOrgan, setSelectedOrgan, setCrosshair, meta } = useExplorerStore();
  const isSelected = selectedOrgan === name;

  const cloned = useMemo(() => {
    const c = scene.clone();
    const hex = ORGAN_COLORS[name] || '#ffffff';

    c.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        // Force accurate surface normals to create true 3D contour shadows & highlights
        child.geometry.computeVertexNormals();

        // MeshPhongMaterial provides distinct specular highlights and 3D volume
        child.material = new THREE.MeshPhongMaterial({
          color: new THREE.Color(hex),
          emissive: isSelected ? new THREE.Color(hex).multiplyScalar(0.45) : new THREE.Color(0x11080d),
          specular: new THREE.Color(0xffffff),
          shininess: isSelected ? 80 : 35,
          transparent: true,
          opacity: isSelected ? 1.0 : selectedOrgan ? 0.22 : 0.85,
          side: THREE.DoubleSide,
        });
      }
    });
    return c;
  }, [scene, name, isSelected, selectedOrgan]);

  return (
    <primitive
      object={cloned}
      onClick={(e: any) => {
        e.stopPropagation();
        setSelectedOrgan(name);
        if (meta?.labels) {
          const item = Object.values(meta.labels).find((l: any) => l.name === name) as any;
          if (item) {
            setCrosshair([
              Math.round(item.centroid[0]),
              Math.round(item.centroid[1]),
              Math.round(item.centroid[2]),
            ]);
          }
        }
      }}
    />
  );
}

function SliceCanvas({ type, ctBuffer }: { type: 'axial' | 'coronal' | 'sagittal'; ctBuffer: Uint8Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { meta, crosshair, setCrosshair } = useExplorerStore();
  const isDragging = useRef(false);

  const updateCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!meta || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const [ni, nj, nk] = meta.shape;

    const width = (type === 'axial' || type === 'coronal') ? ni : nj;
    const height = (type === 'axial') ? nj : nk;

    const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);

    let [ci, cj, ck] = crosshair;
    if (type === 'axial') {
      ci = ni - 1 - x;
      cj = nj - 1 - y;
    } else if (type === 'coronal') {
      ci = ni - 1 - x;
      ck = nk - 1 - y;
    } else {
      cj = nj - 1 - x;
      ck = nk - 1 - y;
    }

    setCrosshair([
      Math.max(0, Math.min(ni - 1, ci)),
      Math.max(0, Math.min(nj - 1, cj)),
      Math.max(0, Math.min(nk - 1, ck)),
    ]);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!meta) return;
    const [ni, nj, nk] = meta.shape;
    const delta = e.deltaY > 0 ? 1 : -1;
    let [ci, cj, ck] = crosshair;

    if (type === 'axial') {
      ck = Math.max(0, Math.min(nk - 1, ck + delta));
    } else if (type === 'coronal') {
      cj = Math.max(0, Math.min(nj - 1, cj + delta));
    } else {
      ci = Math.max(0, Math.min(ni - 1, ci + delta));
    }
    setCrosshair([ci, cj, ck]);
  };

  useEffect(() => {
    if (!meta || !ctBuffer || !canvasRef.current) return;
    const [ni, nj, nk] = meta.shape;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (type === 'axial' || type === 'coronal') ? ni : nj;
    let height = (type === 'axial') ? nj : nk;

    canvas.width = width;
    canvas.height = height;
    const imgData = ctx.createImageData(width, height);
    const [ci, cj, ck] = crosshair;

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        let i = 0, j = 0, k = 0;
        if (type === 'axial') {
          i = ni - 1 - col;
          j = nj - 1 - row;
          k = ck;
        } else if (type === 'coronal') {
          i = ni - 1 - col;
          j = cj;
          k = nk - 1 - row;
        } else {
          i = ci;
          j = nj - 1 - col;
          k = nk - 1 - row;
        }

        const idx = i * nj * nk + j * nk + k;
        const val = ctBuffer[idx] !== undefined ? ctBuffer[idx] : 0;
        const pIdx = (row * width + col) * 4;
        imgData.data[pIdx] = val;
        imgData.data[pIdx + 1] = val;
        imgData.data[pIdx + 2] = val;
        imgData.data[pIdx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Crosshair overlay
    ctx.strokeStyle = '#E8447A';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (type === 'axial') {
      const cx = ni - 1 - ci;
      const cy = nj - 1 - cj;
      ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
      ctx.moveTo(0, cy); ctx.lineTo(width, cy);
    } else if (type === 'coronal') {
      const cx = ni - 1 - ci;
      const cy = nk - 1 - ck;
      ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
      ctx.moveTo(0, cy); ctx.lineTo(width, cy);
    } else {
      const cx = nj - 1 - cj;
      const cy = nk - 1 - ck;
      ctx.moveTo(cx, 0); ctx.lineTo(cx, height);
      ctx.moveTo(0, cy); ctx.lineTo(width, cy);
    }
    ctx.stroke();
  }, [meta, crosshair, ctBuffer, type]);

  let sliceIndex = 0;
  let sliceMax = 0;
  if (meta) {
    if (type === 'axial') { sliceIndex = crosshair[2]; sliceMax = meta.shape[2]; }
    else if (type === 'coronal') { sliceIndex = crosshair[1]; sliceMax = meta.shape[1]; }
    else { sliceIndex = crosshair[0]; sliceMax = meta.shape[0]; }
  }

  return (
    <div
      onWheel={handleWheel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        background: '#090407',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={(e) => { isDragging.current = true; updateCoords(e); }}
        onMouseMove={(e) => { if (isDragging.current) updateCoords(e); }}
        onMouseUp={() => { isDragging.current = false; }}
        onMouseLeave={() => { isDragging.current = false; }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          cursor: 'crosshair',
          imageRendering: 'pixelated',
        }}
      />
      <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 11, color: '#C9A9B4', background: 'rgba(26,13,20,0.85)', padding: '2px 8px', borderRadius: 4, border: '1px solid #3A1C2B' }}>
        {type.toUpperCase()} • Slice {sliceIndex + 1}/{sliceMax}
      </div>
      <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, color: '#8E7380', background: 'rgba(26,13,20,0.7)', padding: '2px 6px', borderRadius: 3 }}>
        Scroll to scrub
      </div>
    </div>
  );
}

export default function Page() {
  const { meta, setMeta, setCrosshair, selectedOrgan, setSelectedOrgan, visibleOrgans } = useExplorerStore();
  const [ctBuffer, setCtBuffer] = useState<Uint8Array | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const metaRes = await fetch('/data/meta.json');
        const metaJson = await metaRes.json();
        setMeta(metaJson);

        const ctRes = await fetch('/data/ct.bin');
        const ctBuf = await ctRes.arrayBuffer();
        setCtBuffer(new Uint8Array(ctBuf));

        setCrosshair([
          Math.floor(metaJson.shape[0] / 2),
          Math.floor(metaJson.shape[1] / 2),
          Math.floor(metaJson.shape[2] / 2),
        ]);
      } catch (err) {
        console.error('Failed to load assets', err);
      }
    }
    loadData();
  }, [setMeta, setCrosshair]);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#1A0D14', color: '#FCE4EC', overflow: 'hidden' }}>
      {/* Organ List Sidebar */}
      <aside style={{ width: 230, minWidth: 230, borderRight: '1px solid #3A1C2B', padding: 16, background: '#2A1520', display: 'flex', flexDirection: 'column', gap: 6, boxSizing: 'border-box' }}>
        <h2 style={{ fontSize: 15, fontWeight: 'bold', margin: '0 0 10px 0', color: '#E8447A' }}>Organs</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          {visibleOrgans.map((name) => (
            <button
              key={name}
              onClick={() => {
                setSelectedOrgan(name);
                if (meta?.labels) {
                  const item = Object.values(meta.labels).find((l: any) => l.name === name) as any;
                  if (item) setCrosshair([Math.round(item.centroid[0]), Math.round(item.centroid[1]), Math.round(item.centroid[2])]);
                }
              }}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderRadius: 5,
                background: selectedOrgan === name ? '#E8447A' : 'transparent',
                color: selectedOrgan === name ? '#FFFFFF' : '#FCE4EC',
                border: '1px solid #3A1C2B',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: selectedOrgan === name ? 600 : 400,
                textTransform: 'capitalize',
                transition: 'all 0.15s ease',
              }}
            >
              {name.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 'auto', fontSize: 10, color: '#C9A9B4', borderTop: '1px solid #3A1C2B', paddingTop: 8, lineHeight: 1.4 }}>
          TotalSegmentator CT data (CC BY 4.0). For learning only, not for diagnosis.
        </div>
      </aside>

      {/* 2x2 Viewport Matrix */}
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 2, background: '#3A1C2B', height: '100vh', width: 'calc(100vw - 230px)', boxSizing: 'border-box', overflow: 'hidden' }}>
        {/* 3D Anatomical Canvas */}
        <div style={{ background: '#1A0D14', position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <Canvas camera={{ position: [120, -180, 280], fov: 45, up: [0, 0, 1] }}>
            {/* Multi-angle cinematic key & fill lights */}
            <ambientLight intensity={1.4} />
            <directionalLight position={[200, 300, 400]} intensity={2.8} />
            <directionalLight position={[-200, -300, 200]} intensity={1.5} color="#E890A5" />
            <pointLight position={[0, 0, 300]} intensity={2.0} />
            <OrbitControls enableDamping dampingFactor={0.05} />
            {meta && visibleOrgans.map((name) => (
              <OrganModel key={name} name={name} />
            ))}
          </Canvas>
          <div style={{ position: 'absolute', top: 10, left: 10, fontSize: 15, color: '#E8447A', background: 'rgba(26,13,20,0.85)', padding: '3px 8px', borderRadius: 4, border: '1px solid #3A1C2B' }}>
            {selectedOrgan ? selectedOrgan.replace(/_/g, ' ') : '3D View'}
          </div>
        </div>

        <SliceCanvas type="axial" ctBuffer={ctBuffer} />
        <SliceCanvas type="coronal" ctBuffer={ctBuffer} />
        <SliceCanvas type="sagittal" ctBuffer={ctBuffer} />
      </main>
    </div>
  );
}
