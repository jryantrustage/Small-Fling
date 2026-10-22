import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from services.ocr_service import call_minicpm_ollama_sync, parse_minicpm_output

test_img = Path(__file__).parent.parent / "storage" / "frames" / "dag_node2_home.png"
print(f"Testing MiniCPM on {test_img} (exists={test_img.exists()})...")

try:
    res, model = call_minicpm_ollama_sync(test_img, expected_top=1)
    print("Model used:", model)
    print("Raw response:\n", res)
    lines, top_ln, bot_ln, fmt, fn = parse_minicpm_output(res)
    print(f"\nParsed: top={top_ln}, bot={bot_ln}, total lines={len(lines)}")
    for l in lines:
        print(f"{l['line_number']}: {repr(l['text'])}")
except Exception as e:
    import traceback
    traceback.print_exc()
