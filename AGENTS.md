# VoiceTransleter V2 — Project Context

## Stack
- Electron 33 + Vue 3 + TypeScript + Tailwind CSS
- `faster-whisper` (Python) for Whisper ASR — CTranslate2 backend
- `google-translate-api-x` for translation
- `fluent-ffmpeg` + system FFmpeg
- **Coqui TTS** (Python) — XTTS v2 for voice cloning/multi-voice TTS

## ASR Model
- **Model**: `medium` (faster-whisper, CTranslate2, int8 CPU)
- **Engine**: Python sidecar (`scripts/whisper_server.py`), communicates via JSON stdin/stdout
- **Why**: Replaced `@huggingface/transformers` (transformers.js + ONNX Runtime) which suffered from Windows file locking issues on `.onnx` files. faster-whisper uses CTranslate2 (no `.onnx` lock issues).

## TTS Model
- **Model**: `tts_models/multilingual/multi-dataset/xtts_v2` (Coqui XTTS v2)
- **Architecture**: XTTS (Cross-lingual Text-to-Speech with voice cloning)
- **Size**: ~2.5 GB
- **Sample rate**: 24 kHz
- **Languages**: en, es, fr, de, it, pt, pl, tr, ru, nl, cs, ar, zh-cn, hu, ko, ja, hi
- **Voices**: Voice cloning from user-provided WAV samples (multi-speaker)
- **Engine**: Python sidecar (`scripts/tts_server.py`), communicates via JSON stdin/stdout

## Key Architecture Decisions
- JS/TS stack + **Python sidecar for ASR and TTS** (both via JSON stdin/stdout protocol)
- ASR: `faster-whisper` (CTranslate2) via `scripts/whisper_server.py`
- TTS: `XTTS v2` (Coqui TTS) via `scripts/tts_server.py`
- No `@huggingface/transformers` dependency — removed due to ONNX Runtime file locking on Windows
- FFmpeg system binary (C:\kinescope-desktop\bin\ffmpeg.exe)
- Audio mixing: software WAV mixer (Node.js Int16Array) for 200+ segments
- Output text files: 8 files per video (*_source.txt, *_translation.txt, *_translit*.txt + plain versions)

## Critical Paths
- Models cache (faster-whisper): `%USERPROFILE%\.cache\faster-whisper\`
- Models cache (HF): `%APPDATA%\voice-transleter\hf-cache\`
- Temp: `%APPDATA%\voice-transleter\temp\`
- Output: `%APPDATA%\voice-transleter\output\`
- Voices: `%APPDATA%\voice-transleter\voices\`
- Python scripts: `scripts/tts_server.py`, `scripts/whisper_server.py`

## Build Commands
- Dev: `npm run dev`
- Build: `npm run build`
- Dist: `npm run dist`

## TTS Quality Note
XTTS v2 provides voice cloning from user audio samples. The speaker_wav is loaded from the `voices/` directory. For best quality, provide a 10-30 second WAV sample. If no sample is available, a fallback silence WAV is used (poor quality — user should upload a voice sample).
