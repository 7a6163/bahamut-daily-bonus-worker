import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { BahamutService } from './services/bahamut';
import { NotificationService } from './services/notification';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors());

app.get('/', (c) => {
  return c.json({
    name: '巴哈姆特自動簽到 Worker',
    version: '1.0.0',
    endpoints: {
      '/trigger': '手動觸發簽到',
      '/status': '查看簽到狀態',
      '/health': '健康檢查'
    }
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/status', async (c) => {
  const kv = c.env.BAHAMUT_KV;
  const today = new Date().toISOString().split('T')[0];
  
  const status = await kv.get(`status:${today}`, { type: 'json' });
  
  if (!status) {
    return c.json({ message: '今日尚未簽到', date: today });
  }
  
  return c.json(status);
});

app.post('/trigger', async (c) => {
  const { BAHAMUT_UID, BAHAMUT_PWD, BAHAMUT_TOTP, BAHAMUT_KV, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = c.env;
  
  if (!BAHAMUT_UID || !BAHAMUT_PWD) {
    return c.json({ error: '缺少必要的帳號密碼設定' }, 400);
  }
  
  const config = {
    uid: BAHAMUT_UID,
    pwd: BAHAMUT_PWD,
    totp: BAHAMUT_TOTP || '',
    needSignAds: false,
    needSignGuild: true,
    needAnswer: true
  };
  
  const bahamut = new BahamutService(config);
  const notification = new NotificationService(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID);
  
  const results: string[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const existingStatus = await BAHAMUT_KV.get(`status:${today}`, { type: 'json' });
    if (existingStatus) {
      return c.json({ message: '今日已完成簽到', status: existingStatus });
    }
    
    await bahamut.login();
    results.push('✅ 登入成功');
    
    if (config.needSignGuild) {
      const guildResult = await bahamut.signGuild();
      results.push(guildResult);
    }
    
    const mainResult = await bahamut.signMain();
    results.push(mainResult);
    
    if (config.needAnswer) {
      const answerResult = await bahamut.answerAnime();
      results.push(answerResult);
    }
    
    const statusData = {
      date: today,
      success: true,
      results,
      timestamp: new Date().toISOString()
    };
    
    await BAHAMUT_KV.put(`status:${today}`, JSON.stringify(statusData), {
      expirationTtl: 86400 * 7
    });
    
    await notification.send('巴哈姆特簽到完成', results.join('\\n'));
    
    return c.json(statusData);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';
    results.push(`❌ 錯誤: ${errorMessage}`);
    
    const statusData = {
      date: today,
      success: false,
      results,
      error: errorMessage,
      timestamp: new Date().toISOString()
    };
    
    await BAHAMUT_KV.put(`status:${today}`, JSON.stringify(statusData), {
      expirationTtl: 86400 * 7
    });
    
    await notification.send('巴哈姆特簽到失敗', results.join('\\n'));
    
    return c.json(statusData, 500);
  }
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const url = new URL('/trigger', 'https://bahamut-daily-bonus.workers.dev');
    const request = new Request(url, { method: 'POST' });
    
    ctx.waitUntil(
      fetch(request).then(response => response.json())
    );
  }
};