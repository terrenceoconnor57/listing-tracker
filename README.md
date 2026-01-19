# Job Posting Alert

Get emailed the moment a job listing changes. Simple, one-time $5 payment.

## Features

- **Monitors job postings** every 5 minutes via Vercel Cron
- **Instant email alerts** when content changes (via Resend)
- **One-time $5 payment** via Stripe Checkout
- **No frameworks** — just static HTML/CSS/JS + Vercel Functions

## Tech Stack

- **Hosting**: Vercel
- **Backend**: Vercel Functions (Web API style)
- **Storage**: Vercel KV
- **Payments**: Stripe Checkout
- **Email**: Resend
- **Scheduler**: Vercel Cron

## Project Structure

```
/public
  index.html      # Landing page with two-step form
  styles.css      # Styling
  app.js          # Frontend logic
  success.html    # Post-payment success page
  cancel.html     # Payment canceled page

/api
  create-checkout-session.js   # Creates Stripe session
  stripe-webhook.js            # Handles Stripe webhooks
  /cron
    check.js                   # Cron job to check URLs
  /_lib
    hash.js                    # HTML cleaning + hashing
    email.js                   # Resend email helper
```

## Setup

### 1. Clone and Install

```bash
git clone <repo-url>
cd listing-tracker
npm install
```

### 2. Create Stripe Product & Price

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Create a new Product (e.g., "Job Posting Alert")
3. Add a one-time price of $5.00
4. Copy the **Price ID** (starts with `price_`)

### 3. Set Up Vercel KV

1. Go to your Vercel project dashboard
2. Navigate to **Storage** → **Create Database** → **KV**
3. Connect it to your project
4. The KV environment variables are automatically added

### 4. Set Up Resend

1. Sign up at [resend.com](https://resend.com)
2. Verify a domain or use the sandbox domain for testing
3. Create an API key
4. Note your verified sender email (e.g., `alerts@yourdomain.com`)

### 5. Configure Stripe Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint:
   - URL: `https://your-vercel-url.vercel.app/api/stripe-webhook`
   - Events: `checkout.session.completed`
3. Copy the **Webhook Signing Secret** (starts with `whsec_`)

### 6. Add Environment Variables

In Vercel project settings → Environment Variables, add:

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_PRICE_ID` | Price ID from step 2 (`price_...`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_...`) |
| `RESEND_API_KEY` | Resend API key (`re_...`) |
| `FROM_EMAIL` | Verified sender email (e.g., `alerts@yourdomain.com`) |
| `CRON_SECRET` | Random secret string for cron auth (generate one) |

### 7. Deploy

```bash
vercel --prod
```

Or connect to GitHub and deploy automatically.

## Local Development

### 1. Install Vercel CLI

```bash
npm i -g vercel
```

### 2. Link Project

```bash
vercel link
```

### 3. Pull Environment Variables

```bash
vercel env pull .env.local
```

### 4. Run Dev Server

```bash
npm run dev
```

This starts the app at `http://localhost:3000`

### 5. Test Stripe Webhooks Locally

Install Stripe CLI:

```bash
# macOS
brew install stripe/stripe-cli/stripe

# or download from https://stripe.com/docs/stripe-cli
```

Forward webhooks to your local server:

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

Copy the webhook signing secret it outputs and add to `.env.local`:

```
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 6. Test Payment

1. Open `http://localhost:3000`
2. Enter a URL and email
3. Click Continue, then Pay
4. Use test card: `4242 4242 4242 4242` (any future date, any CVC)

### 7. Test Cron Manually

```bash
curl -H "x-cron-secret: YOUR_CRON_SECRET" http://localhost:3000/api/cron/check
```

## Data Model

Stored in Vercel KV:

- **Set**: `monitors:active` — Set of active monitor IDs
- **Key**: `monitor:<id>` — JSON object:

```json
{
  "id": "uuid",
  "url": "https://example.com/job",
  "email": "user@example.com",
  "lastHash": "sha256-hash",
  "lastNotifiedAt": 1234567890,
  "createdAt": 1234567890,
  "active": true
}
```

## How It Works

1. User enters job URL + email on landing page
2. User pays $5 via Stripe Checkout
3. Stripe webhook creates a monitor in Vercel KV
4. Cron job runs every 5 minutes
5. For each monitor, fetches the URL and hashes cleaned content
6. If hash differs from last check, sends email via Resend

## License

MIT
