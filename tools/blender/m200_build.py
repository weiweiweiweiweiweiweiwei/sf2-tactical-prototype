# v50 CheyTac M200 Intervention — first-person model built with tools/blender/gunlib.py in the game's GUN SPACE.
# Real proportions ×1.0 (29" fluted barrel, 1346 mm with the stock out): long flat-sided receiver with an integral 30 MOA
# rail running out over the forend, big round free-float forend tube with vent rows and the bipod folded under it, fluted
# barrel, boxy two-port muzzle brake, retractable stock on twin rods (cheek riser, rubber pad, folding monopod), near-
# vertical grip, detachable box magazine (node 'mag'), and a bolt with shroud, stem and big knob (node 'bolt', it rolls up
# around the bore and slides back, pivot BOLTPIV). Nightforce-style 5.5–22×56 scope in two tall rings.
# Bore axis at v = 0; the grip sits on u −0.078 / v −0.082 like every viewmodel.
# blender -b --factory-startup -P tools/blender/m200_build.py -- tools/guns/m200.glb
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gunlib import *

OUT = out_path('tools/guns/m200.glb')

# =============================================================================================== layout (metres)
RX0, RX1 = -0.155, 0.205          # receiver rear / front
RTOP, RBOT, RW = 0.03, -0.03, 0.05
TUBE0, TUBE1, TR = RX1, 0.6, 0.027  # forend tube
BR0, BR1 = TUBE1, 0.865            # exposed barrel
MB0, MB1 = BR1, 0.955              # muzzle brake
SY = 0.084                         # scope axis height
BOLT_U = -0.112                    # bolt handle station

# =============================================================================================== receiver (black)
prof('receiver', [(RX0, RBOT + 0.006), (RX0 + 0.01, RBOT), (RX1, RBOT), (RX1, RTOP), (RX0 + 0.006, RTOP), (RX0, RTOP - 0.008)], RW, bev=0.003, seg=2)
for sx in (-1, 1):  # the long milled lightening flats on both sides
    prof('flat', [(RX0 + 0.03, -0.016), (RX1 - 0.03, -0.016), (RX1 - 0.03, 0.014), (RX0 + 0.03, 0.014)], 0.0016, x=sx * (RW / 2 + 0.0002), mat='steel', bev=0.0004)
    for u in (RX0 + 0.018, RX1 - 0.018):
        for v in (-0.02, 0.02): screw(u, v, sx * (RW / 2 + 0.0008))
rail(RX0 + 0.004, 0.42, RTOP, w=0.024)
# right side: the ejection port (dark recess) and the bolt-handle slot
box('ejectPort', RW / 2 - 0.002, RW / 2 + 0.0006, 0.02, 0.12, -0.008, 0.016, mat='rubber', bev=0.0005)
box('handleSlot', RW / 2 - 0.002, RW / 2 + 0.0006, BOLT_U - 0.012, 0.02, -0.004, 0.006, mat='rubber', bev=0.0004)
# trigger housing, guard, trigger, bolt release, magazine catch
prof('triggerHousing', [(-0.11, RBOT + 0.001), (0.0, RBOT + 0.001), (0.0, -0.042), (-0.11, -0.042)], 0.034, bev=0.0025)
prof('guard', [(-0.062, -0.04), (0.0, -0.04), (0.0, -0.046), (-0.008, -0.062), (-0.05, -0.064), (-0.062, -0.054)], 0.014, bev=0.0018, seg=2,
     holes=[[(-0.056, -0.043), (-0.006, -0.043), (-0.012, -0.059), (-0.05, -0.06)]])
prof('trigger', [(-0.036, -0.042), (-0.031, -0.042), (-0.032, -0.051), (-0.037, -0.057), (-0.041, -0.055), (-0.037, -0.049)], 0.006, mat='bright', bev=0.0008)
prof('magCatch', [(0.004, -0.04), (0.014, -0.04), (0.012, -0.052), (0.004, -0.05)], 0.02, bev=0.001)

# =============================================================================================== grip (polymer, near vertical) + safety
GRIP = [(-0.112, -0.04), (-0.058, -0.042), (-0.062, -0.06), (-0.07, -0.072), (-0.068, -0.086), (-0.074, -0.1), (-0.076, -0.128), (-0.084, -0.136),
        (-0.104, -0.137), (-0.11, -0.128), (-0.104, -0.096), (-0.108, -0.062), (-0.116, -0.046)]
prof('grip', GRIP, 0.03, mat='polymer', bev=0.006, seg=3)
for sx in (-1, 1):
    for k in range(7): box('gripChecker', sx * 0.0152 - 0.0005, sx * 0.0152 + 0.0005, -0.1 + k * 0.0042, -0.098 + k * 0.0042, -0.122, -0.066, mat='polymer', bev=0.0002)
prof('safety', [(-0.13, 0.018), (-0.112, 0.018), (-0.112, 0.028), (-0.128, 0.026)], 0.008, x=0.0275, mat='steel', bev=0.0008)

# =============================================================================================== bolt (node 'bolt'): shroud behind the receiver, body in the port, stem + knob
box('boltBody', -0.011, 0.011, 0.02, 0.118, -0.006, 0.014, node='bolt', mat='bright', bev=0.002)
lathe('boltShroud', [(0.0, RX0 - 0.032), (0.012, RX0 - 0.032), (0.018, RX0 - 0.024), (0.018, RX0 + 0.004), (0.0, RX0 + 0.004)], v=0.003, node='bolt', mat='black', seg=24)
box('cockIndicator', -0.003, 0.003, RX0 - 0.036, RX0 - 0.03, 0.0, 0.006, node='bolt', mat='dotR', bev=0.0005)
# stem: from the bolt at the bore out to the right and slightly down, then the big tactical knob
stem = cyl('boltStem', 0.0052, 0.0052, 0.0, 0.07, x=BOLT_U, v=0.0, node='bolt', mat='bright', seg=14, axis='X')
for vt in stem.data.vertices: X, Y, Z = vt.co; vt.co = (X, Y, Z - X * 0.22)   # droop 0.22 m per metre outward
lathe('boltKnob', [(0.0, -0.022), (0.009, -0.021), (0.0135, -0.012), (0.0145, 0.0), (0.0135, 0.012), (0.009, 0.02), (0.0, 0.021)], seg=20, node='bolt', mat='polymer')
knob = PARTS[-1][0]
for vt in knob.data.vertices: X, Y, Z = vt.co; vt.co = (0.072 + Y, BOLT_U + X, -0.0155 + Z)  # turn the lathe axis to point outward (along X)

# =============================================================================================== forend tube with vents + folded bipod
lathe('forend', [(0.0, TUBE0), (TR - 0.004, TUBE0), (TR, TUBE0 + 0.008), (TR, TUBE1 - 0.01), (TR - 0.003, TUBE1), (0.0, TUBE1)], mat='black', seg=36)
lathe('tubeNut', [(0.0, TUBE0 - 0.004), (0.031, TUBE0 - 0.004), (0.031, TUBE0 + 0.02), (0.0, TUBE0 + 0.02)], mat='black', seg=12)  # 12-flat lock ring
for k in range(9):  # vent rows (dark ports) on both upper shoulders and the sides
    u = 0.26 + k * 0.034
    for a in (math.radians(25), math.radians(155), math.radians(-10), math.radians(190)):
        cx, cz = math.cos(a) * (TR + 0.0002), math.sin(a) * (TR + 0.0002)
        box('vent', cx - 0.0014, cx + 0.0014, u, u + 0.018, cz - 0.0035, cz + 0.0035, mat='rubber', bev=0.0)
rail(0.24, 0.42, -TR, w=0.02, face='down')                      # accessory rail under the tube, behind the bipod
box('bipodMount', -0.016, 0.016, 0.54, 0.58, -TR - 0.012, -TR + 0.004, bev=0.002)
for sx in (-1, 1):
    box('bipodLeg', sx * 0.0115 - 0.0045, sx * 0.0115 + 0.0045, 0.43, 0.555, -TR - 0.013, -TR - 0.004, bev=0.0016)
    box('bipodFoot', sx * 0.0115 - 0.006, sx * 0.0115 + 0.006, 0.42, 0.436, -TR - 0.015, -TR - 0.003, mat='rubber', bev=0.0016)

# =============================================================================================== fluted barrel + muzzle brake
cyl('barrel', 0.0135, 0.0125, BR0 - 0.02, BR1 + 0.004, mat='steel', seg=24)
for k in range(6):
    a = 2 * math.pi * k / 6
    cx, cz = math.cos(a) * 0.0128, math.sin(a) * 0.0128
    box('flute', cx - 0.0018, cx + 0.0018, BR0 + 0.01, BR1 - 0.02, cz - 0.0018, cz + 0.0018, mat='black', bev=0.0)
box('brake', -0.018, 0.018, MB0, MB1, -0.016, 0.016, bev=0.004)
for (u0, u1) in ((MB0 + 0.014, MB0 + 0.038), (MB0 + 0.05, MB0 + 0.074)):  # two big side ports
    for sx in (-1, 1): box('brakePort', sx * 0.018 - 0.0012, sx * 0.018 + 0.0012, u0, u1, -0.011, 0.011, mat='rubber', bev=0.0)
cyl('brakeBore', 0.0075, 0.0075, MB1 - 0.006, MB1 + 0.0004, mat='rubber', seg=16)

# =============================================================================================== retractable stock on twin rods
for (vz, r) in ((0.012, 0.0062), (-0.034, 0.0062)):
    cyl('stockRod', r, r, RX0 - 0.002, -0.4, v=vz, mat='steel', seg=16)
box('stockBlock', -0.022, 0.022, RX0 - 0.02, RX0, -0.044, 0.024, bev=0.003)
SK0, SK1 = -0.38, -0.47
prof('stock', [(SK0, 0.022), (SK1 + 0.01, 0.024), (SK1, 0.02), (SK1, -0.105), (SK1 + 0.014, -0.11), (SK0 + 0.006, -0.05), (SK0, -0.044)], 0.036,
     mat='polymer', bev=0.004, seg=3)
for sx in (-1, 1):  # recessed skeleton panels (dark inset instead of a through-cut, so the top bar stays solid under the riser)
    prof('stockInset', [(-0.396, -0.008), (-0.452, -0.008), (-0.454, -0.088), (-0.43, -0.07), (-0.402, -0.04)], 0.0012, x=sx * 0.0182, mat='rubber', bev=0.0003)
prof('cheekRiser', [(SK0 + 0.006, 0.026), (SK1 + 0.012, 0.028), (SK1 + 0.012, 0.044), (SK1 + 0.03, 0.05), (SK0 + 0.03, 0.046), (SK0 + 0.006, 0.038)], 0.03, mat='polymer', bev=0.004)
for u in (SK0 + 0.02, SK1 + 0.035): cyl('riserPost', 0.0032, 0.0032, 0.02, 0.028, x=0.0, v=u, mat='steel', seg=10, axis='Z')
prof('buttPad', [(SK1, 0.02), (SK1 - 0.016, 0.019), (SK1 - 0.017, -0.11), (SK1 - 0.003, -0.115), (SK1, -0.11)], 0.04, mat='rubber', bev=0.005)
for k in range(10): box('padGroove', -0.019, 0.019, SK1 - 0.0175, SK1 - 0.0155, -0.1 + k * 0.012, -0.097 + k * 0.012, mat='rubber', bev=0.0003)
box('monopod', -0.007, 0.007, -0.432, -0.418, -0.122, -0.06, bev=0.002)
box('monopodFoot', -0.011, 0.011, -0.436, -0.414, -0.128, -0.12, mat='rubber', bev=0.002)

# =============================================================================================== 5-round box magazine (node 'mag')
prof('mag', [(0.03, -0.03), (0.13, -0.03), (0.132, -0.096), (0.126, -0.104), (0.034, -0.104), (0.028, -0.096)], 0.034, node='mag', mat='magBlack', bev=0.0025, seg=2)
for sx in (-1, 1): prof('magFlat', [(0.044, -0.042), (0.116, -0.042), (0.116, -0.092), (0.044, -0.092)], 0.0012, x=sx * 0.0172, node='mag', mat='polymer', bev=0.0003)
box('magBase', -0.019, 0.019, 0.026, 0.136, -0.112, -0.102, node='mag', mat='polymer', bev=0.003)
box('magRound', -0.0058, 0.0058, 0.04, 0.1, -0.031, -0.023, node='mag', mat='brass', bev=0.002)
cyl('magTip', 0.0058, 0.0016, 0.1, 0.116, v=-0.027, node='mag', mat='brass', seg=12)

# =============================================================================================== Nightforce-style scope in two tall rings
cyl('scopeTube', 0.0152, 0.0152, -0.13, 0.17, v=SY, mat='black', seg=32)
lathe('objective', [(0.0, 0.16), (0.0152, 0.16), (0.032, 0.21), (0.0335, 0.246), (0.031, 0.25), (0.0, 0.25)], v=SY, mat='black', seg=36)
lathe('eyepiece', [(0.0, -0.215), (0.0225, -0.215), (0.0235, -0.205), (0.0235, -0.16), (0.018, -0.14), (0.0152, -0.128), (0.0, -0.128)], v=SY, mat='black', seg=32)
for k in range(10):  # magnification ring grip ribs
    a = 2 * math.pi * k / 10
    box('zoomRib', math.cos(a) * 0.0238 - 0.0012, math.cos(a) * 0.0238 + 0.0012, -0.2, -0.17, SY + math.sin(a) * 0.0238 - 0.0012, SY + math.sin(a) * 0.0238 + 0.0012, mat='black', bev=0.0)
lathe('saddle', [(0.0, -0.005), (0.021, -0.005), (0.021, 0.075), (0.0, 0.075)], v=SY, mat='black', seg=8)   # turret housing
cyl('elevTurret', 0.0145, 0.0145, SY + 0.018, SY + 0.042, x=0.0, v=0.035, mat='black', seg=24, axis='Z')
cyl('windTurret', 0.0125, 0.0125, 0.018, 0.04, x=0.035, v=SY, mat='black', seg=24, axis='X')
cyl('paraTurret', 0.0125, 0.0125, -0.018, -0.038, x=0.035, v=SY, mat='black', seg=24, axis='X')
for k in range(16):  # turret knurling
    a = 2 * math.pi * k / 16
    box('turretKnurl', math.cos(a) * 0.0148 - 0.0008, math.cos(a) * 0.0148 + 0.0008, 0.035 + math.sin(a) * 0.0148 - 0.0008, 0.035 + math.sin(a) * 0.0148 + 0.0008, SY + 0.026, SY + 0.042, mat='black', bev=0.0)
for u in (-0.085, 0.115):  # tall rings: base clamp on the rail, two pillars, the ring around the tube
    box('ringBase', -0.017, 0.017, u - 0.012, u + 0.012, RTOP + 0.009, RTOP + 0.02, bev=0.0015)
    box('ringPost', -0.011, 0.011, u - 0.009, u + 0.009, RTOP + 0.019, SY - 0.012, bev=0.0015)
    lathe('ring', [(0.0, u - 0.009), (0.02, u - 0.009), (0.02, u + 0.009), (0.0, u + 0.009)], v=SY, mat='black', seg=28)
    cyl('ringBolt', 0.0035, 0.0035, 0.017, 0.022, x=u, v=RTOP + 0.0145, mat='steel', seg=10, axis='X')

# =============================================================================================== empties + export
empty('SIGHT', (0, -0.17, SY)); empty('HOOD', (0, -0.215, SY)); empty('MUZZLE', (0, MB1, 0))
empty('SUPPORT', (0, 0.31, -TR)); empty('GRIP', (0, -0.078, -0.082))
empty('MAGPIV', (0, 0.03, -0.03)); empty('BOLTPIV', (0, BOLT_U, 0))
export(OUT)
