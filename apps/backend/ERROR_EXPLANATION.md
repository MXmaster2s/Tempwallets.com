# Error Explanation: Cannot find module 'dist/main'

## The Error

```
Error: Cannot find module '/Users/monstu/Developer/Tempwallets.com/apps/backend/dist/main'
```

## What This Means

Node.js is trying to load `dist/main` (without `.js` extension), but the actual file is `dist/main.js`.

## Why This Happens

Your project uses **ES modules** (`"type": "module"` in `package.json`), which means:

1. **ES modules require explicit file extensions** in imports
2. **NestJS CLI** might be trying to run the file without the extension
3. The build output exists (`dist/main.js`), but something is looking for `dist/main`

## The Fix

### Option 1: Use the Correct Command (Recommended)

Instead of `nest start`, use:

```bash
# Development (with watch mode)
pnpm dev

# Or directly run the built file
node dist/main.js
```

### Option 2: Check NestJS CLI Configuration

The `nest start` command should automatically handle this, but if it doesn't:

1. **Rebuild the project:**
```bash
pnpm build
```

2. **Check if there's a startup script issue:**
```bash
# Check what 'nest start' actually does
nest start --help
```

### Option 3: Verify Build Output

Make sure the build completed successfully:

```bash
# Check if main.js exists
ls -la dist/main.js

# If it doesn't exist, rebuild
pnpm build
```

## Why It Works When You Run Directly

When you run `node dist/main.js` directly, it works because:
- You're explicitly providing the `.js` extension
- Node.js can find the file with the extension

## Common Causes

1. **Build didn't complete** - Run `pnpm build` first
2. **NestJS CLI version issue** - Try updating: `pnpm add -D @nestjs/cli@latest`
3. **Cache issue** - Try: `rm -rf dist && pnpm build`
4. **ES module configuration** - The `"type": "module"` requires explicit extensions

## Quick Fix

```bash
cd apps/backend

# Clean and rebuild
rm -rf dist
pnpm build

# Run directly (bypasses NestJS CLI)
node dist/main.js
```

Or use the dev script which should handle this:

```bash
pnpm dev
```

