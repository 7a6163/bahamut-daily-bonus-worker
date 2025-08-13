import { TOTP } from 'otpauth';
import type { BahamutConfig, LoginResponse, SignResponse } from '../types';

export class BahamutService {
  private config: BahamutConfig;
  private cookies: Map<string, string> = new Map();
  private headers: HeadersInit;

  constructor(config: BahamutConfig) {
    this.config = config;
    this.headers = {
      'User-Agent': 'Bahamut/5.0 CFNetwork/1399 Darwin/22.1.0',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-TW,zh;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded'
    };
  }

  private async smartDelay(baseMs: number = 500): Promise<void> {
    if (!this.config.useSmartDelay) return;
    
    // 使用更短的延遲時間，減少 CPU 消耗
    // 基礎延遲 + 小範圍隨機（0-500ms）
    const randomOffset = Math.floor(Math.random() * 500);
    const delay = baseMs + randomOffset;
    
    // 最大延遲不超過 2 秒
    const finalDelay = Math.min(delay, 2000);
    await new Promise(resolve => setTimeout(resolve, finalDelay));
  }

  private generateTOTP(secret: string): string {
    const totp = new TOTP({
      secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30
    });
    return totp.generate();
  }

  private parseCookies(setCookieHeaders: string[]): void {
    for (const cookie of setCookieHeaders) {
      const [nameValue] = cookie.split(';');
      const [name, value] = nameValue.split('=');
      if (name && value) {
        this.cookies.set(name.trim(), value.trim());
      }
    }
  }

  private getCookieString(): string {
    const cookieArray = Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`);
    return cookieArray.join('; ');
  }

  async login(retry = 3): Promise<void> {
    for (let i = 0; i < retry; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const body = new URLSearchParams({
        uid: this.config.uid,
        passwd: this.config.pwd,
        vcode: '6666'
      });

      if (this.config.totp) {
        body.append('twoStepAuth', this.generateTOTP(this.config.totp));
      }

      const response = await fetch('https://api.gamer.com.tw/mobile_app/user/v3/do_login.php', {
        method: 'POST',
        headers: {
          ...this.headers,
          'Cookie': 'ckAPP_VCODE=6666'
        },
        body: body.toString()
      });

      const setCookieHeaders = response.headers.getSetCookie();
      if (setCookieHeaders) {
        this.parseCookies(setCookieHeaders);
      }

      const data: LoginResponse = await response.json();

      if (data.success) {
        return;
      }

      if (data.message?.includes('查無此人')) {
        throw new Error('帳號不存在');
      }
      if (data.message?.includes('帳號、密碼')) {
        throw new Error('密碼錯誤');
      }
      if (data.message?.includes('驗證碼錯誤')) {
        continue;
      }
    }
    throw new Error('登入失敗，已達重試次數上限');
  }

  async signMain(): Promise<string> {
    await this.smartDelay(800);
    
    const response = await fetch('https://www.gamer.com.tw/ajax/signin.php', {
      method: 'POST',
      headers: {
        ...this.headers,
        'Cookie': this.getCookieString(),
        'Referer': 'https://www.gamer.com.tw/'
      },
      body: 'action=2'
    });

    const data: SignResponse = await response.json();

    if (data.data?.days) {
      return `✅ 巴哈姆特簽到成功，已連續簽到 ${data.data.days} 天`;
    }
    if (data.error?.message) {
      if (data.error.message.includes('已簽到')) {
        return '⚠️ 巴哈姆特今日已簽到';
      }
      return `❌ 巴哈姆特簽到失敗: ${data.error.message}`;
    }
    return '❌ 巴哈姆特簽到失敗: 未知錯誤';
  }

  async signGuild(): Promise<string> {
    try {
      await this.smartDelay(600);
      
      const listResponse = await fetch('https://api.gamer.com.tw/ajax/common/topBar.php?type=forum', {
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString()
        }
      });

      const listHtml = await listResponse.text();
      
      // 從 guild.php?gsn= 參數中提取公會 ID
      const guildMatch = listHtml.match(/guild\.php\?gsn=(\d+)/);
      
      if (!guildMatch) {
        return '⚠️ 未加入任何公會';
      }
      
      const guildId = guildMatch[1];
      
      await this.smartDelay(400);
      
      const signResponse = await fetch('https://guild.gamer.com.tw/ajax/guildSign.php', {
        method: 'POST',
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString(),
          'Referer': `https://guild.gamer.com.tw/${guildId}`
        },
        body: `sn=${guildId}`
      });

      const result = await signResponse.json();
      
      if (result.ok === 1) {
        return `✅ 公會簽到成功`;
      }
      if (result.msg?.includes('已經簽到過了') || result.msg?.includes('已簽到')) {
        return '⚠️ 公會今日已簽到';
      }
      if (result.error === 1 && result.msg) {
        return `❌ 公會簽到失敗: ${result.msg}`;
      }
      return `❌ 公會簽到失敗: 未知錯誤`;
    } catch (error) {
      return `❌ 公會簽到失敗: ${error instanceof Error ? error.message : '未知錯誤'}`;
    }
  }

  async answerAnime(): Promise<string> {
    try {
      await this.smartDelay(700);
      
      const response = await fetch('https://ani.gamer.com.tw/', {
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString()
        }
      });

      const html = await response.text();
      const tokenMatch = html.match(/token:\s*'([^']+)'/);
      
      if (!tokenMatch) {
        return '⚠️ 動畫瘋今日已答題或無題目';
      }

      const token = tokenMatch[1];
      
      await this.smartDelay(500);
      
      const questionResponse = await fetch(`https://ani.gamer.com.tw/ajax/videoCastcleGet.php?s=${token}`, {
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString()
        }
      });

      const questionData = await questionResponse.json();
      
      if (!questionData.question) {
        return '⚠️ 無法獲取題目';
      }

      const searchQuery = encodeURIComponent(questionData.question);
      const searchResponse = await fetch(`https://www.google.com/search?q=${searchQuery}`);
      const searchHtml = await searchResponse.text();
      
      let answer = questionData.a1;
      for (const option of [questionData.a1, questionData.a2, questionData.a3, questionData.a4]) {
        if (searchHtml.includes(option)) {
          answer = option;
          break;
        }
      }

      await this.smartDelay(600);
      
      const answerResponse = await fetch('https://ani.gamer.com.tw/ajax/videoCastcleAnswer.php', {
        method: 'POST',
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString()
        },
        body: `token=${token}&ans=${encodeURIComponent(answer)}&t=${Date.now()}`
      });

      const result = await answerResponse.json();
      
      if (result.ok === 1) {
        return `✅ 動畫瘋答題成功，獲得 ${result.gift} 巴幣`;
      }
      return `❌ 動畫瘋答題失敗: ${result.msg || '未知錯誤'}`;
    } catch (error) {
      return `❌ 動畫瘋答題失敗: ${error instanceof Error ? error.message : '未知錯誤'}`;
    }
  }
}