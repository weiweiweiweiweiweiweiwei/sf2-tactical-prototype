"""Decompress an LZO-compressed UE3 package (SF2's SFGame.upk: compression flag 2) → a plain package tools/sf2_props.py can read.
  python tools/sf2_unlzo.py SFGame [out.upk]        (default out: tools/out/sf2/<name>_dec.upk)
Pure Python LZO1X (no extra install): the package summary lists chunks; each chunk is a tagged header (0x9E2A83C1, block size,
sizes) followed by its LZO blocks.
"""
import struct, sys, os

PKG_DIR = 'D:/SpecialForce2/SFGame/CookedPCConsole/'


def lzo1x(src, out_len):
    dst = bytearray(); ip = 0; n = len(src)

    def lits(k):
        nonlocal ip
        dst.extend(src[ip:ip + k]); ip += k

    def copy(pos, k):
        if pos < 0: raise ValueError('lzo: bad match')
        if pos + k <= len(dst): dst.extend(dst[pos:pos + k])
        else:
            for i in range(k): dst.append(dst[pos + i])

    def run(t):  # length extension used by literal runs and matches
        nonlocal ip
        while src[ip] == 0: t += 255; ip += 1
        t += src[ip]; ip += 1
        return t

    state = 'loop'; t = src[0]
    if t > 17:
        ip = 1; t -= 17
        if t < 4: state = 'match_next'
        else: lits(t); state = 'first_lit'
    while True:
        if state == 'loop':
            t = src[ip]; ip += 1
            if t >= 16: state = 'match'; continue
            if t == 0: t = run(15)
            lits(t + 3); state = 'first_lit'; continue
        if state == 'first_lit':
            t = src[ip]; ip += 1
            if t >= 16: state = 'match'; continue
            pos = len(dst) - (1 + 0x0800) - (t >> 2) - (src[ip] << 2); ip += 1
            copy(pos, 3); state = 'done'; continue
        if state == 'match':
            if t >= 64:
                pos = len(dst) - 1 - ((t >> 2) & 7) - (src[ip] << 3); ip += 1
                copy(pos, (t >> 5) + 1)
            elif t >= 32:
                t &= 31
                if t == 0: t = run(31)
                pos = len(dst) - 1 - ((src[ip] | src[ip + 1] << 8) >> 2); ip += 2
                copy(pos, t + 2)
            elif t >= 16:
                pos = len(dst) - ((t & 8) << 11); t &= 7
                if t == 0: t = run(7)
                pos -= (src[ip] | src[ip + 1] << 8) >> 2; ip += 2
                if pos == len(dst): break  # end of stream
                copy(pos - 0x4000, t + 2)
            else:
                pos = len(dst) - 1 - (t >> 2) - (src[ip] << 2); ip += 1
                copy(pos, 2)
            state = 'done'; continue
        if state == 'done':
            t = src[ip - 2] & 3
            if t == 0: state = 'loop'; continue
            state = 'match_next'; continue
        if state == 'match_next':
            lits(t); t = src[ip]; ip += 1; state = 'match'; continue
    if len(dst) != out_len: raise ValueError(f'lzo: {len(dst)} bytes, expected {out_len}')
    return bytes(dst)


def chunks(b):
    o = 8; o += 4; n = struct.unpack_from('<i', b, o)[0]; o += 4 + (n if n >= 0 else -2 * n); o += 4 + 24 + 4 + 12 + 4 + 16
    g = struct.unpack_from('<i', b, o)[0]; o += 4 + 12 * g
    eng, cook, cf, nch = struct.unpack_from('<iiIi', b, o); o += 16
    return cf, [struct.unpack_from('<4i', b, o + 16 * i) for i in range(nch)]


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'SFGame'
    out = sys.argv[2] if len(sys.argv) > 2 else f'tools/out/sf2/{name}_dec.upk'
    b = open(PKG_DIR + name + '.upk', 'rb').read(); cf, ch = chunks(b)
    if cf != 2: raise SystemExit(f'compression {cf}: not LZO')
    total = max(u + us for u, us, c, cs in ch); res = bytearray(total); res[:ch[0][0]] = b[:ch[0][0]]
    for u, us, c, cs in ch:
        tag, bs, csz, usz = struct.unpack_from('<IiII', b, c); assert tag == 0x9E2A83C1
        nb = (usz + bs - 1) // bs; o = c + 16 + 8 * nb; w = u
        for i in range(nb):
            bc, bu = struct.unpack_from('<ii', b, c + 16 + 8 * i)
            res[w:w + bu] = lzo1x(b[o:o + bc], bu); o += bc; w += bu
    os.makedirs(os.path.dirname(out), exist_ok=True); open(out, 'wb').write(res)
    print('UNLZO', name, len(ch), 'chunks', len(b), '->', len(res), out)


if __name__ == '__main__':
    main()
