"""Validate static markup, navigation destinations, image files, and paper metadata."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import re

ROOT = Path(__file__).resolve().parent.parent
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.ids = set()
        self.references = []
        self.errors = []
        self.papers = 0
        self.news = 0
        self.h1 = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag not in VOID:
            self.stack.append(tag)
        element_id = attrs.get('id')
        if element_id:
            if element_id in self.ids:
                self.errors.append(f'Duplicate ID: {element_id}')
            self.ids.add(element_id)
        classes = attrs.get('class', '').split()
        self.papers += 'publication' in classes
        self.news += 'news-item' in classes
        self.h1 += tag == 'h1'
        for attr in ('src', 'href'):
            value = attrs.get(attr)
            if value:
                self.references.append(value)
        if tag == 'img' and 'alt' not in attrs:
            self.errors.append('Image missing alternative text')
        if attrs.get('target') == '_blank' and 'noopener' not in attrs.get('rel', ''):
            self.errors.append(f'External link missing noopener: {attrs.get("href")}')

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(f'Mismatched </{tag}> at line {self.getpos()[0]}; open: {self.stack[-4:]}')
        else:
            self.stack.pop()

page = Page()
page.feed(ROOT.joinpath('index.html').read_text())
for reference in page.references:
    url = urlsplit(reference)
    if url.scheme or url.netloc:
        continue
    if not url.path and url.fragment:
        if url.fragment not in page.ids:
            page.errors.append(f'Broken anchor: {reference}')
    elif url.path:
        target = ROOT / unquote(url.path.lstrip('/'))
        if not target.exists():
            page.errors.append(f'Missing asset: {reference}')

if page.stack:
    page.errors.append(f'Unclosed tags: {page.stack}')
if page.papers != 5 or page.news != 8 or page.h1 != 1:
    page.errors.append(f'Unexpected content counts: {page.papers} papers, {page.news} news items, {page.h1} h1 tags')

source = ROOT.joinpath('index.html').read_text()
for paper in ('TransNormal', 'BideDPO', 'TSGS', 'DreamRenderer', 'Human101'):
    if f'class="pub-name">{paper}</span>' not in source:
        page.errors.append(f'Missing paper: {paper}')
if page.errors:
    raise SystemExit('\n'.join(page.errors))
print(f'PASS: balanced HTML, {len(page.ids)} unique IDs, all local assets and anchors, 5 papers, 8 news entries, accessible images and external links.')
