import urllib.request
import json

def test_config_update():
    # Update reset_home config
    url = "http://localhost:8000/api/dag/nodes/reset_home/config"
    payload = json.dumps({"expected_line": 1, "settle_delay_ms": 1050}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'}, method='POST')
    res = urllib.request.urlopen(req)
    updated = json.loads(res.read().decode())
    print("Updated reset_home config:", updated)
    assert updated["config"]["settle_delay_ms"] == 1050
    assert updated["config"]["expected_line"] == 1

    # Update document_assemble config
    url2 = "http://localhost:8000/api/dag/nodes/document_assemble/config"
    payload2 = json.dumps({"auto_save_markdown": True, "output_filename": "final_test.md"}).encode('utf-8')
    req2 = urllib.request.Request(url2, data=payload2, headers={'Content-Type': 'application/json'}, method='POST')
    res2 = urllib.request.urlopen(req2)
    updated2 = json.loads(res2.read().decode())
    print("Updated document_assemble config:", updated2)
    assert updated2["config"]["output_filename"] == "final_test.md"
    print("ALL API UPDATES PASSED UNIFORMLY!")

if __name__ == "__main__":
    test_config_update()
