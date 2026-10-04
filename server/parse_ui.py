import xml.etree.ElementTree as ET

with open("current_ui.xml", "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

idx = content.find("<?xml")
if idx != -1:
    content = content[idx:]

root = ET.fromstring(content)
for node in root.iter("node"):
    b = node.attrib.get("bounds", "")
    desc = node.attrib.get("content-desc", "")
    text = node.attrib.get("text", "")
    res_id = node.attrib.get("resource-id", "")
    clickable = node.attrib.get("clickable", "")
    if b != "[0,0][0,0]" and (desc or text or clickable == "true"):
        print(f"{b}: desc='{desc}', text='{text}', id='{res_id}', clickable={clickable}")
