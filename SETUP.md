# Setup Guide - Bun + Real APIs

## ✅ What's Been Updated

I've successfully migrated your project to use **real APIs** instead of mocks:

### 1. **OpenRouter Integration** (Multi-Model Images & LLM)
- ✅ Image generation with support for:
  - DALL-E 3 & 2 (OpenAI)
  - Flux 1.1 Pro, Flux Dev, Flux Schnell (Black Forest Labs)
  - Stable Diffusion XL (Stability AI)
- ✅ LLM-powered prompt generation using Claude 3.5 Sonnet or other models
- ✅ Script analysis and scene breakdown

### 2. **ai33.pro Integration** (ElevenLabs-Compatible TTS)
- ✅ Text-to-speech with task polling
- ✅ Automatic audio download
- ✅ Duration detection via FFmpeg
- ✅ Multiple voice support

### 3. **Smart Fallbacks**
- All services fall back to mock data if API keys aren't set
- You can test the app without APIs, then add them later

## 🚀 Installing Bun (Windows)

### Option 1: PowerShell (Recommended)
```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

### Option 2: npm
```bash
npm install -g bun
```

### Option 3: Manual Download
1. Go to https://bun.sh/
2. Download Windows installer
3. Run the installer
4. Restart your terminal

### Verify Installation
```bash
bun --version
```

## 🔑 Setting Up API Keys

### Step 1: Get Your API Keys

**OpenRouter** (for images & LLM):
1. Go to https://openrouter.ai/
2. Sign up and get API key
3. Add credits to your account

**ai33.pro** (for voiceover):
1. Go to https://api.ai33.pro/
2. Sign up and get API key

### Step 2: Create `.env` File

In `packages/backend/`, create a file named `.env`:

```bash
# Copy the example
cp .env.example .env

# Or manually create .env with these contents:
PORT=3001
NODE_ENV=development

# ai33.pro API (ElevenLabs-compatible TTS)
AI33_API_KEY=your_actual_api_key_here
AI33_BASE_URL=https://api.ai33.pro/v1

# OpenRouter API (Multi-model image & LLM)
OPENROUTER_API_KEY=your_actual_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# Default Models
DEFAULT_IMAGE_MODEL=black-forest-labs/flux-1.1-pro
DEFAULT_LLM_MODEL=anthropic/claude-3.5-sonnet
```

## 🏃 Running with Bun

### Install Dependencies
```bash
bun install
```

### Start Development Servers
```bash
bun run dev
```

This will start:
- Frontend on http://localhost:3000
- Backend on http://localhost:3001

## 📊 Available Models

### Image Models (via OpenRouter)
- `black-forest-labs/flux-1.1-pro` - Best quality, slower
- `black-forest-labs/flux-1-schnell` - Fast generation
- `openai/dall-e-3` - OpenAI's flagship model
- `openai/dall-e-2` - Older OpenAI model
- `stability-ai/stable-diffusion-xl` - Open source option

### LLM Models (for prompts)
- `anthropic/claude-3.5-sonnet` - Best for creative prompts
- `openai/gpt-4-turbo` - Good alternative
- `meta-llama/llama-3.1-70b-instruct` - Fast & cheap

### Voice Models (ai33.pro)
The API supports all ElevenLabs voices. Common voice IDs:
- `21m00Tcm4TlvDq8ikWAM` - Rachel (default female)
- `pNInz6obpgDQGcFmaJgB` - Adam (male)
- `EXAVITQu4vr4xnSDxMaL` - Bella (female)
- `IKne3meq5aSn9XLyUdCD` - Charlie (casual male)

## 🧪 Testing Without API Keys

The app will work WITHOUT API keys - it will use mock data:
- Mock voiceovers (estimated duration based on word count)
- Mock images (JSON files with metadata)
- Mock LLM prompts (template-based)

This lets you:
- Test the UI/UX
- Verify the workflow
- Develop without costs

## 💰 Cost Estimates

### OpenRouter Pricing (approximate)
- **Flux 1.1 Pro**: ~$0.04 per image
- **DALL-E 3**: ~$0.04 per image  
- **Claude 3.5 Sonnet**: ~$0.003 per 1K tokens (prompts)

### ai33.pro Pricing
- Check their website for current rates
- Usually cheaper than direct ElevenLabs

### Example Video Cost
For a 60-second video with 10 images:
- Voiceover: ~$0.05-0.10
- 10 Images: ~$0.40
- LLM Prompts: ~$0.01
- **Total: ~$0.50-0.60 per video**

## 🔧 Troubleshooting

### "Bun command not found"
- Restart your terminal after installing Bun
- Make sure Bun is in your PATH

### "API key invalid"
- Double-check you copied the full key
- Make sure there are no spaces in the `.env` file
- Verify your account has credits

### "Image generation failed"
- Check OpenRouter account balance
- Try a different model (Flux Schnell is faster/cheaper)
- Look at backend logs for specific error

### "Voiceover timeout"
- Long scripts may take 30-60 seconds
- Check ai33.pro account status
- Fallback to mock will activate automatically

## 📝 Next Steps

1. **Install Bun** (see instructions above)
2. **Add API keys** to `packages/backend/.env`
3. **Run:** `bun install && bun run dev`
4. **Test** the full workflow with real APIs
5. **Monitor** costs in your API dashboards

## 🎯 Quick Start (Without Bun)

If you want to stick with npm for now:
```bash
npm install
npm run dev
```

The API integrations will work the same way!
