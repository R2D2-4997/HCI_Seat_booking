import base64
import io
import json
import re
from typing import Any, Dict, List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
import uvicorn

try:
    import google.generativeai as genai
    # Configurez votre clé API Gemini ici ou via os.environ["GEMINI_API_KEY"]
    genai.configure(api_key="VOTRE_CLE_API_GEMINI")
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

app = FastAPI(title="TactileSeat Backend AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    if not HAS_GEMINI:
        raise ValueError("Le SDK google-generativeai n'est pas installé sur le serveur.")

    image = Image.open(io.BytesIO(image_bytes))
    model = genai.GenerativeModel("gemini-1.5-flash")

    prompt = """
    Tu es un système de vision par ordinateur spécialisé dans l'accessibilité pour les déficients visuels.
    Analyse ce plan de réservation de sièges de vol/train et génère une structure JSON stricte.

    Règles de conversion :
    1. Identifie la disposition exacte des rangées et des colonnes.
    2. Construis un tableau 2D 'matrix' représentant chaque case de la cabine :
       - 0 = Couloir / Allée centrale
       - 1 = Siège disponible
       - 2 = Siège occupé / Indisponible / Bloqué
    3. Génère un objet 'seatsMetadata' associant chaque coordonnée "rangée,colonne" (ex: "0,1") à :
       - id: Identifiant réel du siège (ex: "31A")
       - price: Prix ou "Disponible"/"Indisponible"
       - status: "available" ou "occupied"

    Retourne EXCLUSIVEMENT un objet JSON valide suivant cette structure, sans balises Markdown :
    {
      "rows": 5,
      "cols": 7,
      "matrix": [[2, 1, 1, 0, 1, 1, 2]],
      "seatsMetadata": {
        "0,0": {"id": "1A", "price": "Indisponible", "status": "occupied"}
      }
    }
    """

    response = model.generate_content([prompt, image])
    text_response = response.text.strip()

    if text_response.startswith("```"):
        text_response = re.sub(r"^```(?:json)?\n?", "", text_response)
        text_response = re.sub(r"\n?```$", "", text_response)

    return json.loads(text_response)

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