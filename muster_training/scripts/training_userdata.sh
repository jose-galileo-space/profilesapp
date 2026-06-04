#!/bin/bash
# MuSTeR Training Script — runs on EC2 g4dn.xlarge via SSM Run Command
# Triggered manually: aws ec2 start-instances ... then aws ssm send-command ...
# Auto-stops the instance by uploading a checkpoint to S3 (Lambda fires on upload)
#
# Usage:
#   aws ssm send-command \
#     --instance-ids i-0231dba6961baefbc \
#     --document-name "AWS-RunShellScript" \
#     --parameters commands=["bash /opt/muster/training_userdata.sh"] \
#     --region us-west-1 --profile serrano-dev

set -euo pipefail
LOGFILE="/var/log/muster_training.log"
exec > >(tee -a "$LOGFILE") 2>&1

REPO_DIR="/opt/muster/fusion_model_orin_nx_gpu"
BUCKET="galileo-muster-artifacts-559156180869"
CONFIG="configs/rf_meta_eo.yaml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "===== MuSTeR Training Run: $TIMESTAMP ====="

# ── 1. Pull latest code ───────────────────────────────────────────
if [ ! -d "$REPO_DIR" ]; then
  mkdir -p /opt/muster
  git clone git@github.com:jose-galileo-space/fusion_model_orin_nx_gpu.git "$REPO_DIR"
else
  git -C "$REPO_DIR" pull origin main
fi
cd "$REPO_DIR"

# ── 2. Install dependencies ───────────────────────────────────────
pip3 install -e . --quiet

# ── 3. Pull latest data from S3 (if real data exists) ────────────
aws s3 sync "s3://$BUCKET/data/" data/ --quiet || echo "No remote data yet, using synthetic"

# ── 4. Generate synthetic data (always refresh) ──────────────────
python3 scripts/make_synthetic_data.py \
  --out data/rf_meta_samples \
  --classes 8 --per-class 200 \
  --modalities rf_meta eo

# ── 5. Train ──────────────────────────────────────────────────────
python3 -m fusion.train --config "$CONFIG"

# ── 6. Compress (pruning + QAT + 2:4 sparsity) ───────────────────
python3 scripts/compress_model.py \
  --checkpoint runs/rf_meta_eo/best.pt \
  --data data/rf_meta_samples \
  --out runs/rf_meta_eo_compressed

# ── 7. Export ONNX ────────────────────────────────────────────────
python3 - <<'PYEOF'
import torch
from fusion.infer import load_model
device = torch.device("cpu")
m, mods = load_model("runs/rf_meta_eo_compressed/compressed.pt", device)
dummy = {n: torch.randn(1, *mod.shape) for n, mod in mods.items()}
mask  = torch.ones(1, len(mods))
torch.onnx.export(m, (dummy, mask), "runs/rf_meta_eo_compressed/model.onnx", opset_version=17)
print("ONNX exported")
PYEOF

# ── 8. Push artifacts to S3 ───────────────────────────────────────
RUN_PREFIX="checkpoints/run_$TIMESTAMP"

aws s3 cp runs/rf_meta_eo/best.pt \
  "s3://$BUCKET/$RUN_PREFIX/best.pt" \
  --metadata "run=$TIMESTAMP,config=$CONFIG"

aws s3 cp runs/rf_meta_eo_compressed/compressed.pt \
  "s3://$BUCKET/$RUN_PREFIX/compressed.pt"

aws s3 cp runs/rf_meta_eo_compressed/model.onnx \
  "s3://$BUCKET/$RUN_PREFIX/model.onnx"

aws s3 cp "$LOGFILE" \
  "s3://$BUCKET/logs/run_$TIMESTAMP.log"

# Uploading best.pt triggers the Lambda auto-stop.
echo "===== Training complete. Instance will stop shortly. ====="
