from pydantic import BaseModel
from typing import Optional, Dict, Any, List

class ProjectCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    target_total_lines: Optional[int] = 0

class FramePositionRequest(BaseModel):
    custom_offset_y: float

class ConfigRequest(BaseModel):
    api_key: str

class LineEditRequest(BaseModel):
    text: str
    status: Optional[str] = None
    notes: Optional[str] = None

class FlagRequest(BaseModel):
    notes: str

class RecaptureRequest(BaseModel):
    line_number: int
    reason: str

class TelemetryUpdateRequest(BaseModel):
    device_id: Optional[str] = "Pixel 10 Desktop"
    is_pacing: Optional[bool] = False
    current_page: Optional[int] = 0
    current_top_line: Optional[int] = 0
    current_bottom_line: Optional[int] = 0
    target_total_lines: Optional[int] = 0
    dwell_countdown_ms: Optional[int] = 0
    phase: Optional[str] = "IDLE"
    status_message: Optional[str] = ""
    active_step: Optional[str] = None
    source: Optional[str] = "mobile"
    mobile_tokens: Optional[Dict[str, int]] = None
    pacer_calibration: Optional[Dict[str, Any]] = None

class OrchestrationRequest(BaseModel):
    command: str
    source: Optional[str] = "web"
    active_step: Optional[str] = None
    target_total_lines: Optional[int] = None

class OcrSelectionRequest(BaseModel):
    engine: Optional[str] = None
    model_target: Optional[str] = None

class PipelineModeRequest(BaseModel):
    mode: str

class ReprocessRequest(BaseModel):
    model_target: Optional[str] = None

class DeviceSelectRequest(BaseModel):
    device_model: Optional[str] = None
    serial: Optional[str] = None

class AdbCommandRequest(BaseModel):
    command: str
    serial: Optional[str] = None

class AdbConnectRequest(BaseModel):
    address: str

class AdbPairRequest(BaseModel):
    address: str
    code: str

class AdvancePageRequest(BaseModel):
    key: Optional[str] = "down"
    custom_arrows: Optional[int] = None
    device_id: Optional[str] = None
    source: Optional[str] = "web"

class GotoLineRequest(BaseModel):
    target_line: int
    current_top_line: Optional[int] = None
    source: Optional[str] = "web"

class ResetStateRequest(BaseModel):
    target_total_lines: Optional[int] = 0
