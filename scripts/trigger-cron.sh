#!/bin/bash

# Manually trigger the cron job to check all monitors

echo "Triggering cron job to check all monitors..."

# Pull env vars if not present
if [ ! -f .env.local ]; then
  vercel env pull .env.local
fi

# Load CRON_SECRET from .env.local
CRON_SECRET=$(grep CRON_SECRET .env.local | cut -d '=' -f2 | tr -d '"')

if [ -z "$CRON_SECRET" ]; then
  echo "Error: CRON_SECRET not found in .env.local"
  exit 1
fi

# Determine URL
if [ -n "$1" ]; then
  URL="$1"
else
  URL="https://listing-tracker-three.vercel.app"
fi

echo "Calling: $URL/api/cron/check"

curl -X GET "$URL/api/cron/check" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "user-agent: vercel-cron/1.0" \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s

echo ""
echo "Done!"
