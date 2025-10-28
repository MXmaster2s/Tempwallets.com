# ⚡ Quick Start Guide

Get Tempwallets up and running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- PostgreSQL running locally (or use Docker)
- pnpm installed (`npm install -g pnpm`)

## 🚀 Quick Setup

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/utk-dwd/Tempwallets.com.git
cd Tempwallets.com

# Install dependencies
pnpm install
```

### 2. Setup PostgreSQL Database

**Option A: Using Docker (Recommended)**
```bash
docker run --name tempwallets-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=tempwallets \
  -p 5432:5432 \
  -d postgres:15
```

**Option B: Using Local PostgreSQL**
```bash
# Create database
createdb tempwallets
```

### 3. Configure Environment Variables

**Backend:**
```bash
cd apps/backend
cp .env.example .env
```

Edit `apps/backend/.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tempwallets?schema=public"
JWT_SECRET="your-dev-secret-change-in-production"
PORT=5005
```

**Web:**
```bash
cd apps/web
cp .env.example .env.local
```

Edit `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5005
NEXT_PUBLIC_DEFAULT_CHAIN=base
```

### 4. Setup Database Schema

```bash
cd apps/backend
npx prisma migrate dev
```

### 5. Start Development Servers

```bash
# From root directory
cd ../..
pnpm run dev
```

This will start:
- 🔹 Backend API on `http://localhost:5005`
- 🔹 Web app on `http://localhost:3000`

## ✅ Verify Setup

1. Open `http://localhost:3000` - Web app should load
2. Check `http://localhost:5005` - Backend should respond
3. Check terminal - No errors in logs

## 🐛 Troubleshooting

### "DATABASE_URL not found"
- Make sure `.env` file exists in `apps/backend/`
- Check the DATABASE_URL format is correct

### "Connection refused" to PostgreSQL
```bash
# Check if PostgreSQL is running
docker ps  # If using Docker
# or
pg_isready  # If using local PostgreSQL
```

### "Port already in use"
```bash
# Kill process on port 5005 (backend)
lsof -ti:5005 | xargs kill -9

# Kill process on port 3000 (web)
lsof -ti:3000 | xargs kill -9
```

### Prisma Client errors
```bash
cd apps/backend
npx prisma generate
npx prisma migrate dev
```

## 📦 Common Commands

```bash
# Development
pnpm run dev          # Start all apps in dev mode
pnpm run build        # Build all apps
pnpm run lint         # Lint all apps

# Backend only
pnpm run dev --filter=backend
pnpm run build --filter=backend

# Web only
pnpm run dev --filter=web
pnpm run build --filter=web

# Database
cd apps/backend
npx prisma studio     # Open Prisma Studio (database GUI)
npx prisma migrate dev    # Run migrations
npx prisma generate   # Generate Prisma Client
```

## 🏗️ Project Structure

```
tempwallets.com/
├── apps/
│   ├── backend/          # NestJS API
│   │   ├── src/
│   │   ├── prisma/
│   │   └── .env          # Backend config (create this)
│   └── web/              # Next.js frontend
│       ├── app/
│       ├── components/
│       └── .env.local    # Web config (create this)
├── packages/
│   ├── wallet-sdk/       # Wallet management SDK
│   ├── types/            # Shared TypeScript types
│   └── ui/               # Shared UI components
└── ENV_SETUP.md          # Detailed env setup guide
```

## 🚂 Deploy to Railway

See [ENV_SETUP.md](./ENV_SETUP.md) for detailed Railway deployment instructions.

**Quick Railway Setup:**

1. Create new Railway project
2. Add PostgreSQL database
3. Deploy backend (set root directory: `apps/backend`)
4. Deploy web (set root directory: `apps/web`)
5. Set environment variables in Railway dashboard
6. Run migrations: `railway run npx prisma migrate deploy`

## 📚 Next Steps

- Read [ENV_SETUP.md](./ENV_SETUP.md) for production deployment
- Check [WALLET_ARCHITECTURE.md](./WALLET_ARCHITECTURE.md) for wallet system details
- Review [ASSET_PROTECTION_GUIDE.md](./ASSET_PROTECTION_GUIDE.md) for security

## 🆘 Need Help?

- Check [ENV_SETUP.md](./ENV_SETUP.md) for detailed configuration
- Review error logs in terminal
- Ensure all environment variables are set correctly

---

**Happy coding! 🎉**
