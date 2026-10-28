"""Apex weapon pages from apexlegends.wiki.gg (loop H2, 2026-10-28) -> docs/research/apex/web/wiki-<slug>.md: every table of the
rendered page (Stats, TTK, Advanced stats, attachments …) as Markdown under the section it sits in, with the URL and the date.
Through the MediaWiki API (action=parse, redirects), 3 s between pages; the names come from docs/research/apex/weapons-2026-10-27.json.
  python tools/fetch-wiki-gg.py
"""
import html, json, re, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / 'docs/research/apex/web'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
API = 'https://apexlegends.wiki.gg/api.php'


def get(params):
    req = urllib.request.Request(API + '?' + urllib.parse.urlencode(params), headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read().decode('utf-8'))


def cell(c):
    c = re.sub(r'<br\s*/?>', ' / ', c); c = re.sub(r'<sup.*?</sup>', '', c, flags=re.S)
    c = re.sub(r'<img[^>]*alt="([^"]*)"[^>]*>', r'\1', c)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', c))).strip().replace('|', '\\|')


def table_md(t):
    rows = []
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S):
        cells = []
        for m in re.finditer(r'<(t[hd])([^>]*)>(.*?)</t[hd]>', tr, re.S):
            span = re.search(r'colspan="?(\d+)', m.group(2)); cells += [cell(m.group(3))] * (int(span.group(1)) if span else 1)
        if cells: rows.append(cells)
    if not rows: return ''
    w = max(len(r) for r in rows); rows = [r + [''] * (w - len(r)) for r in rows]
    return '\n'.join(['| ' + ' | '.join(rows[0]) + ' |', '|' + ' --- |' * w] + ['| ' + ' | '.join(r) + ' |' for r in rows[1:]])


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    guns = json.load(open(ROOT / 'docs/research/apex/weapons-2026-10-27.json', encoding='utf-8'))
    guns = guns if isinstance(guns, list) else guns['weapons']
    ttk = 0
    for i, g in enumerate(guns):
        if i: time.sleep(3)
        slug = g['source'].rstrip('/').split('/')[-1]
        d = get({'action': 'parse', 'page': g['name'], 'prop': 'text|sections', 'redirects': 1, 'format': 'json'})
        if 'error' in d:  # a name the wiki spells otherwise: its search
            hit = get({'action': 'opensearch', 'search': g['name'], 'limit': 1, 'format': 'json'})[1]
            time.sleep(3); d = get({'action': 'parse', 'page': hit[0], 'prop': 'text|sections', 'redirects': 1, 'format': 'json'}) if hit else d
        if 'error' in d: print(slug, 'NOT FOUND', g['name']); continue
        title = d['parse']['title']; page = d['parse']['text']['*']; url = 'https://apexlegends.wiki.gg/wiki/' + urllib.parse.quote(title.replace(' ', '_'))
        out = [f'# {title}（apexlegends.wiki.gg）', '', f'- 網址：{url}', f'- 抓取：{date.today().isoformat()}（本機 loop H2，MediaWiki API action=parse）', '']
        # walk headings and tables in page order
        n = 0
        for m in re.finditer(r'<h([2-4])[^>]*>(.*?)</h\1>|<table[^>]*class="[^"]*(?:wikitable|infobox)[^"]*"[^>]*>.*?</table>', page, re.S):
            if m.group(1): out += ['', '#' * (int(m.group(1)) + 0) + ' ' + cell(m.group(2)).replace('[edit]', '').replace('[ edit | edit source ]', '').strip(), '']
            else:
                md = table_md(m.group(0))
                if md: out += [md, '']; n += 1
        has_ttk = bool(re.search(r'time.to.kill|TTK', page, re.I)); ttk += has_ttk
        (OUT / f'wiki-{slug}.md').write_text('\n'.join(out).rstrip() + '\n', encoding='utf-8')
        print(slug, title, 'tables', n, 'TTK' if has_ttk else '-', flush=True)
    print('pages with a TTK table:', ttk)


if __name__ == '__main__':
    main()
