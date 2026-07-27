#!/bin/bash
# MuSTeR Training Pipeline — runs on EC2 g4dn.xlarge
# Invoke via SSM send-command (always prefix with: export HOME=/root)
#
# Run from Orin NX:
#   CMD_ID=$(aws ssm send-command \
#     --instance-ids i-0231dba6961baefbc \
#     --document-name "AWS-RunShellScript" \
#     --parameters 'commands=["export HOME=/root && bash /root/Documents/workspace/profilesapp/muster_training/scripts/training_userdata.sh"]' \
#     --region us-west-1 --profile serrano-dev \
#     --query 'Command.CommandId' --output text)
#
# Poll:
#   until aws ssm get-command-invocation --command-id $CMD_ID \
#     --instance-id i-0231dba6961baefbc --region us-west-1 --profile serrano-dev \
#     --query 'Status' --output text | grep -qE 'Success|Failed'; do sleep 5; done
#
# Output:
#   aws ssm get-command-invocation --command-id $CMD_ID \
#     --instance-id i-0231dba6961baefbc --region us-west-1 --profile serrano-dev \
#     --query '{Status:Status,Out:StandardOutputContent,Err:StandardErrorContent}'

set -euo pipefail

export HOME=/root
export PATH="$HOME/.local/bin:$PATH"

LOGFILE="/var/log/muster_training.log"
exec > >(tee -a "$LOGFILE") 2>&1

REPO_DIR="/root/Documents/workspace/fusion_model_orin_nx_gpu"
BUCKET="galileo-muster-artifacts-559156180869"
CONFIG="configs/rf_meta_eo.yaml"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_PREFIX="checkpoints/run_$TIMESTAMP"

echo "===== MuSTeR Training Run: $TIMESTAMP ====="
echo "Instance: $(curl -s http://169.254.169.254/latest/meta-data/instance-id)"
echo "GPU: $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo 'GPU query failed')"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
echo "--- [1/7] Syncing code from GitHub ---"
if [ ! -d "$REPO_DIR/.git" ]; then
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone git@github.com:jose-galileo-space/fusion_model_orin_nx_gpu.git "$REPO_DIR"
else
  git -C "$REPO_DIR" pull origin main
fi
cd "$REPO_DIR"

# ── 2. Install dependencies ───────────────────────────────────────────────────
echo "--- [2/7] Installing dependencies ---"
pip3 install -e . --quiet

# ── 3. Sync training data from S3 ────────────────────────────────────────────
echo "--- [3/7] Syncing data from S3 ---"
aws s3 sync "s3://$BUCKET/data/" data/ --quiet && echo "Data synced from S3" || echo "No remote data yet"

# Only generate synthetic data if real data doesn't exist
SAMPLE_COUNT=$(find data/rf_meta_samples -name "*.npz" 2>/dev/null | wc -l)
if [ "$SAMPLE_COUNT" -lt 100 ]; then
  echo "Fewer than 100 real samples found ($SAMPLE_COUNT), generating synthetic data..."
  python3 scripts/make_synthetic_data.py \
    --out data/rf_meta_samples \
    --classes 8 --per-class 200 \
    --modalities rf_meta eo
else
  echo "Using $SAMPLE_COUNT real samples from S3."
fi

# ── 4. Train ──────────────────────────────────────────────────────────────────
echo "--- [4/7] Training ---"
python3 -m fusion.train --config "$CONFIG"

# ── 5. Compress (pruning + QAT + 2:4 sparsity) ───────────────────────────────
echo "--- [5/7] Compressing model ---"
python3 scripts/compress_model.py \
  --checkpoint runs/rf_meta_eo/best.pt \
  --data data/rf_meta_samples \
  --out runs/rf_meta_eo_compressed

# ── 6. Export ONNX ────────────────────────────────────────────────────────────
echo "--- [6/7] Exporting ONNX ---"
python3 - <<'PYEOF'
import torch
from fusion.infer import load_model
device = torch.device("cpu")
m, mods = load_model("runs/rf_meta_eo_compressed/compressed.pt", device)
dummy = {n: torch.randn(1, *mod.shape) for n, mod in mods.items()}
mask  = torch.ones(1, len(mods))
torch.onnx.export(m, (dummy, mask), "runs/rf_meta_eo_compressed/model.onnx", opset_version=17)
print("ONNX exported OK")
PYEOF

# ── 7. Push artifacts to S3 ──────────────────────────────────────────────────
echo "--- [7/7] Uploading artifacts to S3 ---"
aws s3 cp runs/rf_meta_eo/best.pt \
  "s3://$BUCKET/$RUN_PREFIX/best.pt" \
  --metadata "run=$TIMESTAMP,config=$CONFIG"

aws s3 cp runs/rf_meta_eo_compressed/compressed.pt \
  "s3://$BUCKET/$RUN_PREFIX/compressed.pt"

aws s3 cp runs/rf_meta_eo_compressed/model.onnx \
  "s3://$BUCKET/$RUN_PREFIX/model.onnx"

aws s3 cp "$LOGFILE" \
  "s3://$BUCKET/logs/run_$TIMESTAMP.log"

echo "===== Done. Artifacts at s3://$BUCKET/$RUN_PREFIX/ ====="
echo "Uploading best.pt triggers Lambda auto-stop."
