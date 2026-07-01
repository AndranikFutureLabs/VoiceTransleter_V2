import sys, json, os

os.environ.setdefault("PYTHONUNBUFFERED", "1")

from faster_whisper import WhisperModel

model: WhisperModel | None = None

def write_msg(obj: dict):
    line = json.dumps(obj, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()

def load_model():
    global model
    try:
        write_msg({"type": "log", "message": "Loading faster-whisper medium (CPU, int8)...", "id": 0})
        model = WhisperModel("medium", device="cpu", compute_type="int8")
        write_msg({"type": "ready"})
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        write_msg({"type": "error", "message": str(e) + "\n" + tb})
        sys.exit(1)

def transcribe(audio_path: str, language: str, req_id: int = 0):
    global model
    if model is None:
        write_msg({"type": "result", "status": "error", "message": "Model not loaded", "id": req_id})
        return
    try:
        lang = None if language == "auto" else language
        segments, info = model.transcribe(audio_path, language=lang, beam_size=5)
        detected = info.language if lang is None else lang
        result = []
        for seg in segments:
            result.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": seg.text.strip(),
            })
        write_msg({
            "type": "result",
            "status": "ok",
            "segments": result,
            "detected_language": detected,
            "id": req_id,
        })
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        write_msg({"type": "result", "status": "error", "message": str(e) + "\n" + tb, "id": req_id})

if __name__ == "__main__":
    load_model()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            write_msg({"type": "result", "status": "error", "message": "invalid json", "id": 0})
            continue
        t = req.get("type")
        rid = req.get("id", 0)
        if t == "transcribe":
            transcribe(req.get("audio_path", ""), req.get("language", "auto"), rid)
        elif t == "shutdown":
            break
        else:
            write_msg({"type": "result", "status": "error", "message": f"unknown type: {t}", "id": rid})
