#!/usr/bin/env python3
"""Derive PatternPals metadata (juggler/club counts, junk flags, index merges,
excerpt page fixes) from the source books' own text layers.

Usage:
  python3 scripts/patternpals/derive_books.py report   # write work/report.tsv for review
  python3 scripts/patternpals/derive_books.py apply    # rewrite patterns.ts/excerpts.ts, write derived.ts, regenerate excerpt images

Everything here is reproducible from public/patternpals/books/*.pdf plus the
catalog files; the output is generated, not hand-edited.
"""
from __future__ import annotations

import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

import fitz  # pymupdf

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BOOK_DIR = os.path.join(REPO, 'public', 'patternpals', 'books')
EXCERPT_DIR = os.path.join(REPO, 'public', 'patternpals', 'excerpts')
PATTERNS_TS = os.path.join(REPO, 'lib', 'patternpals', 'patterns.ts')
EXCERPTS_TS = os.path.join(REPO, 'lib', 'patternpals', 'excerpts.ts')
DERIVED_TS = os.path.join(REPO, 'lib', 'patternpals', 'derived.ts')
WORK = os.environ.get('PATTERNPALS_WORK', os.path.join(REPO, 'scripts', 'patternpals', 'work'))

BOOKS = {
    'majbook_v3': ('majbook_v3.pdf', 'Madison Juggling Club Passing Book (v3)'),
    'highgate2014-05-16': ('highgate2014-05-16.pdf', 'Highgate Passing Patterns (2014)'),
    'passingpatternsaug06': ('PassingPatternsAug06.pdf', 'Passing Patterns Compendium (Aug 2006)'),
    'willpatterns': ('WillPatterns.pdf', 'Will Murray Passing Patterns'),
    'madison_patterns_v1_2': ('Madison_Patterns_V1-2.pdf', 'Madison Patterns V1-2'),
    'takeouts': ('takeouts.pdf', 'Takeouts'),
    'anthology': ('anthology.pdf', 'Passing Pattern Anthology'),
    'curriculum_flowchart': ('Curriculum-Flowchart.pdf', 'Passing Progression Flowchart'),
}

NUMBER_WORDS = {
    'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7',
    'eight': '8', 'nine': '9', 'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
}
TRANSLIT = str.maketrans({'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': '', 'é': 'e', 'è': 'e', 'ﬂ': 'fl', 'ﬀ': 'ff', 'ﬁ': 'fi', '’': "'", '‘': "'", 'λ': 'y'})


def norm(name: str) -> str:
    s = name.lower().translate(TRANSLIT)
    s = s.replace("'s", 's').replace("'", '')
    s = re.sub(r'[^a-z0-9+]+', ' ', s)
    s = ' '.join(NUMBER_WORDS.get(w, w) for w in s.split())
    s = re.sub(r'\b(\d+) count\b', r'\1count', s)
    s = re.sub(r'\b(the|of)\b', '', s)
    return ' '.join(s.split())


def dedup_key(name: str) -> str:
    k = norm(rotate_name(name))
    return re.sub(r'\b(feed|feast|triangle|box|line|weave)s\b', r'\1', k)


def rotate_name(name: str) -> str:
    """'Bookends, Jim's' -> "Jim's Bookends"; 'One count, Jim's, triangle' -> "Jim's One count triangle";
    'Programming, Copenhagen countdown' -> 'Copenhagen countdown'."""
    if name.lower().startswith('programming, '):
        return name[len('programming, '):]
    parts = [p.strip() for p in name.split(',')]
    if len(parts) < 2:
        return name
    return ' '.join([parts[1], parts[0]] + parts[2:])


# ---------------------------------------------------------------- loading

_PAGE_CACHE: dict[str, list[str]] = {}


def pages(tag: str) -> list[str]:
    if tag not in _PAGE_CACHE:
        doc = fitz.open(os.path.join(BOOK_DIR, BOOKS[tag][0]))
        _PAGE_CACHE[tag] = [p.get_text() for p in doc]
    return _PAGE_CACHE[tag]


def page_text(tag: str, page: Optional[int]) -> str:
    if page is None:
        return ''
    ps = pages(tag)
    return ps[page - 1] if 1 <= page <= len(ps) else ''


ENTRY_RE = re.compile(
    r"^  \{\n    id: '([^']+)',\n    name: '((?:[^'\\]|\\.)*)',\n    difficulty: '(\w+)',\n"
    r"    requiredJugglers: (\d+),\n    props: \[([^\]]*)\],\n    description: '((?:[^'\\]|\\.)*)',\n"
    r"    tags: \[([^\]]*)\],\n    prerequisites: \[([^\]]*)\],\n  \},\n",
    re.M,
)


@dataclass
class Entry:
    id: str
    name: str
    difficulty: str
    required: int
    tags: list[str]
    raw: str
    sources: list[str] = field(default_factory=list)


def unescape(s: str) -> str:
    return s.replace("\\'", "'")


def parse_catalog() -> list[Entry]:
    src = open(PATTERNS_TS, encoding='utf-8').read()
    entries = []
    for m in ENTRY_RE.finditer(src):
        tags = re.findall(r"'([^']+)'", m.group(7))
        e = Entry(m.group(1), unescape(m.group(2)), m.group(3), int(m.group(4)), tags, m.group(0))
        e.sources = [t[len('source:'):] for t in tags if t.startswith('source:')]
        entries.append(e)
    ids = re.findall(r"^    id: '", src, re.M)
    assert len(entries) == len(ids), f'parsed {len(entries)} of {len(ids)} entries'
    return entries


EXCERPT_RE = re.compile(
    r"  '([^']+)': \{\n    sourceTag: 'source:([^']+)',\n    sourceTitle: '([^']*)',\n    bookFile: '([^']*)',\n"
    r"    page: (\d+),\n    image: '([^']*)',\n    alt: '((?:[^'\\]|\\.)*)',\n  \},\n"
)


def parse_excerpts() -> dict[str, dict]:
    src = open(EXCERPTS_TS, encoding='utf-8').read()
    out = {}
    for m in EXCERPT_RE.finditer(src):
        out[m.group(1)] = {'tag': m.group(2), 'title': m.group(3), 'file': m.group(4), 'page': int(m.group(5)), 'image': m.group(6), 'alt': m.group(7), 'raw': m.group(0)}
    count = len(re.findall(r"^  '[^']+': \{$", src, re.M))
    assert len(out) == count, f'parsed {len(out)} of {count} excerpts'
    return out


# ---------------------------------------------------------------- book helpers

def heading_pages(tag: str, name: str, first: int = 1, last: Optional[int] = None, allow_paren: bool = True) -> list[int]:
    """Pages where `name` appears as its own line (optionally followed by '(...)')."""
    n = norm(name)
    out = []
    ps = pages(tag)
    last = last or len(ps)
    for pn in range(first, last + 1):
        for line in ps[pn - 1].split('\n'):
            s = line.strip()
            if not s:
                continue
            if norm(s) == n or (allow_paren and '(' in s and norm(s.split('(')[0]) == n):
                out.append(pn)
                break
    return out


def name_on_page(tag: str, name: str, page: Optional[int]) -> bool:
    return bool(page) and norm(name) in norm(page_text(tag, page))


def parse_highgate_index() -> dict[str, list[dict]]:
    """Index pp.239-246: 'Name (qualifier) 12, 34-36'."""
    idx: dict[str, list[dict]] = defaultdict(list)
    for pn in range(239, 247):
        for line in page_text('highgate2014-05-16', pn).split('\n'):
            line = line.strip()
            m = re.match(r'^(.*?[^\d,\- ])\s+(\d+(?:\s*[-,]\s*\d+)*)$', line)
            if not m or m.group(1).lower() == 'index':
                continue
            name = m.group(1).strip()
            pages_ = []
            for part in re.split(r',\s*', m.group(2)):
                r = [int(x) for x in re.findall(r'\d+', part)]
                if len(r) == 2:
                    pages_.extend(range(r[0], r[1] + 1))
                elif r:
                    pages_.append(r[0])
            quals = re.findall(r'\(([^)]*)\)', name)
            base = re.sub(r'\s*\([^)]*\)', '', name).strip()
            rec = {'name': name, 'base': base, 'quals': quals, 'pages': pages_, 'first': pages_[0]}
            idx[norm(base)].append(rec)
            if norm(name) != norm(base):
                idx[norm(name)].append(rec)
    return idx


def parse_highgate_toc() -> list[tuple[str, int]]:
    toc = []
    for pn in (2, 3):
        for line in page_text('highgate2014-05-16', pn).split('\n'):
            m = re.match(r'^(.*?)\.{3,}\s*(\d+)\s*$', line.strip())
            if m:
                toc.append((m.group(1).strip(), int(m.group(2))))
    return toc


def highgate_people(page: int) -> Optional[int]:
    if 4 <= page <= 70:
        return 2
    if 71 <= page <= 156:
        return 3
    if 157 <= page <= 238:
        return 4
    return None


def highgate_clubs(page: int, people: Optional[int]) -> Optional[int]:
    if people == 2:
        if 23 <= page <= 25:
            return 5
        if 51 <= page <= 70:
            return 7
        return 6
    if people == 3:
        return 10 if 134 <= page <= 156 else 9
    if people == 4:
        return 13 if 213 <= page <= 238 else 12
    return None


def parse_anthology() -> dict[str, dict]:
    pats: dict[str, dict] = {}
    cur_j = cur_c = None
    cur_sec = None
    for pn, text in enumerate(pages('anthology'), start=1):
        lines = text.split('\n')
        for i, l in enumerate(lines):
            s = l.strip()
            m = re.match(r'^(\d+)\.\s+(\d+) jugglers?\s*$', s)
            if m:
                cur_j = int(m.group(2))
                continue
            m = re.match(r'^(\d+\.\d+)\.\s+(\d+) clubs?\s*$', s)
            if m:
                cur_c = int(m.group(2))
                continue
            m = re.match(r'^(\d+\.\d+\.\d+)\.\s+(.+)$', s)
            if m:
                cur_sec = m.group(2)
                continue
            if s.startswith('sequence:') or s.startswith('préchac:'):
                j = i - 1
                while j >= 0 and not lines[j].strip():
                    j -= 1
                name = lines[j].strip()
                if re.match(r'^(sequence|global|local|start|throws|interface|remark|préchac|color coding)\b', name):
                    continue
                if re.match(r'^[A-F]:', name) or len(name) < 2 or re.match(r'^[LR](\s|$)', name):
                    continue
                key = norm(name)
                if key in pats:
                    continue
                rec = {'name': name, 'page': pn, 'jugglers': cur_j, 'clubs': cur_c, 'section': cur_sec}
                for k in range(i, min(i + 16, len(lines))):
                    fm = re.match(r'^(sequence|global|local|start|throws|interface|préchac|remark):\s*(.*)$', lines[k].strip())
                    if fm and fm.group(1) not in rec:
                        rec[fm.group(1)] = fm.group(2).strip()
                pats[key] = rec
    return pats


def will_heading_page(name: str) -> Optional[int]:
    """Will's headings are preceded by their TOC number on its own line."""
    n = norm(name)
    for pn in range(7, len(pages('willpatterns')) + 1):
        lines = [l.strip() for l in page_text('willpatterns', pn).split('\n')]
        for i, l in enumerate(lines):
            if norm(l) == n and i > 0 and re.match(r'^\d{1,3}$', lines[i - 1]):
                return pn
    return None


def will_fields(name: str, page: int) -> Optional[dict]:
    n = norm(name)
    lines = [l.strip() for l in (page_text('willpatterns', page) + '\n' + page_text('willpatterns', page + 1)).split('\n')]
    for i, l in enumerate(lines):
        if norm(l) == n and i > 0 and re.match(r'^\d{1,3}$', lines[i - 1]):
            clubs = jug = None
            for k in range(i + 1, min(i + 90, len(lines))):
                mc = re.match(r'^Clubs:\s*(\d+)', lines[k])
                mj = re.match(r'^Jugglers:\s*(\d+)', lines[k])
                if mc:
                    clubs = int(mc.group(1))
                if mj:
                    jug = int(mj.group(1))
                if clubs and jug:
                    return {'clubs': clubs, 'jugglers': jug}
    return None


_MAJ_CHAPTERS: Optional[list[tuple[int, int, str]]] = None


def majbook_chapter(page: int) -> Optional[tuple[int, str]]:
    global _MAJ_CHAPTERS
    if _MAJ_CHAPTERS is None:
        starts = []
        for pn, txt in enumerate(pages('majbook_v3'), start=1):
            m = re.match(r'^\s*Chapter (\d+)\s*\n([^\n]+)', txt)
            if m:
                starts.append((pn, int(m.group(1)), m.group(2).strip()))
        _MAJ_CHAPTERS = starts
    cur = None
    for pn, num, title in _MAJ_CHAPTERS:
        if pn <= page:
            cur = (num, title)
    return cur


def flowchart_counts() -> dict[str, int]:
    lines = [l.strip() for l in page_text('curriculum_flowchart', 1).split('\n')]
    out = {}
    for i, l in enumerate(lines):
        m = re.match(r'^(\d+)\+?\s*-?\s*person$', l)
        if m and i > 0:
            out[norm(lines[i - 1])] = int(m.group(1))
            if i > 1 and not re.match(r'^\d+\+?\s*-?\s*person$', lines[i - 2]):
                out[norm(lines[i - 2] + ' ' + lines[i - 1])] = int(m.group(1))
    return out


TAKEOUT_NAMES = ['Anne', 'Ben', 'Clare', 'Daniel', 'Emma', 'Fred', 'George', 'Helen']


def takeouts_section(name: str, page: int) -> Optional[str]:
    lines = page_text('takeouts', page).split('\n')
    n = norm(name)
    start = None
    for i, l in enumerate(lines):
        if norm(l) == n:
            start = i
            break
    if start is None:
        return None
    body = []
    for l in lines[start + 1:]:
        s = l.strip()
        if s and len(s) < 48 and not s.endswith('.') and not s.endswith(',') and not s.endswith(':') and s[0].isupper() and ' ' in s \
                and not re.search(r'\b(is|are|the|and|to|in|a|with|for)\b', s.lower()) and body:
            break
        body.append(s)
    return ' '.join(body)


# ---------------------------------------------------------------- notation

SS_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'


def valid_siteswap(text: str) -> bool:
    t = text.strip().lower()
    if not t or not re.fullmatch(r'[0-9a-f]+', t):
        return False
    throws = [SS_DIGITS.index(c) for c in t]
    n = len(throws)
    if sum(throws) % n:
        return False
    return len({(i + v) % n for i, v in enumerate(throws)}) == n


def highgate_notation(name: str, page: int) -> dict:
    """'Siteswap:' / 'Prechac:' lines that follow a heading on a Highgate page.
    Headings may carry suffixes ("Jim's two count (asynch version)", "... aka ...") and the catalog name
    may carry a "(7 clubs)" suffix; the first matching heading block that prints a siteswap wins."""
    lines = [l.strip() for l in page_text('highgate2014-05-16', page).split('\n')]
    target = norm(re.sub(r'\(\d+ clubs\)', '', name))
    candidates = []
    for i, l in enumerate(lines):
        if not l or l.startswith(('Siteswap', 'Prechac', 'Start ', 'Pattern ', 'Colour ')):
            continue
        head = norm(re.sub(r'\(.*?\)', '', re.split(r'\baka\b', l)[0]))
        if head == target or (head.startswith(target + ' ') and len(head.split()) - len(target.split()) <= 2):
            candidates.append(i)
    best: dict = {}
    for i in candidates:
        out: dict = {}
        for k in range(i + 1, min(i + 7, len(lines))):
            ms = re.match(r'^Siteswap:\s*([0-9a-f]+)\s*$', lines[k], re.I)
            msync = re.match(r'^Siteswap:\s*(\([0-9a-fx, ]+\)(?:\s*\([0-9a-fx, ]+\))*)\s*$', lines[k], re.I)
            mp = re.match(r'^Prechac:\s*([0-9a-f.p ]+)$', lines[k], re.I)
            if ms and valid_siteswap(ms.group(1)):
                out['siteswap'] = ms.group(1).lower()
            elif msync:
                out['sync_siteswap'] = msync.group(1).replace(' ', '')
            elif mp:
                out['prechac'] = mp.group(1).strip()
            elif k > i + 1 and not lines[k].startswith(('Start', 'Pattern', 'Colour')) and lines[k]:
                break
        if 'siteswap' in out or 'sync_siteswap' in out:
            return out
        if out and not best:
            best = out
    return best


def compendium_notation(name: str, page: int) -> dict:
    """Heading lines like '7 clubs: 4-count <3 3 5p 3 | 5p 3 3 3>', or the first '<a|b>' printed
    within a few lines after a section heading such as '7 clubs: 4 vs 3 4-counts'."""
    n = norm(name)
    short = norm(re.sub(r'^\d+\+?\s*clubs?\s*:\s*', '', name))
    lines = page_text('passingpatternsaug06', page).split('\n')
    pair_re = re.compile(r'<\s*([^<>|]+?)\s*\|\s*([^<>|]+?)\s*>')
    for i, l in enumerate(lines):
        m = pair_re.search(l)
        head = norm(l[:m.start()]) if m else norm(l)
        if not head or not (head == n or head == short or head.endswith(short)):
            continue
        if m:
            return {'pair': [m.group(1).strip(), m.group(2).strip()]}
        for k in range(i + 1, min(i + 10, len(lines))):
            mk = pair_re.search(lines[k])
            if mk:
                return {'pair': [mk.group(1).strip(), mk.group(2).strip()]}
    return {}


def flowchart_siteswaps() -> dict[str, str]:
    lines = [l.strip() for l in page_text('curriculum_flowchart', 1).split('\n')]
    out = {}
    for i, l in enumerate(lines):
        if re.fullmatch(r'\d{3,}', l) and i > 0 and valid_siteswap(l):
            out[norm(lines[i - 1])] = l
            if i > 1:
                out[norm(lines[i - 2] + ' ' + lines[i - 1])] = l
    return out


def will_related(name: str, page: int) -> dict[str, list[str]]:
    """'Related patterns' block: Add a club / Subtract a club / Other related patterns."""
    text = page_text('willpatterns', page) + '\n' + page_text('willpatterns', page + 1)
    lines = [l.strip() for l in text.split('\n')]
    n = norm(name)
    start = None
    for i, l in enumerate(lines):
        if norm(l) == n and i > 0 and re.match(r'^\d{1,3}$', lines[i - 1]):
            start = i
            break
    if start is None:
        return {}
    out: dict[str, list[str]] = {}
    section = None
    for k in range(start + 1, min(start + 140, len(lines))):
        l = lines[k]
        if k > start + 1 and re.match(r'^\d{1,3}$', lines[k - 1]) and l and not re.match(r'^[LR]$', l) and k > start + 20 and section:
            break  # next pattern heading
        if l.startswith('Add a club'):
            section = 'add'
            continue
        if l.startswith('Subtract a club'):
            section = 'subtract'
            continue
        if l.startswith('Other related'):
            section = 'other'
            continue
        if l.startswith('Related patterns') or l.startswith('Will and Rhonda') or l.startswith('Inventor'):
            section = None if not l.startswith('Related') else section
            continue
        if section and l and not re.match(r'^[LR]$', l):
            names = [x.strip(' .') for x in re.split(r'[,;]|\band\b', l.split('(')[0]) if x.strip(' .')]
            for cand in names:
                if re.match(r'^[A-Za-z0-9][A-Za-z0-9\-+]*$', cand) and len(cand) > 2:
                    out.setdefault(section, []).append(cand)
    return out


# ---------------------------------------------------------------- derivation

@dataclass
class Derived:
    id: str
    jugglers: Optional[int] = None
    jugglers_max: Optional[int] = None  # None = fixed; 0 = open-ended; n = max
    clubs: Optional[int] = None
    jug_prov: str = ''
    clubs_prov: str = ''
    junk: Optional[str] = None
    merge_into: Optional[str] = None
    new_page: Optional[int] = None
    rename: Optional[str] = None
    notes: list[str] = field(default_factory=list)
    anthology: Optional[dict] = None
    flags: list[str] = field(default_factory=list)
    siteswap: Optional[str] = None
    prechac: Optional[str] = None
    sync_pair: Optional[list[str]] = None
    sync_siteswap: Optional[str] = None
    notation_source: Optional[str] = None
    related: dict = field(default_factory=dict)


FLOW_SS: dict[str, str] = {}
PAREN_COUNT_RE = re.compile(r'\((\d{1,2})\s*(\+|-\s*(\d{1,2}))?\)\s*$')
FOR_N_RE = re.compile(r'\(?\s*for\s+(\d{1,2})(?:\s*,\s*(\d{1,2}))?(?:\s*,?\s*and\s+(\d{1,2}))?(?:\s+or\s+more)?\s*-?\s*(?:jugglers?|people|person)?\s*\)?', re.I)
N_CLUBS_RE = re.compile(r'\b(\d{1,2})\+?\s*-?\s*clubs?\b', re.I)

JUNK_NAMES = {
    # Madison v1.2 front matter / instruction lines (p2-3, p17)
    'jugglers', 'juggler', 'madison area', 'variation', 'version 1 2', 'positions', 'at same time',
    'a faces b andc faces d', 'a passes triple to d single to b',
    'a and b start with 4 clubs each and start passing', 'b passes triple back to back to c single to a',
    'c and d each start with 3 clubs', 'c passes single to d triple back to back to b', 'd passes single to c triple to a',
    # takeouts appendix
    'appendix', 'redundant modules',
    # compendium section headings
    'creating new patterns', 'games', 'popcorn oddities', 'sunshine series', '13+ clubs', '6+ clubs slow fast patterns',
    # highgate chapter headings / index artefacts
    'passing etiquette', '4 handed siteswaps', '6 handed siteswaps', 'combination tricks', 'colour coded pattern 49',
    # majbook sub-heading, anthology wrapped-line fragment, flowchart category node
    'original', 'single', 'takeouts',
}

# Maintainer-reviewed values where the book gives the count only in prose or a diagram.
MANUAL: dict[str, dict] = {
    'khaos_buttery': {'rename': 'Khaos Butterfly', 'new_page': 139, 'jugglers': 8, 'prov': 'majbook p139, chapter 8 (ligature-mangled name fixed)'},
    'synchronous_passing': {'jugglers': 2, 'clubs': 7, 'prov': 'majbook pp.166-167, 7-club section of chapter 12'},
    'big_hinge': {'jugglers': 12, 'prov': 'majbook p152 ("the 12 person hinge above")'},
    'double_vision_hex': {'jugglers': 12, 'prov': 'majbook p152 ("6-person Hex and make each juggler two")'},
    'fully_loaded_blast': {'jugglers': 11, 'jugglers_max': 12, 'prov': 'majbook p152 ("for 11 people, works for 7 through 12")'},
    'double_decker_sandwich': {'jugglers': 12, 'prov': 'majbook p153 (3-3-3-3 stack: weave, twister, twister, weave)'},
    'triangle_weave': {'jugglers': 15, 'prov': 'majbook p153 ("for 15 jugglers")'},
    'octagon_weave': {'jugglers': 48, 'prov': 'majbook p155 ("8 sides and 48 jugglers")'},
    'mating_clovers': {'jugglers': 12, 'jugglers_max': 0, 'prov': 'majbook p156 (12, 20 or 24 jugglers depending on the mating)'},
    'big_circle': {'jugglers': 16, 'jugglers_max': 0, 'prov': 'majbook p157 diagram (two rings of movers plus posts; scalable, ~50 at Madfest 2013)'},
    'ball_bearing_6_8': {'jugglers': 6, 'jugglers_max': 0, 'prov': 'compendium name "(6,8,+)"'},
    'martin_s_madness_mildness': {'jugglers': 4, 'clubs': 12, 'prov': 'madison v1.2 p21 (A and B mildness, C and D madness)'},
    'dual_passing_pattern_for_4': {'jugglers': 4, 'prov': 'madison v1.2 p7 title'},
    'dual_passing_pattern_for_2': {'jugglers': 2, 'clubs': 7, 'prov': 'madison v1.2 p8 ("7-club 3-count" virtual jugglers)'},
    'gandini_siteswap_weaves': {'jugglers': 3, 'jugglers_max': 0, 'prov': 'madison v1.2 p9 ("for 3 or more jugglers")'},
    'passing_43': {'jugglers': 2, 'clubs': 7, 'prov': 'majbook pp.168-169 (two-juggler 4-handed siteswap groups)'},
    'star': {'jugglers': 5, 'prov': 'compendium p73 "Star (5)", flowchart "5-person"'},
    'scrambled_v': {'jugglers': 4, 'clubs': 10, 'prov': 'takeouts p11 (Anne, Ben, Clare runaround + Daniel manipulating); flowchart says 4-person'},
}


def derive_all(entries: list[Entry], excerpts: dict[str, dict]) -> list[Derived]:
    global FLOW_SS
    FLOW_SS = flowchart_siteswaps()
    hg_index = parse_highgate_index()
    hg_toc = parse_highgate_toc()
    anth = parse_anthology()
    flow = flowchart_counts()
    hg_real: dict[str, list[Entry]] = defaultdict(list)
    for e in entries:
        ex = excerpts.get(e.id)
        if ex and ex['tag'] == 'highgate2014-05-16' and 4 <= ex['page'] <= 238:
            hg_real[dedup_key(e.name)].append(e)
    kept_index_keys: dict[tuple[str, int], str] = {}

    out = []
    for e in entries:
        d = Derived(e.id)
        ex = excerpts.get(e.id)
        tag = ex['tag'] if ex else (e.sources[0] if e.sources else None)
        page = ex['page'] if ex else None
        n = norm(e.name)
        if n in JUNK_NAMES:
            d.junk = 'heading/front-matter/instruction line, not a pattern'
            out.append(d)
            continue

        m = PAREN_COUNT_RE.search(e.name)
        name_people = None
        if m and tag == 'passingpatternsaug06' and int(m.group(1)) <= 12:
            name_people = int(m.group(1))
            if m.group(2):
                d.jugglers_max = int(m.group(3)) if m.group(3) else 0
        mf = FOR_N_RE.search(e.name)
        if mf and 'for' in e.name.lower():
            name_people = int(mf.group(1))
            if 'or more' in e.name.lower():
                d.jugglers_max = 0
            elif mf.group(2) or mf.group(3):
                d.jugglers_max = int(mf.group(3) or mf.group(2))
        mc = N_CLUBS_RE.search(e.name)
        name_clubs = int(mc.group(1)) if mc else None

        if tag == 'highgate2014-05-16':
            if page is None or page <= 3 or page >= 239 or not name_on_page(tag, e.name, page):
                mt = re.search(r'[\s,]+(\d+(?:\s*[-,]\s*\d+)*)\s*$', e.name)
                base = (e.name[:mt.start()] if mt else e.name).strip()
                trailing = int(re.findall(r'\d+', mt.group(1))[0]) if mt else None
                cands = hg_index.get(norm(base)) or hg_index.get(norm(rotate_name(base))) or []
                real_page = None
                if trailing and 4 <= trailing <= 238:
                    real_page = trailing
                    for c in cands:
                        if trailing in c['pages']:
                            cands = [c]
                            break
                if cands:
                    if real_page is None:
                        real_page = cands[0]['first']
                    for q in cands[0]['quals']:
                        mq = re.match(r'(\d+)\s*people', q)
                        if mq:
                            d.jugglers, d.jug_prov = int(mq.group(1)), 'highgate index qualifier'
                        mq = re.match(r'(\d+)\s*clubs', q)
                        if mq:
                            d.clubs, d.clubs_prov = int(mq.group(1)), 'highgate index qualifier'
                elif real_page is None:
                    for title, p in hg_toc:
                        if norm(title) in (n, n + ' patterns'):
                            real_page = p
                            break
                if real_page is None and page and 4 <= page <= 238:
                    real_page = page  # name not found verbatim but page is a pattern page; keep
                    d.notes.append('name not found verbatim on page')
                if real_page is None:
                    d.junk = 'index/TOC entry that resolves to no page'
                    out.append(d)
                    continue
                key = dedup_key(base)
                dup = [x for x in hg_real.get(key, []) if x.id != e.id and abs(excerpts[x.id]['page'] - real_page) <= 2]
                if dup:
                    d.merge_into = dup[0].id
                    d.notes.append(f'index duplicate of {dup[0].id} (p{excerpts[dup[0].id]["page"]})')
                    out.append(d)
                    continue
                if (key, real_page) in kept_index_keys:
                    d.merge_into = kept_index_keys[(key, real_page)]
                    d.notes.append('duplicate index entry')
                    out.append(d)
                    continue
                if not (4 <= real_page <= 238):
                    d.junk = f'index entry pointing at non-pattern page {real_page}'
                    out.append(d)
                    continue
                kept_index_keys[(key, real_page)] = e.id
                if real_page != page:
                    d.new_page = real_page
                nice = rotate_name(base)
                if nice != e.name:
                    d.rename = nice[0].upper() + nice[1:]
                page = real_page
            people = highgate_people(page)
            if d.jugglers is None and people:
                d.jugglers, d.jug_prov = people, f'highgate chapter range (p{page})'
            if d.clubs is None:
                d.clubs = name_clubs or highgate_clubs(page, people)
                d.clubs_prov = 'name' if name_clubs else f'highgate club sub-chapter (p{page})'
            if n in ('spelling game', 'a sailor went to sea', 'fizz buzz'):
                d.flags.append('game')

        elif tag == 'anthology':
            rec = anth.get(n)
            if not rec:
                alt = norm(re.sub(r'\s*\(.*?\)', '', e.name))
                rec = anth.get(alt) if alt != n else None
            if rec:
                d.anthology = rec
                d.jugglers, d.jug_prov = rec['jugglers'], f'anthology chapter (p{rec["page"]})'
                d.clubs, d.clubs_prov = rec['clubs'], 'anthology section'
                if rec['page'] != page:
                    d.new_page = rec['page']
            else:
                d.junk = 'anthology: not a pattern heading in the book (notation fragment / index)'

        elif tag == 'willpatterns':
            hp = will_heading_page(e.name)
            if hp and hp != page:
                d.new_page = hp
            wf = will_fields(e.name, hp or page)
            if wf:
                d.jugglers, d.jug_prov = wf['jugglers'], 'will "Jugglers:" field'
                d.clubs, d.clubs_prov = wf['clubs'], 'will "Clubs:" field'
            else:
                d.notes.append('will: heading not found')

        elif tag == 'passingpatternsaug06':
            if not name_on_page(tag, e.name, page):
                hp = heading_pages(tag, e.name, 4, 90)
                if len(hp) == 1:
                    d.new_page = hp[0]
                    page = hp[0]
            if name_people is None:
                # heading on the page may carry the "(N)" suffix even if the catalog name lost it
                for line in page_text(tag, page).split('\n'):
                    mm = re.match(r'^(.*?)\s*\((\d{1,2})(\+)?\)\s*$', line.strip())
                    if mm and norm(mm.group(1)) == n:
                        name_people = int(mm.group(2))
                        if mm.group(3):
                            d.jugglers_max = 0
                        break
            if name_people:
                d.jugglers, d.jug_prov = name_people, 'compendium "(N)" suffix'
            elif re.match(r'^\d+\+?\s*clubs?\s*:', e.name, re.I) or 4 <= page <= 32:
                d.jugglers, d.jug_prov = 2, 'compendium 2-person section'
            elif 33 <= page <= 53:
                d.jugglers, d.jug_prov = 3, 'compendium feeds/3-person section'
            elif 54 <= page <= 72:
                d.jugglers, d.jug_prov = 4, 'compendium 4-person section'
            if name_clubs:
                d.clubs, d.clubs_prov = name_clubs, 'name'
            elif d.jugglers:
                d.clubs, d.clubs_prov = 3 * d.jugglers, 'default 3 per juggler'

        elif tag == 'majbook_v3':
            if not name_on_page(tag, e.name, page):
                hp = heading_pages(tag, e.name, 25, 173)
                if len(hp) == 1:
                    d.new_page = hp[0]
                    page = hp[0]
            ch = majbook_chapter(page) if page else None
            if name_people:
                d.jugglers, d.jug_prov = name_people, 'name'
            elif ch and re.match(r'^(\d+)[ -]Person', ch[1]):
                d.jugglers, d.jug_prov = int(re.match(r'^(\d+)', ch[1]).group(1)), f'majbook chapter {ch[0]} ({ch[1]})'
            elif ch and ch[0] == 12 and re.match(r'^\d+ club', n) and int(n.split()[0]) <= 9:
                d.jugglers, d.jug_prov = 2, 'majbook chapter 12, 7-club section'
            if name_clubs:
                d.clubs, d.clubs_prov = name_clubs, 'name'
            elif d.jugglers:
                d.clubs, d.clubs_prov = 3 * d.jugglers, 'default 3 per juggler'

        elif tag == 'madison_patterns_v1_2':
            if not name_on_page(tag, e.name, page) or (page and page <= 4):
                hp = heading_pages(tag, e.name, 5, 65)
                if len(hp) >= 1:
                    d.new_page = hp[0]
                    page = hp[0]
            txt = page_text(tag, page)
            if name_people:
                d.jugglers, d.jug_prov = name_people, 'name'
            else:
                tl = txt.split('\n')
                for i, line in enumerate(tl):
                    joined = ' '.join(tl[i:i + 2])
                    if norm(line.split('(')[0]) == n and FOR_N_RE.search(joined) and 'for' in joined.lower():
                        d.jugglers, d.jug_prov = int(FOR_N_RE.search(joined).group(1)), f'madison v1.2 title "(for N jugglers)" (p{page})'
                        break
            if d.jugglers is None:
                letters = {l.strip() for l in txt.split('\n') if re.match(r'^[A-H]$', l.strip())}
                if len(letters) >= 2:
                    d.jugglers, d.jug_prov = len(letters), f'madison v1.2 position diagram letters {"".join(sorted(letters))} (p{page})'
            if name_clubs:
                d.clubs, d.clubs_prov = name_clubs, 'name'
            elif d.jugglers:
                d.clubs, d.clubs_prov = 3 * d.jugglers, 'default 3 per juggler'

        elif tag == 'takeouts':
            if not name_on_page(tag, e.name, page) or takeouts_section(e.name, page) is None:
                hp = heading_pages(tag, e.name, 3, 24)
                if hp:
                    hp = [p for p in hp if takeouts_section(e.name, p)] or hp
                    if hp[0] != page:
                        d.new_page = hp[0]
                    page = hp[0]
            body = takeouts_section(e.name, page) or ''
            found = {x for x in TAKEOUT_NAMES if re.search(r'\b' + x + r'\b', body)}
            if found:
                d.jugglers, d.jug_prov = len(found), f'takeouts: people named in the description ({", ".join(sorted(found))})'
                runaround = 'runaround' in body.lower() or 'feeder' in body.lower()
                d.clubs = (9 + len(found) - 3) if runaround else (6 + len(found) - 2)
                d.clubs_prov = 'takeouts: passers x3 + one club per manipulator'
            else:
                d.jugglers, d.jug_prov = 3, 'takeouts: three person chapter default'

        elif tag == 'curriculum_flowchart':
            if n in flow:
                d.jugglers, d.jug_prov = flow[n], 'flowchart "N-person" label'
            elif re.match(r'^(3 club cascade|4 club|423)', n):
                d.jugglers, d.jug_prov = 1, 'flowchart solo drill'
            else:
                d.jugglers, d.jug_prov = 2, 'flowchart default (2-person track)'
            if name_clubs:
                d.clubs, d.clubs_prov = name_clubs, 'name'

        # secondary source: anthology by name
        if 'anthology' in e.sources and n in anth:
            if d.jugglers is None:
                d.jugglers, d.jug_prov = anth[n]['jugglers'], 'anthology chapter (secondary source)'
                d.clubs, d.clubs_prov = anth[n]['clubs'], 'anthology section (secondary source)'
            elif anth[n]['jugglers'] != d.jugglers:
                d.notes.append(f'anthology says {anth[n]["jugglers"]} jugglers')
            d.anthology = d.anthology or anth[n]

        # ---- notation (2-person patterns only for siteswaps)
        cur_page = d.new_page or page
        if tag == 'highgate2014-05-16' and cur_page and 4 <= cur_page <= 238:
            hn = highgate_notation(d.rename or e.name, cur_page)
            if hn:
                d.siteswap = hn.get('siteswap')
                d.prechac = hn.get('prechac')
                d.sync_siteswap = hn.get('sync_siteswap')
                if d.sync_siteswap and d.prechac and '.' not in d.prechac:
                    # synchronous pattern: both jugglers juggle the printed prechac (integer p throws)
                    d.sync_pair = [d.prechac, d.prechac]
                    d.prechac = None
                d.notation_source = f'Highgate p{cur_page}'
        elif tag == 'passingpatternsaug06' and cur_page:
            cn = compendium_notation(e.name, cur_page)
            if cn:
                d.sync_pair = cn['pair']
                d.notation_source = f'Compendium p{cur_page}'
        elif tag == 'willpatterns' and cur_page:
            rel = will_related(e.name, d.new_page or cur_page)
            if rel:
                d.related = rel
        if d.siteswap is None and d.prechac and (d.jugglers == 2):
            # symmetric two-juggler prechac -> global siteswap (3.5p413.5p3 -> 77862)
            toks = re.findall(r'\d(?:\.\d)?p?', d.prechac.replace(' ', ''))
            if toks and ''.join(toks) == d.prechac.replace(' ', ''):
                doubled = []
                ok = True
                for t in toks:
                    v = float(t.rstrip('p')) * 2
                    if abs(v - round(v)) > 1e-6 or (t.endswith('p') != (round(v) % 2 == 1)) or round(v) >= len(SS_DIGITS):
                        ok = False
                        break
                    doubled.append(int(round(v)))
                if ok:
                    n = len(doubled)
                    if n % 2 == 1:
                        glob = [doubled[(k * ((n + 1) // 2)) % n] for k in range(n)]
                    else:
                        glob = []
                        for i in range(n):
                            glob += [doubled[i], doubled[(i + n // 2) % n]]
                    text = ''.join(SS_DIGITS[g] for g in glob)
                    if valid_siteswap(text):
                        d.siteswap = text
                        d.notes.append('siteswap converted from the printed prechac')
        if d.anthology and d.anthology.get('global') and valid_siteswap(d.anthology['global']) and (d.jugglers == 2):
            d.siteswap = d.siteswap or d.anthology['global'].lower()
            d.notation_source = d.notation_source or f'Anthology p{d.anthology["page"]}'
        if d.siteswap is None and 'curriculum_flowchart' in e.sources and (d.jugglers or e.required) == 2:
            fs = FLOW_SS.get(n)
            if fs:
                d.siteswap = fs
                d.notation_source = d.notation_source or 'Passing progression flowchart'
        if d.siteswap and d.jugglers == 2:
            throws = [SS_DIGITS.index(c) for c in d.siteswap]
            clubs = sum(throws) // len(throws)
            if d.clubs != clubs:
                d.notes.append(f'siteswap {d.siteswap} implies {clubs} clubs (book said {d.clubs})')
                d.clubs, d.clubs_prov = clubs, f'siteswap average ({d.notation_source})'

        if e.id in MANUAL:
            mfix = MANUAL[e.id]
            for k in ('jugglers', 'jugglers_max', 'clubs', 'rename', 'new_page'):
                if k in mfix:
                    if k == 'new_page' and ex and ex['page'] == mfix[k]:
                        continue
                    if k == 'rename' and e.name == mfix[k]:
                        continue
                    setattr(d, k, mfix[k])
            d.jug_prov = 'maintainer: ' + mfix['prov']
            if 'clubs' in mfix:
                d.clubs_prov = d.jug_prov
        if d.jugglers is None:
            mp = re.search(r'\b(\d{1,2})[ -]person\b', e.name, re.I)
            if mp:
                d.jugglers, d.jug_prov = int(mp.group(1)), 'name "N person"'
        if d.jugglers is None:
            d.notes.append('unresolved; keeping legacy count')
        out.append(d)
    # kept index entries that share a name but sit on different pages get a club-count suffix
    by_key: dict[str, list[Derived]] = defaultdict(list)
    for d in out:
        if d.new_page and not d.junk and not d.merge_into:
            e = next(x for x in entries if x.id == d.id)
            ex = excerpts.get(d.id)
            if (ex and ex['tag'] == 'highgate2014-05-16') or (not ex and 'highgate2014-05-16' in e.sources):
                by_key[dedup_key(d.rename or e.name)].append(d)
    for key, group in by_key.items():
        if len(group) > 1 or any(dedup_key(x.name) == key and x.id not in {g.id for g in group} for x in entries):
            for d in group:
                e = next(x for x in entries if x.id == d.id)
                base = d.rename or e.name
                if d.clubs and f'{d.clubs} clubs' not in base:
                    d.rename = f'{base} ({d.clubs} clubs)'
    return out


# ---------------------------------------------------------------- outputs

def write_report(entries, excerpts, derived):
    os.makedirs(WORK, exist_ok=True)
    by_id = {e.id: e for e in entries}
    rows = ['id\tname\told_jug\tnew_jug\tmax\tclubs\tjug_prov\tclubs_prov\taction\tnotes\tsiteswap\tprechac\tpair\trelated']
    changed = junk = merged = repaged = 0
    for d in derived:
        e = by_id[d.id]
        ex = excerpts.get(d.id)
        action = ''
        if d.junk:
            action = f'DROP: {d.junk}'; junk += 1
        elif d.merge_into:
            action = f'MERGE→{d.merge_into}'; merged += 1
        elif d.new_page:
            action = f'REPAGE {ex["tag"] if ex else ""}:{ex["page"] if ex else ""}→{d.new_page}'; repaged += 1
        if d.rename:
            action += f' RENAME "{d.rename}"'
        if d.jugglers is not None and d.jugglers != e.required and not d.junk and not d.merge_into:
            changed += 1
        rows.append('\t'.join(str(x) for x in [d.id, e.name, e.required, d.jugglers if d.jugglers is not None else '', '' if d.jugglers_max is None else ('open' if d.jugglers_max == 0 else d.jugglers_max), d.clubs or '', d.jug_prov, d.clubs_prov, action, '; '.join(d.notes), d.siteswap or '', d.prechac or '', '|'.join(d.sync_pair or []), str(d.related) if d.related else '']))
    open(os.path.join(WORK, 'report.tsv'), 'w').write('\n'.join(rows) + '\n')
    print(f'report: {len(derived)} entries, {changed} juggler-count changes, {junk} junk, {merged} merged, {repaged} repaged -> {WORK}/report.tsv')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'report'
    entries = parse_catalog()
    excerpts = parse_excerpts()
    derived = derive_all(entries, excerpts)
    if cmd == 'report':
        write_report(entries, excerpts, derived)
    elif cmd == 'apply':
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from apply_derived import apply  # noqa: E402
        apply(entries, excerpts, derived)
    elif cmd == 'derived':
        # Regenerate derived.ts only (keeps the previously recorded removed ids).
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from apply_derived import write_derived  # noqa: E402
        prior = {}
        if os.path.exists(DERIVED_TS):
            for rid, target in re.findall(r"^  '([^']+)': ('[^']*'|null),$", open(DERIVED_TS, encoding='utf-8').read().split('REMOVED_PATTERN_IDS')[1], re.M):
                prior[rid] = None if target == 'null' else target.strip("'")
        write_derived(entries, {d.id: d for d in derived}, prior)
    else:
        sys.exit('unknown command')
