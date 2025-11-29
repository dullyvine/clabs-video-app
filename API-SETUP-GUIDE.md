# 🔑 API Setup Guide

## Current Status of Your APIs

Based on your `.env` file:

✅ **GEMINI_API_KEY** - Configured  
✅ **GEN_AI_PRO_API_KEY** - Configured  
❌ **OPENROUTER_API_KEY** - Missing (needed for some image models)  
❌ **AI33_API_KEY** - Not configured (optional)  
❌ **PEXELS_API_KEY** - Not being used (optional)

## Issues Fixed

### 1. ✅ Gemini Image Generation (404 Error)
**Problem**: Wrong API endpoint (`:generateImages` doesn't exist)  
**Fixed**: Updated to use `:generateContent` endpoint with correct request structure

### 2. ✅ Stock Video Keywords (Empty Arrays)
**Problem**: LLM wasn't returning stock video queries properly  
**Fixed**: 
- Enhanced JSON parsing to handle markdown code blocks
- Added fallback to use visual keywords if stock queries are empty
- Improved `generateStockVideoKeywords` with better distribution logic
- Added comprehensive error handling and logging

### 3. ⚠️ OpenRouter Image Generation
**Status**: Your API key is not set  
**Solution**: See instructions below

## How to Get OpenRouter API Key

OpenRouter gives you access to FLUX Pro, DALL-E 3, and other advanced image models.

### Step 1: Sign Up
1. Go to https://openrouter.ai/
2. Click "Sign In" → Sign up with GitHub or email
3. Verify your email

### Step 2: Add Credits
1. Go to https://openrouter.ai/credits
2. Add at least $5 (recommended $10-20 for testing)
3. Image generation costs vary:
   - FLUX 1.1 Pro: ~$0.04 per image
   - DALL-E 3: ~$0.04 per image
   - FLUX Schnell: ~$0.003 per image (cheapest)

### Step 3: Get API Key
1. Go to https://openrouter.ai/keys
2. Click "Create Key"
3. Name it "Video Generator"
4. Copy the key (starts with `sk-or-...`)

### Step 4: Add to Your .env
```bash
# Open packages/backend/.env and add:
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

## Current Working Setup

With your current API keys, here's what works:

### ✅ Working Features
- **Voiceover Generation**: Gen AI Pro TTS is configured
- **Script Analysis**: Gemini LLM analyzes your scripts
- **Image Generation**: Gemini image models (imagen-4, gemini-2.5-flash-image, etc.)
- **Stock Videos**: Mock data with proper keyword generation (now fixed!)

### ⚠️ Limited Features (need OpenRouter key)
- FLUX Pro/Dev/Schnell models
- DALL-E 3 model
- These require OpenRouter API key + credits

## Testing the Fixes

### Test 1: Single Image Flow
1. Start the app: `bun run dev`
2. Enter a script
3. Select "Single Image" flow
4. Choose **"gemini-2.5-flash-image"** or **"imagen-4.0-generate-001"** as model
5. Generate → Should work now!

### Test 2: Stock Video Flow
1. Enter a script
2. Select "Stock Videos" flow
3. Click analyze → Should now show keywords and mock videos

### Test 3: Multi-Image Flow
1. Enter a script
2. Select "Multiple Images" flow
3. Set image count (e.g., 5)
4. Generate prompts → LLM creates scene descriptions
5. Generate images → Uses Gemini models

## Recommended Next Steps

1. **For best results**: Get OpenRouter API key (gives you FLUX and DALL-E)
2. **Test Gemini images**: Works immediately with your current setup
3. **Stock videos**: Currently using mock data (works for testing)

## Model Recommendations

### For Quick Testing (Free/Your Current Setup)
- **Image**: `gemini-2.5-flash-image` (fast, free with Gemini API)
- **LLM**: Gemini 2.5 Flash (already working)
- **TTS**: Gen AI Pro (already configured)

### For Production Quality (Requires OpenRouter)
- **Image**: `flux-pro` or `imagen-4.0-ultra-generate-001`
- **LLM**: Claude 3.5 Sonnet via OpenRouter (better prompts)
- **TTS**: Gen AI Pro (you have this)

## Troubleshooting

### "OPENROUTER_API_KEY not set"
→ This is expected! The app falls back to Gemini for images.  
→ To use FLUX/DALL-E, add OpenRouter key as shown above.

### Gemini 404 errors
→ **FIXED!** The endpoint has been corrected.

### Stock videos showing empty keywords
→ **FIXED!** Enhanced fallback logic added.

### "Image generation failed"
→ Check which model you selected  
→ Gemini models need GEMINI_API_KEY (you have this ✅)  
→ FLUX/DALL-E need OPENROUTER_API_KEY (you need to add this)

## Questions?

All fixes have been applied. The main thing you need to decide:

1. **Use Gemini images only** → Works right now, no cost
2. **Add OpenRouter** → Better models (FLUX Pro), costs ~$0.04/image

Both options will work perfectly now! 🚀
