#!/bin/bash

# Update the test job posting to trigger a change detection

if [ -z "$1" ]; then
  echo "Usage: ./scripts/update-test-job.sh <change-description>"
  echo ""
  echo "Examples:"
  echo "  ./scripts/update-test-job.sh 'Increased salary to 160k-210k'"
  echo "  ./scripts/update-test-job.sh 'Added new requirement: Docker experience'"
  echo "  ./scripts/update-test-job.sh 'Changed location to Remote Only'"
  echo ""
  echo "This will:"
  echo "  1. Increment the version badge"
  echo "  2. Add your change as a comment"
  echo "  3. Deploy to Vercel"
  exit 1
fi

CHANGE="$1"
FILE="public/test-job.html"

# Get current version
CURRENT_VERSION=$(grep -o 'v[0-9]\+\.[0-9]\+' "$FILE" | head -1)
if [ -z "$CURRENT_VERSION" ]; then
  CURRENT_VERSION="v1.0"
fi

# Increment version
MAJOR=$(echo "$CURRENT_VERSION" | cut -d'v' -f2 | cut -d'.' -f1)
MINOR=$(echo "$CURRENT_VERSION" | cut -d'.' -f2)
MINOR=$((MINOR + 1))
NEW_VERSION="v${MAJOR}.${MINOR}"

echo "Updating test job posting..."
echo "Current version: $CURRENT_VERSION"
echo "New version: $NEW_VERSION"
echo "Change: $CHANGE"
echo ""

# Update version in file
sed -i.bak "s/$CURRENT_VERSION/$NEW_VERSION/g" "$FILE"

# Add change comment after version badge
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
COMMENT="  <!-- CHANGE $NEW_VERSION ($TIMESTAMP): $CHANGE -->"
sed -i.bak "/<div class=\"version\">/a\\
$COMMENT
" "$FILE"

rm "${FILE}.bak"

echo "✓ Updated $FILE"
echo ""
echo "Deploying to Vercel..."
vercel --prod

echo ""
echo "✓ Done! Test job posting updated to $NEW_VERSION"
echo ""
echo "Test URL: https://listing-tracker-three.vercel.app/test-job.html"
echo ""
echo "To test monitoring:"
echo "  1. Add this URL to your monitor: https://listing-tracker-three.vercel.app/test-job.html"
echo "  2. Wait for deployment to complete"
echo "  3. Run: ./scripts/trigger-cron.sh"
echo "  4. Check your email for change notification"
