import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import config
import json
from google import genai
from google.genai import types
from PIL import Image

def main():
    client = genai.Client(api_key=config.GEMINI_API_KEY)
    img = Image.open("scratch/clean_home.png")
    prompt = """You are an expert code OCR transcription engine.
Look at the editor on the screen. There are line numbers in the left gutter (1, 2, 3, 4, ...).
Transcribe every visible line in the editor document verbatim.
Preserve exact indentation, box-drawing characters (├──, │, └──), markdown symbols, backticks, empty lines, and syntax.
Return ONLY valid JSON matching this schema:
{
  "top_gutter_line": <int>,
  "bottom_gutter_line": <int>,
  "lines": [
    {
      "line_number": <int>,
      "text": "<verbatim line content without line number prefix>",
      "is_blank": <bool>
    }
  ]
}
"""
    models = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-flash-lite"]
    resp = None
    for m in models:
        try:
            print(f"Trying {m}...")
            resp = client.models.generate_content(
                model=m,
                contents=[img, prompt],
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            if resp and resp.text:
                print(f"Success with {m}!")
                break
        except Exception as e:
            print(f"Failed {m}: {e}")
    data = json.loads(resp.text)
    print("Top line:", data.get("top_gutter_line"))
    print("Bottom line:", data.get("bottom_gutter_line"))
    print("Extracted count:", len(data.get("lines", [])))
    for item in data.get("lines", []):
        print(f"{item.get('line_number'):>3}: {item.get('text')}")

if __name__ == "__main__":
    main()
