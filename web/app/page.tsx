'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { create } from 'zustand';

// Zustand store for syncing 3D & 2D slices
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

const ORGAN_COLORS: Record<string, string> = {
  liver: '#D88A9C',
  spleen: '#B6A6D3',
  stomach: '#E6A88E',
  kidney_right: '#EB7A6F',
  kidney_left: '#E5625E',
  aorta: '#F05D7A',
  inferior_vena_cava: '#9CB2E0',
  spine: '#FFF4E0',
};

function OrganModel({ name }: { name: string }) {
  const { scene } = useGLTF(`/data/meshes/${name}.glb`);
  const { selectedOrgan, setSelectedOrgan, setCrosshair, meta } = useExplorerStore();
  const isSelected = selectedOrgan === name;

  return (
    <primitive
      object={scene.clone()}
      onClick={(e: any) => {
        e.stopPropagation();
        setSelectedOrgan(name);
        if (meta?.labels) {
          const item = Object.values(meta.labels).find((l: any) => l.name === name) as any;
          if (item) setCrosshair([Math.round(item.centroid[0]), Math.round(item.centroid[1]), Math.round(item.centroid[2])]);
        }
      }}
    >
      <meshStandardMaterial
        color={ORGAN_COLORS[name] || '#ffffff'}
        transparent
        opacity={isSelected || !selectedOrgan ? 0.9 : 0.25}
      />
    </primitive>
  );
}

function SliceCanvas({ type, ctBuffer, labelsBuffer }: { type: 'axial' | 'coronal' | 'sagittal'; ctBuffer: Uint8Array | null; labelsBuffer: Uint8Array | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { meta, crosshair, setCrosshair } = useExplorerStore();

  useEffect(() => {
    if (!meta || !ctBuffer || !canvasRef.current) return;
    const [ni, nj, nk] = meta.shape;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0, height = 0;
    if (type === 'axial') { width = ni; height = nj; }
    else if (type === 'coronal') { width = ni; height = nk; }
    else { width = nj; height = nk; }

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
        const val = ctBuffer[idx] || 0;
        const pIdx = (row * width + col) * 4;
        imgData.data[pIdx] = val;
        imgData.data[pIdx + 1] = val;
        imgData.data[pIdx + 2] = val;
        imgData.data[pIdx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }, [meta, crosshair, ctBuffer, type]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      <div style={{ position: 'absolute', bottom: 6, left: 6, fontSize: 11, color: '#C9A9B4' }}>
        {type.toUpperCase()}
      </div>
    </div>
  );
}

export default function Page() {
  const { meta, setMeta, setCrosshair, selectedOrgan, setSelectedOrgan, visibleOrgans } = useExplorerStore();
  const [ctBuffer, setCtBuffer] = useState<Uint8Array | null>(null);
  const [labelsBuffer, setLabelsBuffer] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const metaRes = await fetch('/data/meta.json');
        const metaJson = await metaRes.json();
        setMeta(metaJson);

        const [ctRes, lblRes] = await Promise.all([
          fetch('/data/ct.bin'),
          fetch('/data/labels.bin'),
        ]);

        const ctBuf = await ctRes.arrayBuffer();
        const lblBuf = await lblRes.arrayBuffer();

        setCtBuffer(new Uint8Array(ctBuf));
        setLabelsBuffer(new Uint8Array(lblBuf));

        setCrosshair([
          Math.floor(metaJson.shape[0] / 2),
          Math.floor(metaJson.shape[1] / 2),
          Math.floor(metaJson.shape[2] / 2),
        ]);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load assets', err);
      }
    }
    loadData();
  }, [setMeta, setCrosshair]);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#1A0D14', color: '#FCE4EC', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: 240, borderRight: '1px solid #3A1C2B', padding: 16, background: '#2A1520', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 'bold', margin: '0 0 8px 0', color: '#E8447A' }}>Organs</h2>
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
              borderRadius: 4,
              background: selectedOrgan === name ? '#E8447A' : 'transparent',
              color: selectedOrgan === name ? '#FFFFFF' : '#FCE4EC',
              border: '1px solid #3A1C2B',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {name.replace('_', ' ')}
          </button>
        ))}
        <div style={{ marginTop: 'auto', fontSize: 10, color: '#C9A9B4', borderTop: '1px solid #3A1C2B', paddingTop: 8 }}>
          TotalSegmentator CT data (CC BY 4.0). For learning only, not for diagnosis.
        </div>
      </aside>

      {/* Grid Layout: 3D Top-Left, 2D Slices in remaining quadrants */}
      <main style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 2, background: '#3A1C2B' }}>
        <div style={{ background: '#1A0D14', position: 'relative' }}>
          <Canvas camera={{ position: [0, 0, 450], fov: 45 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[100, 100, 100]} intensity={1} />
            <OrbitControls />
            {meta && visibleOrgans.map((name) => (
              <OrganModel key={name} name={name} />
            ))}
          </Canvas>
          <div style={{ position: 'absolute', top: 12, left: 12, fontSize: 18, color: '#E8447A' }}>
            {selectedOrgan ? selectedOrgan.replace('_', ' ') : '3D View'}
          </div>
        </div>

        <SliceCanvas type="axial" ctBuffer={ctBuffer} labelsBuffer={labelsBuffer} />
        <SliceCanvas type="coronal" ctBuffer={ctBuffer} labelsBuffer={labelsBuffer} />
        <SliceCanvas type="sagittal" ctBuffer={ctBuffer} labelsBuffer={labelsBuffer} />
      </main>
    </div>
  );
}
