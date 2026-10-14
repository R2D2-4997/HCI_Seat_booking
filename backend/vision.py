# ============================================================
# Analyse d'une capture d'écran du plan de sièges avec Gemini
# Responsable : Personne 2
# ============================================================

import io
import json
import os
import re
from typing import Any, Dict

from PIL import Image

from prompts import SEATMAP_PROMPT

try:
    import google.generativeai as genai
    # Clé API lue dans la variable d'environnement GEMINI_API_KEY
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY", "VOTRE_CLE_API_GEMINI"))
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False


def analyze_seatmap_with_vision(image_bytes: bytes) -> Dict[str, Any]:
    if not HAS_GEMINI:
        raise ValueError("Le SDK google-generativeai n'est pas installé sur le serveur.")

    image = Image.open(io.BytesIO(image_bytes))
    model = genai.GenerativeModel("gemini-1.5-flash")

    response = model.generate_content([SEATMAP_PROMPT, image])
    text_response = response.text.strip()

    if text_response.startswith("```"):
        text_response = re.sub(r"^```(?:json)?\n?", "", text_response)
        text_response = re.sub(r"\n?```$", "", text_response)

    return json.loads(text_response)
