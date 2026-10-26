import urllib.request
import json

def verify():
    url = "http://localhost:8000/api/dag/nodes/metadata"
    try:
        req = urllib.request.urlopen(url)
        data = json.loads(req.read().decode())
        nodes = data.get("nodes", [])
        print(f"Total Nodes: {len(nodes)}")
        for n in nodes:
            print(f"Step {n['step']}: id={n['id']} | title={n['title']} | cat={n['category']} | color={n['accent_color']} | config_keys={list(n['config'].keys())}")
    except Exception as e:
        print("Error fetching metadata:", e)

    # Also test get config for reset_home
    cfg_url = "http://localhost:8000/api/dag/nodes/reset_home/config"
    try:
        req = urllib.request.urlopen(cfg_url)
        cfg_data = json.loads(req.read().decode())
        print("\nReset Home Config:", cfg_data)
    except Exception as e:
        print("Error fetching reset_home config:", e)

if __name__ == "__main__":
    verify()
