"""SF2 → game weapon overrides: for every gun with an SF2 first-person rig, its SF2 timing, lenses, zoom offsets and recoil block
straight from docs/research/sf2/client-data/weapons.json → the marked block in src/01_core.js (SF2_WEAPONS,
applied onto WEAPON_DATABASE before compileWeapon). Damage is not taken: it stays on the game's balance rules.
  python tools/sf2_weapon_table.py
Per gun below: our weapon id → SF2 class, rig id (tools/guns/<rig>_sf2_rig.glb), sound id (assets/sfx_sf2.js) and the reload
sound times measured on its Reload clip (magazine out / in, bolt: weapon_magazine / weapon_cartridge travel).
"""
import json

GUNS = {
    'scarhdmr': ('SCARHDMR', 'scarh', 'scarh', [0.12, 0.4, 0.73]),  # v65s no own model: scarh's rig
    'fs2000': ('FNFS2000', 'fnf2000', 'fnf2000', [0.12, 0.4, 0.73]),  # v65s no own model: fnf2000's rig
    'sar21': ('SAR21', 'sar21', 'sar21', [0.12, 0.4, 0.73]),  # v65q sf2_add_gun
    'mrr': ('MRR', 'mrr', 'mrr', [0.12, 0.4, 0.73]),  # v65q sf2_add_gun
    'madsenlar': ('MadsenLar', 'madsenlar', 'madsenlar', [0.12, 0.4, 0.73]),  # v65q sf2_add_gun
    'k2c1': ('K2C1', 'k2c1', 'k2c1', [0.12, 0.4, 0.73]),  # v65q sf2_add_gun
    'fnf2000': ('FNF2000', 'fnf2000', 'fnf2000', [0.12, 0.4, 0.73]),  # v65q sf2_add_gun
    'cm901': ('CM901', 'cm901', 'cm901', [0.12, 0.4, 0.73]),  # v65q sf2_add_gun
    'arx160': ('ARX160', 'arx160', 'arx160', [0.12, 0.4, 0.73]),  # v65q sf2_add_gun
    'ak104': ('AK104', 'ak103', 'ak103', [0.14, 0.46, 0.82]),  # v65q no own model: the AK-103's rig and sounds
    'an94': ('AN94', 'an94', 'an94', [0.12, 0.4, 0.73]),  # v65q sf2_add_gun  # id: (SF2 class, rig, sound, [magout, magin, charge])
    'm16a3': ('M16A3', 'm16a3', 'm16a3', [0.07, 0.35, 0.72]),  # (v62z loop H3: the M4A1's carry handle + A2 front sight on the flat-top, tools/sf2_rig_build.mjs)
    'k2': ('K2', 'k2', 'k2', [0.12, 0.35, 0.75]),
    'acr': ('ACR', 'acr', 'acr', [0.12, 0.4, 0.73]),  # v65p
    'scarl': ('SCARL', 'scarl', 'scarh', [0.12, 0.44, 0.72]),  # (SF2 plays the SCAR-H's sounds)
    'scarh': ('SCARH', 'scarh', 'scarh', [0.12, 0.44, 0.72]),
    'famas': ('FAMAS', 'famas', 'famas', [0.2, 0.4, 0.73]),
    'xm8': ('XM8', 'xm8', 'xm8', [0.12, 0.27, 0.73]),
    'galil': ('GALIL', 'galil', 'galil', [0.23, 0.72, 0.76]),  # (the mag is swung away and swapped in at frame 58)
    'hk417': ('HK417', 'hk417', 'hk417', [0.16, 0.37, 0.77]),
    'mp5k': ('MP5K', 'mp5k', 'mp5k', [0.17, 0.48, 0.77]),  # (v62z loop H3: the first SMG; reload times from its Reload clip, 65 frames)
    'qbz97': ('QBZ97', 'qbz97', 'qbz97', [0.19, 0.4, 0.73]),  # (v62z loop H3: its carry-handle sights measured by hand, tools/sf2_rig_build.mjs sightMarks)
    # v64 the attachment builds (the base gun's rig + SF2's EOTech / Reflex and silencer, the suppressed AR shot; reload as the base gun)
    # (the aimed lenses fitted to the user's SF2 shots, 10-28, with the eye 15 cm behind the optic's DOT (src/09_models.js RIG_EYE): the HK417
    # Reflex's window 76 % of the screen's width → 15; the G36C EOTech's (a 4:3 shot stretched, heights: 52.5 %) → 20, the SCAR-L's EOTech as it)
    'g36c_eo': ('G36C_EOTech_Silencer_ButterflyFX', 'g36c_eo', 'g36c_eo', [0.12, 0.32, 0.76], {'vmAdsHFov': 20}),
    'hk417_rs': ('HK417_mod2A', 'hk417_rs', 'hk417_rs', [0.16, 0.37, 0.77], {'vmAdsHFov': 15}),
    'scarl_eo': ('SCARL_MK2', 'scarl_eo', 'scarl_eo', [0.12, 0.44, 0.72], {'vmAdsHFov': 20}),
    # v64 the K14 bolt action: its Reload clip (91 frames) opens the bolt at 13, the mag out at 28 / in at 44, the bolt shut at 68;
    # the 2D scope stays the game's (zoom levels like the M40A1), and SF2's 20° kick block is left out (the bolt drops the scope anyway)
    'k14': ('K14', 'k14', 'k14', [0.31, 0.48, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 17, 'vmAdsHFov': None, 'sf2Recoil': None,
                                                       'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']]}),
    # v64s the TRG-41: its Reload clip is the K14's length (91 frames) and order — bolt open, mag out / in, bolt shut — marks as the K14's
    # v64t SF2's other bolt guns: a 2D scope with SF2's default reticle ('mil', mic_ScopeView), zooms fZoomedFOV then 20; reload marks as the K14's
    'm40a1': ('M40A1', 'm40a1', 'm40a1', [0.31, 0.48, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 17, 'vmAdsHFov': None, 'sf2Recoil': None, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20],
                                                       'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']]}),
    'cz700': ('CZ700', 'cz700', 'cz700', [0.31, 0.48, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 17, 'vmAdsHFov': None, 'sf2Recoil': None, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20],
                                                       'sf2ReloadSounds': [[0.14, 'charge'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']]}),
    'cheytac_m200': ('CheyTac', 'cheytac', 'cheytac', [0.31, 0.48, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 17, 'vmAdsHFov': None, 'sf2Recoil': None, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20],
                                                       'sf2ReloadSounds': [[0.14, 'charge'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']]}),
    'awp': ('AWP', 'awp', 'awp', [0.31, 0.48, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 17, 'vmAdsHFov': None, 'sf2Recoil': None, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20],
                                                       'sf2ReloadSounds': [[0.14, 'charge'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']]}),
    # v64y Barrett (SFCItem_Barret_Def_Scope: the CZ700's scope, reticle mic_ScopeView_03 → 'mil3' by tools/sf2_reticle_svg.py)
    'barrett': ('Barret', 'barrett', 'barrett', [0.2, 0.45, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 15, 'vmAdsHFov': None, 'sf2Recoil': None, 'sf2Reticle': 'mil3', 'zoomHFovs': [55, 20]}),
    'kar98k': ('Kar98k', 'kar98k', 'kar98k', [0.31, 0.48, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 17, 'vmAdsHFov': None, 'sf2Recoil': None, 'sf2Reticle': 'mil', 'zoomHFovs': [55, 20],
                                                       'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']]}),
    'sr25': ('SR25', 'sr25', 'sr25', [0.2, 0.45, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 16, 'vmAdsHFov': None, 'sf2Recoil': None, 'sf2Reticle': 'mil', 'zoomHFovs': [20, 12]}), # (fZoomedFOV 12: its high power as the second step)
    'psg1': ('PSG1', 'psg1', 'psg1', [0.2, 0.45, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 16, 'vmAdsHFov': None, 'sf2Recoil': None, 'sf2Reticle': 'mil', 'zoomHFovs': [20, 12]}),
    'frf2': ('FRF2', 'frf2', 'frf2', [0.31, 0.48, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 17, 'vmAdsHFov': None, 'sf2Recoil': None, 'sf2Reticle': 'mil1', 'zoomHFovs': [55, 20],
                                                       'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']]}),
    'm14ebr': ('M14EBR', 'm14ebr', 'm14ebr', [0.2, 0.45, 0.75], {'adsType': '3d_sight', 'vmAdsHFov': 20, 'zoomHFovs': None}), # (SF2: an EOTech rifle — the 2D scope goes)
    # v65e docs/loop/GUNS.md D: rifles (reload marks the SF2 rifles' usual: out, in, charge)
    'aug': ('AUGA3', 'aug', 'aug', [0.15, 0.4, 0.75]),
    'sg551': ('SIG551', 'sg551', 'sg551', [0.15, 0.4, 0.75]),
    'type89': ('Type89', 'type89', 'type89', [0.15, 0.4, 0.75]),
    # v65f docs/loop/GUNS.md D: SMGs
    'ump45': ('UMP45', 'ump45', 'ump45', [0.15, 0.4, 0.75]),
    'mp7': ('MP7A1', 'mp7', 'mp7', [0.15, 0.4, 0.75]),
    # v65g docs/loop/GUNS.md D: machine guns
    'mg4': ('MG4', 'mg4', 'mg4', [0.15, 0.45, 0.8]),
    'k3': ('K3', 'k3', 'k3', [0.15, 0.45, 0.8]),
    'hk23e': ('HK23E', 'hk23e', 'hk23e', [0.15, 0.45, 0.8]),
    # v65h docs/loop/GUNS.md D: shotguns
    'remington870': ('M870', 'remington870', 'remington870', [0.2, 0.5, 0.8]),
    'benelli_m4': ('BNLLI', 'benelli_m4', 'benelli_m4', [0.2, 0.5, 0.8]),
    'ksg': ('KeltecKSG', 'ksg', 'ksg', [0.2, 0.5, 0.8]),
    'saiga12': ('SAIGA12', 'saiga12', 'saiga12', [0.15, 0.4, 0.75]),
    # v65i docs/loop/GUNS.md D: pistols
    'p226': ('P226', 'p226', 'p226', [0.15, 0.45, 0.8]),
    'deagle': ('DESERTEAGLE', 'deagle', 'deagle', [0.15, 0.45, 0.8]),
    'glock18': ('GLOCK17', 'glock18', 'glock18', [0.15, 0.45, 0.8]),
    'm1911': ('Colt1911', 'm1911', 'm1911', [0.15, 0.45, 0.8]),
    'cz75': ('CZ75BD', 'cz75', 'cz75', [0.15, 0.45, 0.8]),
    'jericho': ('JERICHO941', 'jericho', 'jericho', [0.15, 0.45, 0.8]),
    'sw60': ('RevolverSW60', 'sw60', 'sw60', [0.15, 0.45, 0.8]),
    'm92fs': ('M92FS', 'm92fs', 'm92fs', [0.15, 0.45, 0.8]),
    'infinity': ('INFINITY', 'infinity', 'infinity', [0.15, 0.45, 0.8]),
    'trg': ('TRG', 'trg', 'trg', [0.31, 0.48, 0.75], {'adsType': '2d_scope_overlay', 'adsFov': 20, 'adsSpeed': 17, 'vmAdsHFov': None, 'sf2Recoil': None,
                                                       'sf2ReloadSounds': [[0.14, 'boltback'], [0.31, 'magout'], [0.48, 'magin'], [0.75, 'charge']]}),
}
REC = ['nextCrossVert', 'maxCrossVert', 'vertInc', 'vertDec', 'crossDecreasInc', 'incline', 'forceCorrection', 'domDefault', 'domZoomDefault',
       'domInc', 'domMax', 'domMin', 'domDec', 'maxMovingValue', 'mulValueRun', 'mulValueJump']


def r3(v): return round(float(v), 3)


def reload_blend():
    """v64m ReloadBlendTime of every weapon class (SFGameContent class defaults): SF2 plays the Reload clip over it (SFWeapon.
    GetReloadBlendTime) while the rounds go in at ReloadTimes[0] (GetReloadTime, WeaponReloading's 'Reloaded' timer) — the K14: 3.25 / 3.0."""
    import sf2_props as S
    pk = S.Pkg(S.PKG_DIR + 'SFGameContent.upk'); out = {}
    for e in pk.exports:
        if e['name'].startswith('Default__SFCWeapon'):
            for n, i, t, v in pk.props(e):
                if n == 'ReloadBlendTime': out[e['name'][9:]] = float(v)
    return out


def main():
    w = json.load(open('docs/research/sf2/client-data/weapons.json', encoding='utf-8'))
    rows = []; blend = reload_blend()
    for gid, (cls, rig, snd, rs, *extra) in GUNS.items():
        d = w['SFCWeapon' + cls]; rc = d['RecoilDefault']
        rec = {k: r3(rc.get(k, 0)) for k in REC}; rec['zoomMod'] = r3(d.get('RecoilZoomModifier', 1)); rec['crouchMod'] = r3(d.get('RecoilCrouchModifier', 1))
        o = {
            'fireRate': r3(d['FireInterval'][0]), 'reloadTime': r3(d['ReloadTimes'][0]), 'equipTime': r3(d.get('EquipTime', 0.8)), 'adsSpeed': 12, 'adsFov': 55,
            'adsType': '3d_sight', 'vmHFov': r3(d.get('fZoomOutFOV', 60)), 'vmAdsHFov': r3(d.get('fZoomedMeshFOV', 35)),
            'sf2Rig': rig, 'sf2': snd, 'sf2ZoomIn': [r3(x) for x in d.get('vLocZoomIN', [0, 0, 0])], 'sf2ZoomOut': [r3(x) for x in d.get('vLocZoomOut', [0, 0, 0])],
            'sf2ReloadSounds': [[rs[0], 'magout'], [rs[1], 'magin'], [rs[2], 'charge']], 'sf2Recoil': rec,
        }
        rb = next((blend[c] for c in d.get('chain', ['SFCWeapon' + cls]) if c in blend), None)  # v64m the Reload clip's own length (GetReloadBlendTime)
        if rb and rb > o['reloadTime']: o['sf2ReloadAnim'] = r3(rb)
        for k, v in (extra[0] if extra else {}).items():  # (v64 per-gun overrides; None drops the key)
            if v is None: o.pop(k, None)
            else: o[k] = v
        rows.append(f"  {gid}: {json.dumps(o, separators=(', ', ': '))}, // SFCWeapon{cls}")
    js = ("/* v62i SF2's own timing, lenses, zoom offsets and recoil for the guns with an SF2 rig — generated by tools/sf2_weapon_table.py from\n"
          "   docs/research/sf2/client-data/weapons.json; applied onto WEAPON_DATABASE before compileWeapon. Damage stays on the balance rules. */\n"
          "const SF2_WEAPONS = {\n" + "\n".join(rows).replace('"', "'") + "\n};\n"
          "for (const [id, o] of Object.entries(SF2_WEAPONS)) { const s = WEAPON_DATABASE[id]; Object.assign(s, o); delete s.vmAdsFov; delete s.adsVertical; } // (their own sights now)\n")
    p = 'src/01_core.js'; src = open(p, encoding='utf-8').read(); a, b = '// <sf2-weapons>\n', '// </sf2-weapons>\n'
    if a not in src:
        src = src.replace('const WEAPON_DEFS = {};\n', a + b + 'const WEAPON_DEFS = {};\n', 1)
    i, j = src.index(a) + len(a), src.index(b)
    open(p, 'w', encoding='utf-8').write(src[:i] + js + src[j:])
    print(p, len(rows), 'guns')


if __name__ == '__main__':
    main()
