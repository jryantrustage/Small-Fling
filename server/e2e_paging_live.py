"""
Live UI-automation paging check (real device via ADB + running API server).

Drives the DAG over HTTP exactly like the web UI buttons do:
  1. purge frames + clear key-event telemetry
  2. run DAG 1 (initialize: verify Line 1 + cursor on Line 1)
  3. run N single-cycle DAG 2 captures (screen capture -> gutter OCR -> arrow down -> verify)
  4. assert top(page n+1) == bottom(page n) + 1 for every page, and that the arrow-down
     press counts follow (2L-1) for page 1->2 and L afterwards.

Usage:  python e2e_paging_live.py [--pages 6] [--base http://localhost:8000]
Exit code 0 = pass, 1 = fail.
"""
import argparse
import json
import sys
import time
import urllib.request


def call(base, method, path, body=None, timeout=180):
    data = json.dumps(body).encode() if body is not None else (b"{}" if method == "POST" else None)
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:1500]}")


def run_paging_check(base="http://localhost:8000", pages=6, verbose=True):
    log = print if verbose else (lambda *a, **k: None)
    call(base, "POST", "/api/frames/purge")
    call(base, "POST", "/api/telemetry/key-events/clear")

    init = call(base, "POST", "/api/dag/groups/initialize/run", {})
    log("INIT:", json.dumps(init)[:300])

    observed = []  # (top, bottom, arrow_count)
    for i in range(pages):
        res = call(base, "POST", "/api/dag/groups/capture/run", {"single_cycle": True})
        dag = call(base, "GET", "/api/dag/status")
        nodes = dag.get("dag", dag).get("nodes", {})
        ocr = nodes.get("frame_ocr", {})
        arr = nodes.get("arrow_down", {})
        top, bot = ocr.get("top_line"), ocr.get("bottom_line")
        observed.append({"page": i + 1, "top": top, "bottom": bot,
                         "arrows": arr.get("arrow_count"), "status": res.get("status")})
        log(f"page {i+1}: Ln {top}->{bot} arrows={arr.get('arrow_count')} status={res.get('status')}")
        time.sleep(0.3)

    failures = []
    if not observed or observed[0]["top"] != 1:
        failures.append(f"page 1 top must be Ln 1, got {observed[0]['top'] if observed else None}")
    L = (observed[0]["bottom"] - observed[0]["top"] + 1) if observed and observed[0]["bottom"] else None
    for prev, cur in zip(observed, observed[1:]):
        if prev["bottom"] is None or cur["top"] != prev["bottom"] + 1:
            failures.append(f"page {cur['page']} top Ln {cur['top']} != page {prev['page']} bottom {prev['bottom']} + 1")
    if L:
        if observed[0]["arrows"] != 2 * L - 1:
            failures.append(f"page1->2 arrows {observed[0]['arrows']} != 2L-1 ({2*L-1})")
        for o in observed[1:-1]:
            if o["arrows"] != L:
                failures.append(f"page {o['page']}->{o['page']+1} arrows {o['arrows']} != L ({L})")
    return {"observed": observed, "viewport_lines": L, "failures": failures}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=6)
    ap.add_argument("--base", default="http://localhost:8000")
    a = ap.parse_args()
    out = run_paging_check(a.base, a.pages)
    print(json.dumps(out, indent=2))
    sys.exit(1 if out["failures"] else 0)
