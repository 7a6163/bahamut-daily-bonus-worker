export interface Env {
  BAHAMUT_UID: string;
  BAHAMUT_PWD: string;
  BAHAMUT_TOTP?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  DAILY_STATUS: KVNamespace;
}

export interface BahamutConfig {
  uid: string;
  pwd: string;
  totp?: string;
  needSignAds?: boolean;
  needSignGuild?: boolean;
  needAnswer?: boolean;
  useSmartDelay?: boolean;
}

export interface LoginResponse {
  success: boolean;
  userid?: string;
  nickname?: string;
  gold?: number;
  gp?: number;
  avatar?: string;
  avatar_s?: string;
  lv?: number;
  code?: number;
  message?: string;
}

export interface MobileSignResponse {
  code?: number;
  message?: string;
  data?: {
    days?: number;
    token?: string;
    bahamutCsrfToken?: string;
    [key: string]: unknown;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
  token?: string;
  bahamutCsrfToken?: string;
}

export interface AnimeQuestion {
  question: string;
  answers: string[];
  token: string;
}
