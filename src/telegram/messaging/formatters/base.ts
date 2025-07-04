/**
 * 基础格式化器
 * 提供通用的 Telegram 消息格式化功能
 */

/**
 * 基础响应格式化器
 */
export class BaseFormatter {
  /**
   * 格式化文本为 Telegram 格式，处理常见的格式化问题
   */
  static formatText(
    text: string,
    options?: {
      maxLength?: number;
      parseMode?: "Markdown" | "HTML";
    }
  ): string {
    const maxLength = options?.maxLength || 4096;

    // 截断如有必要
    let formattedText =
      text.length > maxLength ? `${text.substring(0, maxLength - 3)}...` : text;

    // 根据解析模式处理特殊字符
    if (options?.parseMode === "Markdown") {
      // 转义特殊 Markdown 字符
      formattedText = formattedText.replace(
        /([*_`[\]()~>#+\-=|{}.!])/g,
        "\\$1"
      );
    } else if (options?.parseMode === "HTML") {
      // 转义 HTML 特殊字符
      formattedText = formattedText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    return formattedText;
  }

  /**
   * 创建内联键盘标记
   */
  static createInlineKeyboard(
    buttons: Array<
      Array<{
        text: string;
        callback_data?: string;
        url?: string;
      }>
    >
  ): object {
    return {
      inline_keyboard: buttons,
    };
  }

  /**
   * 创建回复键盘标记
   */
  static createReplyKeyboard(
    buttons: Array<Array<string>>,
    options?: {
      one_time_keyboard?: boolean;
      resize_keyboard?: boolean;
      selective?: boolean;
    }
  ): object {
    return {
      keyboard: buttons.map((row) => row.map((text) => ({ text }))),
      one_time_keyboard: options?.one_time_keyboard ?? false,
      resize_keyboard: options?.resize_keyboard ?? true,
      selective: options?.selective ?? false,
    };
  }

  /**
   * 移除键盘标记
   */
  static removeKeyboard(selective?: boolean): object {
    return {
      remove_keyboard: true,
      selective: selective ?? false,
    };
  }

  /**
   * 统一的成功消息结构
   */
  protected static createSuccessMessage(
    title: string,
    content: string,
    options?: { showTimestamp?: boolean }
  ): string {
    const parts = [`✅ **${title}**`, "", content];

    if (options?.showTimestamp) {
      const now = new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });
      parts.push("", `🕐 **时间**: ${now}`);
    }

    return parts.join("\n");
  }

  /**
   * 统一的错误消息结构
   */
  protected static createErrorMessage(
    operation: string,
    error: string,
    suggestions?: string[]
  ): string {
    const parts = [
      "❌ **操作失败**",
      "",
      `**操作**: ${operation}`,
      `**错误**: ${error}`,
    ];

    if (suggestions && suggestions.length > 0) {
      parts.push("", "💡 **建议**:");
      suggestions.forEach((suggestion) => {
        parts.push(`• ${suggestion}`);
      });
    }

    return parts.join("\n");
  }

  /**
   * 统一的信息展示结构
   */
  protected static createInfoMessage(
    title: string,
    items: Array<{ label: string; value: string; icon?: string }>
  ): string {
    const parts = [`ℹ️ **${title}**`, ""];

    items.forEach((item) => {
      const icon = item.icon || "•";
      parts.push(`${icon} **${item.label}**: ${item.value}`);
    });

    return parts.join("\n");
  }
}

// 向后兼容性导出
export const ResponseFormatter = BaseFormatter; 