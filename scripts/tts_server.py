import sys, json, os, struct
import numpy as np

os.environ.setdefault("PYTHONUNBUFFERED", "1")
os.environ["COQUI_TOS_AGREED"] = "1"

# Prevent torch access violation (0xC0000005) on CPU — limit threads and disable MKL
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import torch
torch.set_num_threads(4)

original_load = torch.load
def _patched_load(f, *args, **kwargs):
    kwargs["weights_only"] = False
    return original_load(f, *args, **kwargs)
torch.load = _patched_load

import soundfile as sf
import torchaudio

original_torchaudio_load = torchaudio.load
def _patched_audio_load(filepath: str, *args, **kwargs):
    try:
        tensor, sr = original_torchaudio_load(filepath, *args, **kwargs)
        # torchaudio: (C, T) → (1, T) mono
        if tensor.size(0) > 1:
            tensor = tensor.mean(dim=0, keepdim=True)
        return tensor, sr
    except Exception:
        audio, sr = sf.read(filepath, dtype="float32")
        # soundfile: (T, C) → (1, T) mono
        if audio.ndim == 1:
            tensor = torch.from_numpy(audio).unsqueeze(0)
        else:
            tensor = torch.from_numpy(audio.mean(axis=1))  # (T,)
            tensor = tensor.unsqueeze(0)  # (1, T)
        return tensor, sr

torchaudio.load = _patched_audio_load

from TTS.tts.models.xtts import load_audio as xtts_load_audio
xtts_load_audio.__globals__["torchaudio"].load = _patched_audio_load

from TTS.api import TTS

model: TTS | None = None

def write_msg(obj: dict):
    line = json.dumps(obj, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()

def load_model():
    global model
    try:
        write_msg({"type": "log", "message": "Starting XTTS v2 model load..."})
        hf_endpoint = os.environ.get("HF_ENDPOINT", "(not set)")
        write_msg({"type": "log", "message": f"HF_ENDPOINT={hf_endpoint}"})
        sys.stdout.flush()
        sys.stderr.flush()

        # If mirror is set, TTS model may not be on mirror — use direct HF
        if "MIRROR" in hf_endpoint.upper() or "HF-MIRROR" in hf_endpoint.lower():
            write_msg({"type": "log", "message": "Mirror detected, using direct HF for TTS model..."})
            os.environ.pop("HF_ENDPOINT", None)

        write_msg({"type": "log", "message": "Loading XTTS v2 into memory (может занять 10-30 мин при первом запуске)..."})
        # progress_bar=False — tqdm спамит в stderr, прогресс показываем через Node.js reminders
        model = TTS("tts_models/multilingual/multi-dataset/xtts_v2", gpu=False, progress_bar=False)
        write_msg({"type": "log", "message": "Moving model to CPU..."})
        model.to(torch.device("cpu"))
        write_msg({"type": "ready"})
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        write_msg({"type": "error", "message": str(e) + "\n" + tb})
        sys.exit(1)

def synthesize(text: str, speaker_wav: str | None, language: str, output_path: str):
    try:
        # Redirect TTS print() to stderr to avoid pipe deadlock on stdout
        import contextlib
        with contextlib.redirect_stdout(sys.stderr):
            wav = model.tts(text=text, speaker_wav=speaker_wav, language=language)
        save_wav(np.array(wav), 24000, output_path)
        return {"type": "result", "status": "ok"}
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        return {"type": "result", "status": "error", "message": str(e) + "\n" + tb}

def save_wav(wav: np.ndarray, sr: int, path: str):
    wav = np.clip(wav, -1.0, 1.0)
    samples = (wav * 32767).astype(np.int16)
    num_samples = len(samples)
    data_size = num_samples * 2
    with open(path, "wb") as f:
        f.write(b"RIFF")
        f.write(struct.pack("<I", 36 + data_size))
        f.write(b"WAVE")
        f.write(b"fmt ")
        f.write(struct.pack("<I", 16))
        f.write(struct.pack("<H", 1))
        f.write(struct.pack("<H", 1))
        f.write(struct.pack("<I", sr))
        f.write(struct.pack("<I", sr * 2))
        f.write(struct.pack("<H", 2))
        f.write(struct.pack("<H", 16))
        f.write(b"data")
        f.write(struct.pack("<I", data_size))
        f.write(samples.tobytes())

if __name__ == "__main__":
    load_model()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            write_msg({"type": "result", "status": "error", "message": "invalid json"})
            continue
        t = req.get("type")
        req_id = req.get("id")
        if t == "synthesize":
            result = synthesize(
                text=req.get("text", ""),
                speaker_wav=req.get("speaker_wav"),
                language=req.get("language", "ru"),
                output_path=req.get("output_path", ""),
            )
            result["id"] = req_id
            write_msg(result)
        elif t == "shutdown":
            break
        else:
            write_msg({"type": "result", "status": "error", "message": f"unknown type: {t}"})
