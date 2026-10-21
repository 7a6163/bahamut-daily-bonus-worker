import { TOTP } from 'otpauth';
import type { BahamutConfig, LoginResponse, MobileSignResponse } from '../types';

export class BahamutService {
  private config: BahamutConfig;
  private cookies: Map<string, string> = new Map();
  private csrfToken: string = '';
  private mainSignedIn: boolean = false;
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
      this.cookies.set('ckAPP_VCODE', '6666');

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

    // Web endpoint www.gamer.com.tw/ajax/get_csrf_token.php is now behind a
    // Cloudflare JS challenge that blocks non-browser clients. Use the mobile
    // API sign-in endpoint instead, which only needs the login cookie.
    const response = await fetch('https://api.gamer.com.tw/mobile_app/bahamut/v1/sign_in.php', {
      method: 'POST',
      headers: {
        ...this.headers,
        'Cookie': this.getCookieString()
      },
      body: 'vcode=6666'
    });

    const text = await response.text();
    console.log(`[signMain] status=${response.status} body=${text.slice(0, 300)}`);

    // The sign-in response may issue ckBahamutCsrfToken (needed by signAds)
    // via Set-Cookie. Capture it into the jar.
    const signInCookies = response.headers.getSetCookie();
    if (signInCookies && signInCookies.length > 0) {
      this.parseCookies(signInCookies);
      console.log(`[signMain] set-cookie cookies=${signInCookies.map(c => c.split('=')[0]).join(',')}`);
    }

    let data: MobileSignResponse;
    try {
      data = JSON.parse(text);
    } catch {
      const preview = text.slice(0, 120).replace(/\n/g, ' ');
      return `❌ 巴哈姆特簽到失敗: 非 JSON 回應 (${response.status}) ${preview}`;
    }

    const token = data.token || data.bahamutCsrfToken || data.data?.token || data.data?.bahamutCsrfToken;
    if (token) this.csrfToken = token;

    if (data.data?.days != null) {
      this.mainSignedIn = true;
      return `✅ 巴哈姆特簽到成功，已連續簽到 ${data.data.days} 天`;
    }

    const msg = data.message || data.error?.message;
    if (typeof msg === 'string') {
      if (msg.includes('簽到成功')) {
        this.mainSignedIn = true;
        return `✅ 巴哈姆特簽到成功`;
      }
      if (msg.includes('已經簽到') || msg.includes('已簽到')) {
        this.mainSignedIn = true;
        return '⚠️ 巴哈姆特今日已簽到';
      }
      return `❌ 巴哈姆特簽到失敗: ${msg}`;
    }
    return '❌ 巴哈姆特簽到失敗: 未知錯誤';
  }

  async signAds(): Promise<string> {
    try {
      if (!this.mainSignedIn) {
        return '❌ 廣告獎勵需要先完成主站簽到';
      }

      // The ad endpoints only check that the bahamutCsrfToken param matches the
      // ckBahamutCsrfToken cookie (double-submit), so a random token works when
      // the mobile sign-in didn't issue one.
      const token = this.csrfToken || this.cookies.get('ckBahamutCsrfToken')
        || Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
      const adsCookie = `ckBahamutCsrfToken=${token};${this.getCookieString()}`;

      await this.smartDelay(500);

      const startResponse = await fetch(`https://api.gamer.com.tw/mobile_app/bahamut/v1/sign_in_ad_start.php?bahamutCsrfToken=${token}`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Cookie': adsCookie
        }
      });

      const startText = await startResponse.text();
      console.log(`[signAds] start status=${startResponse.status} body=${startText.slice(0, 300)}`);
      const startData = JSON.parse(startText);

      if (startData.data?.finished === 1) {
        return '⚠️ 廣告雙倍獎勵今日已領取';
      }

      if (startData.data?.finished !== 0) {
        const errMsg = startData.error?.message || startData.message;
        return `❌ 廣告獎勵啟動失敗: ${errMsg || '未知錯誤'}`;
      }

      // Wait 30 seconds for ad to play
      await new Promise(resolve => setTimeout(resolve, 30000));

      const finishResponse = await fetch(`https://api.gamer.com.tw/mobile_app/bahamut/v1/sign_in_ad_finished.php?bahamutCsrfToken=${token}`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Cookie': adsCookie
        }
      });

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
    // guild.gamer.com.tw/ajax/guildSign.php is now behind a Cloudflare JS
    // challenge that returns HTML to non-browser clients, causing JSON parse
    // errors. The mobile guild sign endpoint params could not be determined
    // without a live session, so guild sign-in is disabled. Use a local
    // script (Surge/Node/NAS) for guild sign-in until the mobile API flow is
    // reverse-engineered.
    return '⚠️ 公會簽到已停用：guild.gamer.com.tw 已被 Cloudflare JS 挑戰保護，Worker 無法通過，請改用本地腳本';
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
