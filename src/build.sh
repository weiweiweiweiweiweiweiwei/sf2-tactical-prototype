#!/bin/sh
# Concatenate the part files into one playable HTML (default: ../index.html) and syntax-check the script with node.
cd "$(dirname "$0")"
OUT="${1:-../index.html}"
PARTS="01_core.js 02_audio.js 03_textures.js 04_collision.js 05_physics_fx.js 06_mapbuilder.js 07_maps.js 07r_ryokan.js 07s_skycity.js 08_nav_input.js 09_models.js 09b_gunparts.js 10_weapons.js 11_weaponsystem.js 12_player.js 12b_cmd.js 13_bots.js 13b_netplayers.js 14_hud.js 14b_emblems.js 15_postfx.js 15b_rules.js 16_match.js 18_net.js 18b_online.js 18c_room.js 18d_friends.js"
cat 00_head.html $PARTS 17_app.js > "$OUT"
CHK="${TMPDIR:-/tmp}/sf2_check.mjs"
cat $PARTS > "$CHK"
sed -n '1,/^<\/script>/p' 17_app.js | grep -v "^</script>" >> "$CHK"
node --check "$CHK" && echo BUILD_OK
