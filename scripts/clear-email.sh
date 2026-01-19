#!/bin/bash

# Clear all monitors for a specific email address

if [ -z "$1" ]; then
  echo "Usage: ./scripts/clear-email.sh <email>"
  echo "Example: ./scripts/clear-email.sh user@example.com"
  exit 1
fi

EMAIL="$1"

echo "Clearing monitors for: $EMAIL"

# Pull env vars if not present
if [ ! -f .env.local ]; then
  vercel env pull .env.local
fi

node -e "
const Redis = require('ioredis');
require('dotenv').config({ path: '.env.local' });

const redis = new Redis(process.env.REDIS_URL);

async function clearEmail(email) {
  const emailKey = 'email:' + email.toLowerCase();
  const monitors = await redis.smembers(emailKey);
  
  if (monitors.length === 0) {
    console.log('No monitors found for:', email);
    redis.disconnect();
    return;
  }
  
  console.log('Found', monitors.length, 'monitor(s):', monitors);
  
  for (const id of monitors) {
    await redis.del('monitor:' + id);
    await redis.srem('monitors:active', id);
    console.log('✓ Deleted monitor:', id);
  }
  await redis.del(emailKey);
  console.log('✓ Cleared email:', email);
  
  redis.disconnect();
}

clearEmail('$EMAIL').catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
"
