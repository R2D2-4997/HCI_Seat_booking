# ============================================================
# Format des données échangées avec l'extension
# Responsable : Personne 2
# ============================================================

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class SeatmapPayload(BaseModel):
    dynamic_layout: Optional[Dict[str, Any]] = None
    image_base64: Optional[str] = None
    width: Optional[float] = 414.0
    height: Optional[float] = 1200.0


class SeatmapResponse(BaseModel):
    status: str
    source: str
    rows: int
    cols: int
    matrix: List[List[int]]
    seats_metadata: Dict[str, Any]
