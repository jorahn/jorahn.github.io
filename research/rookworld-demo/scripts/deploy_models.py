#!/usr/bin/env python3
"""
Deploy converted ONNX models to the demo directories
"""

import os
import shutil
import argparse
from pathlib import Path

def deploy_model(source_dir, target_dir, model_name):
    """Deploy a converted model to the demo directory"""
    print(f"Deploying {model_name} to {target_dir}...")

    try:
        # Create target directory
        os.makedirs(target_dir, exist_ok=True)

        # Required files for the demo
        required_files = {
            "model.onnx": "model.onnx",
            "tokenizer.json": "tokenizer.json",
            "config.json": "config.json",
            "special_tokens_map.json": "special_tokens_map.json",
            "tokenizer_config.json": "tokenizer_config.json"
        }

        copied_files = []
        missing_files = []

        for source_file, target_file in required_files.items():
            source_path = os.path.join(source_dir, source_file)
            target_path = os.path.join(target_dir, target_file)

            if os.path.exists(source_path):
                shutil.copy2(source_path, target_path)
                size_mb = os.path.getsize(target_path) / (1024 * 1024)
                copied_files.append(f"  ✅ {target_file} ({size_mb:.1f} MB)")
            else:
                missing_files.append(f"  ⚠️ {source_file} (not found)")

        print(f"📂 Copied files:")
        for file_info in copied_files:
            print(file_info)

        if missing_files:
            print(f"⚠️ Missing files:")
            for file_info in missing_files:
                print(file_info)

        # Verify essential files
        essential_files = ["model.onnx", "tokenizer.json", "config.json"]
        missing_essential = [f for f in essential_files if not os.path.exists(os.path.join(target_dir, f))]

        if missing_essential:
            print(f"❌ Missing essential files: {missing_essential}")
            return False

        print(f"✅ Successfully deployed {model_name}")
        return True

    except Exception as e:
        print(f"❌ Deployment failed for {model_name}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Deploy ONNX models to demo directories")
    parser.add_argument("--source-dir", default="./onnx_models", help="Source directory with ONNX models")
    parser.add_argument("--target-dir", default="../model", help="Target directory (demo model folder)")
    parser.add_argument("--models", nargs="+",
                       choices=["rook-lm", "rookworld-lm", "all"],
                       default=["all"],
                       help="Which models to deploy")

    args = parser.parse_args()

    # Check if source directory exists
    if not os.path.exists(args.source_dir):
        print(f"❌ Source directory {args.source_dir} not found")
        print("Please run convert_to_onnx.py first")
        return

    models_to_deploy = []

    if "all" in args.models or "rook-lm" in args.models:
        source_path = os.path.join(args.source_dir, "ROOK-LM-124M")
        target_path = os.path.join(args.target_dir, "ROOK-LM-124M")
        if os.path.exists(source_path):
            models_to_deploy.append((source_path, target_path, "ROOK-LM-124M"))
        else:
            print(f"⚠️ ROOK-LM-124M not found in {source_path}")

    if "all" in args.models or "rookworld-lm" in args.models:
        source_path = os.path.join(args.source_dir, "RookWorld-LM-124M")
        target_path = os.path.join(args.target_dir, "RookWorld-LM-124M")
        if os.path.exists(source_path):
            models_to_deploy.append((source_path, target_path, "RookWorld-LM-124M"))
        else:
            print(f"⚠️ RookWorld-LM-124M not found in {source_path}")

    if not models_to_deploy:
        print("❌ No valid models found to deploy")
        return

    print(f"Deploying {len(models_to_deploy)} models to demo directories...")

    success_count = 0
    total_size = 0

    for source_path, target_path, model_name in models_to_deploy:
        if deploy_model(source_path, target_path, model_name):
            success_count += 1
            # Calculate total size
            for file in os.listdir(target_path):
                file_path = os.path.join(target_path, file)
                if os.path.isfile(file_path):
                    total_size += os.path.getsize(file_path)

    total_size_mb = total_size / (1024 * 1024)

    print(f"\n📊 Deployed {success_count}/{len(models_to_deploy)} models successfully")
    print(f"📦 Total deployed size: {total_size_mb:.1f} MB")

    if success_count > 0:
        print(f"\n🎯 Demo ready at: http://localhost:8080/research/rookworld-demo/")
        print("The models should now load successfully in the demo!")

if __name__ == "__main__":
    main()