# 📋 Setup Checklist

Use this checklist to ensure your Tempwallets development environment is properly configured.

## ✅ Initial Setup

- [ ] Node.js 18+ installed (`node --version`)
- [ ] pnpm installed (`pnpm --version`)
- [ ] PostgreSQL running (local or Docker)
- [ ] Repository cloned
- [ ] Dependencies installed (`pnpm install`)

## ✅ Backend Configuration

- [ ] `.env` file created in `apps/backend/`
- [ ] `DATABASE_URL` set in `.env`
- [ ] `JWT_SECRET` set in `.env`
- [ ] `PORT` set in `.env` (default: 5005)
- [ ] RPC URLs configured (ETH, BASE, ARB, AVA)
- [ ] Prisma migrations run (`npx prisma migrate dev`)
- [ ] Backend starts without errors (`pnpm dev --filter=backend`)

## ✅ Web Configuration

- [ ] `.env.local` file created in `apps/web/`
- [ ] `NEXT_PUBLIC_API_URL` set (default: http://localhost:5005)
- [ ] `NEXT_PUBLIC_DEFAULT_CHAIN` set
- [ ] Web app starts without errors (`pnpm dev --filter=web`)

## ✅ Database Setup

- [ ] PostgreSQL database created
- [ ] Connection successful (check backend logs)
- [ ] Prisma Client generated (`npx prisma generate`)
- [ ] Database schema migrated
- [ ] Can access Prisma Studio (`npx prisma studio`)

## ✅ Development Environment

- [ ] Both apps start with `pnpm run dev`
- [ ] Web app accessible at http://localhost:3000
- [ ] Backend API accessible at http://localhost:5005
- [ ] No errors in terminal logs
- [ ] Hot reload working on code changes

## ✅ Build & Production

- [ ] All packages build successfully (`pnpm run build`)
- [ ] No TypeScript errors
- [ ] No linting errors (`pnpm run lint`)
- [ ] Tests pass (`pnpm run test`)

## ✅ Railway Deployment (Optional)

- [ ] Railway account created
- [ ] PostgreSQL database provisioned
- [ ] Backend service deployed
- [ ] Web service deployed
- [ ] Environment variables set in Railway
- [ ] Database migrations run on Railway
- [ ] Both services accessible online

## 🐛 Troubleshooting

If any checkbox fails, refer to:
- [QUICK_START.md](./QUICK_START.md) - Quick setup guide
- [ENV_SETUP.md](./ENV_SETUP.md) - Detailed environment configuration
- [README.md](./README.md) - Project documentation

## Common Issues

### ❌ "DATABASE_URL not found"
**Solution:** Create `.env` file in `apps/backend/` with DATABASE_URL

### ❌ "Prisma Client not found"
**Solution:** Run `cd apps/backend && npx prisma generate`

### ❌ "Port already in use"
**Solution:** Kill existing process:
```bash
lsof -ti:5005 | xargs kill -9  # Backend
lsof -ti:3000 | xargs kill -9  # Web
```

### ❌ "Connection refused" to database
**Solution:** Ensure PostgreSQL is running:
```bash
docker ps  # Check Docker containers
# or
pg_isready  # Check local PostgreSQL
```

### ❌ Build fails with TypeScript errors
**Solution:** 
```bash
pnpm install  # Reinstall dependencies
cd apps/backend && npx prisma generate  # Regenerate Prisma Client
pnpm run build  # Try build again
```

---

**Once all checkboxes are checked, you're ready to develop! 🎉**
