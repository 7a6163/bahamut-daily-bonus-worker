# Changelog

## [Unreleased]

### Fixed
- **Ad double reward** failed with `網頁已過期` since the switch to the mobile sign-in API, which issues no CSRF token. `signAds()` now falls back to a random 16-hex `bahamutCsrfToken`, sent as both cookie and query param (the endpoints only check that the two match).

### Removed
- **Ani Gamer quiz** (`answerAnime`, `needAnswer`): `ani.gamer.com.tw` returns 403 to every datacenter IP tried (Cloudflare Workers, GitHub Actions runners, even a headed browser), so it can't run from this Worker.
- **Guild sign-in stub** (`signGuild`, `needSignGuild`): guild sign-in now runs from GitHub Actions in [bahamut-daily-bonus-action](https://github.com/7a6163/bahamut-daily-bonus-action).

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
