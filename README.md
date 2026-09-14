# 3D Interactive CT Anatomy Explorer

An interactive, browser-based 3D CT scan explorer designed for medical students, researchers, and developers. The application reconstructs 8 abdominal structures into interactive 3D meshes and keeps them synchronized in real time with radiological axial, coronal, and sagittal slice views.

![CT Explorer Demo](public/demo.gif)

---

## Features

- **Multi-Planar Reconstruction (MPR):** Fully synchronized Axial (transverse), Coronal, and Sagittal orthogonal slice views.
- **Real-Time Crosshair Synchronization:** Clicking or scrubbing any slice plane updates the other orthogonal views and 3D crosshair position instantly.
- **Interactive 3D Anatomical Meshes:** Reconstructed volumetric organ surfaces with individual selection, isolation, and transparency controls.
- **Radiological Conventions:** True clinical display conventions (patient right displayed on screen left for axial views / "viewed from the feet").
- **Optimized Cloud Asset Pipeline:** Processes a ~3 GB raw clinical dataset down to <20 MB web-ready binary slices and GLTF meshes via headless GitHub Actions[cite: 1].

---

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript[cite: 1]
- **3D Graphics:** Three.js, React Three Fiber (`@react-three/fiber`), Drei (`@react-three/drei`)[cite: 1]
- **State Management:** Zustand[cite: 1]
- **Data & Geometry Pipeline:** Python (NiBabel, NumPy, Scikit-Image, Trimesh)[cite: 1]
- **CI/CD & Hosting:** GitHub Actions, Vercel[cite: 1]

---

## Anatomy & Structures Segmented

The explorer extracts and displays 8 core abdominal structures[cite: 1]:

- Liver[cite: 1]
- Spleen[cite: 1]
- Stomach[cite: 1]
- Right Kidney[cite: 1]
- Left Kidney[cite: 1]
- Abdominal Aorta[cite: 1]
- Inferior Vena Cava (IVC)[cite: 1]
- Spine (Vertebral column union)[cite: 1]

---

## How It Works

1. **Volume Extraction & Reorientation:** Scans are loaded in Python and normalized to canonical orientation ($RAS+$ coordinates)[cite: 1].
2. **Hounsfield Unit (HU) Windowing:** Soft-tissue windowing (Level: 50, Width: 400, clipped to $[-150, 250]$ HU) is scaled to 8-bit unsigned integers to minimize transfer size[cite: 1].
3. **Surface Reconstruction:** Binary segmentations are processed via Marching Cubes, smoothed, decimated, and exported to `.glb` format[cite: 1].
4. **Binary Slice Streaming:** Volumetric data is served as raw binary buffers (`ct.bin`, `labels.bin`) and drawn dynamically onto HTML5 Canvases[cite: 1].

---

## Local Development

1. Clone the repository:
   ```bash
   git clone [https://github.com/](https://github.com/)<your-username>/ct-explorer.git
   cd ct-explorer/web
