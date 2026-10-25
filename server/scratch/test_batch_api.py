import urllib.request
import json

def test(path, method='GET', data=None):
    url = f'http://127.0.0.1:8000{path}'
    req = urllib.request.Request(url, method=method)
    if data is not None:
        req.data = json.dumps(data).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode('utf-8')
            print(f'{method} {path} => {resp.status}: {content[:150]}')
    except Exception as e:
        print(f'{method} {path} => ERROR: {e}')

if __name__ == '__main__':
    test('/api/ocr/rescan-all-frames/status')
    test('/api/dag/config/bypass-live-ocr')
    test('/api/dag/config/bypass-live-ocr', method='POST', data={'bypass': True})
    test('/api/dag/config/bypass-live-ocr', method='POST', data={'bypass': False})
    test('/api/dag/status')
