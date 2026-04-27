"""
PESQ / STOI Quality Server
──────────────────────────
Runs locally on http://127.0.0.1:8000
Angular Test Component POSTs two WAV files (reference + degraded) and receives
PESQ (MOS-LQO wideband) and STOI scores back.

Setup (one-time):
    pip install fastapi uvicorn pesq pystoi soundfile scipy numpy

Start:
    python quality_server.py

Endpoint:
    POST /api/quality
    multipart/form-data:
        reference  — WAV file (RAW / original)
        degraded   — WAV file (DF3 or Koala processed)
    Response JSON:
        { "pesq": 3.42, "stoi": 0.87, "pesq_label": "Good" }
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pesq import pesq, PesqError
from pystoi import stoi
import soundfile as sf
import numpy as np
import io
import math
import uvicorn

try:
    from scipy.signal import resample_poly
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

app = FastAPI(title="Audio Quality Server", version="1.0.0")

# Allow requests from Angular dev server (localhost:4200) and any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

TARGET_SR = 16000  # PESQ wideband + STOI both require 16 kHz


def resample_audio(audio: np.ndarray, from_sr: int, to_sr: int) -> np.ndarray:
    """Resample audio to target sample rate."""
    if from_sr == to_sr:
        return audio
    if SCIPY_AVAILABLE:
        gcd = math.gcd(from_sr, to_sr)
        return resample_poly(audio, to_sr // gcd, from_sr // gcd).astype(np.float32)
    # Fallback: linear interpolation (lower quality but no scipy needed)
    target_len = int(len(audio) * to_sr / from_sr)
    indices = np.linspace(0, len(audio) - 1, target_len)
    return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)


def mos_label(score: float) -> str:
    """Map PESQ score to perceptual quality label."""
    if score >= 4.0: return "Excellent"
    if score >= 3.5: return "Good"
    if score >= 3.0: return "Fair"
    if score >= 2.0: return "Poor"
    return "Bad"


async def read_wav(upload: UploadFile) -> tuple[np.ndarray, int]:
    """Read an uploaded WAV file into a mono float32 numpy array."""
    data = await upload.read()
    audio, sr = sf.read(io.BytesIO(data), dtype="float32")
    # Mix to mono if stereo
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    return audio, sr


@app.get("/")
def health():
    return {"status": "ok", "message": "Audio quality server running. POST /api/quality"}


@app.post("/api/quality")
async def compute_quality(
    reference: UploadFile = File(..., description="RAW / original WAV (reference signal)"),
    degraded:  UploadFile = File(..., description="Processed WAV (DF3 or Koala output)")
):
    """
    Compute PESQ (wideband) and STOI scores between reference and degraded audio.
    Both files are resampled to 16 kHz before scoring.
    """
    try:
        ref_audio, ref_sr = await read_wav(reference)
        deg_audio, deg_sr = await read_wav(degraded)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read WAV files: {e}")

    if len(ref_audio) == 0 or len(deg_audio) == 0:
        raise HTTPException(status_code=422, detail="One or both audio files are empty.")

    # Resample to 16 kHz
    ref16 = resample_audio(ref_audio, ref_sr, TARGET_SR)
    deg16 = resample_audio(deg_audio, deg_sr, TARGET_SR)

    # Trim to same length (shorter wins)
    n = min(len(ref16), len(deg16))
    if n < TARGET_SR * 0.5:  # less than 0.5 s — not enough signal
        raise HTTPException(status_code=422, detail="Audio too short (minimum 0.5 s required for PESQ).")
    ref16, deg16 = ref16[:n], deg16[:n]

    # PESQ wideband (mode 'wb') — requires 16 kHz
    try:
        pesq_score = float(pesq(TARGET_SR, ref16, deg16, "wb"))
    except PesqError as e:
        raise HTTPException(status_code=422, detail=f"PESQ error: {e}")

    # STOI — short-time objective intelligibility
    try:
        stoi_score = float(stoi(ref16, deg16, TARGET_SR, extended=False))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"STOI error: {e}")

    return {
        "pesq":       round(pesq_score, 3),
        "stoi":       round(stoi_score, 3),
        "pesq_label": mos_label(pesq_score),
    }


if __name__ == "__main__":
    print("=" * 55)
    print("  Audio Quality Server — PESQ / STOI")
    print("  http://127.0.0.1:8000")
    print("  POST /api/quality  { reference, degraded }")
    print("=" * 55)
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
