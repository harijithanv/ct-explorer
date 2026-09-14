import os
import glob
import numpy as np
import nibabel as nib

REQUIRED_MASKS = [
    "liver", "spleen", "stomach", "kidney_left", 
    "kidney_right", "aorta", "inferior_vena_cava"
]

def find_best_subject(raw_dir="data/raw"):
    subjects = [d for d in glob.glob(os.path.join(raw_dir, "s*")) if os.path.isdir(d)]
    best_subj, max_vol = None, 0

    for s in subjects:
        seg_dir = os.path.join(s, "segmentations")
        if not os.path.exists(seg_dir):
            continue

        # Check required masks exist
        available = [os.path.basename(f).replace(".nii.gz", "") for f in glob.glob(f"{seg_dir}/*.nii.gz")]
        if not all(m in available for m in REQUIRED_MASKS):
            continue

        total_vol = 0
        valid = True
        for m in REQUIRED_MASKS:
            mask_path = os.path.join(seg_dir, f"{m}.nii.gz")
            img = nib.as_closest_canonical(nib.load(mask_path))
            data = img.get_fdata()
            if data.sum() == 0 or (data[:, :, 0].sum() > 0 or data[:, :, -1].sum() > 0):
                valid = False
                break
            total_vol += data.sum()

        if valid and total_vol > max_vol:
            max_vol = total_vol
            best_subj = s

    if not best_subj:
        raise RuntimeError("No qualifying subject found.")

    with open("pipeline/chosen_subject.txt", "w") as f:
        f.write(best_subj)
    print(f"Selected: {best_subj}")

if __name__ == "__main__":
    find_best_subject()
