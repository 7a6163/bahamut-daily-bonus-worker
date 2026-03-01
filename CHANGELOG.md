# Changelog

## [1.1.0] - 2026-03-01

### Added
- **Ad double reward** (`signAds`): calls `sign_in_ad_start.php`, waits 30s, then claims via `sign_in_ad_finished.php`
- **Retry mechanism**: two additional cron triggers at Taiwan 10:00 and 12:00 (UTC 02:00, 04:00)
- **KV deduplication**: `DAILY_STATUS` KV namespace records a `signed_YYYY-MM-DD` key (25h TTL) after successful main sign-in; retry crons skip silently if key exists

### Changed
- Refactored sign-in logic into `runSignIn()` in `index.ts`; scheduled handler and `/trigger` endpoint both call it
- `signMain()` now stores the CSRF token internally for use by `signAds()`
- `answerAnime()` switched to reference-script APIs: article list via `mobile_app/bahamut/v1/home.php`, article detail via `home_creation_detail.php` (JSON), regex updated to `/A[:;：](\d)/`
- Fixed already-signed-in detection: `includes('已經簽到')` added alongside `includes('已簽到')`
- Fixed ad already-claimed case: returns `⚠️ 廣告雙倍獎勵今日已領取` instead of `❌`

### Disabled
- **Ani Gamer quiz** (`needAnswer: false`): `ani.gamer.com.tw` is Cloudflare-protected and returns 403 for requests from Cloudflare Worker IP ranges; use a local script (Surge, Node.js, NAS) for quiz answering

## [1.0.0] - Initial release

- Bahamut main site daily sign-in
- Guild sign-in
- Ani Gamer quiz answering
- 2FA (TOTP) support
- Telegram Bot notifications
- Cron trigger at Taiwan 08:00 (UTC 00:00)
