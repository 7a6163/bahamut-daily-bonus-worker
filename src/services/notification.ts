interface TelegramConfig {
  botToken: string;
  chatId: string;
  threadId?: string;
}

export class NotificationService {
  private telegramConfig?: TelegramConfig;

  constructor(botToken?: string, chatId?: string, threadId?: string) {
    if (botToken && chatId) {
      this.telegramConfig = { botToken, chatId, threadId };
    }
  }

  async send(title: string, message: string): Promise<void> {
    if (!this.telegramConfig) {
      return;
    }

    try {
      await this.sendTelegram(title, message);
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  }

  private async sendTelegram(title: string, message: string): Promise<void> {
    if (!this.telegramConfig) return;

    const { botToken, chatId, threadId } = this.telegramConfig;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const text = `🎮 *${this.escapeMarkdown(title)}*\n\n${this.escapeMarkdown(message)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        // Posts into a forum topic when the chat is a group with Topics enabled.
        message_thread_id: threadId ? Number(threadId) : undefined,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Telegram API error: ${error}`);
    }
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
}
