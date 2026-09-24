import re, glob, os

css_path = 'web/src/index.css'
with open(css_path, encoding='utf-8') as f:
    css_content = f.read()

jsx_classes = set()
for fpath in glob.glob('web/src/**/*.tsx', recursive=True):
    with open(fpath, encoding='utf-8') as f:
        content = f.read()
    # find className="..." or className={`...`}
    matches = re.findall(r'className=["`{]([^"`}]+)["`}]', content)
    for m in matches:
        tokens = re.findall(r'[a-zA-Z0-9_\-]+', m)
        for t in tokens:
            if not t.startswith('is') and not t.startswith('show') and not t.startswith('has') and t not in ('true', 'false', 'null', 'undefined', 'p', 'prev', 'e'):
                jsx_classes.add((t, fpath))

missing = []
for cls, fpath in sorted(jsx_classes):
    # Check if cls exists in css as .cls
    if not re.search(r'\.' + re.escape(cls) + r'(?![a-zA-Z0-9_\-])', css_content):
        missing.append((cls, fpath))

by_file = {}
for cls, fpath in missing:
    by_file.setdefault(os.path.basename(fpath), []).append(cls)

for fname, clss in sorted(by_file.items()):
    print(f'=== {fname} ({len(clss)} missing classes) ===')
    print(', '.join(clss))
