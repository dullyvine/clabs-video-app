# YouTube Video Generator

Transform scripts into stunning YouTube videos with AI-powered voiceovers and visuals.

## Features

- **AI Voiceover Generation**: Convert scripts to speech using various TTS services
- **Three Content Flows**:
  - **Single Image**: Generate one AI image that loops throughout the video
  - **Multiple Images**: Create dynamic videos with multiple AI-generated images
  - **Stock Videos**: Use professional stock footage automatically matched to your script
- **AI-Powered Prompts**: LLM generates optimized image prompts based on your script and niche
- **Customization**: Choose models, aspect ratios, image count, and duration settings
- **Video Composition**: FFmpeg-powered video generation with audio sync
- **No Database Required**: Temporary file storage with automatic cleanup

## Tech Stack

### Frontend
- Next.js 14+ with App Router
- React with TypeScript
- Premium dark mode design with glassmorphism
- Responsive and animated UI

### Backend
- Node.js with Express
- FFmpeg for video processing
- Mock APIs for TTS, image generation, and stock videos

### Monorepo Structure
```
├── packages/
│   ├── frontend/          # Next.js application
│   ├── backend/           # Express API server
│   └── shared/            # Shared TypeScript types
└── package.json           # Root workspace configuration
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- FFmpeg installed on your system
  - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH
  - **Mac**: `brew install ffmpeg`
  - **Linux**: `sudo apt-get install ffmpeg`

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development servers**:
   ```bash
   npm run dev
   ```

   This starts both frontend (http://localhost:3000) and backend (http://localhost:3001) concurrently.

### Individual Server Commands

- Frontend only: `npm run dev:frontend`
- Backend only: `npm run dev:backend`
- Build all: `npm run build`

## Usage

1. **Enter Script**: Paste your video script and select a voiceover service
2. **Select Niche**: Choose your content category (motivational, educational, etc.)
3. **Choose Flow**:
   - **Single Image**: Best for simple, looping backgrounds
   - **Multiple Images**: Dynamic scene changes throughout the video
   - **Stock Videos**: Professional stock footage
4. **Generate Assets**: AI creates prompts and generates images/finds videos
5. **Customize**: Adjust settings like image duration, aspect ratio, etc.
6. **Generate Video**: FFmpeg compiles everything into a final video
7. **Download**: Get your completed video file

## API Endpoints

### Voiceover
- `POST /api/voiceover/generate` - Generate voiceover from script

### Images
- `POST /api/images/prompts` - Generate image prompts from script
- `POST /api/images/generate` - Generate single image
- `POST /api/images/generate-batch` - Generate multiple images
- `POST /api/images/upload` - Upload custom image

### Stock Videos
- `POST /api/stock-videos/analyze` - Analyze script for video keywords
- `POST /api/stock-videos/search` - Search stock videos

### Video Generation
- `POST /api/video/generate` - Start video generation
- `GET /api/video/status/:jobId` - Check generation progress
- `POST /api/video/overlay/upload` - Upload overlay image

## Configuration

### Mock APIs

Currently, all external APIs are mocked:
- **TTS**: Returns dummy audio files with estimated duration
- **Image Generation**: Returns placeholder images
- **Stock Videos**: Returns mock video URLs
- **LLM**: Generates prompts using simple text processing

To integrate real APIs:
1. Navigate to `packages/backend/src/services/`
2. Replace mock implementations with actual API calls
3. Add API keys to environment variables

### Environment Variables

Create `.env` files in frontend and backend directories:

**Frontend (.env.local)**:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**Backend (.env)**:
```env
PORT=3001
OPENAI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
# Add other API keys as needed
```

## File Management

- Temporary files are stored in `packages/backend/temp/`
- Uploaded files go to `packages/backend/uploads/`
- Files are automatically deleted after 1 hour
- No database or persistent storage

## Architecture

### Data Flow

1. User enters script → Frontend
2. Frontend calls backend API → `/api/voiceover/generate`
3. Backend processes with mock TTS → Returns audio URL
4. User selects content type → Frontend
5. Frontend requests prompts → `/api/images/prompts`
6. LLM generates prompts → Returns prompt array
7. Frontend requests images → `/api/images/generate-batch`
8. Image service generates images → Returns image URLs
9. User clicks generate video → Frontend
10. Backend uses FFmpeg to compose → Job queued
11. Frontend polls for progress → `/api/video/status/:jobId`
12. Video ready → Download link provided

## Development Notes

- Frontend runs on port **3000**
- Backend runs on port **3001**
- Hot reload enabled for both
- TypeScript strict mode enabled
- Shared types ensure type safety across packages

## Troubleshooting

### FFmpeg not found
Ensure FFmpeg is installed and added to your system PATH.

### Port already in use
Change ports in:
- Frontend: `packages/frontend/package.json` (dev script)
- Backend: `packages/backend/src/server.ts` (PORT variable)

### Module not found errors
Run `npm install` in the root directory to ensure all workspaces are linked.

## Future Enhancements

- [ ] Real API integrations (OpenAI, ElevenLabs, Leonardo AI, Pixels)
- [ ] Overlay blend mode preview
- [ ] Stock video flow UI completion
- [ ] Video preview before download
- [ ] Cloud storage integration
- [ ] User authentication
- [ ] Project history/database
- [ ] Advanced video editing (filters, effects)
- [ ] Subtitle/caption generation
- [ ] Batch video generation

## License

MIT

## Support

For issues or questions, please check the backend logs in the terminal where you ran `npm run dev`.
