# v51 FN P90 — first-person model built with tools/blender/gunlib.py in the game's GUN SPACE.
# Real proportions ×1.0 (500 mm long, 263 mm barrel, 55 mm wide): bullpup shell in tan over a black lower frame with the two
# thumbholes (rear one for the firing hand, front one for the support hand), the 50-round translucent magazine lying flat on
# top with the rounds crosswise in two staggered rows (node 'mag'; its pivot MAGPIV is the FRONT end: the rear lifts first,
# then it slides back off), the ring-sight housing that bridges over the magazine, ambidextrous charging handles under the
# sight (node 'charge'), short barrel and slotted flash hider.
# Bore axis at v = 0; the firing hand sits on u −0.078 / v −0.082 like every viewmodel; the support hand on SUPPORT.
# blender -b --factory-startup -P tools/blender/p90_build.py -- tools/guns/p90.glb
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gunlib import *

OUT = out_path('tools/guns/p90.glb')

# =============================================================================================== layout (metres)
BUTT, NOSE = -0.25, 0.165         # shell rear / front
W = 0.055                          # body width
STOP, SBOT = 0.032, -0.042         # upper shell top (magazine rests on it) / bottom
MG0, MG1, MT = -0.19, 0.15, 0.03   # magazine rear / front / thickness
SIGHT_V = STOP + MT + 0.026        # sight axis

# =============================================================================================== upper shell (tan)
prof('shell', [(BUTT, SBOT + 0.01), (BUTT + 0.006, STOP - 0.01), (BUTT + 0.03, STOP), (NOSE - 0.03, STOP), (NOSE, STOP - 0.018), (NOSE + 0.008, -0.01), (NOSE, SBOT), (BUTT + 0.012, SBOT)],
     W, mat='tan', bev=0.008, seg=3)
for sx in (-1, 1):
    # moulded side panel lines and the grip texture band along the shell
    prof('shellPanel', [(BUTT + 0.03, -0.024), (NOSE - 0.04, -0.024), (NOSE - 0.03, 0.012), (BUTT + 0.04, 0.012)], 0.0012, x=sx * (W / 2 + 0.0002), mat='tan', bev=0.0004)
    for k in range(9): box('shellRib', sx * (W / 2 + 0.0008) - 0.0006, sx * (W / 2 + 0.0008) + 0.0006, BUTT + 0.05 + k * 0.012, BUTT + 0.056 + k * 0.012, -0.02, 0.008, mat='polymer', bev=0.0002)
    torus('sling', 0.006, 0.0015, BUTT + 0.02, x=sx * (W / 2 + 0.002), v=-0.03, mat='steel', axis='X')
# magazine bed rails on the shell top and the rear magazine latch
for sx in (-1, 1): box('magRail', sx * 0.022 - 0.003, sx * 0.022 + 0.003, MG0 + 0.01, MG1 - 0.01, STOP - 0.001, STOP + 0.004, mat='polymer', bev=0.0008)
box('magLatch', -0.014, 0.014, MG0 - 0.022, MG0 - 0.002, STOP - 0.002, STOP + 0.016, mat='polymer', bev=0.002)
box('latchTab', -0.008, 0.008, MG0 - 0.028, MG0 - 0.016, STOP + 0.01, STOP + 0.019, mat='polymer', bev=0.0015)

# =============================================================================================== lower frame (black) with the two thumbholes
LOW = [(BUTT + 0.004, SBOT + 0.004), (NOSE - 0.004, SBOT + 0.004), (NOSE - 0.012, -0.07), (0.118, -0.118), (0.09, -0.15), (0.05, -0.156), (0.03, -0.145),
       (-0.05, -0.15), (-0.12, -0.145), (-0.17, -0.152), (-0.22, -0.15), (BUTT - 0.008, -0.138), (BUTT - 0.012, -0.09)]
prof('lower', LOW, W - 0.004, mat='polymer', bev=0.007, seg=3,
     holes=[[(-0.2, -0.066), (-0.11, -0.066), (-0.108, -0.096), (-0.116, -0.124), (-0.2, -0.128), (-0.21, -0.098)],      # rear thumbhole
            [(-0.05, -0.064), (0.04, -0.064), (0.06, -0.09), (0.05, -0.126), (-0.034, -0.128), (-0.05, -0.096)]])         # front hole (trigger + support thumb)
box('buttPad', -W / 2 + 0.002, W / 2 - 0.002, BUTT - 0.012, BUTT - 0.002, -0.14, STOP - 0.012, mat='rubber', bev=0.004)
for k in range(8): box('padGroove', -W / 2 + 0.004, W / 2 - 0.004, BUTT - 0.0128, BUTT - 0.0115, -0.13 + k * 0.016, -0.126 + k * 0.016, mat='rubber', bev=0.0003)
# trigger at the rear edge of the front hole, the rotary selector disc under it
prof('trigger', [(-0.046, -0.064), (-0.04, -0.064), (-0.041, -0.074), (-0.046, -0.082), (-0.05, -0.08), (-0.046, -0.072)], 0.006, mat='bright', bev=0.0008)
cyl('selector', 0.011, 0.011, -0.15, -0.146, x=-0.02, v=0.0, mat='black', seg=20, axis='Z')
# front grip texture (where the support hand wraps)
for sx in (-1, 1):
    for k in range(5): box('gripTex', sx * (W / 2 - 0.0016) - 0.0005, sx * (W / 2 - 0.0016) + 0.0005, 0.07 + k * 0.007, 0.073 + k * 0.007, -0.14, -0.08, mat='polymer', bev=0.0002)
    for k in range(5): box('gripTexR', sx * (W / 2 - 0.0016) - 0.0005, sx * (W / 2 - 0.0016) + 0.0005, -0.104 + k * 0.007, -0.101 + k * 0.007, -0.14, -0.07, mat='polymer', bev=0.0002)

# =============================================================================================== barrel + flash hider
cyl('barrel', 0.0082, 0.0082, NOSE - 0.02, 0.215, mat='steel', seg=20)
lathe('hider', [(0.0, 0.212), (0.0112, 0.212), (0.0118, 0.218), (0.0118, 0.252), (0.011, 0.256), (0.0055, 0.256), (0.0055, 0.22), (0.0, 0.22)], mat='black', seg=24)
for k in range(6):
    a = 2 * math.pi * k / 6 + 0.25
    cx, cz = math.cos(a) * 0.0118, math.sin(a) * 0.0118
    box('hiderSlot', cx - 0.0013, cx + 0.0013, 0.226, 0.25, cz - 0.0013, cz + 0.0013, mat='rubber', bev=0.0)

# =============================================================================================== 50-round magazine (node 'mag'): clear body, follower, rounds crosswise
box('magBody', -0.0245, 0.0245, MG0, MG1, STOP + 0.002, STOP + MT, node='mag', mat='magClear', bev=0.004)
for k in range(24):   # visible rounds: two staggered rows of 5.7 mm cartridges lying across the gun
    u = MG0 + 0.03 + k * 0.0115
    if u > MG1 - 0.03: break
    vz = STOP + 0.011 + (0.007 if k % 2 else 0.0)
    cyl('round', 0.0032, 0.0032, -0.018, 0.012, x=u, v=vz, node='mag', mat='brass', seg=8, axis='X')
    cyl('roundTip', 0.0032, 0.0009, 0.012, 0.021, x=u, v=vz, node='mag', mat='brass', seg=8, axis='X')
box('magFront', -0.025, 0.025, MG1 - 0.018, MG1 + 0.002, STOP + 0.001, STOP + MT + 0.001, node='mag', mat='polymer', bev=0.003)
box('magRear', -0.025, 0.025, MG0 - 0.002, MG0 + 0.016, STOP + 0.001, STOP + MT + 0.001, node='mag', mat='polymer', bev=0.003)
box('magSpine', -0.006, 0.006, MG0 + 0.016, MG1 - 0.018, STOP + MT - 0.002, STOP + MT + 0.002, node='mag', mat='polymer', bev=0.0012)

# =============================================================================================== ring-sight housing bridging over the magazine
HS0, HS1 = -0.03, 0.115
for sx in (-1, 1):  # side cheeks from the shell up past the magazine
    prof('sightCheek', [(HS0 + 0.035, STOP - 0.004), (HS1, STOP - 0.004), (HS1, SIGHT_V + 0.004), (HS1 - 0.022, SIGHT_V + 0.012), (HS0 + 0.055, SIGHT_V + 0.012), (HS0 + 0.035, STOP + MT + 0.008)],
         0.005, x=sx * (W / 2 - 0.006), mat='tan', bev=0.002)
box('sightRoof', -W / 2 + 0.006, W / 2 - 0.006, HS0 + 0.05, HS1 - 0.018, SIGHT_V + 0.012, SIGHT_V + 0.018, mat='tan', bev=0.003)
# the optic itself is an open tube: base under the sight axis, thin side walls, open ring ends (nothing on the axis)
box('sightBase', -0.017, 0.017, HS0, HS1 - 0.004, STOP + MT + 0.004, SIGHT_V - 0.012, mat='polymer', bev=0.003)
for sx in (-1, 1): box('sightWall', sx * 0.0145 - 0.0025, sx * 0.0145 + 0.0025, HS0 + 0.004, HS1 - 0.008, SIGHT_V - 0.013, SIGHT_V + 0.009, mat='polymer', bev=0.0012)
lathe('sightRingR', [(0.0115, HS0 - 0.002), (0.0145, HS0 - 0.002), (0.0145, HS0 + 0.006), (0.0115, HS0 + 0.006), (0.0115, HS0 - 0.002)], v=SIGHT_V, mat='polymer', seg=28)
lathe('sightRingF', [(0.0118, HS1 - 0.012), (0.015, HS1 - 0.012), (0.015, HS1 - 0.004), (0.0118, HS1 - 0.004), (0.0118, HS1 - 0.012)], v=SIGHT_V, mat='polymer', seg=28)
for sx in (-1, 1):  # backup iron sights moulded on both sides of the housing
    box('ironRear', sx * 0.021 - 0.003, sx * 0.021 + 0.003, HS0 + 0.006, HS0 + 0.016, SIGHT_V + 0.016, SIGHT_V + 0.024, mat='polymer', bev=0.001)
    box('ironFront', sx * 0.021 - 0.0015, sx * 0.021 + 0.0015, HS1 - 0.014, HS1 - 0.008, SIGHT_V + 0.016, SIGHT_V + 0.026, mat='polymer', bev=0.0006)
# --- charging handles (node 'charge'): one each side under the sight, they slide back together
for sx in (-1, 1):
    box('chHandle', sx * (W / 2 + 0.001) - 0.005, sx * (W / 2 + 0.001) + 0.005, 0.088, 0.106, 0.002, 0.014, node='charge', mat='polymer', bev=0.0025)
    box('chSlot', sx * (W / 2 + 0.0004) - 0.0008, sx * (W / 2 + 0.0004) + 0.0008, 0.03, 0.11, 0.005, 0.011, mat='rubber', bev=0.0)

# =============================================================================================== empties + export
empty('SIGHT', (0, HS0 + 0.04, SIGHT_V)); empty('HOOD', (0, HS0 - 0.002, SIGHT_V)); empty('MUZZLE', (0, 0.256, 0))
empty('SUPPORT', (0, 0.085, -0.096)); empty('GRIP', (0, -0.078, -0.082))
empty('MAGPIV', (0, MG1, STOP + MT / 2)); empty('CHARGEPIV', (0, 0.097, 0.008))
export(OUT)
