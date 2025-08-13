import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { BahamutService } from './services/bahamut';
import { NotificationService } from './services/notification';

interface Env {
  BAHAMUT_UID: string;
  BAHAMUT_PWD: string;
  BAHAMUT_TOTP?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors());

app.get('/', (c) => {
  return c.json({
    name: '巴哈姆特自動簽到 Worker',
    version: '1.0.0',
    endpoints: {
      '/trigger': '手動觸發簽到',
      '/health': '健康檢查'
    }
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/trigger', async (c) => {
  const { BAHAMUT_UID, BAHAMUT_PWD, BAHAMUT_TOTP, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = c.env;
  
  if (!BAHAMUT_UID || !BAHAMUT_PWD) {
    return c.json({ error: '缺少必要的帳號密碼設定' }, 400);
  }
  
  const config = {
    uid: BAHAMUT_UID,
    pwd: BAHAMUT_PWD,
    totp: BAHAMUT_TOTP || '',
    needSignAds: false,
    needSignGuild: true,
    needAnswer: true,
    useSmartDelay: true
  };
  
  const bahamut = new BahamutService(config);
  const notification = new NotificationService(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
  const results: string[] = [];
  
  try {
    // 登入
    await bahamut.login();
    results.push('✅ 登入成功');
    
    // 公會簽到 - API 會自動回應是否已簽到
    if (config.needSignGuild) {
      const guildResult = await bahamut.signGuild();
      results.push(guildResult);
    }
    
    // 主站簽到 - API 會自動回應是否已簽到
    const mainResult = await bahamut.signMain();
    results.push(mainResult);
    
    // 動畫瘋答題 - API 會自動回應是否已答題
    if (config.needAnswer) {
      const answerResult = await bahamut.answerAnime();
      results.push(answerResult);
    }
    
    // 發送 Telegram 通知
    await notification.send('巴哈姆特簽到完成', results.join('\n'));
    
    return c.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';
    results.push(`❌ 錯誤: ${errorMessage}`);
    
    // 發送錯誤通知到 Telegram
    await notification.send('巴哈姆特簽到失敗', results.join('\n'));
    
    return c.json({
      success: false,
      results,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 定時觸發時直接執行簽到
    const url = new URL('/trigger', 'https://bahamut-daily-bonus.workers.dev');
    const request = new Request(url, { method: 'POST' });
    
    await app.fetch(request, env, ctx);
  }
};