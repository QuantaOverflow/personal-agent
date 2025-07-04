import { ResponseFormatter } from "../messaging/formatters/base";
import { MessageConverter } from "../messaging/converter";
import { TelegramBot } from "../core/bot";
import type {
  ToolCall,
  TelegramToolConfirmation,
  TelegramCallbackQuery,
  AgentTelegramBridge,
} from "../types";

/**
 * Simplified confirmation store for UI state only
 */
class TelegramConfirmationStore {
  private confirmations = new Map<string, TelegramToolConfirmation>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Note: Cleanup interval will be started when first used
    // to avoid global scope async operations in Cloudflare Workers
    this.cleanupInterval = null;
  }

  private ensureCleanupStarted(): void {
    if (!this.cleanupInterval) {
      // Clean up expired confirmations every 5 minutes
      this.cleanupInterval = setInterval(
        () => {
          this.cleanupExpired();
        },
        5 * 60 * 1000
      );
    }
  }

  generateId(): string {
    return `ui_conf_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  store(confirmation: TelegramToolConfirmation): void {
    this.ensureCleanupStarted();
    this.confirmations.set(confirmation.id, confirmation);
  }

  get(id: string): TelegramToolConfirmation | undefined {
    return this.confirmations.get(id);
  }

  delete(id: string): boolean {
    return this.confirmations.delete(id);
  }

  private cleanupExpired(): void {
    const now = new Date();
    for (const [id, confirmation] of this.confirmations.entries()) {
      if (confirmation.expiresAt < now) {
        this.confirmations.delete(id);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.confirmations.clear();
  }
}

// Global UI-only confirmation store
const telegramConfirmationStore = new TelegramConfirmationStore();

/**
 * Telegram UI Manager - handles only UI and messaging, no tool execution
 */
export class TelegramUIManager {
  /**
   * Set the bridge for communication with Agent layer
   * Note: Currently using static methods, bridge is passed as parameter
   */
  setBridge(_bridge: AgentTelegramBridge): void {
    // Currently not stored as instance variable since we use static methods
    // Bridge is passed as parameter to static methods instead
  }

  /**
   * Create a tool confirmation UI with inline keyboard (UI only)
   */
  static async sendToolConfirmationUI(
    toolCall: ToolCall,
    chatId: number,
    userId: number,
    bot: TelegramBot,
    messageId?: number
  ): Promise<string> {
    const confirmationId = telegramConfirmationStore.generateId();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Store UI confirmation data (no execution logic)
    const confirmation: TelegramToolConfirmation = {
      id: confirmationId,
      toolName: toolCall.function.name,
      parameters: toolCall.function.arguments,
      chatId,
      userId,
      messageId,
      timestamp: new Date(),
      expiresAt,
    };

    telegramConfirmationStore.store(confirmation);

    // Format parameters for display
    const paramDisplay = Object.entries(toolCall.function.arguments)
      .map(([key, value]) => `• ${key}: ${JSON.stringify(value)}`)
      .join("\n");

    // Create confirmation message
    const message = [
      `🔧 **工具执行确认 / Tool Execution Confirmation**`,
      ``,
      `**工具名称 / Tool:** \`${toolCall.function.name}\``,
      ``,
      `**参数 / Parameters:**`,
      paramDisplay || "无参数 / No parameters",
      ``,
      `⚠️ 请确认是否执行此工具？`,
      `⚠️ Please confirm tool execution?`,
      ``,
      `⏱️ 确认链接将在10分钟后过期`,
      `⏱️ Confirmation expires in 10 minutes`,
    ].join("\n");

    // Create inline keyboard (UI only)
    const keyboard = ResponseFormatter.createInlineKeyboard([
      [
        {
          text: "✅ 确认执行 / Confirm",
          callback_data: `confirm_${confirmationId}`,
        },
        { text: "❌ 取消 / Cancel", callback_data: `cancel_${confirmationId}` },
      ],
      [
        {
          text: "📋 查看详情 / View Details",
          callback_data: `details_${confirmationId}`,
        },
      ],
    ]);

    // 🔧 修复：应用 Markdown 转换
    const formattedMessage =
      MessageConverter.formatMarkdownForTelegram(message);

    // Send confirmation message
    await bot.sendMessage(chatId, formattedMessage, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
      reply_to_message_id: messageId,
    });

    return confirmationId;
  }

  /**
   * Handle confirmation UI callbacks (no tool execution)
   */
  static async handleConfirmationUICallback(
    callbackData: string,
    callbackQuery: TelegramCallbackQuery,
    bot: TelegramBot,
    bridge?: AgentTelegramBridge
  ): Promise<void> {
    const [action, confirmationId] = callbackData.split("_", 2);

    if (!confirmationId) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "无效的确认ID / Invalid confirmation ID",
        show_alert: true,
      });
      return;
    }

    const confirmation = telegramConfirmationStore.get(confirmationId);
    if (!confirmation) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "确认已过期或不存在 / Confirmation expired or not found",
        show_alert: true,
      });
      return;
    }

    // Verify user permission
    if (confirmation.userId !== callbackQuery.from.id) {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: "您无权限执行此确认 / You are not authorized to confirm this",
        show_alert: true,
      });
      return;
    }

    switch (action) {
      case "confirm":
        await this.handleUIConfirmAction(
          confirmation,
          callbackQuery,
          bot,
          bridge
        );
        break;
      case "cancel":
        await this.handleUICancelAction(
          confirmation,
          callbackQuery,
          bot,
          bridge
        );
        break;
      case "details":
        await this.handleUIDetailsAction(confirmation, callbackQuery, bot);
        break;
      default:
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: "未知操作 / Unknown action",
          show_alert: true,
        });
    }
  }

  /**
   * Handle UI confirmation (no execution - just forward to Agent)
   */
  private static async handleUIConfirmAction(
    confirmation: TelegramToolConfirmation,
    callbackQuery: TelegramCallbackQuery,
    bot: TelegramBot,
    bridge?: AgentTelegramBridge
  ): Promise<void> {
    // Remove UI confirmation from store
    telegramConfirmationStore.delete(confirmation.id);

    // Answer callback query
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "确认已发送给Agent / Confirmation sent to Agent",
    });

    // Update UI to show confirmation was received
    if (callbackQuery.message) {
      const confirmedMessage = [
        `✅ **用户已确认 / User Confirmed**`,
        ``,
        `**工具名称 / Tool:** \`${confirmation.toolName}\``,
        ``,
        `🔄 已通知Agent执行工具...`,
        `🔄 Agent has been notified to execute tool...`,
      ].join("\n");

      // 🔧 修复：应用 Markdown 转换
      const formattedConfirmedMessage =
        MessageConverter.formatMarkdownForTelegram(confirmedMessage);

      await bot.editMessageText(
        callbackQuery.message.chat.id,
        callbackQuery.message.message_id,
        formattedConfirmedMessage,
        { parse_mode: "Markdown" }
      );
    }

    // Forward confirmation to Agent layer (if bridge is available)
    if (bridge) {
      await bridge.onToolConfirmation(
        confirmation.id,
        true,
        confirmation.chatId
      );
    } else {
      console.warn(
        "No Agent bridge available - confirmation cannot be processed"
      );
    }
  }

  /**
   * Handle UI cancellation (no execution logic)
   */
  private static async handleUICancelAction(
    confirmation: TelegramToolConfirmation,
    callbackQuery: TelegramCallbackQuery,
    bot: TelegramBot,
    bridge?: AgentTelegramBridge
  ): Promise<void> {
    // Remove UI confirmation from store
    telegramConfirmationStore.delete(confirmation.id);

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "工具执行已取消 / Tool execution cancelled",
    });

    // Update the original message
    if (callbackQuery.message) {
      const cancelledMessage = [
        `❌ **工具执行已取消 / Tool Execution Cancelled**`,
        ``,
        `**工具名称 / Tool:** \`${confirmation.toolName}\``,
        ``,
        `用户取消了工具执行`,
        `User cancelled tool execution`,
      ].join("\n");

      // 🔧 修复：应用 Markdown 转换
      const formattedCancelledMessage =
        MessageConverter.formatMarkdownForTelegram(cancelledMessage);

      await bot.editMessageText(
        callbackQuery.message.chat.id,
        callbackQuery.message.message_id,
        formattedCancelledMessage,
        { parse_mode: "Markdown" }
      );
    }

    // Forward cancellation to Agent layer (if bridge is available)
    if (bridge) {
      await bridge.onToolConfirmation(
        confirmation.id,
        false,
        confirmation.chatId
      );
    }
  }

  /**
   * Show detailed tool information (UI only)
   */
  private static async handleUIDetailsAction(
    confirmation: TelegramToolConfirmation,
    callbackQuery: TelegramCallbackQuery,
    bot: TelegramBot
  ): Promise<void> {
    const detailsMessage = [
      `📋 **工具详细信息 / Tool Details**`,
      ``,
      `**工具名称 / Tool Name:** \`${confirmation.toolName}\``,
      `**请求时间 / Requested:** ${confirmation.timestamp.toLocaleString()}`,
      `**过期时间 / Expires:** ${confirmation.expiresAt.toLocaleString()}`,
      ``,
      `**完整参数 / Full Parameters:**`,
      `\`\`\`json`,
      JSON.stringify(confirmation.parameters, null, 2),
      `\`\`\``,
    ].join("\n");

    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "查看详细信息 / Viewing details",
    });

    // 🔧 修复：应用 Markdown 转换
    const formattedDetailsMessage =
      MessageConverter.formatMarkdownForTelegram(detailsMessage);

    // Send details as a new message to avoid cluttering the original
    await bot.sendMessage(confirmation.chatId, formattedDetailsMessage, {
      parse_mode: "Markdown",
    });
  }

  /**
   * Display tool execution result from Agent (UI only)
   */
  static async displayToolResult(
    chatId: number,
    toolName: string,
    result: any,
    success: boolean,
    bot: TelegramBot
  ): Promise<void> {
    const icon = success ? "✅" : "❌";
    const status = success
      ? "工具执行完成 / Tool Executed Successfully"
      : "工具执行失败 / Tool Execution Failed";

    const resultMessage = [
      `${icon} **${status}**`,
      ``,
      `**工具名称 / Tool:** \`${toolName}\``,
      ``,
      `**结果 / Result:**`,
      `\`\`\``,
      typeof result === "string" ? result : JSON.stringify(result, null, 2),
      `\`\`\``,
    ].join("\n");

    // 🔧 修复：先应用 Markdown 转换，再分割消息
    const formattedResultMessage =
      MessageConverter.formatMarkdownForTelegram(resultMessage);
    const messageParts = MessageConverter.splitLongMessage(
      formattedResultMessage
    );

    for (const part of messageParts) {
      await bot.sendMessage(chatId, part, {
        parse_mode: "Markdown",
      });
    }
  }

  /**
   * Update tool execution status (UI only)
   */
  static async updateToolStatus(
    chatId: number,
    messageId: number,
    status: "executing" | "completed" | "failed" | "cancelled",
    toolName: string,
    bot: TelegramBot
  ): Promise<void> {
    const statusMessages = {
      executing: "🔧 **工具执行中 / Tool Executing**",
      completed: "✅ **工具执行完成 / Tool Completed**",
      failed: "❌ **工具执行失败 / Tool Failed**",
      cancelled: "⏹️ **工具执行已取消 / Tool Cancelled**",
    };

    const statusDetails = {
      executing: "⏳ 正在执行，请稍候... / Executing, please wait...",
      completed: "✅ 执行成功 / Execution successful",
      failed: "❌ 执行失败 / Execution failed",
      cancelled: "⏹️ 已取消 / Cancelled",
    };

    const message = [
      statusMessages[status],
      ``,
      `**工具名称 / Tool:** \`${toolName}\``,
      ``,
      statusDetails[status],
    ].join("\n");

    // 🔧 修复：应用 Markdown 转换
    const formattedMessage =
      MessageConverter.formatMarkdownForTelegram(message);

    await bot.editMessageText(chatId, messageId, formattedMessage, {
      parse_mode: "Markdown",
    });
  }
}

// Export for backward compatibility
/** @deprecated Use TelegramUIManager instead */
export const ToolConfirmationManager = {
  sendToolConfirmation: () =>
    console.log("Use TelegramUIManager.sendToolConfirmationUI instead"),
  handleConfirmationCallback: () =>
    console.log("Use TelegramUIManager.handleConfirmationUICallback instead"),
  cleanupExpiredConfirmations: () =>
    console.log("Use TelegramUIManager instead"),
};
