"""Per-map settings for tools/blender/skulltown_build.py / skulltown_export.py (pick one with  -- --map <name>).
center: source metres put at the origin; crop: x0 x1 y0 y1 (source metres, around the centre) of what is built;
inner: half size of the fine (4096²) lightmap region; play: game-axis play bounds (None: the official spawns ± 25 m)."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
A = ROOT / 'tools/out/apex'  # (RSX exports: models, map lumps)
M = ROOT / 'maps'  # (v66b each map's work folder — its .blend files — lives with the map: maps/apex-<map>/work)
MAPS = {
    'skulltown': dict(stem='mp_rr_freedm_skulltown', maps=M / 'apex-skulltown/work/wrap/maps', models=M / 'apex-skulltown/work/full/mdl', work=M / 'apex-skulltown/work',
                      center=(-41.0, -10.0, 0.0), crop=(-330.0, 250.0, -300.0, 280.0), inner=150.0, play=None),
    # the firing range (mp_rr_canyonlands_staging_mu1): the canyon the old box-collision map covered, centred on its reachable area
    'range': dict(stem='mp_rr_canyonlands_staging_mu1', maps=A / 'map-data/wrap/maps', models=A / 'full-models/mdl', work=M / 'apex-range/work',
                  center=(-145.0, 51.0, 0.0), crop=(-545.0, 255.0, -455.0, 345.0), inner=175.0, play=dict(minX=-165, maxX=165, minZ=-140, maxZ=140)),
}


def pick():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    name = args[args.index('--map') + 1] if '--map' in args else 'skulltown'
    cfg = dict(MAPS[name], name=name); cfg['work'].mkdir(parents=True, exist_ok=True)
    return cfg
