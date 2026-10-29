"""SF2 (UE3, package version 904 / licensee 14) — read the tagged properties of objects in a cooked package, e.g. the weapon
class defaults in SFGameContent.upk (Default__SFCWeaponM4A1: RecoilDefault, FireInterval, Spread…). UModel lists these objects
but cannot read SF2's own classes; the property tags are plain UE3 serialisation, so they are read here directly.
  python tools/sf2_props.py [Default__SFCWeaponM4A1 …] [--pkg SFGameContent] [--json out.json]
"""
import struct, sys, json

PKG_DIR = 'D:/SpecialForce2/SFGame/CookedPCConsole/'


class Pkg:
    def __init__(self, path):
        self.b = b = open(path, 'rb').read(); self.o = 0
        tag, ver, lic = struct.unpack_from('<IHH', b, 0); assert tag == 0x9E2A83C1, 'not a UE3 package'
        self.ver = ver; self.o = 8
        self.i32()  # total header size
        self.fstr()  # folder name
        self.flags = self.u32()
        self.name_n, self.name_off, self.exp_n, self.exp_off, self.imp_n, self.imp_off = (self.i32() for _ in range(6))
        self.names = []; self.o = self.name_off
        for _ in range(self.name_n):
            self.names.append(self.fstr()); self.o += 8  # name flags
        self.imports = []; self.o = self.imp_off
        for _ in range(self.imp_n):
            cp, cn, outer, on = self.name(), self.name(), self.i32(), self.name(); self.imports.append(dict(cls=cn, outer=outer, name=on))
        self.exports = []; self.o = self.exp_off
        for _ in range(self.exp_n):
            cls, sup, outer = self.i32(), self.i32(), self.i32(); nm = self.name(); arch = self.i32(); oflags = struct.unpack_from('<Q', b, self.o)[0]; self.o += 8
            size, off = self.i32(), self.i32(); self.i32()  # export flags
            n = self.i32(); self.o += 4 * n  # net object counts
            self.o += 16 + 4  # package guid, package flags
            self.exports.append(dict(cls=cls, sup=sup, outer=outer, name=nm, arch=arch, flags=oflags, size=size, off=off))

    def i32(self): v = struct.unpack_from('<i', self.b, self.o)[0]; self.o += 4; return v
    def u32(self): v = struct.unpack_from('<I', self.b, self.o)[0]; self.o += 4; return v
    def f32(self): v = struct.unpack_from('<f', self.b, self.o)[0]; self.o += 4; return v
    def fstr(self):
        n = self.i32()
        if n >= 0: s = self.b[self.o:self.o + n].rstrip(b'\0').decode('latin1'); self.o += n
        else: s = self.b[self.o:self.o - 2 * n].decode('utf-16-le').rstrip('\0'); self.o += -2 * n
        return s
    def name(self):
        i, num = self.i32(), self.i32(); s = self.names[i] if 0 <= i < len(self.names) else f'?{i}'
        return s if num == 0 else f'{s}_{num - 1}'
    def objname(self, idx):
        if idx > 0: return self.exports[idx - 1]['name']
        if idx < 0: return self.imports[-idx - 1]['name']
        return 'None'
    def clsname(self, e): return self.objname(e['cls']) if e['cls'] else 'Class'

    # tagged properties of one export; structs are read as nested tags, unknown ones as raw hex
    def props(self, e, skip=None):
        self.o = e['off']; end = e['off'] + e['size']
        self.i32()  # net index
        # v65n a component (…Component class, not a template / default object) stores TemplateOwnerClass (4 bytes) before its tags
        if skip is None: skip = 4 if self.clsname(e).endswith('Component') and not e['name'].startswith('Default__') else 0
        if skip == 'auto' or (skip == 0 and not self._tagAt(self.o)): # v65o a level actor's native state frame (length varies) before its tags
            start = self.o; skip = next((k for k in range(0, 96, 2) if self._tagAt(start + k)), 0); self.o = start
        self.o += skip
        return self._tags(end)
    TYPES = {'IntProperty', 'FloatProperty', 'BoolProperty', 'ByteProperty', 'NameProperty', 'StrProperty', 'ObjectProperty', 'ClassProperty', 'StructProperty', 'ArrayProperty', 'ComponentProperty', 'InterfaceProperty', 'DelegateProperty'}
    def _tagAt(self, o):
        if o + 16 > len(self.b): return False
        i, n, t, tn = struct.unpack_from('<4i', self.b, o)
        return 0 <= i < len(self.names) and n == 0 and 0 <= t < len(self.names) and tn == 0 and (self.names[t] in self.TYPES or self.names[i] == 'None')

    def _tags(self, end):
        out = []
        while self.o < end:
            nm = self.name()
            if nm == 'None': break
            typ = self.name(); size = self.i32(); idx = self.i32(); extra = None
            if typ == 'StructProperty': extra = self.name()
            elif typ == 'ByteProperty' and self.ver >= 633: extra = self.name()
            elif typ == 'BoolProperty':
                val = self.b[self.o] != 0; self.o += 1; out.append((nm, idx, typ, val)); continue
            start = self.o; val = self._value(typ, size, extra)
            self.o = start + size
            out.append((nm, idx, typ if extra is None else f'{typ}<{extra}>', val))
        return out

    def _value(self, typ, size, extra):
        b, o = self.b, self.o
        if typ == 'FloatProperty': return round(struct.unpack_from('<f', b, o)[0], 6)
        if typ == 'IntProperty': return struct.unpack_from('<i', b, o)[0]
        if typ in ('ObjectProperty', 'ClassProperty', 'ComponentProperty'): return self.objname(struct.unpack_from('<i', b, o)[0])
        if typ == 'NameProperty': return self.name()
        if typ == 'ByteProperty': return b[o] if size == 1 else self.name()
        if typ == 'StrProperty': return self.fstr()
        if typ == 'StructProperty':
            if extra in ('Vector', 'Rotator') and size == 12:
                return struct.unpack_from('<fff' if extra == 'Vector' else '<iii', b, o)
            if extra == 'Vector2D' and size == 8: return struct.unpack_from('<ff', b, o)
            try:
                sub = self._tags(o + size); return {f'{n}[{i}]' if i else n: v for n, i, t, v in sub}
            except Exception: return b[o:o + size].hex()
        if typ == 'ArrayProperty':
            n = struct.unpack_from('<i', b, o)[0]; body = b[o + 4:o + size]
            if n and len(body) == 4 * n:  # ints / floats / objects: show both readings
                return dict(n=n, f=[round(x, 6) for x in struct.unpack_from(f'<{n}f', body)], i=list(struct.unpack_from(f'<{n}i', body)))
            if n and len(body) % n == 0:  # struct elements: try tags per element
                try:
                    self.o = o + 4; items = []
                    for _ in range(n): items.append({f'{a}[{i}]' if i else a: v for a, i, t, v in self._tags(o + size)})
                    return items
                except Exception: pass
            return dict(n=n, hex=body[:256].hex())
        return b[o:o + size][:64].hex()


def main():
    args = [a for a in sys.argv[1:]]; pkg = 'SFGameContent'; out = None
    if '--pkg' in args: i = args.index('--pkg'); pkg = args[i + 1]; del args[i:i + 2]
    if '--json' in args: i = args.index('--json'); out = args[i + 1]; del args[i:i + 2]
    p = Pkg(pkg if pkg.endswith('.upk') else PKG_DIR + pkg + '.upk'); res = {}  # (an LZO package: tools/sf2_unlzo.py first, then --pkg its _dec.upk)
    want = args or ['Default__SFCWeaponM4A1']
    for e in p.exports:
        if e['name'] in want or any(w.endswith('*') and e['name'].startswith(w[:-1]) for w in want):
            res[e['name']] = dict(cls=p.clsname(e), props=[[n, i, t, v] for n, i, t, v in p.props(e)])
    if out: json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
    else:
        for k, v in res.items():
            print('==', k, v['cls'])
            for n, i, t, val in v['props']: print(f'  {n}[{i}] {t} = {val}')


if __name__ == '__main__':
    main()
