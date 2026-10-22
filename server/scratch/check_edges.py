import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from services import state
print("Configured Edges:")
for e in state.dag_state.get("edges", []):
    print(f"{e.get('from')} -> {e.get('to')} (cond={e.get('condition')}, enabled={e.get('enabled')})")
