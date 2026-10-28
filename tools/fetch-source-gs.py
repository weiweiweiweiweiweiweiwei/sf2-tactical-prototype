"""Apex weapon pages from apex.source.gs (loop H1, 2026-10-28: the cloud session's network is blocked from it) ->
docs/research/apex/source-gs-s30/<slug>.html (the page as served) + <slug>.md (its <main> as text: headings, then every
label / value line in page order — damage, fire rate, magazine, handling, ballistics, spread and recoil, each attachment tier).
  python tools/fetch-source-gs.py            (all 29 weapons of docs/research/apex/weapons-2026-10-27.json; 3 s between pages)
  python tools/fetch-source-gs.py --md-only  (re-convert the saved HTML)
"""
import html, json, re, sys, time, urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / 'docs/research/apex/source-gs-s30'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'


def to_md(page, url):
    m = re.search(r'<main[^>]*>(.*?)</main>', page, re.S); body = m.group(1) if m else page
    body = re.sub(r'<script.*?</script>|<style.*?</style>|<svg.*?</svg>', '', body, flags=re.S)
    body = re.sub(r'<h([1-4])[^>]*>', lambda h: '\n' + '#' * int(h.group(1)) + ' ', body)  # headings stay headings
    body = re.sub(r'</h[1-4]>', '\n', body)
    text = html.unescape(re.sub(r'<[^>]+>', '\n', body))
    lines = [re.sub(r'\s+', ' ', l).strip() for l in text.split('\n')]
    lines = [l for l in lines if l and l not in ('·',)]
    title = re.search(r'<title>(.*?)</title>', page, re.S)
    head = [f'# {html.unescape(title.group(1)).strip() if title else url}', '', f'- 來源：{url}', f'- 抓取：{date.today().isoformat()}（本機 loop H1）',
            '- 每行一個欄位或數值，照網頁順序（標籤後面緊接它的值）。', '']
    return '\n'.join(head + [l if l.startswith('#') else l for l in lines]) + '\n'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    guns = json.load(open(ROOT / 'docs/research/apex/weapons-2026-10-27.json', encoding='utf-8'))
    guns = guns if isinstance(guns, list) else list(guns.get('weapons', guns).values()) if isinstance(guns.get('weapons', guns), dict) else guns['weapons']
    for i, g in enumerate(guns):
        url = g['source']; slug = url.rstrip('/').split('/')[-1]; f = OUT / f'{slug}.html'
        if '--md-only' not in sys.argv:
            if i: time.sleep(3)
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en'})
            with urllib.request.urlopen(req, timeout=60) as r: f.write_bytes(r.read())
        (OUT / f'{slug}.md').write_text(to_md(f.read_text(encoding='utf-8', errors='replace'), url), encoding='utf-8')
        print(slug, f.stat().st_size, flush=True)


if __name__ == '__main__':
    main()
