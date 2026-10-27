"""SF2 UnrealScript decompiler (UE3, package version 904 / licensee 14) — turns a scripted function's bytecode back into
readable pseudo-UnrealScript, e.g. how SF2 grows and decays the weapon spread or applies the recoil punch to the view.
  python tools/sf2_unlzo.py SFGame ; python tools/sf2_unlzo.py Core ; python tools/sf2_unlzo.py Engine   (once)
  python tools/sf2_decompile.py SFWeapon.AddSpreadEx [SFPlayerController.UpdateRotation …]
Native functions (flag 0x400, e.g. SFWeapon.StartRecoil) have no script: their body lives in sf2.exe.
Function layout here: 40 header bytes, ScriptBytecodeSize (memory) at 40, ScriptStorageSize (disk) at 44, script at 48, then
iNative u16, precedence u8, flags u32, friendly name. On disk an object reference is 4 bytes, in memory 8 — jump targets are
memory offsets, so both are tracked.
"""
import struct, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from sf2_props import Pkg

NAT = {}


def load_natives():
    if NAT: return
    for f in ('tools/out/sf2/Core_dec.upk', 'tools/out/sf2/Engine_dec.upk', 'tools/out/sf2/SFGame_dec.upk'):
        if not os.path.exists(f): continue
        p = Pkg(f)
        for e in p.exports:
            if p.clsname(e) != 'Function' or e['size'] < 63: continue
            b = p.b[e['off']:e['off'] + e['size']]; t = 48 + struct.unpack_from('<i', b, 44)[0]
            if t + 15 > len(b): continue
            nat = struct.unpack_from('<H', b, t)[0]; flags = struct.unpack_from('<I', b, t + 3)[0]
            fi = struct.unpack_from('<i', b, t + 7)[0]; fr = p.names[fi] if 0 <= fi < len(p.names) else e['name']
            if nat: NAT[nat] = (e['name'], fr, flags)


OPS = {'+', '-', '*', '/', '%', '<', '>', '<=', '>=', '==', '!=', '&&', '||', '^^', '&', '|', '^', '**', '+=', '-=', '*=', '/=', '$', '@', '<<', '>>', '>>>', '~=', 'dot', 'cross', 'ClockwiseFrom', '$=', '@='}
CASTS = {0x36: 'InterfaceToObject', 0x37: 'InterfaceToString', 0x38: 'InterfaceToBool', 0x39: 'RotatorToVector', 0x3A: 'ByteToInt', 0x3B: 'ByteToBool',
         0x3C: 'ByteToFloat', 0x3D: 'IntToByte', 0x3E: 'IntToBool', 0x3F: 'IntToFloat', 0x40: 'BoolToByte', 0x41: 'BoolToInt', 0x42: 'BoolToFloat',
         0x43: 'FloatToByte', 0x44: 'FloatToInt', 0x45: 'FloatToBool', 0x46: 'ObjectToInterface', 0x47: 'ObjectToBool', 0x48: 'NameToBool',
         0x49: 'StringToByte', 0x4A: 'StringToInt', 0x4B: 'StringToBool', 0x4C: 'StringToFloat', 0x4D: 'StringToVector', 0x4E: 'StringToRotator',
         0x4F: 'VectorToBool', 0x50: 'VectorToRotator', 0x51: 'RotatorToBool', 0x52: 'ByteToString', 0x53: 'IntToString', 0x54: 'BoolToString',
         0x55: 'FloatToString', 0x56: 'ObjectToString', 0x57: 'NameToString', 0x58: 'VectorToString', 0x59: 'RotatorToString', 0x5A: 'DelegateToString',
         0x5B: 'StringToDelegate', 0x5C: 'StringToName'}


class Dec:
    def __init__(self, p, script):
        self.p, self.b, self.i, self.mem = p, script, 0, 0

    def u8(self): v = self.b[self.i]; self.i += 1; self.mem += 1; return v
    def u16(self): v = struct.unpack_from('<H', self.b, self.i)[0]; self.i += 2; self.mem += 2; return v
    def i32(self): v = struct.unpack_from('<i', self.b, self.i)[0]; self.i += 4; self.mem += 4; return v
    def f32(self): v = struct.unpack_from('<f', self.b, self.i)[0]; self.i += 4; self.mem += 4; return v
    def obj(self):
        v = struct.unpack_from('<i', self.b, self.i)[0]; self.i += 4; self.mem += 8
        return self.p.objname(v)
    def name(self):
        a, n = struct.unpack_from('<ii', self.b, self.i); self.i += 8; self.mem += 8
        s = self.p.names[a] if 0 <= a < len(self.p.names) else f'?{a}'
        return s if n == 0 else f'{s}_{n - 1}'

    def params(self):
        out = []
        while self.b[self.i] != 0x16:
            if self.b[self.i] == 0x4A: self.u8(); out.append(''); continue  # empty (optional) parameter
            out.append(self.expr())
        self.u8(); return out

    def call(self, nm, fr, args, flags=0):
        if fr in OPS and len(args) == 2: return f'({args[0]} {fr} {args[1]})'
        if flags & 0x10 and len(args) == 1: return f'{fr}{args[0]}'  # pre-operator
        if fr in ('!', '-', '~', '++', '--') and len(args) == 1: return f'{fr}{args[0]}'
        return f'{fr}({", ".join(args)})'

    def expr(self):
        op = self.u8()
        if op == 0x00 or op == 0x01 or op == 0x02 or op == 0x03 or op == 0x48: v = self.obj(); return ('default.' if op == 0x02 else '') + v
        if op == 0x04: return f'return {self.expr()}'
        if op == 0x05: self.obj(); self.u8(); return f'switch ({self.expr()})'
        if op == 0x06: return f'goto @{self.u16()}'
        if op == 0x07: t = self.u16(); return f'if (!{self.expr()}) goto @{t}'
        if op == 0x08: return 'stop'
        if op == 0x09: self.u16(); self.u8(); return f'assert({self.expr()})'
        if op == 0x0A:
            t = self.u16()
            return 'default:' if t == 0xFFFF else f'case {self.expr()}: (next @{t})'
        if op == 0x0B: return 'nothing'
        if op == 0x0D: return f'goto {self.expr()}'
        if op == 0x0E: self.obj(); return self.expr()
        if op == 0x0F: a = self.expr(); return f'{a} = {self.expr()}'
        if op == 0x10 or op == 0x1A: i = self.expr(); a = self.expr(); return f'{a}[{i}]'
        if op == 0x11: a = [self.expr() for _ in range(4)]; return f'new({a[0]}, {a[1]}, {a[2]}) {a[3]}'
        if op in (0x12, 0x19, 0x51 - 0x51 + 0x19 if False else 0x19):
            pass
        if op == 0x12 or op == 0x19:
            o = self.expr(); self.u16(); self.obj(); self.u8(); return f'{o}.{self.expr()}'
        if op == 0x13: c = self.obj(); return f'class<{c}>({self.expr()})'
        if op == 0x14: a = self.expr(); return f'{a} = {self.expr()}'
        if op == 0x15: return ''
        if op == 0x16: return ')'
        if op == 0x17: return 'self'
        if op == 0x18: self.u16(); return self.expr()
        if op == 0x1B: n = self.name(); return self.call(n, n, self.params())
        if op == 0x1C: n = self.obj(); return self.call(n, n, self.params())
        if op == 0x1D: return str(self.i32())
        if op == 0x1E: return f'{self.f32():g}'
        if op == 0x1F:
            j = self.b.index(0, self.i); s = self.b[self.i:j].decode('latin1'); self.mem += j + 1 - self.i; self.i = j + 1; return repr(s)
        if op == 0x20: return self.obj()
        if op == 0x21: return f"'{self.name()}'"
        if op == 0x22: return f'rot({self.i32()}, {self.i32()}, {self.i32()})'
        if op == 0x23: return f'vect({self.f32():g}, {self.f32():g}, {self.f32():g})'
        if op == 0x24: return str(self.u8())
        if op == 0x25: return '0'
        if op == 0x26: return '1'
        if op == 0x27: return 'true'
        if op == 0x28: return 'false'
        if op == 0x29: return self.obj()
        if op == 0x2A: return 'none'
        if op == 0x2C: return str(self.u8())
        if op == 0x2D: return self.expr()
        if op == 0x2E: c = self.obj(); return f'{c}({self.expr()})'
        if op == 0x2F: e = self.expr(); self.u16(); return f'foreach {e}'
        if op == 0x30: return 'iteratorpop'
        if op == 0x31: return 'iteratornext'
        if op in (0x32, 0x33): self.obj(); a = self.expr(); b = self.expr(); return f'({a} {"==" if op == 0x32 else "!="} {b})'
        if op == 0x34:
            s = ''
            while True:
                c = self.u16()
                if not c: break
                s += chr(c)
            return repr(s)
        if op == 0x35: m = self.obj(); self.obj(); self.u8(); self.u8(); return f'{self.expr()}.{m}'
        if op == 0x36: return f'{self.expr()}.Length'
        if op == 0x37: n = self.name(); return self.call(n, n, self.params())
        if op == 0x38: t = self.u8(); return f'{CASTS.get(t, hex(t))}({self.expr()})'
        if op == 0x39: a = self.expr(); x = self.expr(); n = self.expr(); self.u8(); return f'{a}.Insert({x}, {n})'
        if op == 0x3A: self.obj(); return 'return'
        if op in (0x3B, 0x3C, 0x3D, 0x3E): a = self.expr(); b = self.expr(); self.u8(); return f'({a} {"==" if op in (0x3B, 0x3D) else "!="} {b})'
        if op == 0x3F: return 'none'
        if op == 0x40: a = self.expr(); x = self.expr(); n = self.expr(); self.u8(); return f'{a}.Remove({x}, {n})'
        if op == 0x41: self.i32(); self.i32(); self.i32(); self.u8(); return ''
        if op == 0x42: self.u8(); self.obj(); n = self.name(); return self.call(n, n, self.params())
        if op == 0x43: n = self.name(); self.obj(); return n
        if op == 0x44: a = self.expr(); return f'{a} = {self.expr()}'
        if op == 0x45:
            c = self.expr(); self.u16(); a = self.expr(); self.u16(); b = self.expr(); return f'({c} ? {a} : {b})'
        if op == 0x46: a = self.expr(); self.u16(); x = self.expr(); self.u8(); return f'{a}.Find({x})'
        if op == 0x47: a = self.expr(); self.u16(); x = self.expr(); y = self.expr(); self.u8(); return f'{a}.Find({x}, {y})'
        if op == 0x49: self.u16(); e = self.expr(); self.u8(); return f'default param = {e}'
        if op == 0x4A: return ''
        if op == 0x4B: return self.name()
        if op == 0x52: c = self.obj(); return f'{c}({self.expr()})'
        if op == 0x53: return 'end'
        if op in (0x54, 0x55, 0x56):
            a = self.expr(); self.u16(); x = self.expr(); self.u8(); return f'{a}.{ {0x54: "Add", 0x55: "AddItem", 0x56: "RemoveItem"}[op]}({x})'
        if op == 0x57: a = self.expr(); self.u16(); x = self.expr(); y = self.expr(); self.u8(); return f'{a}.InsertItem({x}, {y})'
        if op == 0x58:
            a = self.expr(); it = self.expr(); has = self.u8(); ix = self.expr(); self.u16(); return f'foreach {a}({it}{", " + ix if has else ""})'
        if op == 0x59: a = self.expr(); self.u16(); x = self.expr(); self.u8(); return f'{a}.Sort({x})'
        if op == 0x5A: self.u16(); return ''
        if 0x60 <= op <= 0x6F:
            idx = ((op - 0x60) << 8) + self.u8(); nm, fr, fl = NAT.get(idx, (f'native{idx}', f'native{idx}', 0)); return self.call(nm, fr, self.params(), fl)
        if op >= 0x70:
            nm, fr, fl = NAT.get(op, (f'native{op}', f'native{op}', 0)); return self.call(nm, fr, self.params(), fl)
        raise ValueError(f'token 0x{op:02x} at disk {self.i - 1}')

    def statements(self):
        out = []
        while self.i < len(self.b):
            at = self.mem
            try: s = self.expr()
            except Exception as ex: out.append((at, f'/* stopped: {ex} */')); break
            if s and s not in ('nothing', 'end'): out.append((at, s))
            if s == 'end': break
        return out


def find(p, qual):
    cls, fn = qual.split('.')
    for e in p.exports:
        if e['name'] == fn and p.objname(e['outer']) == cls and p.clsname(e) == 'Function': return e


def decompile(p, e):
    b = p.b[e['off']:e['off'] + e['size']]; st = struct.unpack_from('<i', b, 44)[0]
    t = 48 + st; flags = struct.unpack_from('<I', b, t + 3)[0] if t + 7 <= len(b) else 0
    if flags & 0x400: return flags, [(0, '/* native: body in sf2.exe */')]
    return flags, Dec(p, b[48:48 + st]).statements()


def main():
    load_natives()
    pk = 'tools/out/sf2/SFGame_dec.upk'; args = sys.argv[1:]
    if '--pkg' in args: i = args.index('--pkg'); pk = args[i + 1]; del args[i:i + 2]
    p = Pkg(pk)
    for q in args:
        e = find(p, q)
        if not e: print('== not found:', q); continue
        flags, st = decompile(p, e)
        print(f'== {q}  ({e["size"]} bytes, flags 0x{flags:x})')
        for at, s in st: print(f'  @{at:<5} {s}')


if __name__ == '__main__':
    main()
