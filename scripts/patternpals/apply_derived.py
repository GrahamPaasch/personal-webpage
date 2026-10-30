"""Apply the derivation results to the catalog:
  - drop junk / merged entries from patterns.ts and excerpts.ts (and their orphan images)
  - rename entries, re-point excerpts to the right page and re-crop the images
  - write lib/patternpals/derived.ts (counts + provenance + removed-id redirects)
"""
from __future__ import annotations

import io
import os
import re

import fitz
from PIL import Image

from derive_books import (BOOKS, BOOK_DIR, DERIVED_TS, EXCERPT_DIR, EXCERPTS_TS, PATTERNS_TS, Derived, Entry, norm)

TARGET_WIDTH = 1078
CROP_HEIGHT = 833
MARGIN_ABOVE = 28


def render_excerpt(tag: str, page: int, name: str, out_path: str) -> None:
    doc = fitz.open(os.path.join(BOOK_DIR, BOOKS[tag][0]))
    pg = doc[page - 1]
    zoom = TARGET_WIDTH / pg.rect.width
    hits = []
    for probe in (name, name.split('(')[0].strip(), re.sub(r'[^A-Za-z0-9 ]', '', name)):
        if probe:
            hits = pg.search_for(probe)
            if hits:
                break
    top = 0.0
    if hits:
        # prefer the hit that starts a line (heading), i.e. the left-most occurrence
        hit = min(hits, key=lambda r: (round(r.x0 / 40), r.y0))
        top = max(0.0, hit.y0 - MARGIN_ABOVE / zoom)
    bottom = min(pg.rect.height, top + CROP_HEIGHT / zoom)
    if bottom - top < CROP_HEIGHT / zoom:
        top = max(0.0, bottom - CROP_HEIGHT / zoom)
    clip = fitz.Rect(0, top, pg.rect.width, bottom)
    pix = pg.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
    img = Image.open(io.BytesIO(pix.tobytes('png')))
    img.save(out_path, 'WEBP', quality=82, method=6)


def ts_str(s: str) -> str:
    return "'" + s.replace('\\', '\\\\').replace("'", "\\'") + "'"


def apply(entries: list[Entry], excerpts: dict[str, dict], derived: list[Derived]) -> None:
    by_id = {e.id: e for e in entries}
    dmap = {d.id: d for d in derived}
    removed: dict[str, str | None] = {}
    for d in derived:
        if d.junk:
            removed[d.id] = None
        elif d.merge_into:
            removed[d.id] = d.merge_into

    # ---- patterns.ts
    src = open(PATTERNS_TS, encoding='utf-8').read()
    for e in entries:
        d = dmap[e.id]
        if e.id in removed:
            assert e.raw in src
            src = src.replace(e.raw, '', 1)
        elif d.rename:
            new_raw = e.raw.replace(f"    name: {ts_str(e.name)},\n", f"    name: {ts_str(d.rename)},\n", 1)
            assert new_raw != e.raw, e.id
            src = src.replace(e.raw, new_raw, 1)
    # drop metadata overrides for removed ids
    for rid in removed:
        src = re.sub(r"  '" + re.escape(rid) + r"': \{\n(?:    .*\n)*?  \},\n", '', src)
    open(PATTERNS_TS, 'w', encoding='utf-8').write(src)

    # ---- excerpts.ts + images
    esrc = open(EXCERPTS_TS, encoding='utf-8').read()
    regenerated = []
    for e in entries:
        d = dmap[e.id]
        ex = excerpts.get(e.id)
        if e.id in removed:
            if ex:
                esrc = esrc.replace(ex['raw'], '', 1)
                img = os.path.join(EXCERPT_DIR, os.path.basename(ex['image']))
                if os.path.exists(img):
                    os.remove(img)
            continue
        name = d.rename or e.name
        if d.new_page or (ex and d.rename):
            tag = ex['tag'] if ex else ('highgate2014-05-16' if 'highgate2014-05-16' in e.sources else e.sources[0])
            page = d.new_page or ex['page']
            title = BOOKS[tag][1]
            image = f'/patternpals/excerpts/{e.id}.webp'
            block = (
                f"  '{e.id}': {{\n    sourceTag: 'source:{tag}',\n    sourceTitle: {ts_str(title)},\n"
                f"    bookFile: '/patternpals/books/{BOOKS[tag][0]}',\n    page: {page},\n    image: '{image}',\n"
                f"    alt: {ts_str(f'Excerpt for {name} from {title}, page {page}.')},\n  }},\n"
            )
            if ex:
                esrc = esrc.replace(ex['raw'], block, 1)
            else:
                esrc = esrc.replace('\n};\n\nexport const getPatternExcerpt', '\n' + block + '};\n\nexport const getPatternExcerpt', 1)
            if d.new_page:
                render_excerpt(tag, page, name, os.path.join(EXCERPT_DIR, f'{e.id}.webp'))
                regenerated.append(e.id)
    # keep the map sorted by key like the original file
    head, rest = esrc.split('export const PATTERN_EXCERPTS: Record<string, PatternExcerpt> = {\n', 1)
    body, tail = rest.split('\n};\n', 1)
    blocks = re.findall(r"  '[^']+': \{\n(?:    .*\n)*?  \},", body)
    blocks.sort(key=lambda b: re.match(r"  '([^']+)'", b).group(1))
    esrc = head + 'export const PATTERN_EXCERPTS: Record<string, PatternExcerpt> = {\n' + '\n'.join(blocks) + '\n};\n' + tail
    open(EXCERPTS_TS, 'w', encoding='utf-8').write(esrc)

    write_derived(entries, dmap, removed)
    remove_orphan_images()


def remove_orphan_images() -> None:
    keys = set(re.findall(r"^  '([^']+)': \{$", open(EXCERPTS_TS, encoding='utf-8').read(), re.M))
    for f in os.listdir(EXCERPT_DIR):
        if f.endswith('.webp') and f[:-5] not in keys:
            os.remove(os.path.join(EXCERPT_DIR, f))


def write_derived(entries: list[Entry], dmap: dict[str, Derived], removed: dict[str, str | None]) -> None:
    lines = [
        '// GENERATED by scripts/patternpals/derive_books.py apply — do not edit by hand.',
        '// Juggler/club counts derived from the source books\' own text (chapter ranges, "(N)" suffixes,',
        '// "Jugglers:" fields, index qualifiers) plus a few maintainer-reviewed values; see jugglersProvenance.',
        "import type { PatternDerivedMeta } from './types';",
        '',
        'export const PATTERN_DERIVED: Record<string, PatternDerivedMeta> = {',
    ]
    for e in entries:
        if e.id in removed:
            continue
        d = dmap[e.id]
        fields = []
        if d.jugglers is not None:
            fields.append(f'numJugglers: {d.jugglers}')
            if d.jugglers_max is not None:
                fields.append(f'maxJugglers: {"null" if d.jugglers_max == 0 else d.jugglers_max}')
            fields.append(f'jugglersProvenance: {ts_str(d.jug_prov)}')
        if d.clubs:
            fields.append(f'numClubs: {d.clubs}')
            fields.append(f'clubsProvenance: {ts_str(d.clubs_prov)}')
        if d.flags:
            fields.append('flags: [' + ', '.join(ts_str(f) for f in d.flags) + ']')
        if d.anthology:
            a = d.anthology
            notation = [('page', a['page'])] + [(('prechac' if k == 'préchac' else k), a[k]) for k in ('sequence', 'global', 'local', 'préchac', 'start', 'throws', 'interface', 'remark') if a.get(k)]
            fields.append('anthology: { ' + ', '.join(f'{k}: {v if isinstance(v, int) else ts_str(v)}' for k, v in notation) + ' }')
        if fields:
            lines.append(f"  '{e.id}': {{ " + ', '.join(fields) + ' },')
    lines.append('};')
    lines.append('')
    lines.append('/** Ids removed in the 2026-10 cleanup: value is the id they were merged into, or null for junk. */')
    lines.append('export const REMOVED_PATTERN_IDS: Record<string, string | null> = {')
    for rid, target in removed.items():
        lines.append(f"  '{rid}': {ts_str(target) if target else 'null'},")
    lines.append('};')
    lines.append('')
    open(DERIVED_TS, 'w', encoding='utf-8').write('\n'.join(lines))
    print(f'wrote derived.ts ({len(removed)} removed ids)')
