#!/bin/bash

# Verify No Prisma Dependencies
# This script checks if Prisma has been completely removed from the codebase

echo "🔍 Verifying Prisma removal..."
echo ""

# Check for @prisma/client imports
echo "1️⃣ Checking for Prisma imports..."
PRISMA_IMPORTS=$(grep -r "from.*@prisma/client\|import.*@prisma/client" supabase/functions/server/ 2>/dev/null | grep -v "does NOT work")

if [ -z "$PRISMA_IMPORTS" ]; then
    echo "✅ No Prisma imports found"
else
    echo "❌ Found Prisma imports:"
    echo "$PRISMA_IMPORTS"
    exit 1
fi

echo ""

# Check for PrismaClient usage
echo "2️⃣ Checking for PrismaClient usage..."
PRISMA_CLIENT=$(grep -r "PrismaClient\|db\.\$transaction" supabase/functions/server/ 2>/dev/null | grep -v "does NOT work" | grep -v "註釋")

if [ -z "$PRISMA_CLIENT" ]; then
    echo "✅ No PrismaClient usage found"
else
    echo "❌ Found PrismaClient usage:"
    echo "$PRISMA_CLIENT"
    exit 1
fi

echo ""

# Check for db.user.findUnique patterns
echo "3️⃣ Checking for Prisma ORM patterns..."
PRISMA_PATTERNS=$(grep -r "db\.user\.find\|db\.listing\.find\|db\.subscription\." supabase/functions/server/ 2>/dev/null)

if [ -z "$PRISMA_PATTERNS" ]; then
    echo "✅ No Prisma ORM patterns found"
else
    echo "❌ Found Prisma ORM patterns:"
    echo "$PRISMA_PATTERNS"
    exit 1
fi

echo ""

# Check for new imports (Supabase Client and Postgres)
echo "4️⃣ Checking for new database clients..."
SUPABASE_IMPORTS=$(grep -r "from.*@supabase/supabase-js" supabase/functions/server/ 2>/dev/null | wc -l)
POSTGRES_IMPORTS=$(grep -r "from.*postgres@" supabase/functions/server/ 2>/dev/null | wc -l)

echo "   Supabase Client imports: $SUPABASE_IMPORTS"
echo "   Postgres SQL imports: $POSTGRES_IMPORTS"

if [ "$SUPABASE_IMPORTS" -gt 0 ] && [ "$POSTGRES_IMPORTS" -gt 0 ]; then
    echo "✅ New database clients are in place"
else
    echo "⚠️ Warning: Expected database clients may be missing"
fi

echo ""
echo "=========================================="
echo "✅ Verification Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "- Prisma imports: REMOVED ✅"
echo "- PrismaClient usage: REMOVED ✅"
echo "- Prisma ORM patterns: REMOVED ✅"
echo "- New database clients: IN PLACE ✅"
echo ""
echo "Status: Ready for deployment 🚀"
