#!/usr/bin/env bash
set -euo pipefail
VERSION="v0.52.0"
OUTDIR="src/tools/k6"
mkdir -p "$OUTDIR"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"   # darwin o linux
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) A="amd64" ;;
  arm64|aarch64) A="arm64" ;;
  *) echo "Arquitectura no soportada: $ARCH"; exit 1 ;;
esac

if [ "$OS" = "darwin" ]; then
  PKG="k6-$VERSION-macos-$A.zip"
  URL="https://github.com/grafana/k6/releases/download/$VERSION/$PKG"
  curl -L "$URL" -o "$OUTDIR/k6.zip"
  unzip -o "$OUTDIR/k6.zip" -d "$OUTDIR"
  rm "$OUTDIR/k6.zip"
  mv "$OUTDIR/k6-$VERSION-macos-$A/k6" "$OUTDIR/k6"
  rm -rf "$OUTDIR/k6-$VERSION-macos-$A"
else
  PKG="k6-$VERSION-linux-$A.tar.gz"
  URL="https://github.com/grafana/k6/releases/download/$VERSION/$PKG"
  curl -L "$URL" -o "$OUTDIR/k6.tgz"
  tar -C "$OUTDIR" -xzf "$OUTDIR/k6.tgz"
  rm "$OUTDIR/k6.tgz"
  mv "$OUTDIR/k6-$VERSION-linux-$A/k6" "$OUTDIR/k6"
  rm -rf "$OUTDIR/k6-$VERSION-linux-$A"
fi

chmod +x "$OUTDIR/k6"
echo "Listo. Binario en src/tools/k6/k6"
