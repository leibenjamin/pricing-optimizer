from pathlib import Path
text_path = Path('src/App.tsx')
text = text_path.read_text(encoding='utf-8')
sub = 'id="kpi-pocket-coverage"'
indices = []
start = 0
while True:
    i = text.find(sub, start)
    if i == -1:
        break
    indices.append(i)
    start = i + 1
print('indices', indices)
if len(indices) <= 1:
    raise SystemExit('nothing to remove')
remove_start = indices[-1]
end = text.find('</Section>', remove_start)
if end == -1:
    raise SystemExit('end not found')
end = text.find('\n', end)
if end == -1:
    end = len(text)
line_start = text.rfind('\n', 0, remove_start) + 1
new_text = text[:line_start] + text[end:]
text_path.write_text(new_text, encoding='utf-8')
print('removed block from', line_start, 'to', end)
