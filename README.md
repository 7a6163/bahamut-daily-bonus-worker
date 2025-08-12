# 巴哈姆特自動簽到 Cloudflare Worker

使用 Cloudflare Worker + Hono + TypeScript 實現的巴哈姆特自動簽到服務。

## 功能特點

- 🔐 巴哈姆特主站自動簽到
- 🏛️ 公會自動簽到
- 🎬 動畫瘋自動答題
- 📱 支援二步驗證 (2FA)
- 🤖 Telegram Bot 通知
- ⏰ 定時自動執行（每日 UTC 00:00，台灣時間 08:00）
- 📊 簽到狀態查詢

## 安裝步驟

### 1. 安裝依賴

```bash
cd worker/bahamut-daily-bonus
npm install
```

### 2. 設定 KV Namespace

```bash
# 創建 KV namespace
wrangler kv:namespace create "BAHAMUT_KV"
wrangler kv:namespace create "BAHAMUT_KV" --preview

# 將返回的 ID 填入 wrangler.toml
```

### 3. 設定環境變數

```bash
# 必填：巴哈姆特帳號
wrangler secret put BAHAMUT_UID

# 必填：巴哈姆特密碼
wrangler secret put BAHAMUT_PWD

# 選填：二步驗證 Token（16位數）
wrangler secret put BAHAMUT_TOTP

# 選填：Telegram Bot Token
wrangler secret put TELEGRAM_BOT_TOKEN

# 選填：Telegram Chat ID
wrangler secret put TELEGRAM_CHAT_ID
```

### 4. 部署

```bash
npm run deploy
```

## API 端點

### GET /
返回服務資訊和可用端點

### GET /health
健康檢查

### GET /status
查看今日簽到狀態

### POST /trigger
手動觸發簽到

## Telegram Bot 設定

1. 向 [@BotFather](https://t.me/botfather) 申請 Bot Token
2. 獲取你的 Chat ID（可以向 [@userinfobot](https://t.me/userinfobot) 發送訊息獲取）
3. 使用 `wrangler secret` 設定環境變數

## 開發

```bash
# 本地開發
npm run dev

# 查看日誌
npm run tail
```

## 注意事項

- 請確保帳號密碼正確
- 如有開啟二步驗證，需提供 16 位 Token
- 動畫瘋答題使用 Google 搜尋輔助，不保證 100% 正確
- 建議設定 Telegram 通知以便及時了解簽到狀態

## License

MIT