import { TOTP } from 'otpauth';
import type { BahamutConfig, LoginResponse, SignResponse } from '../types';

export class BahamutService {
  private config: BahamutConfig;
  private cookies: Map<string, string> = new Map();
  private csrfToken: string = '';
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

    const randomOffset = Math.floor(Math.random() * 500);
    const delay = Math.min(baseMs + randomOffset, 2000);
    await new Promise(resolve => setTimeout(resolve, delay));
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
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
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

    const tokenResponse = await fetch('https://www.gamer.com.tw/ajax/get_csrf_token.php', {
      method: 'GET',
      headers: {
        ...this.headers,
        'Cookie': this.getCookieString(),
        'Referer': 'https://www.gamer.com.tw/'
      }
    });

    if (!tokenResponse.ok) {
      return '❌ 無法取得簽到令牌';
    }

    const token = await tokenResponse.text();
    if (!token) {
      return '❌ 簽到令牌為空';
    }

    this.csrfToken = token;

    await this.smartDelay(500);

    const signResponse = await fetch('https://www.gamer.com.tw/ajax/signin.php', {
      method: 'POST',
      headers: {
        ...this.headers,
        'Cookie': this.getCookieString(),
        'Referer': 'https://www.gamer.com.tw/'
      },
      body: `action=1&token=${token}`
    });

    const data: SignResponse = await signResponse.json();

    if (data.data?.days) {
      return `✅ 巴哈姆特簽到成功，已連續簽到 ${data.data.days} 天`;
    }
    if (data.error?.message) {
      if (data.error.message.includes('已經簽到') || data.error.message.includes('已簽到')) {
        return '⚠️ 巴哈姆特今日已簽到';
      }
      return `❌ 巴哈姆特簽到失敗: ${data.error.message}`;
    }
    return '❌ 巴哈姆特簽到失敗: 未知錯誤';
  }

  async signAds(): Promise<string> {
    try {
      if (!this.csrfToken) {
        return '❌ 廣告獎勵需要先完成主站簽到';
      }

      const shortToken = this.csrfToken.slice(0, 16);
      const adsCookie = `ckBahamutCsrfToken=${shortToken};${this.getCookieString()}`;

      await this.smartDelay(500);

      const startResponse = await fetch(
        `https://api.gamer.com.tw/mobile_app/bahamut/v1/sign_in_ad_start.php?bahamutCsrfToken=${shortToken}`,
        {
          method: 'POST',
          headers: {
            ...this.headers,
            'Cookie': adsCookie
          }
        }
      );

      const startData = await startResponse.json();

      if (startData.data?.finished === 1) {
        return '⚠️ 廣告雙倍獎勵今日已領取';
      }

      if (startData.data?.finished !== 0) {
        const errMsg = startData.error?.message || startData.message;
        return `❌ 廣告獎勵啟動失敗: ${errMsg || '未知錯誤'}`;
      }

      // Wait 30 seconds for ad to play
      await new Promise(resolve => setTimeout(resolve, 30000));

      const finishResponse = await fetch(
        `https://api.gamer.com.tw/mobile_app/bahamut/v1/sign_in_ad_finished.php?bahamutCsrfToken=${shortToken}`,
        {
          method: 'POST',
          headers: {
            ...this.headers,
            'Cookie': adsCookie
          }
        }
      );

      const finishData = await finishResponse.json();

      if (finishData.data?.finished === 1) {
        return '✅ 廣告雙倍獎勵領取成功';
      }

      const errMsg = finishData.error?.message || finishData.message;
      return `❌ 廣告獎勵領取失敗: ${errMsg || '未知錯誤'}`;

    } catch (error) {
      return `❌ 廣告獎勵失敗: ${error instanceof Error ? error.message : '未知錯誤'}`;
    }
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

      const guildMatch = listHtml.match(/guild\.php\?g?sn=(\d+)/);

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

      const questionResponse = await fetch(`https://ani.gamer.com.tw/ajax/animeGetQuestion.php?t=${Date.now()}`, {
        headers: {
          'User-Agent': 'Anime/2.13.9 (tw.com.gamer.anime;build:437;iOS 14.5.0) Alamofire/5.4.1',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
          'Cookie': this.getCookieString(),
          'Referer': 'https://ani.gamer.com.tw/',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      const questionText = await questionResponse.text();
      let questionData;
      try {
        questionData = JSON.parse(questionText);
      } catch {
        const preview = questionText.slice(0, 120).replace(/\n/g, ' ');
        return `❌ 動畫瘋 API 非 JSON (${questionResponse.status}): ${preview}`;
      }

      if (!questionData.token) {
        if (questionData.error === 1 && questionData.nologin === 1) {
          return '❌ 動畫瘋需要登入（請確認認證有效）';
        }
        if (questionData.msg?.includes('已經答過題目')) {
          return '⚠️ 動畫瘋今日已答題';
        }
        return `⚠️ 動畫瘋: ${questionData.msg || '今日無題目'}`;
      }

      // Fetch web session cookies needed for ani.gamer.com.tw
      const webAuthResponse = await fetch('https://www.gamer.com.tw/', {
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString()
        },
        redirect: 'manual'
      });
      const webCookies = webAuthResponse.headers.getSetCookie();
      if (webCookies.length > 0) {
        this.parseCookies(webCookies);
      }

      // Get answer article list (same API as reference script)
      await this.smartDelay(500);

      const articleResponse = await fetch('https://api.gamer.com.tw/mobile_app/bahamut/v1/home.php?owner=blackXblue&page=1', {
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString(),
          'Referer': 'https://home.gamer.com.tw/'
        }
      });

      const articleData = await articleResponse.json();

      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${month}/${day}`;

      const article = (articleData.creation || []).find((a: { title?: string; sn?: string }) =>
        a.title?.includes(dateStr)
      );

      if (!article?.sn) {
        return '❌ 找不到今日答案文章';
      }

      // Get answer from article content (JSON, same as reference script)
      await this.smartDelay(500);

      const answerResponse = await fetch(`https://api.gamer.com.tw/mobile_app/bahamut/v1/home_creation_detail.php?sn=${article.sn}`, {
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString(),
          'Referer': 'https://home.gamer.com.tw/'
        }
      });

      const answerData = await answerResponse.json();
      const answer = (answerData.content || '').split(/A[:;：](\d)/)[1];

      if (!answer) {
        return '❌ 無法解析答案';
      }

      // Submit answer
      await this.smartDelay(600);

      const submitResponse = await fetch('https://ani.gamer.com.tw/ajax/animeAnsQuestion.php', {
        method: 'POST',
        headers: {
          'User-Agent': 'Anime/2.13.9 (tw.com.gamer.anime;build:437;iOS 14.5.0) Alamofire/5.4.1',
          'Cookie': this.getCookieString(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://ani.gamer.com.tw/',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: `token=${questionData.token}&ans=${answer}&t=${Date.now()}`
      });

      const result = await submitResponse.json();

      if (result.ok === 1) {
        return `✅ 動畫瘋答題成功，${result.gift}`;
      }
      return `❌ 動畫瘋答題失敗: ${result.msg || '未知錯誤'}`;
    } catch (error) {
      return `❌ 動畫瘋答題失敗: ${error instanceof Error ? error.message : '未知錯誤'}`;
    }
  }
}
