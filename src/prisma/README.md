# Prisma Setup Guide

## Prerequisites

Before running migrations, ensure you have:

1. **Supabase PostgreSQL Database** set up
2. **DATABASE_URL** environment variable configured
3. **Prisma CLI** installed (if running locally)

## Environment Setup

Add the following to your Supabase project environment variables:

```bash
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
```

## Migration Commands

### 1. Initialize Prisma (First Time Only)

```bash
# Initialize Prisma in your project
npx prisma init
```

### 2. Create Initial Migration

```bash
# Generate migration from schema.prisma
npx prisma migrate dev --name init

# This will:
# - Create migration files in /prisma/migrations/
# - Apply migration to database
# - Generate Prisma Client
```

### 3. Apply Migrations (Production)

```bash
# Apply pending migrations
npx prisma migrate deploy
```

### 4. Generate Prisma Client

```bash
# Regenerate Prisma Client after schema changes
npx prisma generate
```

### 5. Reset Database (Development Only)

```bash
# ⚠️ Warning: This will delete all data!
npx prisma migrate reset
```

## Verify Database Connection

Test your database connection:

```bash
# Run Prisma Studio to browse your data
npx prisma studio
```

Or use the health check endpoint:

```bash
curl https://[PROJECT-ID].supabase.co/functions/v1/make-server-5c6718b9/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected"
}
```

## Migration Workflow

### Development

1. Make changes to `schema.prisma`
2. Run `npx prisma migrate dev --name [migration-name]`
3. Test the changes
4. Commit migration files

### Production Deployment

1. Run `npx prisma migrate deploy` in production
2. Restart your Edge Functions

## Common Issues

### Issue: "Environment variable not found: DATABASE_URL"

**Solution:** Add DATABASE_URL to Supabase secrets:

```bash
# Using Supabase CLI
supabase secrets set DATABASE_URL="postgresql://..."
```

### Issue: "Can't reach database server"

**Solution:** Check your connection string and database status in Supabase dashboard.

### Issue: "Prisma Client not generated"

**Solution:** Run `npx prisma generate` manually.

## Schema Design

This project uses 9 tables:

1. **users** - User profiles (SSOT for real names)
2. **subscriptions** - Annual subscription management
3. **referral_codes** - Unique referral codes (format: abc123456)
4. **referral_relationships** - 3-generation referral tree
5. **reward_schedules** - Monthly reward distribution schedule
6. **reward_history** - Complete reward audit trail
7. **withdrawals** - Point withdrawal requests
8. **task_progress** - Task achievement tracking
9. **listings** - Service provider listings

## Next Steps

After successful migration:

1. ✅ Verify all tables created: `npx prisma studio`
2. ✅ Test database connection via health endpoint
3. ✅ Proceed to Phase 2: Implement registration API

---

**Reference:**
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Supabase Database](https://supabase.com/docs/guides/database)
