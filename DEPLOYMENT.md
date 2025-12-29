# YouTube Video Generator - Deployment Guide

## 🚀 Deployment to Contabo Server

### Prerequisites
- Docker installed on your server
- At least 4GB RAM and 2+ CPU cores
- API keys for services (optional - app works with mocks)

---

## 📝 Contabo Deployment Settings

### **Provider**: GitHub
Select your GitHub account and repository

### **Build Type**: Dockerfile
The Dockerfile is already configured at the root of the project

### **Build Path**: `/`
Keep the root path

### **Trigger Type**: On Push
Enable automatic deployments on git push

### **Environment Variables**
Add these in Contabo's environment settings:

```bash
# Required for production
PORT=3001
NODE_ENV=production
FRONTEND_PORT=3000

# API Keys (Optional - app falls back to mock data without them)
OPENROUTER_API_KEY=your_openrouter_key_here
AI33_API_KEY=your_ai33_key_here
GEMINI_API_KEY=your_gemini_key_here

# Model Configuration (Optional)
DEFAULT_IMAGE_MODEL=black-forest-labs/flux-1.1-pro
DEFAULT_LLM_MODEL=anthropic/claude-3.5-sonnet
```

### **Ports to Expose**
- `3000` - Frontend (Next.js)
- `3001` - Backend API (Express)

---

## 🏗️ Local Testing with Docker

### Build and run locally:
```bash
# Using Docker Compose (recommended)
docker-compose up --build

# Or build manually
docker build -t youtube-video-generator .
docker run -p 3000:3000 -p 3001:3001 \
  -e OPENROUTER_API_KEY=your_key \
  -e AI33_API_KEY=your_key \
  youtube-video-generator
```

### Access your app:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

---

## 🔧 Production Configuration

### Resource Requirements
- **Minimum**: 4GB RAM, 2 CPU cores
- **Recommended**: 8GB RAM, 4 CPU cores
- **Storage**: 20GB+ for temporary video files

### Volume Mounts (Important!)
Ensure these directories are persistent:
- `/app/packages/backend/temp` - Temporary video files
- `/app/packages/backend/uploads` - User uploads

### Health Check
The container includes a health check endpoint:
- Endpoint: `http://localhost:3001/health`
- Interval: 30 seconds

---

## 📋 Deployment Checklist

- [x] Dockerfile created
- [x] .dockerignore optimized
- [x] docker-compose.yml for testing
- [ ] Push changes to GitHub
- [ ] Configure environment variables in Contabo
- [ ] Set resource limits (4GB+ RAM)
- [ ] Configure volume persistence
- [ ] Test deployment

---

## 🐛 Troubleshooting

### Build fails
- Ensure all dependencies are in package.json
- Check that Bun is compatible with all packages

### FFmpeg errors
- FFmpeg is pre-installed in the Docker image
- Check temp directory permissions

### Out of memory
- Increase container memory limit to 8GB
- Video generation is memory-intensive

### API keys not working
- App gracefully falls back to mock data
- Verify environment variables are set correctly

---

## 🎯 Next Steps After Deployment

1. **Test the deployment**: Visit your Contabo URL
2. **Monitor logs**: Check for any runtime errors
3. **Configure domain**: Point your domain to the server
4. **Enable HTTPS**: Use Contabo's SSL/TLS settings
5. **Set up backups**: For temp and uploads directories

---

## 📞 Support

If you encounter issues:
1. Check Contabo deployment logs
2. Verify environment variables
3. Ensure sufficient server resources
4. Review Docker container logs

**The app works without API keys** - it will use mock data for testing!
