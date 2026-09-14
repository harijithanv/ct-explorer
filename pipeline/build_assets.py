import os, json
import numpy as np
import nibabel as nib
from skimage import measure
import trimesh

with open("pipeline/chosen_subject.txt") as f:
    subj_dir = f.read().strip()

out_dir = "web/public/data"
mesh_dir = os.path.join(out_dir, "meshes")
os.makedirs(mesh_dir, exist_ok=True)

LABEL_MAP = {
    1: "liver", 2: "spleen", 3: "stomach", 
    4: "kidney_right", 5: "kidney_left", 
    6: "aorta", 7: "inferior_vena_cava"
}

ct_img = nib.as_closest_canonical(nib.load(os.path.join(subj_dir, "ct.nii.gz")))
spacing = [float(x) for x in ct_img.header.get_zooms()[:3]]
ct_data = ct_img.get_fdata()

labels = np.zeros(ct_data.shape, dtype=np.uint8)
for idx, name in LABEL_MAP.items():
    p = os.path.join(subj_dir, "segmentations", f"{name}.nii.gz")
    if os.path.exists(p):
        data = nib.as_closest_canonical(nib.load(p)).get_fdata()
        labels[data > 0] = idx

# Add spine (union of vertebrae)
vert_files = glob.glob(os.path.join(subj_dir, "segmentations", "vertebrae_*.nii.gz"))
for vf in vert_files:
    labels[nib.as_closest_canonical(nib.load(vf)).get_fdata() > 0] = 8
LABEL_MAP[8] = "spine"

# Crop bounding box + 20mm margin
coords = np.argwhere(labels > 0)
margin = [int(np.ceil(20 / s)) for s in spacing]
min_c = np.maximum(coords.min(axis=0) - margin, 0)
max_c = np.minimum(coords.max(axis=0) + margin + 1, labels.shape)

ct_cropped = ct_data[min_c[0]:max_c[0], min_c[1]:max_c[1], min_c[2]:max_c[2]]
labels_cropped = labels[min_c[0]:max_c[0], min_c[1]:max_c[1], min_c[2]:max_c[2]]

# Window HU [-150, 250] to 0-255 uint8
ct_win = np.clip((ct_cropped + 150) / 400.0 * 255.0, 0, 255).astype(np.uint8)
ct_win.tofile(os.path.join(out_dir, "ct.bin"))
labels_cropped.astype(np.uint8).tofile(os.path.join(out_dir, "labels.bin"))

vol_center = (np.array(ct_cropped.shape) * np.array(spacing)) / 2.0
meta = {
    "shape": list(ct_cropped.shape),
    "spacing_mm": spacing,
    "labels": {}
}

for idx, name in LABEL_MAP.items():
    mask = labels_cropped == idx
    if not mask.any(): continue
    meta["labels"][idx] = {
        "name": name,
        "centroid": [float(c) for c in np.argwhere(mask).mean(axis=0)]
    }
    verts, faces, _, _ = measure.marching_cubes(mask, spacing=spacing)
    verts[:, 0] = -(verts[:, 0] - vol_center[0])
    verts[:, 1] = verts[:, 2] - vol_center[2]
    verts[:, 2] = verts[:, 1] - vol_center[1]
    mesh = trimesh.Trimesh(vertices=verts, faces=faces)
    mesh.export(os.path.join(mesh_dir, f"{name}.glb"))

with open(os.path.join(out_dir, "meta.json"), "w") as f:
    json.dump(meta, f)
