# AI Coding Agent Instructions

## Project Overview
**YouTube Video Generator**: A monorepo (Node.js + Next.js) that transforms video scripts into complete YouTube videos with AI-generated voiceovers, images/stock footage, and FFmpeg composition. Frontend handles multi-step wizard UI; backend orchestrates three content flows via service patterns.

## Architecture & Key Patterns

### Monorepo Structure
- **`packages/frontend`**: Next.js 16 with React 19, App Router, TypeScript. Manages UI wizard (4-step flow) + context state (`AppContext.tsx`).
- **`packages/backend`**: Express server with services (TTS, LLM, image generation, FFmpeg) and route-based API organization.
- **`packages/shared`**: Centralized TypeScript types (`src/types/index.ts`) used across frontend/backend.
- **Root scripts**: `npm run dev` starts both servers concurrently; individual commands in `packages/*/package.json`.

### Service Architecture (Backend)
Services are organized by domain with fallback patterns. Key services in `src/services/`:
- **`tts.service.ts`**: Text-to-speech supporting `gen-ai-pro`, `ai33`, `gemini` providers. Includes voice filtering and concatenation for long scripts.
- **`llm.service.ts`**: LLM prompt generation via OpenRouter (Claude default) or Gemini, with mock fallback if API keys absent.
- **`image.service.ts`**: Image generation using OpenRouter (Flux, DALL-E) or Gemini Imagen, supporting batch operations.
- **`ffmpeg.service.ts`**: Video composition—generates single-image loops, multi-image sequences, or stock video overlays with audio sync.
- **`file.service.ts`**: File tracking/cleanup in `temp/` and `uploads/` directories.
- **`stock.service.ts`**: Mock stock video keyword analysis.

### Three Content Flows
1. **Single-Image**: One AI image loops throughout video duration.
2. **Multi-Image**: Script broken into scenes; each generates unique image with duration settings.
3. **Stock-Video**: LLM analyzes script for keywords; mock stock API returns video clips per scene.
All flows merge: voiceover + visuals → FFmpeg composition → downloadable MP4.

### Frontend State Management
`AppContext.tsx` centralizes app state (7 major groups: voiceover, flow selection, image generation, overlays, video generation). Components dispatch updates via `useApp()` hook. Single-page, client-side rendering.

### API Client Pattern
`lib/api.ts` wraps all backend calls with uniform `fetchAPI<T>()` helper. All endpoint types defined in `shared/src/types/`. No error boundaries—errors bubble to consumer components via throws.

### Request/Response Types
All API requests/responses are typed in `shared/src/types/index.ts`. Examples:
- `VoiceoverRequest` → `VoiceoverResponse` (includes duration)
- `ImagePromptRequest` → array of prompt objects with scene descriptions
- `VideoGenerationRequest` → async job (`jobId` + polling via `/video/status/:jobId`)

## Critical Developer Workflows

### Local Development
```bash
npm install           # Install all workspaces
npm run dev          # Start frontend (3000) + backend (3001) concurrently
npm run dev:frontend # Next.js only
npm run dev:backend  # Express + tsx watch
npm run build        # Compile both packages
```

### Environment Setup
Create `packages/backend/.env`:
```
PORT=3001
OPENROUTER_API_KEY=your_key      # Image generation + LLM
AI33_API_KEY=your_key            # TTS (ElevenLabs-compatible)
GEMINI_API_KEY=optional          # Alternative TTS/LLM/image provider
DEFAULT_IMAGE_MODEL=black-forest-labs/flux-1.1-pro
DEFAULT_LLM_MODEL=anthropic/claude-3.5-sonnet
```
Without API keys, services fall back to mock data—no local setup required for UI testing.

### Video Generation Flow (Async Job Pattern)
1. Frontend calls `POST /api/video/generate` → returns `jobId` immediately.
2. Backend spawns async video composition (FFmpeg), stores job state in memory (`utils/jobs.ts`).
3. Frontend polls `GET /api/video/status/:jobId` until `status === 'completed'`.
4. Video saved to `temp/` directory, served via `app.use('/temp', express.static(...))`.
Job state includes `progress`, `status`, `result.videoUrl`, and error tracking.

### File Lifecycle
- Temporary files: `getTempFilePath()` generates paths in `packages/backend/temp/`.
- Uploads: `multer` saves to `packages/backend/uploads/`, served at `/uploads/*`.
- Cleanup: `file.service.ts` tracks files for manual cleanup (not auto-deleted).

## Project-Specific Conventions

### Error Handling
- Backend routes return `{ error: string }` on 500 errors; stack traces only in dev mode.
- Frontend catches fetch errors and surfaces via Toast context (`useToast()`).
- Services log warnings for missing API keys but continue with mocks (graceful degradation).

### Provider/Model Flexibility
Services support multiple providers (TTS: `gen-ai-pro`/`ai33`/`gemini`; LLM: `openrouter`/`gemini`; images: `openrouter`/`gemini`). Frontend passes provider/model in requests; backend routes them appropriately. Defaults in env vars, overridable per request.

### Niche-Based Customization
Image prompt generation includes niche mappings (`motivational`, `educational`, `entertainment`, etc.) that tailor visual style descriptions sent to LLMs. Backend applies these; frontend selects during flow.

### UUID Usage
All IDs (voiceovers, images, jobs, overlays) use `uuid` package for generation. Stored in state objects and API responses.

## Integration Points & Cross-Component Communication

### Frontend → Backend Data Flow
1. **Voiceover**: `ScriptVoiceoverStep` → API → audio URL stored in `AppContext` → used in video generation.
2. **Image Prompts**: `AssetGenerationStep` → API → prompt array → individual image requests → gallery display.
3. **Video Generation**: `VideoGenerationStep` → collect final state (images, voiceover, overlays) → `POST /api/video/generate` → poll until done.

### Backend Service Composition
- Image generation uses LLM-generated prompts → passes to image service.
- FFmpeg composition reads voiceover (audio file URL) + images + overlays from `temp/` → outputs video.
- Multi-image flow calls `generateMultipleImagePrompts()` then individual `generateImage()` calls in parallel.

### Shared Types as Contract
`shared/src/types/index.ts` is the single source of truth. Changes here ripple through frontend API client and backend route handlers. Always update types first.

## Common Development Tasks

### Adding a New Content Flow
1. Add flow type to `shared/src/types/` (e.g., `'animated-text'`).
2. Extend `AppState` in `AppContext.tsx` with flow-specific state.
3. Create step component in `frontend/src/app/page.tsx`.
4. Add route in `backend/src/routes/video.ts` or create new service.
5. Update `generateVideoAsync()` in `video.ts` to handle new flow.

### Adding a New Image/TTS Provider
1. Define new provider type in `shared/src/types/` (e.g., `'stability-ai'`).
2. Implement service function in backend (e.g., `generateStabilityImage()`).
3. Wrap in existing service file or create new one (e.g., `stability.service.ts`).
4. Route provider selection in existing service functions (check `if (provider === 'new-provider')`).
5. Add env vars and defaults to `.env` template.

### Debugging Video Generation
- Backend logs each stage: prompt generation, image downloads, FFmpeg execution.
- Job state includes full error details (check `GET /api/video/status/{jobId}` response).
- Temp files preserved for inspection; manually clean `packages/backend/temp/`.
- Frontend Toast displays errors; check browser console + backend server logs.

## Key Files Reference
- **Wizard UI**: `packages/frontend/src/app/page.tsx` (871 lines; all 4 steps)
- **App State**: `packages/frontend/src/contexts/AppContext.tsx`
- **Backend Routes**: `packages/backend/src/routes/*.ts` (voiceover, images, stock-videos, video)
- **Services**: `packages/backend/src/services/` (tts, llm, image, ffmpeg, file, stock)
- **Types Contract**: `packages/shared/src/types/index.ts`
- **Job Polling**: `packages/backend/src/utils/jobs.ts` (in-memory job state)
