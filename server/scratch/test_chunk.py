import urllib.request, json, base64
from PIL import Image

# Crop lines 10 to 18 (y: 530 to 780, x: 50 to 1800)
img = Image.open("scratch/clean_home.png")
chunk = img.crop((50, 530, 1800, 785))
chunk.save("scratch/chunk_10_18.png")

img_b64 = base64.b64encode(open("scratch/chunk_10_18.png", "rb").read()).decode("utf-8")
prompt = """Transcribe every line in this code editor image verbatim from top to bottom.
Include the gutter line numbers (e.g. '10: ├── DevAnalysis...').
Preserve all characters, symbols, tree branches, and indentation verbatim.
Output format:
<line_number>: <verbatim code>"""

req_data = json.dumps({
    "model": "minicpm-v:latest",
    "prompt": prompt,
    "images": [img_b64],
    "stream": False,
    "options": {
        "num_predict": 512,
        "temperature": 0.05,
        "num_thread": 4
    }
}).encode("utf-8")

req = urllib.request.Request("http://localhost:11434/api/generate", data=req_data, headers={"Content-Type": "application/json"})
resp = json.loads(urllib.request.urlopen(req, timeout=60).read().decode("utf-8"))
print("CHUNK 10-18 RESULT:\n" + resp.get("response", ""))
