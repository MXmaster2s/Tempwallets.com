# Environment Variables Setup Guide

This guide explains how to set up environment variables for local development and Railway deployment.

## 🏠 Local Development

### Backend Setup

1. **Create `.env` file** in `apps/backend/`:
   ```bash
   cd apps/backend
   cp .env.example .env
   ```

2. **Update the `.env` file** with your local values:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tempwallets?schema=public"
   JWT_SECRET="your-development-secret"
   PORT=5005
   
   # Wallet Encryption Key (generate with: openssl rand -base64 32)
   WALLET_ENC_KEY="your-base64-encoded-32-byte-key"
   
   # Add your actual RPC and service URLs
   ETH_RPC_URL="https://mainnet.infura.io/v3/YOUR_INFURA_KEY"
   # ... other chain configurations
   ```

3. **Start local PostgreSQL** (if needed):
   ```bash
   # Using Docker
   docker run --name tempwallets-postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=tempwallets \
     -p 5432:5432 \
     -d postgres:15
   ```

4. **Run Prisma migrations**:
   ```bash
   cd apps/backend
   npx prisma migrate dev
   ```

### Web/Frontend Setup

1. **Create `.env.local` file** in `apps/web/`:
   ```bash
   cd apps/web
   cp .env.example .env.local
   ```

2. **Update the `.env.local` file**:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5005
   NEXT_PUBLIC_DEFAULT_CHAIN=base
   ```

### Running the App Locally

```bash
# From root directory
pnpm run dev
```

---

## 🚂 Railway Deployment

Railway automatically provides `DATABASE_URL` when you provision a PostgreSQL database. You only need to set the additional environment variables.

### Step 1: Create Railway Projects

1. **Backend Service**:
   - Create a new project in Railway
   - Add PostgreSQL plugin (this automatically sets `DATABASE_URL`)
   - Deploy from GitHub (select `apps/backend` as root directory)

2. **Web Service**:
   - Create another service in the same project
   - Deploy from GitHub (select `apps/web` as root directory)

### Step 2: Set Backend Environment Variables

In Railway dashboard for the **Backend service**, add these variables:

```env
# JWT Secret (generate a strong one!)
JWT_SECRET=your-production-jwt-secret-min-32-chars

# Server Configuration
PORT=5005

# Wallet Encryption Key (generate with: openssl rand -base64 32)
WALLET_ENC_KEY=your-base64-encoded-32-byte-key

# Ethereum Mainnet Configuration
ETH_BUNDLER_URL=https://bundler.ethereum.org
ETH_PAYMASTER_URL=https://paymaster.ethereum.org
ETH_PAYMASTER_ADDRESS=0x0000000000000000000000000000000000000000
ETH_RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY

# Base Mainnet Configuration
BASE_BUNDLER_URL=https://bundler.base.org
BASE_PAYMASTER_URL=https://paymaster.base.org
BASE_PAYMASTER_ADDRESS=0x0000000000000000000000000000000000000000
BASE_RPC_URL=https://mainnet.base.org

# Arbitrum One Configuration
ARB_BUNDLER_URL=https://bundler.arbitrum.io
ARB_PAYMASTER_URL=https://paymaster.arbitrum.io
ARB_PAYMASTER_ADDRESS=0x0000000000000000000000000000000000000000
ARB_RPC_URL=https://arb1.arbitrum.io/rpc

# Avalanche C-Chain Configuration
AVA_BUNDLER_URL=https://bundler.avalanche.org
AVA_PAYMASTER_URL=https://paymaster.avalanche.org
AVA_PAYMASTER_ADDRESS=0x0000000000000000000000000000000000000000
AVA_RPC_URL=https://api.avax.network/ext/bc/C/rpc
```

**Note**: `DATABASE_URL` is automatically set by Railway's PostgreSQL plugin. Don't override it!

### Step 3: Set Web Environment Variables

In Railway dashboard for the **Web service**, add:

```env
# API URL (use your backend Railway URL)
NEXT_PUBLIC_API_URL=https://your-backend-service.up.railway.app

# Chain Configuration
NEXT_PUBLIC_DEFAULT_CHAIN=base
```

### Step 4: Configure Build Settings

#### Backend Service Settings:
- **Root Directory**: `apps/backend`
- **Build Command**: `pnpm install && pnpm run build`
- **Start Command**: `pnpm run start:prod`

#### Web Service Settings:
- **Root Directory**: `apps/web`
- **Build Command**: `pnpm install && pnpm run build`
- **Start Command**: `pnpm run start`

### Step 5: Run Database Migrations

After the first deployment, run migrations:

1. Go to Railway backend service
2. Open the terminal/shell
3. Run:
   ```bash
   npx prisma migrate deploy
   ```

Or use Railway CLI:
```bash
railway run npx prisma migrate deploy
```

---

## 🔒 Security Best Practices

### For Production (Railway):

1. **Generate Strong Secrets**:
   ```bash
   # Generate a random JWT secret
   openssl rand -base64 32
   ```

2. **Never Commit `.env` Files**:
   - `.env` and `.env.local` are in `.gitignore`
   - Only commit `.env.example` files

3. **Use Railway Secret Variables**:
   - Railway encrypts all environment variables
   - Use Railway's variable references: `${{VARIABLE_NAME}}`

4. **Rotate Secrets Regularly**:
   - Change JWT_SECRET periodically
   - Update API keys when compromised

---

## 📋 Environment Variables Checklist

### Backend (`apps/backend/.env`)
- ✅ `DATABASE_URL` - PostgreSQL connection string
- ✅ `JWT_SECRET` - JWT signing secret
- ✅ `PORT` - Server port (default: 5005)
- ✅ `WALLET_ENC_KEY` - 32-byte base64 key for wallet seed encryption (generate with: `openssl rand -base64 32`)
- ✅ Chain-specific RPC URLs
- ✅ Bundler and Paymaster configurations

### Web (`apps/web/.env.local`)
- ✅ `NEXT_PUBLIC_API_URL` - Backend API URL
- ✅ `NEXT_PUBLIC_DEFAULT_CHAIN` - Default blockchain

---

## 🆘 Troubleshooting

### "Environment variable not found: DATABASE_URL"
- **Local**: Make sure `.env` file exists in `apps/backend/`
- **Railway**: Ensure PostgreSQL plugin is added to your project

### "Failed to connect to database"
- **Local**: Check if PostgreSQL is running on localhost:5432
- **Railway**: Verify `DATABASE_URL` is set correctly by the plugin

### Environment variables not loading
- **NestJS**: Ensure `ConfigModule.forRoot()` is imported in `app.module.ts`
- **Next.js**: Restart the dev server after changing `.env.local`
- **Railway**: Redeploy after adding new environment variables

---

## 📚 Additional Resources

- [Railway Docs - Environment Variables](https://docs.railway.app/develop/variables)
- [NestJS Config Module](https://docs.nestjs.com/techniques/configuration)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)
- [Prisma Connection URLs](https://www.prisma.io/docs/reference/database-reference/connection-urls)
