import config
import json
from pathlib import Path
from PIL import Image
from google import genai
from google.genai import types

def run_audit():
    client = genai.Client(api_key=config.GEMINI_API_KEY)
    img_path = Path("C:/Projects/Small-Fling/server/storage/frames/frame_00216_00269_20261003_123930_367.png")
    if not img_path.exists():
        print("Image path does not exist")
        return

    img = Image.open(img_path)
    prompt = """
    Examine the provided code screenshot. Line numbers are indicated in the left gutter.
    We extracted the following lines with our local OCR model (MiniCPM-V):
    - Line 3: "B G I H J K L M N O P Q R S T U V W X Y Z | 1 2 |"
    - Line 4: "  |    F    E    D    C    B    A    0    -1   |"
    - Line 5: "  |    \\    /    \\    /    \\    /    \\    /    \\   |"

    For each of these lines:
    1. Transcribe the ground-truth text verbatim directly from the image, including indentation and every symbol/bracket/punctuation.
    2. Compute character match fidelity % between the local OCR text and your ground-truth transcription.
    3. Note any character discrepancies (substitutions like 0 vs O, | vs I, \\ vs /, missing or extra spaces/punctuation).
    4. Provide concrete adjustment recommendations:
       - image_processing: filter, contrast (+15%), sharpening, or binarization adjustments
       - dpi_resolution: device DPI scaling (e.g. adb shell wm density) or display resolution adjustments
       - model_tuning: prompt instructions or decoding temperature

    Return ONLY a JSON object:
    {
      "audit_status": "success",
      "model_auditor": "gemini-3.8-flash",
      "overall_accuracy_percent": 98.5,
      "lines": [
        {
          "line_number": 3,
          "ocr_text": "...",
          "gemini_reference_text": "...",
          "accuracy_percent": 100.0,
          "status": "perfect_match",
          "discrepancies": [],
          "character_diff_summary": "Exact match across 49 characters",
          "diagnostics": {
            "image_processing": "Contrast and brightness are sufficient for alphanumeric characters.",
            "dpi_resolution": "Resolution 1080p is sharp; character pitch is well-preserved.",
            "model_tuning": "Optimal verbatim reproduction."
          }
        }
      ],
      "system_recommendations": {
        "device_dpi": "Current DPI preserves character boundaries. If punctuation bleeds, increase DPI to 400.",
        "display_resolution": "1920x1080 native is optimal; avoid non-integer fractional display scaling.",
        "ocr_image_preprocessing": "Apply 10% contrast stretch on text bounding boxes to improve thin slashes and pipes.",
        "model_temperature_and_prompt": "Maintain temperature=0.0 and verbatim token prompt."
      }
    }
    """

    models_to_try = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-2.5-flash"]
    res = None
    last_err = None
    for m in models_to_try:
        try:
            print(f"Trying model: {m}...")
            res = client.models.generate_content(
                model=m,
                contents=[img, prompt],
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            if res and res.text:
                print(f"Success with {m}!")
                break
        except Exception as ex:
            print(f"Failed with {m}: {ex}")
            last_err = ex
            
    if res and res.text:
        print("Gemini Output:")
        print(res.text)
    else:
        print("All models failed:", last_err)

if __name__ == "__main__":
    run_audit()
