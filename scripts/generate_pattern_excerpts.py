from __future__ import annotations

import argparse
import ast
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PATTERNS_PATH = ROOT / 'lib' / 'patternpals' / 'patterns.ts'
OUTPUT_DIR = ROOT / 'public' / 'patternpals' / 'excerpts'
METADATA_PATH = ROOT / 'lib' / 'patternpals' / 'excerpts.ts'


@dataclass(frozen=True)
class BookConfig:
    tag: str
    title: str
    file: str
    pdf_path: Path
    start_page: int = 0
    crop_mode: str = 'section'


BOOKS: dict[str, BookConfig] = {
    'source:majbook_v3': BookConfig(
        tag='source:majbook_v3',
        title='Madison Juggling Club Passing Book (v3)',
        file='/patternpals/books/majbook_v3.pdf',
        pdf_path=ROOT / 'public' / 'patternpals' / 'books' / 'majbook_v3.pdf',
        start_page=20,
    ),
    'source:highgate2014-05-16': BookConfig(
        tag='source:highgate2014-05-16',
        title='Highgate Passing Patterns (2014)',
        file='/patternpals/books/highgate2014-05-16.pdf',
        pdf_path=ROOT / 'public' / 'patternpals' / 'books' / 'highgate2014-05-16.pdf',
    ),
    'source:passingpatternsaug06': BookConfig(
        tag='source:passingpatternsaug06',
        title='Passing Patterns Compendium (Aug 2006)',
        file='/patternpals/books/PassingPatternsAug06.pdf',
        pdf_path=ROOT / 'public' / 'patternpals' / 'books' / 'PassingPatternsAug06.pdf',
        start_page=3,
    ),
    'source:willpatterns': BookConfig(
        tag='source:willpatterns',
        title='Will Murray Passing Patterns',
        file='/patternpals/books/WillPatterns.pdf',
        pdf_path=ROOT / 'public' / 'patternpals' / 'books' / 'WillPatterns.pdf',
        start_page=6,
    ),
    'source:madison_patterns_v1_2': BookConfig(
        tag='source:madison_patterns_v1_2',
        title='Madison Patterns V1-2',
        file='/patternpals/books/Madison_Patterns_V1-2.pdf',
        pdf_path=ROOT / 'public' / 'patternpals' / 'books' / 'Madison_Patterns_V1-2.pdf',
        start_page=1,
    ),
    'source:takeouts': BookConfig(
        tag='source:takeouts',
        title='Takeouts',
        file='/patternpals/books/takeouts.pdf',
        pdf_path=ROOT / 'public' / 'patternpals' / 'books' / 'takeouts.pdf',
        start_page=3,
    ),
    'source:anthology': BookConfig(
        tag='source:anthology',
        title='Passing Pattern Anthology',
        file='/patternpals/books/anthology.pdf',
        pdf_path=ROOT / 'public' / 'patternpals' / 'books' / 'anthology.pdf',
        start_page=14,
    ),
    'source:curriculum_flowchart': BookConfig(
        tag='source:curriculum_flowchart',
        title='Passing Progression Flowchart',
        file='/patternpals/books/Curriculum-Flowchart.pdf',
        pdf_path=ROOT / 'public' / 'patternpals' / 'books' / 'Curriculum-Flowchart.pdf',
        crop_mode='context',
    ),
}


@dataclass
class PatternRecord:
    id: str
    name: str
    tags: list[str]


@dataclass(frozen=True)
class IndexedLine:
    page_index: int
    rect: fitz.Rect
    text: str
    normalized: str


@dataclass
class Match:
    pattern: PatternRecord
    book: BookConfig
    page_index: int
    rect: fitz.Rect
    matched_text: str


class BookIndex:
    def __init__(self, config: BookConfig):
        self.config = config
        self.doc = fitz.open(config.pdf_path)
        self.lines: list[IndexedLine] = []
        for page_index in range(config.start_page, self.doc.page_count):
            page = self.doc.load_page(page_index)
            data = page.get_text('dict')
            for block in data.get('blocks', []):
                for line in block.get('lines', []):
                    spans = line.get('spans', [])
                    text = ''.join(span.get('text', '') for span in spans).strip()
                    if not text:
                        continue
                    self.lines.append(
                        IndexedLine(
                            page_index=page_index,
                            rect=fitz.Rect(line.get('bbox')),
                            text=text,
                            normalized=normalize(text),
                        )
                    )

    def close(self) -> None:
        self.doc.close()


def ts_escape(value: str) -> str:
    return value.replace('\\', '\\\\').replace("'", "\\'")


def parse_patterns() -> list[PatternRecord]:
    text = PATTERNS_PATH.read_text(encoding='utf-8')
    objects = re.findall(r"  \{\n(.*?)\n  \},", text, flags=re.S)
    patterns: list[PatternRecord] = []
    for body in objects:
        id_match = re.search(r"    id: '((?:\\'|[^'])*)',", body)
        name_match = re.search(r"    name: '((?:\\'|[^'])*)',", body)
        tags_match = re.search(r"    tags: \[(.*?)\],", body)
        if not id_match or not name_match:
            continue
        tags = ast.literal_eval('[' + tags_match.group(1) + ']') if tags_match else []
        patterns.append(
            PatternRecord(
                id=id_match.group(1).replace("\\'", "'"),
                name=name_match.group(1).replace("\\'", "'"),
                tags=tags,
            )
        )
    return patterns


def normalize(value: str) -> str:
    value = unicodedata.normalize('NFKD', value)
    for char in ('\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2212'):
        value = value.replace(char, '-')
    value = value.replace('’', "'").replace('‘', "'")
    value = value.encode('ascii', 'ignore').decode('ascii')
    value = value.lower()
    value = re.sub(r"[^a-z0-9+]+", ' ', value)
    return re.sub(r"\s+", ' ', value).strip()


def candidate_names(name: str) -> list[str]:
    values = [name]
    if '(' in name:
        values.append(re.sub(r"\s*\([^)]*\)", '', name).strip())
    if '-' in name:
        values.append(name.replace('-', ' '))
    if "'" in name:
        values.append(name.replace("'", ''))
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        normalized = normalize(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            out.append(normalized)
    return out


def is_heading_like(line: IndexedLine, candidate: str) -> bool:
    if ' . . ' in line.text or len(line.normalized) > 90:
        return False
    return line.normalized == candidate or line.normalized.startswith(f'{candidate} ')


def is_weak_match(line: IndexedLine, candidate: str) -> bool:
    if ' . . ' in line.text:
        return False
    return candidate in line.normalized


def locate_in_index(pattern: PatternRecord, book_index: BookIndex) -> Match | None:
    candidates = candidate_names(pattern.name)

    # Search all pages for heading-like matches first so a later real pattern section wins
    # over earlier TOC entries or incidental prose references.
    for candidate in candidates:
        for line in book_index.lines:
            if is_heading_like(line, candidate):
                return Match(pattern, book_index.config, line.page_index, line.rect, line.text)

    for candidate in candidates:
        for line in book_index.lines:
            if is_weak_match(line, candidate):
                return Match(pattern, book_index.config, line.page_index, line.rect, line.text)

    raw_variants = [pattern.name, pattern.name.replace('-', ' '), re.sub(r"\s*\([^)]*\)", '', pattern.name).strip()]
    for raw in raw_variants:
        if not raw:
            continue
        for page_index in range(book_index.config.start_page, book_index.doc.page_count):
            rects = book_index.doc.load_page(page_index).search_for(raw)
            if rects:
                return Match(pattern, book_index.config, page_index, rects[0], raw)
    return None


def locate_pattern(pattern: PatternRecord, indexes: dict[str, BookIndex]) -> Match | None:
    source_tags = [tag for tag in pattern.tags if tag.startswith('source:')]
    for tag in source_tags:
        book_index = indexes.get(tag)
        if not book_index:
            continue
        match = locate_in_index(pattern, book_index)
        if match:
            return match
    return None


def build_clip(page: fitz.Page, match: Match) -> fitz.Rect:
    page_rect = page.rect
    rect = match.rect
    horizontal_margin = 28
    if match.book.crop_mode == 'context':
        pad_x = 150
        pad_y = 110
        clip = fitz.Rect(
            max(page_rect.x0, rect.x0 - pad_x),
            max(page_rect.y0, rect.y0 - pad_y),
            min(page_rect.x1, rect.x1 + pad_x),
            min(page_rect.y1, rect.y1 + pad_y),
        )
        if clip.width < 320:
            center = (clip.x0 + clip.x1) / 2
            clip.x0 = max(page_rect.x0, center - 160)
            clip.x1 = min(page_rect.x1, center + 160)
        if clip.height < 220:
            center = (clip.y0 + clip.y1) / 2
            clip.y0 = max(page_rect.y0, center - 110)
            clip.y1 = min(page_rect.y1, center + 110)
        return clip

    y0 = max(page_rect.y0, rect.y0 - 26)
    y1 = min(page_rect.y1, rect.y0 + 390)
    if page_rect.y1 - y1 < 80:
        y0 = max(page_rect.y0, y1 - 430)
    return fitz.Rect(
        max(page_rect.x0, page_rect.x0 + horizontal_margin),
        y0,
        min(page_rect.x1, page_rect.x1 - horizontal_margin),
        y1,
    )


def render_excerpt(match: Match, doc: fitz.Document) -> Path:
    page = doc.load_page(match.page_index)
    clip = build_clip(page, match)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=clip, alpha=False)
    png_path = OUTPUT_DIR / f'{match.pattern.id}.png'
    webp_path = OUTPUT_DIR / f'{match.pattern.id}.webp'
    pixmap.save(png_path)
    with Image.open(png_path) as image:
        if image.width > 1200:
            ratio = 1200 / image.width
            image = image.resize((1200, max(1, int(image.height * ratio))), Image.Resampling.LANCZOS)
        image.save(webp_path, 'WEBP', quality=78, method=6)
    png_path.unlink(missing_ok=True)
    return webp_path


def write_metadata(entries: list[dict]) -> None:
    lines: list[str] = []
    lines.append('export type PatternExcerpt = {')
    lines.append('  sourceTag: string;')
    lines.append('  sourceTitle: string;')
    lines.append('  bookFile: string;')
    lines.append('  page: number;')
    lines.append('  image: string;')
    lines.append('  alt: string;')
    lines.append('};')
    lines.append('')
    lines.append('export const PATTERN_EXCERPTS: Record<string, PatternExcerpt> = {')
    for entry in sorted(entries, key=lambda item: item['patternId']):
        lines.append(f"  '{ts_escape(entry['patternId'])}': {{")
        lines.append(f"    sourceTag: '{ts_escape(entry['sourceTag'])}',")
        lines.append(f"    sourceTitle: '{ts_escape(entry['sourceTitle'])}',")
        lines.append(f"    bookFile: '{ts_escape(entry['bookFile'])}',")
        lines.append(f"    page: {entry['page']},")
        lines.append(f"    image: '{ts_escape(entry['image'])}',")
        lines.append(f"    alt: '{ts_escape(entry['alt'])}',")
        lines.append('  },')
    lines.append('};')
    lines.append('')
    lines.append('export const getPatternExcerpt = (patternId: string) => PATTERN_EXCERPTS[patternId];')
    lines.append('')
    METADATA_PATH.write_text('\n'.join(lines), encoding='utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description='Render PatternPals book excerpts.')
    parser.add_argument('--limit', type=int, default=0, help='Optional number of excerpts to render for testing.')
    parser.add_argument('--ids', nargs='*', default=[], help='Optional pattern IDs to render.')
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    patterns = parse_patterns()
    if args.ids:
        wanted = set(args.ids)
        patterns = [pattern for pattern in patterns if pattern.id in wanted]

    indexes = {tag: BookIndex(config) for tag, config in BOOKS.items() if config.pdf_path.exists()}
    entries: list[dict] = []
    misses: list[PatternRecord] = []
    try:
        for pattern in patterns:
            if args.limit and len(entries) >= args.limit:
                break
            match = locate_pattern(pattern, indexes)
            if not match:
                misses.append(pattern)
                continue
            webp_path = render_excerpt(match, indexes[match.book.tag].doc)
            entries.append(
                {
                    'patternId': pattern.id,
                    'sourceTag': match.book.tag,
                    'sourceTitle': match.book.title,
                    'bookFile': match.book.file,
                    'page': match.page_index + 1,
                    'image': '/' + str(webp_path.relative_to(ROOT / 'public')).replace('\\', '/'),
                    'alt': f"Excerpt for {pattern.name} from {match.book.title}, page {match.page_index + 1}.",
                }
            )
    finally:
        for index in indexes.values():
            index.close()

    if not args.limit and not args.ids:
        write_metadata(entries)

    print(f'rendered={len(entries)}')
    print(f'missed={len(misses)}')
    if misses:
        print('sample_misses=')
        for pattern in misses[:50]:
            print(f'  {pattern.id}: {pattern.name}')


if __name__ == '__main__':
    main()
