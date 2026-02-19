#!/bin/bash
set -euo pipefail

PROTO_DIR="$(cd "$(dirname "$0")/.." && pwd)/proto"
OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/generated/ts"

mkdir -p "$OUT_DIR"

echo "Generating TypeScript from proto files..."

PROTOS=$(find "$PROTO_DIR" -name "*.proto" -type f)

for proto in $PROTOS; do
  echo "  -> $(basename "$proto")"
done

npx grpc_tools_node_protoc \
  --proto_path="$PROTO_DIR" \
  --ts_out="$OUT_DIR" \
  --grpc_out="grpc_js:$OUT_DIR" \
  $PROTOS

echo "Done. Output: $OUT_DIR"
