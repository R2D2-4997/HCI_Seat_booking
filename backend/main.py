# ============================================================
# Serveur FastAPI : point d'entrée appelé par l'extension
# Responsable : Personne 2
# ============================================================

import base64
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from schemas import SeatmapPayload, SeatmapResponse
from vision import analyze_seatmap_with_vision

app = FastAPI(title="TactileSeat Backend AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "TactileSeat AI Engine Running"}

@app.post("/process-seatmap", response_model=SeatmapResponse)
async def process_seatmap(payload: SeatmapPayload):
    try:
        if payload.dynamic_layout and payload.dynamic_layout.get("rows", 0) > 0:
            layout = payload.dynamic_layout
            return {
                "status": "success",
                "source": "dom",
                "rows": layout.get("rows", 0),
                "cols": layout.get("cols", 0),
                "matrix": layout.get("matrix", []),
                "seats_metadata": layout.get("seatsMetadata", {})
            }

        if payload.image_base64:
            base64_data = payload.image_base64
            if "," in base64_data:
                base64_data = base64_data.split(",")[1]

            image_bytes = base64.b64decode(base64_data)
            ai_result = analyze_seatmap_with_vision(image_bytes)

            return {
                "status": "success",
                "source": "vision_ai",
                "rows": ai_result.get("rows", 0),
                "cols": ai_result.get("cols", 0),
                "matrix": ai_result.get("matrix", []),
                "seats_metadata": ai_result.get("seatsMetadata", {})
            }

        raise HTTPException(status_code=400, detail="Aucune donnée DOM ni image valide transmise.")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur du moteur IA/Vision : {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
