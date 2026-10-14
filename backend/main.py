import base64
import io
import json
import os
import re
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
import uvicorn

# Import sécurisé de la bibliothèque Google GenAI
try:
    from google import genai
    from google.genai import types
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False
    genai = None
    types = None

app = FastAPI(title="TactileSeat Backend AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.environ.get("GEMINI_API_KEY", "VOTRE_CLE_API_GEMINI")
client = genai.Client(api_key=API_KEY) if HAS_GEMINI else None
MODEL_NAME = "gemini-2.5-flash"


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


def analyze_seatmap_with_vision(image_bytes: bytes) -> Dict[str, Any]:
    if not HAS_GEMINI or client is None:
        raise HTTPException(
            status_code=500,
            detail="Le SDK 'google-genai' n'est pas installé. Exécutez 'pip install google-genai'."
        )

    prompt = """
    Tu es un système de vision par ordinateur spécialisé dans l'accessibilité pour les déficients visuels.
    Analyse ce plan de réservation de sièges de vol/train et génère une structure JSON stricte.

    Consignes de structure :
    1. Reconstruis la cabine sous forme de tableau 2D 'matrix' :
       - 0 = Couloir / Allée centrale
       - 1 = Siège disponible
       - 2 = Siège occupé / Indisponible / Bloqué
    2. Crée un objet 'seatsMetadata' associant chaque coordonnée "rangée,colonne" (ex: "0,1") à :
       - id: Identifiant réel du siège (ex: "31A")
       - price: Prix ou "Disponible"/"Indisponible"
       - status: "available" ou "occupied"

    Retourne EXCLUSIVEMENT un objet JSON valide suivant cette structure :
    {
      "rows": 5,
      "cols": 7,
      "matrix": [[2, 1, 1, 0, 1, 1, 2]],
      "seatsMetadata": {
        "0,0": {"id": "1A", "price": "Indisponible", "status": "occupied"}
      }
    }
    """

    try:
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                prompt
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        return json.loads(response.text)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur API Gemini Vision: {str(e)}")


@app.get("/")
def read_root():
    return {"status": "ok", "message": "TactileSeat AI Engine Running", "gemini_enabled": HAS_GEMINI}


@app.post("/process-seatmap", response_model=SeatmapResponse)
async def process_seatmap(payload: SeatmapPayload):
    try:
        response_data = {}

        if payload.dynamic_layout and payload.dynamic_layout.get("rows", 0) > 0:
            layout = payload.dynamic_layout
            response_data = {
                "status": "success",
                "source": "dom",
                "rows": layout.get("rows", 0),
                "cols": layout.get("cols", 0),
                "matrix": layout.get("matrix", []),
                "seats_metadata": layout.get("seatsMetadata", {})
            }
        elif payload.image_base64:
            base64_data = payload.image_base64
            if "," in base64_data:
                base64_data = base64_data.split(",")[1]

            image_bytes = base64.b64decode(base64_data)
            ai_result = analyze_seatmap_with_vision(image_bytes)

            response_data = {
                "status": "success",
                "source": "vision_ai",
                "rows": ai_result.get("rows", 0),
                "cols": ai_result.get("cols", 0),
                "matrix": ai_result.get("matrix", []),
                "seats_metadata": ai_result.get("seatsMetadata", {})
            }
        else:
            raise HTTPException(status_code=400, detail="Aucune donnée DOM ni image valide transmise.")

        print("\n" + "="*60)
        print(f"  [JSON GÉNÉRÉ EN LIVE - SOURCE : {response_data['source'].upper()}]")
        print("="*60)
        print(json.dumps(response_data, indent=2, ensure_ascii=False))
        print("="*60 + "\n")

        return response_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur du moteur IA/Vision : {str(e)}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)