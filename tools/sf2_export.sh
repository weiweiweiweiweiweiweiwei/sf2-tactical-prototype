#!/bin/sh
# v64y one SF2 gun's raw assets for tools/sf2_rig_build.mjs (the gun loop, docs/loop/GUNS.md) from the user's install via UModel:
#   sh tools/sf2_export.sh <id> <pkg> <Sound_pkg> [<pkg>_texture …]   → tools/out/sf2/<id>/ (glTF + png + sounds), <id>_anim/ (psk, psa, props)
#   sh tools/sf2_export.sh --part <pkg> <object> [<texture pkg> <texture> …]  → tools/out/sf2/parts/, parts_props/ (a scope, a sight)
cd "$(dirname "$0")/out/umodel_win32" || exit 1
P="-game=sf2 -path=D:/SpecialForce2/SFGame/CookedPCConsole"
if [ "$1" = "--part" ]; then
  pkg=$2; obj=$3; shift 3
  ./umodel_64.exe $P -export -gltf -png -out=../sf2/parts "$pkg" "$obj" > /dev/null 2>&1
  ./umodel_64.exe $P -export -psk -out=../sf2/parts_props "$pkg" "$obj" > /dev/null 2>&1
  while [ $# -ge 2 ]; do ./umodel_64.exe $P -export -png -out=../sf2/parts "$1" "$2" > /dev/null 2>&1; shift 2; done
  ls ../sf2/parts/"$pkg"/SkeletalMesh3/"$obj".gltf; exit 0
fi
id=$1; pkg=$2; snd=$3; shift 3
./umodel_64.exe $P -export -gltf -png -out=../sf2/$id "$pkg" > ../sf2/${id}_mesh.log 2>&1
for t in "$@"; do ./umodel_64.exe $P -export -png -out=../sf2/$id "$t" >> ../sf2/${id}_mesh.log 2>&1; done
./umodel_64.exe $P -export -psk -out=../sf2/${id}_anim "$pkg" > ../sf2/${id}_anim.log 2>&1
[ -n "$snd" ] && ./umodel_64.exe $P -export -sounds -out=../sf2/$id "$snd" > ../sf2/${id}_sound.log 2>&1
echo "== $id"; find ../sf2/$id/"$pkg" -name "*.gltf" | grep -v _3rd | sed 's#.*/##' | tr '\n' ' '; echo
find ../sf2/${id}_anim -name "*.psa" | sed 's#.*/##' | tr '\n' ' '; echo; find ../sf2/$id -name "*.ogg" | wc -l
