import base64
import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="TactileSeat Backend")

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
    return {"status": "ok", "service": "TactileSeat Backend"}

@app.post("/api/process-seatmap")
async def process_seatmap(payload: SeatMapPayload):
    try:
        # Decodage de l'image base64
        if "," in payload.image_base64:
            _, encoded = payload.image_base64.split(",", 1)
        else:
            encoded = payload.image_base64

        image_data = base64.b64decode(encoded)
        np_arr = np.frombuffer(image_data, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Image invalide")

        # Pretraitement OpenCV
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 200, 255, cv2.THRESH_BINARY_INV)

        # Matrice logique (0 = couloir, 1 = libre, 2 = occupe)
        mock_grid = [
            [2, 1, 1, 0, 1, 1, 2],
            [2, 2, 1, 0, 1, 2, 2],
            [1, 1, 1, 0, 1, 1, 1],
            [2, 2, 2, 0, 2, 1, 1],
            [1, 1, 1, 0, 1, 1, 2],
        ]

        mock_metadata = {
            "0,1": {"id": "1B", "type": "Standard", "price": "15€", "status": "available"},
            "0,2": {"id": "1C", "type": "Aisle", "price": "20€", "status": "available"},
            "2,0": {"id": "3A", "type": "Window Exit", "price": "45€", "status": "available"}
        }

        return {
            "status": "success",
            "rows": len(mock_grid),
            "cols": len(mock_grid[0]),
            "matrix": mock_grid,
            "seats": mock_metadata
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)