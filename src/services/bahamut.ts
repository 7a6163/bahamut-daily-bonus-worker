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

    // 先取得 CSRF Token
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

    await this.smartDelay(500);

    // 使用 CSRF Token 進行簽到
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

      // 從 guild.php?gsn= 或 guild.php?sn= 參數中提取公會 ID
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

      // 嘗試取得網頁版的 BAHAENUR cookie
      const webAuthResponse = await fetch('https://www.gamer.com.tw/', {
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString()
        },
        redirect: 'manual'
      });

      // 檢查是否有新的 cookies（取得網頁版的 BAHAENUR）
      const webCookies = webAuthResponse.headers.getSetCookie();
      if (webCookies && webCookies.length > 0) {
        this.parseCookies(webCookies);
      }

      // 使用正確的動畫瘋答題 API（必須使用動畫瘋的 User-Agent）
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

      // 嘗試解析響應
      let questionData;
      try {
        const text = await questionResponse.text();
        questionData = JSON.parse(text);
      } catch (e) {
        // 如果不是 JSON，可能是 HTML 錯誤頁面
        return '❌ 動畫瘋 API 需要有效的認證';
      }

      if (!questionData.token) {
        // 檢查各種錯誤情況
        if (questionData.error === 1 && questionData.nologin === 1) {
          return '❌ 動畫瘋需要登入（請確認認證有效）';
        }
        if (questionData.msg?.includes('已經答過題目')) {
          return '⚠️ 動畫瘋今日已答題';
        }
        if (questionData.msg?.includes('請先登入')) {
          return '❌ 動畫瘋需要登入';
        }
        return `⚠️ 動畫瘋: ${questionData.msg || '今日無題目'}`;
      }

      // 從 blackxblue 小屋取得答案（使用 UserScript 相同的 API）
      await this.smartDelay(500);

      const articleResponse = await fetch('https://api.gamer.com.tw/home/v2/creation_list.php?owner=blackXblue', {
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString(),
          'Referer': 'https://home.gamer.com.tw/'
        }
      });

      // 檢查文章 API response
      const articleContentType = articleResponse.headers.get('content-type');
      if (!articleContentType || !articleContentType.includes('application/json')) {
        return '❌ 無法取得答案文章，API 返回非 JSON 格式';
      }

      const articleData = await articleResponse.json();
      const today = new Date();
      // UserScript 使用 M/D 格式（不補零）
      const month = today.getMonth() + 1;
      const day = today.getDate();

      // 嘗試多種日期格式
      const dateFormats = [
        `${month}/${day}`,  // 3/9
        `${month}-${day}`,  // 3-9
        `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`,  // 03/09
        `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`   // 03-09
      ];

      const answerArticle = (articleData.data?.list || []).find((article: any) =>
        dateFormats.some(format => article.title.includes(format))
      );

      if (!answerArticle) {
        return '❌ 找不到今日答案文章';
      }

      await this.smartDelay(500);

      // 取得答案內容（使用 webview API 取得 HTML）
      const answerResponse = await fetch(`https://api.gamer.com.tw/mobile_app/bahamut/v1/home_creation_detail_webview.php?sn=${answerArticle.csn}`, {
        headers: {
          ...this.headers,
          'Cookie': this.getCookieString(),
          'Referer': 'https://home.gamer.com.tw/'
        }
      });

      // 檢查答案 API response（HTML 格式）
      const answerContentType = answerResponse.headers.get('content-type');
      if (!answerContentType || !answerContentType.includes('text/html')) {
        return '❌ 無法取得答案內容，API 返回非預期格式';
      }

      const answerHTML = await answerResponse.text();

      // 解析 HTML 找答案（匹配 UserScript 的邏輯）
      const answerMatch = answerHTML.match(/[aAＡ]\s*.\s*([1-4１-４])/);

      if (!answerMatch) {
        return '❌ 無法解析答案';
      }

      const answer = answerMatch[1];

      await this.smartDelay(600);

      // 提交答案（使用正確的 API）
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

      // 檢查提交答案 response
      const submitContentType = submitResponse.headers.get('content-type');
      if (!submitContentType || !submitContentType.includes('application/json')) {
        return '❌ 提交答案失敗，API 返回非 JSON 格式';
      }

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
