/**
 * Telegram Bot API client
 */
export class TelegramBot {
  private readonly token: string;
  private readonly baseUrl: string;

  constructor(token: string) {
    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    options?: {
      parse_mode?: "Markdown" | "HTML";
      reply_markup?: any;
      disable_web_page_preview?: boolean;
      reply_to_message_id?: number;
    }
  ): Promise<Response> {
    const url = `${this.baseUrl}/sendMessage`;

    // Ensure text doesn't exceed Telegram's 4096 character limit
    const truncatedText =
      text.length > 4096 ? `${text.substring(0, 4093)}...` : text;

    const payload = {
      chat_id: chatId,
      text: truncatedText,
      ...options,
    };

    console.log(`Sending message to chat ${chatId}:`, {
      text:
        truncatedText.substring(0, 100) +
        (truncatedText.length > 100 ? "..." : ""),
      ...options,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send message:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
      }

      return response;
    } catch (error) {
      console.error("Network error while sending message:", error);
      throw error;
    }
  }

  async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options?: {
      parse_mode?: "Markdown" | "HTML";
      reply_markup?: any;
      disable_web_page_preview?: boolean;
    }
  ): Promise<Response> {
    const url = `${this.baseUrl}/editMessageText`;

    // Ensure text doesn't exceed Telegram's 4096 character limit
    const truncatedText =
      text.length > 4096 ? `${text.substring(0, 4093)}...` : text;

    const payload = {
      chat_id: chatId,
      message_id: messageId,
      text: truncatedText,
      ...options,
    };

    console.log(`Editing message ${messageId} in chat ${chatId}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to edit message:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
      }

      return response;
    } catch (error) {
      console.error("Network error while editing message:", error);
      throw error;
    }
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    options?: {
      text?: string;
      show_alert?: boolean;
      url?: string;
      cache_time?: number;
    }
  ): Promise<Response> {
    const url = `${this.baseUrl}/answerCallbackQuery`;

    // Ensure text doesn't exceed Telegram's 200 character limit for callback query answers
    const truncatedText = options?.text
      ? options.text.length > 200
        ? `${options.text.substring(0, 197)}...`
        : options.text
      : undefined;

    const payload = {
      callback_query_id: callbackQueryId,
      ...options,
      ...(truncatedText !== undefined && { text: truncatedText }),
    };

    console.log(`Answering callback query ${callbackQueryId}:`, options);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to answer callback query:`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
      }

      return response;
    } catch (error) {
      console.error("Network error while answering callback query:", error);
      throw error;
    }
  }
}
