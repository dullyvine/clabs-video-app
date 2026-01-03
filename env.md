# Environment Variables Setup
Copy to `packages/backend/.env`

---

## ✅ REQUIRED (Core Functionality)

```env
# Server
PORT=3001
NODE_ENV=development

# Gemini API - Powers: Chat, Script Writing, Search Grounding, Image Generation
# Get key: https://aistudio.google.com/apikey
GEMINI_API_KEY=your_gemini_key_here
```

---

## ✅ CONFIGURED (Your Current Setup)

```env
# Gen AI Pro TTS - ElevenLabs-compatible voice synthesis
# Get key: https://genaipro.vn
GEN_AI_PRO_API_KEY=your_genaipro_key_here
GEN_AI_PRO_BASE_URL=https://genaipro.vn/api/v1

# Pexels - Free stock video library
# Get key: https://www.pexels.com/api/
PEXELS_API_KEY=your_pexels_key_here
```

---

## ⚪ OPTIONAL (Add for More Features)

```env
# OpenRouter - Access Claude, GPT-4o, Llama, DeepSeek + 100 more models
# Get key: https://openrouter.ai/keys
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
DEFAULT_LLM_MODEL=anthropic/claude-3.5-sonnet

# AI33 TTS - Alternative ElevenLabs-compatible TTS
# Get key: https://ai33.pro
AI33_API_KEY=
AI33_BASE_URL=https://api.ai33.pro/v1

# Transcription tuning (local Whisper)
# Xenova/whisper-tiny.en is the smallest + fastest free model available.
# For higher accuracy (still free), switch to Xenova/whisper-base.en.
TRANSCRIPTION_MODEL=Xenova/whisper-tiny.en
TRANSCRIPTION_DTYPE=q8
TRANSCRIPTION_DEVICE=cpu
TRANSCRIPTION_LANGUAGE=english
TRANSCRIPTION_TASK=transcribe
TRANSCRIPTION_CHUNK_LENGTH_S=30
TRANSCRIPTION_STRIDE_LENGTH_S=5

# Storyblocks - Premium stock videos (paid)
STORYBLOCKS_PUBLIC_KEY=
STORYBLOCKS_SECRET_KEY=
```

---

## 🔧 SYSTEM (Usually keep defaults)

```env
# File cleanup settings (milliseconds)
CLEANUP_INTERVAL_MS=600000
FILE_MAX_AGE_MS=3600000
```

---

## Quick Reference

| Feature | Required Key | Status with Your Setup |
|---------|--------------|------------------------|
| Chat & Script Writing | GEMINI_API_KEY | ✅ Working |
| Web Search Grounding | GEMINI_API_KEY | ✅ Working |
| Image Generation | GEMINI_API_KEY | ✅ Working |
| Text-to-Speech | GEN_AI_PRO_API_KEY | ✅ Working |
| Stock Videos | PEXELS_API_KEY | ✅ Working |
| OpenRouter Models | OPENROUTER_API_KEY | ⚪ Not configured |
| AI33 TTS | AI33_API_KEY | ⚪ Not configured |
