import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { BahamutService } from './services/bahamut';
import { NotificationService } from './services/notification';
import { Env } from './types';

interface SignInResult {
  success: boolean;
  results: string[];
  mainSignedIn: boolean;
}

function getTaiwanDateKey(): string {
  const now = new Date();
  const taiwan = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `signed_${taiwan.toISOString().split('T')[0]}`;
}

async function runSignIn(env: Env): Promise<SignInResult> {
  const config = {
    uid: env.BAHAMUT_UID,
    pwd: env.BAHAMUT_PWD,
    totp: env.BAHAMUT_TOTP || '',
    needSignAds: true,
    needSignGuild: true,
    needAnswer: false,
    useSmartDelay: true
  };

  const bahamut = new BahamutService(config);
  const results: string[] = [];
  let mainSignedIn = false;

  try {
    await bahamut.login();
    results.push('✅ 登入成功');

    if (config.needSignGuild) {
      const guildResult = await bahamut.signGuild();
      results.push(guildResult);
    }

    const mainResult = await bahamut.signMain();
    results.push(mainResult);

    mainSignedIn = mainResult.startsWith('✅') || mainResult.startsWith('⚠️ 巴哈姆特今日已簽到');

    if (config.needSignAds) {
      const adsResult = await bahamut.signAds();
      results.push(adsResult);
    }

    if (config.needAnswer) {
      const answerResult = await bahamut.answerAnime();
      results.push(answerResult);
    }

    return { success: true, results, mainSignedIn };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知錯誤';
    results.push(`❌ 錯誤: ${errorMessage}`);
    return { success: false, results, mainSignedIn };
  }
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
  const env = c.env;

  if (!env.BAHAMUT_UID || !env.BAHAMUT_PWD) {
    return c.json({ error: '缺少必要的帳號密碼設定' }, 400);
  }

  const notification = new NotificationService(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
  const result = await runSignIn(env);

  await notification.send(
    result.success ? '巴哈姆特簽到完成' : '巴哈姆特簽到失敗',
    result.results.join('\n')
  );

  if (result.success) {
    return c.json({
      success: true,
      results: result.results,
      timestamp: new Date().toISOString()
    });
  }

  return c.json({
    success: false,
    results: result.results,
    error: result.results[result.results.length - 1],
    timestamp: new Date().toISOString()
  }, 500);
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const key = getTaiwanDateKey();

    const existing = await env.DAILY_STATUS.get(key);
    if (existing === 'success') {
      console.log('Already signed in today, skipping retry');
      return;
    }

    const notification = new NotificationService(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
    const result = await runSignIn(env);

    await notification.send(
      result.success ? '巴哈姆特簽到完成' : '巴哈姆特簽到失敗',
      result.results.join('\n')
    );

    if (result.mainSignedIn) {
      await env.DAILY_STATUS.put(key, 'success', { expirationTtl: 90000 }); // 25h TTL
    }
  }
};
