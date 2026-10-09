from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
import uvicorn

app = FastAPI(title="TactileSeat Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DynamicLayoutPayload(BaseModel):
    dynamic_layout: Dict[str, Any]

class SeatmapResponse(BaseModel):
    status: str
    rows: int
    cols: int
    matrix: List[List[int]]
    seats_metadata: Dict[str, Any]

@app.post("/process-seatmap", response_model=SeatmapResponse)
async def process_seatmap(payload: DynamicLayoutPayload):
    try:
        layout = payload.dynamic_layout
        rows = layout.get("rows", 0)
        cols = layout.get("cols", 0)
        matrix = layout.get("matrix", [])
        seats_metadata = layout.get("seatsMetadata", {})

        if rows == 0 or cols == 0:
            raise HTTPException(status_code=400, detail="Données de cabine invalides.")

        return {
            "status": "success",
            "rows": rows,
            "cols": cols,
            "matrix": matrix,
            "seats_metadata": seats_metadata
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)