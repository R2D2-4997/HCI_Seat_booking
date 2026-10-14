// ============================================================
// Envoi des données au backend Python / Gemini
// Responsable : Personne 2
// ============================================================

const BACKEND_URL = "http://127.0.0.1:8000/process-seatmap";

async function processSeatmap(payload) {
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}
