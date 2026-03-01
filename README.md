# Bahamut Daily Bonus Cloudflare Worker

An automated daily check-in service for Bahamut built with Cloudflare Worker + Hono + TypeScript.

## Features

- 🔐 Automatic daily check-in for Bahamut main site
- 🏛️ Automatic guild check-in
- 📺 Ad double reward (廣告雙倍獎勵)
- 📱 Two-factor authentication (2FA) support
- 🤖 Telegram Bot notifications
- ⏰ Scheduled execution (Daily at UTC 00:00 / Taiwan Time 08:00) with retry at 10:00 and 12:00
- 🔄 KV-based deduplication to skip retries if already signed in

> **Note:** Ani Gamer quiz (`needAnswer`) is disabled. `ani.gamer.com.tw` is protected by Cloudflare
> and returns 403 for requests originating from Cloudflare Worker IP ranges. Use a local script
> (Surge, Node.js, NAS) for quiz answering instead.

## Installation

### 1. Install Dependencies

```bash
cd worker/bahamut-daily-bonus
npm install
```

### 2. Configure Environment Variables

```bash
# Required: Bahamut username
wrangler secret put BAHAMUT_UID

# Required: Bahamut password
wrangler secret put BAHAMUT_PWD

# Optional: 2FA Token (16 digits)
wrangler secret put BAHAMUT_TOTP

# Optional: Telegram Bot Token
wrangler secret put TELEGRAM_BOT_TOKEN

# Optional: Telegram Chat ID
wrangler secret put TELEGRAM_CHAT_ID
```

### 3. Deploy

```bash
npm run deploy
```

## API Endpoints

### GET /
Returns service information and available endpoints

### GET /health
Health check endpoint

### POST /trigger
Manually trigger the sign-in process

## Telegram Bot Setup

1. Get a Bot Token from [@BotFather](https://t.me/botfather)
2. Get your Chat ID (send a message to [@userinfobot](https://t.me/userinfobot))
3. Configure environment variables using `wrangler secret`

## Development

```bash
# Local development
npm run dev

# View logs
npm run tail

# Test manually
curl -X POST http://localhost:8787/trigger
```

## Technical Details

### Authentication
- Uses Mobile API for login with automatic web session establishment
- Supports both mobile and web authentication tokens
- Automatically handles cross-domain cookie sharing for Ani Gamer

### Performance Optimization
This Worker uses several strategies to minimize CPU time while maintaining natural behavior:

1. **Smart Delays**: Implements short, randomized delays (500-2000ms) to simulate human behavior without excessive CPU usage
2. **Simplified Architecture**: No KV storage needed - relies on Bahamut API responses
3. **Automatic Deduplication**: Bahamut API handles duplicate sign-in attempts gracefully
4. **Session Management**: Automatically establishes web sessions when needed for cross-service compatibility

## Notes

- Ensure your account credentials are correct
- If 2FA is enabled, provide the 16-digit TOTP secret
- Recommended to set up Telegram notifications for real-time status updates
- Ad reward adds ~30 seconds wall-clock time (idle wait, not CPU time)
- KV namespace must be created before deploying: `npx wrangler kv namespace create "DAILY_STATUS"`

## License

MIT
