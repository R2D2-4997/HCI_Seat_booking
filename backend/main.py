import base64
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="TactileSeat Backend - OpenCV Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SeatMapPayload(BaseModel):
    image_base64: str

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "TactileSeat Backend Engine"}

@app.post("/api/process-seatmap")
async def process_seatmap(payload: SeatMapPayload):
    try:
        # 1. Décodage de l'image Base64 envoyée par l'extension
        if "," in payload.image_base64:
            _, encoded = payload.image_base64.split(",", 1)
        else:
            encoded = payload.image_base64

        image_data = base64.b64decode(encoded)
        np_arr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Image invalide ou corrompue")

        height, width, _ = img.shape

        # 2. Prétraitement OpenCV : Niveaux de gris, flou Gaussian et Seuillage
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 220, 255, cv2.THRESH_BINARY_INV)

        # 3. Structuration de la grille (5 rangées x 7 colonnes par défaut)
        rows, cols = 5, 7
        matrix = []
        seats_metadata = {}

        col_letters = ["A", "B", "C", "", "D", "E", "F"]

        for r in range(rows):
            row_data = []
            for c in range(cols):
                if c == 3:
                    # Colonne 3 réservée au couloir central
                    row_data.append(0)
                    continue

                # Exemple de répartition d'état (1: libre, 2: occupé)
                status_code = 2 if (r + c) % 3 == 0 else 1
                row_data.append(status_code)

                seat_letter = col_letters[c]
                seat_id = f"{r + 1}{seat_letter}"
                
                # Coordonnées normalisées relatives (0.0 à 1.0) pour le clic
                rel_x = (c + 0.5) / cols
                rel_y = (r + 0.5) / rows

                seats_metadata[f"{r},{c}"] = {
                    "id": seat_id,
                    "type": "Standard",
                    "price": "18€",
                    "status": "occupied" if status_code == 2 else "available",
                    "rel_x": rel_x,
                    "rel_y": rel_y
                }
            matrix.append(row_data)

        return {
            "status": "success",
            "image_width": width,
            "image_height": height,
            "rows": rows,
            "cols": cols,
            "matrix": matrix,
            "seats": seats_metadata
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur d'analyse backend: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)