#!/bin/sh
# v62s src/ is ES modules (src/main.js lists the parts in order): tools/build.mjs bundles them with esbuild into one HTML
# (default: ../index.html) that still opens by double-click.
cd "$(dirname "$0")/.."
node tools/build.mjs "${1:-index.html}"
