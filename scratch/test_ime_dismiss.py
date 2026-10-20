import sys
import asyncio
sys.path.extend(['c:/Projects/Small-Fling/server', 'c:/Projects/Small-Fling/server/services', 'c:/Projects/Small-Fling/server/core'])
import adb_service

async def test():
    ser = await adb_service.get_active_adb_serial()
    disp_id = await adb_service.detect_external_display_id(ser)
    print(f"Serial: {ser}, Display: {disp_id}")

    # Case 1: IME is closed. dismiss_keyboard should do NOTHING and NOT send keyevent 4!
    v = await adb_service.is_ime_visible(ser, force_check=True)
    print(f"Case 1 (IME closed): visible={v}")
    
    # Case 2: Pop IME by tapping body
    print("Popping IME...")
    await adb_service.run_adb_shell(f"input -d {disp_id} tap 500 500", ser)
    await asyncio.sleep(1.0)
    v2 = await adb_service.is_ime_visible(ser, force_check=True)
    print(f"Case 2 (IME popped): visible={v2}")

    # Dismiss using keyevent 4 on disp_id
    if v2:
        print("Dismissing via input -d {disp_id} keyevent 4...")
        await adb_service.run_adb_shell(f"input -d {disp_id} keyevent 4", ser)
        await asyncio.sleep(0.5)
        v3 = await adb_service.is_ime_visible(ser, force_check=True)
        print(f"After dismiss: visible={v3}")

    # Now verify FilePreviewActivity is still intact
    top = await adb_service.get_top_activity(ser)
    print(f"Top activity: {top}")

asyncio.run(test())
