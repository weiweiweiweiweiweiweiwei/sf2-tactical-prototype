# v49 M4A1 — first-person model built in Blender with tools/blender/gunlib.py, in the game's GUN SPACE (see gunlib).
# Real Colt M4A1 proportions ×1.0: 14.5" barrel, flat-top upper with a full-length Picatinny rail, KAC-style quad-rail
# handguard, low-profile gas block, A2 birdcage, forward assist, dust cover + brass deflector, A2 grip, 30-rd STANAG,
# collapsible stock on the buffer tube, folded flip-up sights front and rear, a black EOTech-style holo on the rail.
# Bore axis at v = 0; the grip sits on u −0.078 / v −0.082 like every viewmodel (where the procedural hand wraps it).
# blender -b --factory-startup -P tools/blender/m4a1_build.py -- tools/guns/m4a1.glb
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gunlib import *

OUT = out_path('tools/guns/m4a1.glb')

# =============================================================================================== layout (metres)
UR0, UR1 = -0.15, 0.085           # upper receiver rear / front (barrel nut)
SEAM = -0.012                     # upper / lower split
TOP = 0.018                       # upper receiver top = rail base
RT = TOP + 0.0095                 # rail tooth tops (where the sight sits)
HG0, HG1 = 0.088, 0.27            # quad-rail handguard
MZ0, MZ1 = 0.43, 0.476            # A2 birdcage

# =============================================================================================== upper receiver (black anodised)
prof('upper', [(UR0, SEAM), (UR1, SEAM), (UR1, TOP), (UR0 + 0.004, TOP), (UR0, TOP - 0.006)], 0.028, bev=0.0022, seg=2)
rail(UR0 + 0.002, UR1 - 0.001, TOP)
for sx in (-1, 1):
    # the raised side walls that run up to the rail, thinner over the ejection port area
    prof('upperWall', [(UR0 + 0.01, 0.004), (UR1 - 0.004, 0.004), (UR1 - 0.004, TOP - 0.001), (UR0 + 0.01, TOP - 0.001)], 0.0012, x=sx * 0.0146, bev=0.0003)
# right side: ejection port with the dust cover (closed, hinge rod below) and the bolt showing through the gap
box('dustCover', 0.0146, 0.0158, -0.032, 0.034, -0.007, 0.01, bev=0.0005)
box('dustRib', 0.0156, 0.0162, -0.026, 0.028, 0.0008, 0.0022, bev=0.0002)
cyl('dustHinge', 0.0014, 0.0014, -0.034, 0.036, x=0.0156, v=-0.0085, seg=10)
box('boltFace', 0.0144, 0.0152, 0.034, 0.04, -0.004, 0.007, mat='bright', bev=0.0003)
# brass deflector behind the port and the forward assist (angled cylinder + knurled plunger)
prof('deflector', [(-0.05, -0.002), (-0.034, -0.002), (-0.034, 0.016), (-0.05, 0.011)], 0.006, x=0.0172, bev=0.0012)
lathe('faHousing', [(0.0, -0.118), (0.0062, -0.118), (0.0066, -0.104), (0.0058, -0.082), (0.0, -0.082)], x=0.0172, v=0.006, mat='black', seg=20)
lathe('faPlunger', [(0.0, -0.13), (0.0072, -0.13), (0.0072, -0.118), (0.0, -0.118)], x=0.0172, v=0.006, mat='bright', seg=20)
for k in range(8):
    a = 2 * math.pi * k / 8
    box('faKnurl', 0.0172 + math.cos(a) * 0.007 - 0.0006, 0.0172 + math.cos(a) * 0.007 + 0.0006, -0.13, -0.119, 0.006 + math.sin(a) * 0.007 - 0.0006, 0.006 + math.sin(a) * 0.007 + 0.0006, mat='black', bev=0.0)
# --- charging handle (node 'charge'): T-handle behind the rail with the latch on the left
box('chShaft', -0.004, 0.004, UR0 - 0.012, UR0 + 0.02, TOP - 0.009, TOP - 0.002, node='charge', mat='black', bev=0.0008)
prof('chT', [(UR0 - 0.022, TOP - 0.01), (UR0 - 0.01, TOP - 0.01), (UR0 - 0.01, TOP - 0.001), (UR0 - 0.022, TOP - 0.003)], 0.036, node='charge', mat='black', bev=0.0016)
box('chLatch', -0.026, -0.016, UR0 - 0.021, UR0 - 0.008, TOP - 0.008, TOP - 0.003, node='charge', mat='black', bev=0.0012)

# =============================================================================================== lower receiver
LOW = [(UR0, SEAM), (UR1, SEAM), (UR1, -0.026), (0.07, -0.036), (0.0, -0.036), (-0.056, -0.036), (-0.11, -0.03), (UR0, -0.026)]
prof('lower', LOW, 0.026, bev=0.0022, seg=2)
# magwell with the flared bottom and the side panels
prof('magwell', [(-0.004, -0.03), (0.072, -0.03), (0.074, -0.06), (0.078, -0.066), (-0.006, -0.066), (-0.004, -0.06)], 0.03, bev=0.002, seg=2,
     holes=[[(0.002, -0.05), (0.066, -0.05), (0.068, -0.07), (0.0, -0.07)]])
for sx in (-1, 1):
    prof('magwellPanel', [(0.004, -0.036), (0.064, -0.036), (0.066, -0.058), (0.004, -0.058)], 0.0012, x=sx * 0.0152, bev=0.0003)
    for (u, v) in ((0.074, -0.006), (UR0 + 0.018, -0.006)):  # front pivot pin, rear takedown pin
        cyl('pin', 0.0032, 0.0032, sx * 0.0128, sx * 0.0144, u, v, mat='steel', seg=14, axis='X')
# left: bolt catch paddle; right: magazine release button with its fence
prof('boltCatch', [(-0.012, -0.016), (0.004, -0.016), (0.006, -0.026), (-0.01, -0.028)], 0.002, x=-0.0142, bev=0.0005)
cyl('magRelease', 0.0042, 0.0042, 0.0132, 0.0158, -0.004, -0.024, mat='steel', seg=16, axis='X')
prof('releaseFence', [(-0.012, -0.03), (0.004, -0.03), (0.004, -0.034), (-0.012, -0.034)], 0.004, x=0.014, bev=0.0006)
# trigger guard, trigger, selector (left, above the grip)
prof('guard', [(-0.058, -0.034), (0.0, -0.034), (0.0, -0.04), (-0.006, -0.052), (-0.05, -0.052), (-0.058, -0.044)], 0.012, bev=0.0016, seg=2,
     holes=[[(-0.052, -0.037), (-0.006, -0.037), (-0.01, -0.0485), (-0.048, -0.0485)]])
prof('trigger', [(-0.033, -0.035), (-0.028, -0.035), (-0.029, -0.044), (-0.034, -0.05), (-0.038, -0.048), (-0.034, -0.042)], 0.005, mat='bright', bev=0.0008)
cyl('selHub', 0.0058, 0.0058, -0.0132, -0.0156, -0.094, -0.02, mat='black', seg=18, axis='X')
prof('selLever', [(-0.098, -0.023), (-0.072, -0.019), (-0.07, -0.014), (-0.096, -0.016)], 0.0024, x=-0.0164, bev=0.0006)
for k, col in enumerate(('dotW', 'dotR', 'dotR')):
    cyl('mark', 0.0012, 0.0012, -0.0132, -0.0137, -0.085 + k * 0.008, -0.008 - k * 0.003, mat=col, seg=8, axis='X')

# =============================================================================================== A2 pistol grip (polymer)
GRIP = [(-0.11, -0.03), (-0.06, -0.034), (-0.062, -0.05), (-0.068, -0.062), (-0.064, -0.074), (-0.072, -0.088), (-0.076, -0.12), (-0.084, -0.13),
        (-0.104, -0.131), (-0.11, -0.122), (-0.104, -0.09), (-0.106, -0.06), (-0.114, -0.04)]
prof('grip', GRIP, 0.028, mat='polymer', bev=0.0055, seg=3)
for sx in (-1, 1):
    for k in range(7): box('gripChecker', sx * 0.0142 - 0.0005, sx * 0.0142 + 0.0005, -0.1 + k * 0.0042, -0.098 + k * 0.0042, -0.118, -0.064, mat='polymer', bev=0.0002)

# =============================================================================================== buffer tube + collapsible stock
cyl('bufferTube', 0.0145, 0.0145, UR0 - 0.001, -0.37, v=-0.002, mat='black', seg=24, bev=0.0008)
lathe('castleNut', [(0.0, UR0 - 0.012), (0.0182, UR0 - 0.012), (0.0182, UR0 - 0.002), (0.0, UR0 - 0.002)], v=-0.002, mat='black', seg=8)
box('endPlate', -0.016, 0.016, UR0 - 0.004, UR0, -0.03, 0.012, bev=0.0008)
box('tubeRail', -0.004, 0.004, UR0 - 0.012, -0.26, -0.019, -0.015, bev=0.0006)  # the position holes' strip under the tube
STK0, STK1 = -0.255, -0.37         # stock at the second position: ~9 cm of tube shows
prof('stock', [(STK0, 0.016), (STK1 + 0.006, 0.027), (STK1, 0.027), (STK1, -0.085), (STK1 + 0.012, -0.088), (STK0 + 0.03, -0.032), (STK0, -0.02)], 0.034,
     mat='polymer', bev=0.004, seg=3, holes=[[(-0.3, -0.03), (-0.345, -0.048), (-0.345, -0.064), (-0.308, -0.046)]])
prof('stockLever', [(STK0 + 0.006, -0.022), (STK0 - 0.03, -0.022), (STK0 - 0.036, -0.032), (STK0 + 0.01, -0.028)], 0.012, mat='polymer', bev=0.0014)
prof('buttPad', [(STK1, 0.028), (STK1 - 0.012, 0.027), (STK1 - 0.013, -0.088), (STK1 - 0.002, -0.093), (STK1, -0.088)], 0.036, mat='rubber', bev=0.004)
for k in range(9): box('padGroove', -0.017, 0.017, STK1 - 0.0135, STK1 - 0.0115, -0.08 + k * 0.012, -0.077 + k * 0.012, mat='rubber', bev=0.0003)
torus('slingLoopR', 0.0075, 0.0017, STK1 + 0.02, x=0.0, v=-0.082, mat='steel', axis='Y')

# =============================================================================================== quad-rail handguard, barrel, gas block, birdcage
HW, HB = 0.05, -0.034             # handguard width / bottom (its top sits flush with the receiver rail base)
prof('handguard', [(HG0, TOP), (HG1, TOP), (HG1, HB), (HG0, HB)], HW, bev=0.009, seg=1)  # big single-segment chamfer: the octagonal quad-rail section
for k in range(5):  # cooling slots in the chamfers between the rails
    for sx in (-1, 1):
        for vz in (TOP - 0.0055, HB + 0.0055):
            box('hgSlot', sx * (HW / 2 - 0.0055) - 0.0012, sx * (HW / 2 - 0.0055) + 0.0012, 0.122 + k * 0.03, 0.14 + k * 0.03, vz - 0.0012, vz + 0.0012, mat='rubber', bev=0.0)
lathe('barrelNut', [(0.0, UR1 - 0.002), (0.0172, UR1 - 0.002), (0.0172, HG0 + 0.004), (0.0, HG0 + 0.004)], mat='black', seg=24)
rail(HG0 + 0.004, HG1 - 0.004, TOP)
rail(HG0 + 0.01, HG1 - 0.01, HB, face='down')
rail(HG0 + 0.03, HG1 - 0.02, -0.008, w=0.016, face='right', x=HW / 2)
rail(HG0 + 0.03, HG1 - 0.02, -0.008, w=0.016, face='left', x=-HW / 2)
for sx in (-1, 1):  # rail-cover ladders on the sides behind the side rails (rubber)
    box('railCover', sx * HW / 2 - 0.0008, sx * HW / 2 + 0.0035 * sx, HG0 + 0.006, HG0 + 0.026, -0.024, 0.008, mat='rubber', bev=0.0008)
    for (u, v) in ((HG0 + 0.012, 0.011), (HG1 - 0.012, 0.011)): screw(u, v, sx * (HW / 2 + 0.0004))
cyl('barrel', 0.0095, 0.0095, HG0, 0.31, mat='steel', seg=26)
cyl('barrelM203', 0.0082, 0.0082, 0.31, 0.33, mat='steel', seg=26)                    # the M203 mounting step
cyl('barrelFront', 0.0088, 0.0086, 0.33, MZ0 + 0.004, mat='steel', seg=26)
box('gasBlock', -0.012, 0.012, 0.284, 0.304, -0.013, 0.013, bev=0.0018)
cyl('gasPin', 0.0016, 0.0016, -0.0125, 0.0125, 0.294, -0.007, mat='steel', seg=10, axis='X')
# A2 birdcage: closed bottom, five slots around the top
lathe('birdcage', [(0.0, MZ0), (0.0106, MZ0), (0.0112, MZ0 + 0.006), (0.0112, MZ1 - 0.004), (0.0104, MZ1), (0.0058, MZ1), (0.0058, MZ0 + 0.012), (0.0, MZ0 + 0.012)],
      mat='black', seg=30)
for k in range(5):
    a = math.radians(30 + k * 30)
    cx, cz = math.cos(a) * 0.0112, math.sin(a) * 0.0112
    box('cageSlot', cx - 0.0016, cx + 0.0016, MZ0 + 0.014, MZ1 - 0.007, cz - 0.0016, cz + 0.0016, mat='rubber', bev=0.0)
torus('slingLoopF', 0.007, 0.0016, 0.25, x=-HW / 2 - 0.004, v=-0.02, mat='steel', axis='X')

# =============================================================================================== folded flip-up sights (out of the holo view)
box('buisBase', -0.012, 0.012, UR0 + 0.006, UR0 + 0.034, RT - 0.001, RT + 0.008, bev=0.0012)
box('buisLeaf', -0.009, 0.009, UR0 + 0.01, UR0 + 0.034, RT + 0.008, RT + 0.012, bev=0.001)
box('fsBase', -0.012, 0.012, HG1 - 0.03, HG1 - 0.006, RT - 0.001, RT + 0.008, bev=0.0012)
box('fsLeaf', -0.008, 0.008, HG1 - 0.03, HG1 - 0.008, RT + 0.008, RT + 0.012, bev=0.001)

# =============================================================================================== 30-rd STANAG magazine (node 'mag')
MAGP = [(0.003, -0.034), (0.066, -0.034), (0.068, -0.07), (0.078, -0.12), (0.096, -0.19), (0.094, -0.204), (0.036, -0.204), (0.034, -0.19), (0.016, -0.12), (0.006, -0.07)]
prof('mag', MAGP, 0.023, node='mag', mat='magBlack', bev=0.0018, seg=2)
for sx in (-1, 1):  # the stamped ribs down both sides
    for (a, b) in (((0.014, -0.074), (0.026, -0.12)), ((0.03, -0.124), (0.044, -0.186)), ((0.056, -0.074), (0.066, -0.12)), ((0.07, -0.124), (0.084, -0.186))):
        prof('magRib', [(a[0] - 0.002, a[1]), (a[0] + 0.002, a[1]), (b[0] + 0.002, b[1]), (b[0] - 0.002, b[1])], 0.0012, x=sx * 0.0118, node='mag', mat='magBlack', bev=0.0003)
box('magFloor', -0.0128, 0.0128, 0.032, 0.1, -0.21, -0.2, node='mag', mat='polymer', bev=0.002, rot=('X', -0.27))
box('cartridge', -0.0042, 0.0042, 0.012, 0.05, -0.034, -0.027, node='mag', mat='brass', bev=0.0015)
cyl('bulletTip', 0.0042, 0.0011, 0.05, 0.061, v=-0.0305, node='mag', mat='brass', seg=12)

# =============================================================================================== black EOTech-style holo on the rail
EU0 = -0.072                       # rear of the sight base
WW, WH, HL, T = 0.034, 0.026, 0.034, 0.003
H0 = EU0 + 0.016                   # hood rear
WC = RT + 0.0215 + WH / 2          # window centre = sight axis
box('eoBase', -0.017, 0.017, EU0, EU0 + 0.128, RT, RT + 0.012, bev=0.002)
box('eoClamp', -0.019, 0.019, EU0 + 0.03, EU0 + 0.062, RT - 0.006, RT + 0.004, bev=0.0012)
cyl('eoKnob', 0.0075, 0.0075, -0.019, -0.03, x=EU0 + 0.046, v=RT, mat='polymer', seg=20, axis='X')
box('eoBody', -0.0185, 0.0185, H0, H0 + HL, RT + 0.01, RT + 0.0215, bev=0.003)
box('eoRearPanel', -0.016, 0.016, EU0 - 0.002, H0 + 0.002, RT + 0.006, RT + 0.019, mat='polymer', bev=0.0015)
for uu in (-0.0065, 0.0065): box('eoButton', uu - 0.0042, uu + 0.0042, EU0 - 0.0055, EU0 - 0.001, RT + 0.009, RT + 0.017, mat='rubber', bev=0.0012)
lathe('eoBattery', [(0.0, 0), (0.0105, 0), (0.0105, 0.036), (0.0, 0.036)], mat='black', seg=24)
bat = PARTS[-1][0]
for vt in bat.data.vertices: X, Y, Z = vt.co; vt.co = (Y - 0.018, EU0 + 0.108 + X, RT + 0.003 + Z)
for sx in (-1, 1): cyl('eoBatCap', 0.0112, 0.0112, sx * 0.018, sx * 0.0215, x=EU0 + 0.108, v=RT + 0.003, mat='polymer', seg=24, axis='X')
for sx in (-1, 1):
    prof('eoHoodSide', [(H0, RT + 0.012), (H0 + HL, RT + 0.012), (H0 + HL, WC + WH / 2 - 0.004), (H0 + HL - 0.008, WC + WH / 2 + T), (H0, WC + WH / 2 + T)], T, x=sx * (WW / 2 + T / 2), bev=0.0011)
prof('eoHoodTop', [(H0, WC + WH / 2), (H0 + HL - 0.008, WC + WH / 2), (H0 + HL, WC + WH / 2 - 0.004), (H0 + HL, WC + WH / 2 - 0.001), (H0 + HL - 0.008, WC + WH / 2 + T), (H0, WC + WH / 2 + T)],
     WW + 2 * T, bev=0.0011)
box('eoWinSill', -WW / 2, WW / 2, H0, H0 + HL, RT + 0.0215 - 0.001, WC - WH / 2 - 0.001, bev=0.0006)

# =============================================================================================== empties + export
empty('SIGHT', (0, H0 + HL * 0.5, WC)); empty('HOOD', (0, H0, WC)); empty('MUZZLE', (0, MZ1, 0))
empty('SUPPORT', (0, 0.2, HB)); empty('GRIP', (0, -0.078, -0.082))
empty('MAGPIV', (0, 0.03, -0.035)); empty('CHARGEPIV', (0, UR0 - 0.016, TOP - 0.006))
export(OUT)
