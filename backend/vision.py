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
from dotenv import load_dotenv
from pathlib import Path
from google import genai as new_genai
from prompts import SEATMAP_PROMPT
# Load the Gemini API key from backend/.env.
load_dotenv(Path(__file__).with_name(".env"))

try:
    import google.generativeai as genai
    # Clé API lue dans la variable d'environnement GEMINI_API_KEY
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY", "VOTRE_CLE_API_GEMINI"))
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False


def analyze_seatmap_with_vision(image_bytes: bytes) -> Dict[str, Any]:
        # Open the screenshot received from the extension.
    image = Image.open(io.BytesIO(image_bytes))

    # Initialize the new Gemini client.
    client = new_genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options={
            "timeout": 30000,  # 30 seconds
            "retry_options": {
            "attempts": 1  # Disable automatic retries
            }
        }
    )

    print("Starting Gemini API request...", flush=True)

    # Analyze the seat map using Gemini.
    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=[SEATMAP_PROMPT, image],
    )

    print("Gemini API request completed!", flush=True)

    # Retrieve Gemini's response.
    if not response.text:
        raise ValueError("Gemini returned an empty response.")

    text_response = response.text.strip()

    if text_response.startswith("```"):
        text_response = re.sub(r"^```(?:json)?\n?", "", text_response)
        text_response = re.sub(r"\n?```$", "", text_response)

    return json.loads(text_response)
