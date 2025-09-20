# Railway Deployment Guide

## Prerequisites
1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Repository**: Push your code to a GitHub repository
3. **Model File**: Ensure `best_mask_model.h5` is in your repository root

## Deployment Steps

### 1. Prepare Your Repository
```bash
# Add all files to git
git add .
git commit -m "Initial commit for Railway deployment"
git push origin main
```

### 2. Deploy to Railway

#### Option A: Railway CLI (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init

# Deploy
railway up
```

#### Option B: Railway Dashboard
1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository
5. Railway will automatically detect and deploy your Flask app

### 3. Environment Configuration
No additional environment variables are required. The app will automatically:
- Use the PORT environment variable provided by Railway
- Detect production vs development mode
- Handle model loading gracefully

### 4. Domain Setup
After deployment:
1. Railway will provide a `.railway.app` domain
2. You can add a custom domain in the Railway dashboard
3. SSL certificates are automatically provided

## Files Created for Deployment

### `requirements.txt`
- Specifies exact package versions for reproducible builds
- Uses `opencv-python-headless` for serverless compatibility
- Includes `gunicorn` for production server

### `Procfile`
- Defines the web process command
- Configures gunicorn with optimal settings for Railway
- Sets appropriate timeout and worker configuration

### `runtime.txt`
- Specifies Python 3.11.5 for compatibility
- Ensures consistent runtime environment

### `railway.json`
- Railway-specific configuration
- Sets build and deployment parameters
- Configures health checks and restart policies

### `.gitignore`
- Excludes unnecessary files from deployment
- Keeps repository clean and deployment fast

## Important Notes

### Model File
- Ensure `best_mask_model.h5` is committed to your repository
- File size should be under Railway's limits (500MB per service)
- The app gracefully handles missing model files with demo mode

### Memory Requirements
- Railway provides 512MB RAM by default
- TensorFlow model requires ~300-400MB
- Monitor memory usage in Railway dashboard

### Performance Optimization
- App uses single worker process for memory efficiency
- OpenCV headless version reduces memory footprint
- Gunicorn timeout set to 120 seconds for model loading

## Troubleshooting

### Common Issues

1. **Model Loading Timeout**
   - Increase timeout in `Procfile` if needed
   - Monitor deployment logs for loading time

2. **Memory Issues**
   - Upgrade Railway plan if memory errors occur
   - Model loading requires significant initial memory

3. **Build Failures**
   - Check `requirements.txt` for version conflicts
   - Ensure all dependencies are compatible

### Debugging
```bash
# View deployment logs
railway logs

# Check service status
railway status

# Access Railway shell
railway shell
```

## Production Checklist

- [ ] Model file (`best_mask_model.h5`) committed to repository
- [ ] All dependencies listed in `requirements.txt`
- [ ] Repository pushed to GitHub
- [ ] Railway project created and deployed
- [ ] Health checks passing
- [ ] Application accessible via Railway domain
- [ ] Camera and upload functionality tested
- [ ] Performance monitored

## Post-Deployment

### Monitoring
- Use Railway dashboard to monitor:
  - CPU and memory usage
  - Request volume and response times
  - Error rates and logs

### Scaling
- Railway automatically handles traffic scaling
- Consider upgrading plan for high-traffic applications
- Monitor resource usage and upgrade as needed

### Updates
```bash
# Deploy updates
git add .
git commit -m "Update description"
git push origin main
# Railway automatically redeploys
```

## Support

For deployment issues:
- Check Railway documentation: [docs.railway.app](https://docs.railway.app)
- Railway Discord community
- GitHub repository issues