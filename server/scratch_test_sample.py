import sys
from pathlib import Path
import json

sys.path.insert(0, str(Path("c:/Projects/Small-Fling/server")))

import config
import db
from services import state
from PIL import Image
from google import genai
from google.genai import types

def test_sampling():
    # Load document lines
    pid = state.get_current_project_id()
    sql = """
    SELECT l.line_number, l.line_text, l.frame_id, f.filename, f.top_line, f.bottom_line 
    FROM document_lines l 
    JOIN frames f ON l.frame_id = f.frame_id 
    WHERE length(trim(l.line_text)) > 0 
    ORDER BY l.line_number ASC LIMIT 10;
    """
    rows = db._execute(sql, fetchall=True)
    print(f"Joined rows found: {len(rows)}")
    for r in rows:
        print(dict(r))
    
    code_chars = set("|_\\/[]{}(),;:\"'<>+-=*&%$#@!~`^?")
    sampled = []
    for l in lines:
        txt = l.get("text", "")
        if len(txt.strip()) > 5 and any(c in code_chars for c in txt):
            sampled.append(l)
            if len(sampled) >= 4:
                break
                
    for s in sampled:
        print(f"Ln {s.get('line_number')}: '{s.get('text')}' (frame: {s.get('frame_id')})")

if __name__ == "__main__":
    test_sampling()
