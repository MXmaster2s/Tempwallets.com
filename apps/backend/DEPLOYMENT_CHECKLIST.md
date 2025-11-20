# Production Deployment Checklist

## Pre-Deployment Cleanup ✅

- [x] Removed .DS_Store files
- [x] Moved development documentation to `docs/archive/`
- [x] Changed verbose `logger.log()` calls to `logger.debug()` for production
- [x] Updated `.gitignore` to exclude build artifacts
- [x] Fixed TypeScript compilation errors
- [x] Verified production build works

## Environment Variables Required

Make sure these are set in production:

```bash
# Database
DATABASE_URL=postgresql://...

# Encryption
WALLET_ENC_KEY=<32-byte base64 encoded key>

# API Keys
ZERION_API_KEY=...
PIMLICO_API_KEY=...

# Server
PORT=5005
NODE_ENV=production
FRONTEND_URL=https://www.tempwallets.com

# CORS (if needed)
ALLOWED_ORIGINS=https://www.tempwallets.com,https://tempwallets.com
```

## Build & Deploy Commands

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Run database migrations
pnpm prisma migrate deploy

# Build for production
pnpm build

# Start production server
pnpm start:prod
```

## Health Check

After deployment, verify:
- Health endpoint: `GET /health`
- API endpoints are accessible
- Database connections work
- External API integrations (Zerion, Pimlico) are configured

## Monitoring

- Check application logs for errors
- Monitor database connection pool
- Verify cache is working (addresses and balances)
- Check API response times

## Rollback Plan

If issues occur:
1. Revert to previous deployment
2. Check database migrations status
3. Verify environment variables
4. Check application logs

