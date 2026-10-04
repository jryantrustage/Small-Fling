import asyncio
import re
import xml.etree.ElementTree as ET
from services.adb_service import run_adb_shell, get_active_adb_serial

async def dump():
    ser = await get_active_adb_serial()
    print("Device serial:", ser)
    res = await run_adb_shell("uiautomator dump /sdcard/ui.xml && cat /sdcard/ui.xml", ser)
    xml = res.get("stdout", "")
    idx = xml.find("<?xml")
    if idx != -1:
        xml = xml[idx:]
    try:
        root = ET.fromstring(xml)
    except Exception as e:
        print("XML parse error:", e)
        return

    print("UI Elements:")
    for node in root.iter("node"):
        b = node.attrib.get("bounds", "")
        desc = node.attrib.get("content-desc", "")
        text = node.attrib.get("text", "")
        res_id = node.attrib.get("resource-id", "")
        m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", b)
        if m and int(m.group(2)) < 300:
            if desc or text or "button" in node.attrib.get("class", "").lower():
                print(f"{b}: class={node.attrib.get('class')}, desc='{desc}', text='{text}', id='{res_id}'")

asyncio.run(dump())
