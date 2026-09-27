#!/bin/sh
# Shrinks the built models in place: WebP textures (1024 px, 512 for small
# props), deduplicated data, solid colours merged into palettes. Models whose
# materials are recoloured at runtime keep their materials (no palette/join).
#   shared/tools/office/optimize.sh client/public/office
set -e
cd "$1"
SMALL=" fire_alarm succulent clock coffee_machine trash_bin microwave "
KEEP_MATERIALS=" vending_machine "
for f in *.glb; do
  n=${f%.glb}
  size=1024
  case "$SMALL" in *" $n "*) size=512 ;; esac
  extra=""
  case "$KEEP_MATERIALS" in *" $n "*) extra="--palette false --join false" ;; esac
  npx -y @gltf-transform/cli@4 optimize "$f" "/tmp/opt_$f" --compress false --texture-compress webp \
    --texture-size $size --simplify false --instance false --flatten false $extra >/dev/null
  mv "/tmp/opt_$f" "$f"
done
