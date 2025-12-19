import re
import unicodedata
from pathlib import Path
from typing import Iterable, List, Dict

import fitz

BOOKS_DIR = Path(r"D:\pattern-pals\src\data\pattern_books")
PATTERNS_PATH = Path(r"D:\personal-webpage\lib\patternpals\patterns.ts")

REPLACEMENTS = {
    '\u2019': "'",
    '\u2018': "'",
    '\u201c': '"',
    '\u201d': '"',
    '\u2013': '-',
    '\u2014': '-',
    '\u2212': '-',
    '\u2026': '...',
    '\u2022': '',
    '\u00b7': '-',
    '\u00d7': 'x',
    '\ufb00': 'ff',
}

WORD_NUMBERS = {
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'six': 6,
    'seven': 7,
    'eight': 8,
    'nine': 9,
    'ten': 10,
}


def normalize_block(text: str) -> str:
    if not text:
        return ''
    for old, new in REPLACEMENTS.items():
        text = text.replace(old, new)
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ascii', 'ignore').decode('ascii')
    return text


def normalize_text(text: str) -> str:
    text = normalize_block(text)
    text = re.sub(r"\s+", ' ', text)
    return text.strip()


def clean_name(name: str) -> str:
    name = normalize_text(name)
    name = name.strip(' .-')
    name = re.sub(r"\s+", ' ', name)
    return name


def escape_ts_string(value: str) -> str:
    return value.replace('\\', '\\\\').replace("'", "\\'")


def slugify(name: str) -> str:
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", '_', slug)
    slug = re.sub(r"_+", '_', slug)
    return slug.strip('_')


def unescape_ts_string(value: str) -> str:
    value = value.replace("\\\\'", "'")
    value = value.replace('\\\\', '\\')
    value = value.replace("\\'", "'")
    return value


def parse_string_line(line: str) -> str:
    value = line.split(':', 1)[1].strip()
    if value.endswith(','):
        value = value[:-1].rstrip()
    if len(value) >= 2 and value[0] in "'\"" and value[-1] == value[0]:
        value = value[1:-1]
    return unescape_ts_string(value)


def parse_list_line(line: str) -> List[str]:
    return [unescape_ts_string(value) for value in re.findall(r"'([^']*)'", line)]


def parse_existing_patterns(path: Path) -> List[Dict]:
    patterns: List[Dict] = []
    current: Dict | None = None
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if line.startswith('{'):
            current = {}
            continue
        if current is None:
            continue
        if line.startswith('id:'):
            current['id'] = parse_string_line(line)
        elif line.startswith('name:'):
            current['name'] = clean_name(parse_string_line(line))
        elif line.startswith('difficulty:'):
            current['difficulty'] = parse_string_line(line)
        elif line.startswith('requiredJugglers:'):
            current['requiredJugglers'] = int(re.findall(r"\d+", line)[0])
        elif line.startswith('props:'):
            current['props'] = parse_list_line(line)
        elif line.startswith('description:'):
            current['description'] = normalize_text(parse_string_line(line))
        elif line.startswith('tags:'):
            current['tags'] = parse_list_line(line)
        elif line.startswith('prerequisites:'):
            current['prerequisites'] = parse_list_line(line)
        elif line.startswith('},'):
            if current:
                patterns.append(current)
            current = None
    return patterns


def guess_required_jugglers(name: str) -> int:
    lower = name.lower()
    match = re.search(r"(\d+)\s*[- ]?on\s*(\d+)", lower)
    if match:
        return int(match.group(1)) + int(match.group(2))
    match = re.search(r"(\d+)\s*[- ]?person", lower)
    if match:
        return int(match.group(1))
    match = re.search(r"(\d+)\s*[- ]?jugglers?", lower)
    if match:
        return int(match.group(1))
    for word, value in WORD_NUMBERS.items():
        if re.search(rf"\b{word}\b\s*[- ]?person", lower):
            return value
    return 2


def guess_difficulty(name: str) -> str:
    lower = name.lower()
    if re.search(r"\b(6|7|8|9|10|11|12|13)\b\s*[- ]?clubs?", lower):
        return 'Advanced'
    if re.search(r"\b(6|7|8|9|10|11|12|13)\s*[- ]?count\b", lower):
        return 'Advanced'
    return 'Intermediate'


def derive_tags(name: str, source_tag: str) -> List[str]:
    tags = ['passing']
    lower = name.lower()
    keywords = [
        ('line', 'line'),
        ('feed', 'feed'),
        ('triangle', 'triangle'),
        ('runaround', 'runaround'),
        ('roundabout', 'roundabout'),
        ('popcorn', 'popcorn'),
        ('bookends', 'bookends'),
        ('zap', 'zap'),
        ('apollo', 'apollo'),
        ('weave', 'weave'),
        ('box', 'box'),
        ('count', 'count'),
    ]
    for needle, tag in keywords:
        if needle in lower and tag not in tags:
            tags.append(tag)
    source = f"source:{source_tag}"
    if source not in tags:
        tags.append(source)
    return tags


def build_pattern(name: str, source_tag: str, source_label: str) -> Dict:
    return {
        'id': slugify(name),
        'name': name,
        'difficulty': guess_difficulty(name),
        'requiredJugglers': guess_required_jugglers(name),
        'props': ['clubs'],
        'description': f"Extracted from {source_label} pattern book.",
        'tags': derive_tags(name, source_tag),
        'prerequisites': [],
    }


def extract_toc_patterns(doc: fitz.Document, max_pages: int = 5) -> List[str]:
    leader_re = re.compile(r"^(?P<title>.+?)\s*\.{2,}\s*(?P<page>\d+)\s*$")
    trailing_page_re = re.compile(r"^(?P<title>.+?)\s{2,}(?P<page>\d{1,3})\s*$")
    results: List[str] = []
    for i in range(min(max_pages, doc.page_count)):
        text = doc.load_page(i).get_text("text")
        for raw_line in text.splitlines():
            line = clean_name(raw_line)
            if not line:
                continue
            match = leader_re.match(line) or trailing_page_re.match(line)
            if match:
                title = clean_name(match.group('title'))
                if title:
                    results.append(title)
    return results


def extract_takeouts() -> List[str]:
    doc = fitz.open(BOOKS_DIR / 'takeouts.pdf')
    candidates = extract_toc_patterns(doc, max_pages=3)
    doc.close()
    banned = {
        'terminology',
        'modules',
        'three person patterns',
        'scrambled v variations',
        'scrambled v combinations',
        'other right handed patterns',
        'ambidextrous patterns',
        'switching between patterns',
    }
    results = []
    for title in candidates:
        lower = title.lower()
        if lower in banned:
            continue
        if lower.endswith('patterns'):
            continue
        if 'variations' in lower or 'combinations' in lower:
            continue
        results.append(title)
    return results


def extract_willpatterns() -> List[str]:
    doc = fitz.open(BOOKS_DIR / 'WillPatterns.pdf')
    results: List[str] = []
    contents_page = None
    for i in range(doc.page_count):
        text = doc.load_page(i).get_text("text")
        if 'contents' in text.lower():
            contents_page = i
            break
    if contents_page is None:
        doc.close()
        return results
    for i in range(contents_page, min(contents_page + 4, doc.page_count)):
        text = doc.load_page(i).get_text("text")
        for raw_line in text.splitlines():
            line = clean_name(raw_line)
            if not line:
                continue
            if line.lower() == 'contents':
                continue
            line = re.sub(r"^\d+\s+", '', line)
            if re.fullmatch(r"\d+", line):
                continue
            if 'http' in line.lower():
                continue
            if line:
                results.append(line)
    doc.close()
    return results


def extract_passingpatterns() -> List[str]:
    doc = fitz.open(BOOKS_DIR / 'PassingPatternsAug06.pdf')

    size_counts: Dict[float, int] = {}
    for i in range(doc.page_count):
        data = doc.load_page(i).get_text('dict')
        for block in data.get('blocks', []):
            for line in block.get('lines', []):
                for span in line.get('spans', []):
                    text = span.get('text', '').strip()
                    if not text:
                        continue
                    size = round(span.get('size', 0), 1)
                    size_counts[size] = size_counts.get(size, 0) + len(text)

    body_size = sorted(size_counts.items(), key=lambda item: item[1], reverse=True)[0][0]
    threshold = body_size + 3

    banned_keywords = [
        'passing patterns compendium',
        'edition',
        'terminology',
        'notation',
        'table of contents',
        'contents',
        'rhythms',
        'feeds',
        '3-person patterns',
        '4-person patterns',
        '5+ -person patterns',
        'fun ideas',
        'fun ideas and passing games',
    ]

    results: List[str] = []
    for i in range(doc.page_count):
        if i < 3:
            continue
        data = doc.load_page(i).get_text('dict')
        for block in data.get('blocks', []):
            for line in block.get('lines', []):
                for span in line.get('spans', []):
                    text = span.get('text', '').strip()
                    if not text:
                        continue
                    size = round(span.get('size', 0), 1)
                    if size < threshold:
                        continue
                    name = clean_name(text)
                    if len(name) < 3:
                        continue
                    if name.isdigit():
                        continue
                    if re.fullmatch(r"\(\d+\)", name):
                        continue
                    if re.fullmatch(r"[\(\)]+", name):
                        continue
                    lower = name.lower()
                    if any(keyword in lower for keyword in banned_keywords):
                        continue
                    if re.fullmatch(r"\d+\s*clubs?\s*:?", lower):
                        continue
                    if re.fullmatch(r"\d+\s*clubs?", lower):
                        continue
                    results.append(name)

    doc.close()
    return results


def extract_madison_patterns() -> List[str]:
    doc = fitz.open(BOOKS_DIR / 'Madison_Patterns_V1-2.pdf')
    size_counts: Dict[float, int] = {}
    for i in range(doc.page_count):
        data = doc.load_page(i).get_text('dict')
        for block in data.get('blocks', []):
            for line in block.get('lines', []):
                for span in line.get('spans', []):
                    text = span.get('text', '').strip()
                    if not text:
                        continue
                    size = round(span.get('size', 0), 1)
                    size_counts[size] = size_counts.get(size, 0) + len(text)
    body_size = sorted(size_counts.items(), key=lambda item: item[1], reverse=True)[0][0]
    threshold = body_size + 4

    banned = [
        'editors',
        'how to read',
        'glossary',
        'notes',
        'lines indicate',
        'beat',
        'pattern',
        'patterns',
        'here are',
    ]

    results: List[str] = []
    for i in range(doc.page_count):
        data = doc.load_page(i).get_text('dict')
        for block in data.get('blocks', []):
            for line in block.get('lines', []):
                for span in line.get('spans', []):
                    text = span.get('text', '').strip()
                    if not text:
                        continue
                    size = round(span.get('size', 0), 1)
                    if size < threshold:
                        continue
                    name = clean_name(text)
                    if len(name) < 3:
                        continue
                    tokens = name.split()
                    if tokens and all(len(token) == 1 for token in tokens):
                        continue
                    lower = name.lower()
                    if any(b in lower for b in banned):
                        continue
                    results.append(name)

    doc.close()
    return results


def trim_action_suffix(name: str) -> str:
    lower = name.lower()
    markers = [
        ' pass ',
        ' zap ',
        ' zip ',
        ' heff ',
        ' trelf ',
        ' holllld ',
        ' hold ',
        ' self ',
        ' sync ',
        ' passed ',
        ' add ',
        ' partner ',
        ' solo ',
        ' active ',
    ]
    for marker in markers:
        idx = lower.find(marker)
        if idx != -1:
            name = name[:idx].rstrip()
            lower = name.lower()
    return name


def join_flowchart_lines(lines: List[str]) -> List[str]:
    joined: List[str] = []
    for line in lines:
        if not joined:
            joined.append(line)
            continue
        prev = joined[-1]
        if re.fullmatch(r"\d+-count", line.lower()) and prev.lower().endswith("jim's"):
            joined[-1] = f"{prev} {line}"
            continue
        if re.fullmatch(r"\d+-count", line.lower()) and prev.lower().endswith("jims"):
            joined[-1] = f"{prev} {line}"
            continue
        if prev.count('(') > prev.count(')'):
            joined[-1] = f"{prev} {line}"
            continue
        if line.startswith('(') or line in {'Line', 'Feed'}:
            joined[-1] = f"{prev} {line}"
            continue
        if line[0].islower() and not line[0].isdigit():
            joined[-1] = f"{prev} {line}"
            continue
        joined.append(line)
    return joined


def extract_flowchart() -> List[str]:
    doc = fitz.open(BOOKS_DIR / 'Curriculum-Flowchart.pdf')
    text = normalize_block(doc.load_page(0).get_text('text'))
    lines = [clean_name(line) for line in text.splitlines() if line.strip()]
    lines = join_flowchart_lines(lines)

    banned_exact = {
        'start',
        'a passing progression',
        'solo',
        'partner',
        'add a',
        'add',
        'club',
        'add a club',
        'people',
        'color coding',
        'passed club color',
        'determines count',
        'zaps',
        'hes',
        "jim's",
        'jims',
    }
    action_words = {
        'pass', 'self', 'hold', 'holllld', 'zip', 'zap', 'heff', 'trelf', 'doctoring',
        'pickup', 'early', 'doubles', 'on-time', 'triple', 'hands', 'double', 'sync',
        'active', 'count', 'passself', 'passed', 'add',
    }

    results: List[str] = []
    for line in lines:
        name = clean_name(line)
        name = trim_action_suffix(name)
        if not name:
            continue
        lower = name.lower()
        if lower in banned_exact:
            continue
        if name.isupper() and len(name) <= 8:
            continue
        if re.fullmatch(r"\d+", name):
            continue
        if re.fullmatch(r"\d+\+?\s*-?person", lower):
            continue
        if re.fullmatch(r"\d+\s*[- ]?club", lower):
            continue
        if re.fullmatch(r"\d+-count", lower):
            continue
        if lower.startswith(tuple(WORD_NUMBERS.keys())) and 'person' in lower:
            continue
        if lower.startswith('3-person') or lower.startswith('4-person') or lower.startswith('5-person'):
            continue
        if name[0].isdigit() and 'with' in lower:
            continue
        words = re.findall(r"[A-Za-z']+", lower)
        if words and all(word in action_words for word in words):
            continue
        if not re.search(r"[A-Za-z]", name):
            continue
        results.append(name)

    doc.close()
    return results


def extract_anthology() -> List[str]:
    doc = fitz.open(BOOKS_DIR / 'anthology.pdf')
    results: List[str] = []
    for i in range(doc.page_count):
        if i < 14:
            continue
        text = normalize_block(doc.load_page(i).get_text('text'))
        lines = [clean_name(line) for line in text.splitlines() if line.strip()]
        for idx, line in enumerate(lines):
            lower = line.lower()
            if not re.search(r"[A-Za-z]", line):
                continue
            if re.search(r"\bjugglers?\b", lower) and re.search(r"\d", line):
                continue
            if re.match(r"^\d+(\.\d+)+\.?\s", lower):
                continue
            if re.match(r"^\d+\.?\s+clubs?\b", lower):
                continue
            if line in {'L', 'R', 'A', 'B', 'C', 'D'}:
                continue
            if re.fullmatch(r"[A-Z]{1,2}", line):
                continue
            if ':' in line:
                continue
            if len(line.split()) > 6:
                continue
            lookahead = ' '.join(lines[idx + 1:idx + 4]).lower()
            if 'sequence' in lookahead or 'global' in lookahead or 'local' in lookahead:
                results.append(line)

    doc.close()
    return results


def unique_preserve(items: Iterable[str]) -> List[str]:
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def merge_patterns(existing: List[Dict], extracted: Dict[str, List[str]]) -> List[Dict]:
    by_id = {pattern['id']: pattern for pattern in existing}
    for source_tag, data in extracted.items():
        names = data['names']
        label = data['label']
        for raw_name in names:
            name = clean_name(raw_name)
            if not name:
                continue
            pattern_id = slugify(name)
            if not pattern_id:
                continue
            if pattern_id in by_id:
                tags = by_id[pattern_id].get('tags', [])
                source = f"source:{source_tag}"
                if source not in tags:
                    tags.append(source)
                    by_id[pattern_id]['tags'] = tags
                continue
            by_id[pattern_id] = build_pattern(name, source_tag, label)
    return list(by_id.values())


def write_patterns(path: Path, patterns: List[Dict]) -> None:
    patterns_sorted = sorted(patterns, key=lambda p: p['name'].lower())
    lines: List[str] = []
    lines.append("import type { Pattern } from './types';")
    lines.append('')
    lines.append('export const PATTERN_LIBRARY: Pattern[] = [')
    for pattern in patterns_sorted:
        lines.append('  {')
        lines.append(f"    id: '{escape_ts_string(pattern['id'])}',")
        lines.append(f"    name: '{escape_ts_string(pattern['name'])}',")
        lines.append(f"    difficulty: '{escape_ts_string(pattern['difficulty'])}',")
        lines.append(f"    requiredJugglers: {pattern['requiredJugglers']},")
        props = ', '.join(f"'{escape_ts_string(prop)}'" for prop in pattern['props'])
        lines.append(f"    props: [{props}],")
        lines.append(f"    description: '{escape_ts_string(pattern['description'])}',")
        tags = ', '.join(f"'{escape_ts_string(tag)}'" for tag in pattern['tags'])
        lines.append(f"    tags: [{tags}],")
        prereqs = ', '.join(f"'{escape_ts_string(req)}'" for req in pattern['prerequisites'])
        lines.append(f"    prerequisites: [{prereqs}],")
        lines.append('  },')
    lines.append('];')
    lines.append('')
    lines.append('export const getPatternById = (id: string) =>')
    lines.append('  PATTERN_LIBRARY.find((pattern) => pattern.id === id);')
    lines.append('')
    path.write_text('\n'.join(lines), encoding='utf-8')


def main() -> None:
    existing = parse_existing_patterns(PATTERNS_PATH)
    base_patterns = []
    for pattern in existing:
        tags = pattern.get('tags', [])
        if 'source:majbook_v3' in tags or 'source:highgate2014-05-16' in tags:
            base_patterns.append(pattern)

    extracted = {
        'takeouts': {
            'label': 'takeouts',
            'names': unique_preserve(extract_takeouts()),
        },
        'willpatterns': {
            'label': 'WillPatterns',
            'names': unique_preserve(extract_willpatterns()),
        },
        'passingpatternsaug06': {
            'label': 'PassingPatternsAug06',
            'names': unique_preserve(extract_passingpatterns()),
        },
        'madison_patterns_v1_2': {
            'label': 'Madison Patterns V1-2',
            'names': unique_preserve(extract_madison_patterns()),
        },
        'curriculum_flowchart': {
            'label': 'Curriculum Flowchart',
            'names': unique_preserve(extract_flowchart()),
        },
        'anthology': {
            'label': 'anthology',
            'names': unique_preserve(extract_anthology()),
        },
    }

    merged = merge_patterns(base_patterns, extracted)
    write_patterns(PATTERNS_PATH, merged)

    total = len(merged)
    added = total - len(base_patterns)
    print(f"Existing patterns (majbook/highgate): {len(base_patterns)}")
    for key, data in extracted.items():
        print(f"Extracted {key}: {len(data['names'])}")
    print(f"Total patterns: {total} (added {added})")


if __name__ == '__main__':
    main()
