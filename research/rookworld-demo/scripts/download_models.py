#!/usr/bin/env python3
"""
Download ROOK-LM and RookWorld-LM models from HuggingFace
"""

import os
from huggingface_hub import snapshot_download
import argparse

def download_model(repo_id, local_dir):
    """Download a model from HuggingFace Hub"""
    print(f"Downloading {repo_id} to {local_dir}...")

    try:
        snapshot_download(
            repo_id=repo_id,
            local_dir=local_dir,
            ignore_patterns=["*.bin", "*.safetensors.index.json", "pytorch_model.bin.index.json"],
            local_dir_use_symlinks=False
        )
        print(f"✅ Successfully downloaded {repo_id}")
        return True
    except Exception as e:
        print(f"❌ Failed to download {repo_id}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Download RookWorld models from HuggingFace")
    parser.add_argument("--output-dir", default="./temp_models", help="Output directory for downloads")
    parser.add_argument("--models", nargs="+",
                       choices=["rook-lm", "rookworld-lm", "all"],
                       default=["all"],
                       help="Which models to download")

    args = parser.parse_args()

    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)

    models_to_download = []

    if "all" in args.models or "rook-lm" in args.models:
        models_to_download.append({
            "repo_id": "jrahn/ROOK-LM-124M",
            "local_dir": os.path.join(args.output_dir, "ROOK-LM-124M")
        })

    if "all" in args.models or "rookworld-lm" in args.models:
        models_to_download.append({
            "repo_id": "jrahn/RookWorld-LM-124M",
            "local_dir": os.path.join(args.output_dir, "RookWorld-LM-124M")
        })

    success_count = 0
    for model in models_to_download:
        if download_model(model["repo_id"], model["local_dir"]):
            success_count += 1

    print(f"\n📊 Downloaded {success_count}/{len(models_to_download)} models successfully")

    if success_count > 0:
        print(f"\n📂 Models saved to: {os.path.abspath(args.output_dir)}")
        print("Next steps:")
        print("1. Run convert_to_onnx.py to convert to ONNX format")
        print("2. Run deploy_models.py to copy to demo directories")

if __name__ == "__main__":
    main()