import sys
from pathlib import Path
sys.path.insert(0, 'server')
from ocr_engine import get_rapid_ocr
import cv2

ocr = get_rapid_ocr()
print('RapidOCR available:', ocr is not None)
for name in ['crop_teams.png', 'crop_file.png', 'crop_mode_icons.png', 'crop_first_line.png', 'crop_last_line.png']:
    im = cv2.imread(name)
    if im is None:
        print(f'{name} not found')
        continue
    res, _ = ocr(im)
    print(f'=== {name} ===')
    if res:
        for b, t, s in res:
            print(f'  text: "{t}", score: {s}')
    else:
        print('  no text detected')
