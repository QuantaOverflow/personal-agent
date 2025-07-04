import { TelegramBot } from "../core/bot";
import { TelegramUIManager } from "../infrastructure/ui-manager";
import { simulateAIStreamingResponse } from "../utils/demo";
import { MessageConverter } from "./converter";
import type { TelegramMessage, ToolCall } from "../types";

/**
 * Handle bot commands
 */
export async function handleCommand(
  message: TelegramMessage,
  bot: TelegramBot,
  env?: any
): Promise<void> {
  const command = message.text?.split(" ")[0];

  switch (command) {
    case "/start":
      await bot.sendMessage(
        message.chat.id,
        "🤖 欢迎使用AI助手！\n\n" +
          "可用命令:\n" +
          "/help - 查看帮助\n" +
          "/testconfirm - 测试工具确认UI\n" +
          "/teststream - 测试流式响应\n\n" +
          "直接发送消息与AI对话。"
      );
      break;

    case "/help": {
      const helpMessage =
        "🔧 **Agent架构说明 / Agent Architecture**\n\n" +
        "• UI层 (Telegram): 处理用户交互和界面\n" +
        "• UI Layer (Telegram): Handles user interaction and interface\n\n" +
        "• Agent层: 处理工具执行和AI推理\n" +
        "• Agent layer: Handles tool execution and AI reasoning";

      // 🔧 修复：应用 Markdown 转换
      const formattedMessage =
        MessageConverter.formatMarkdownForTelegram(helpMessage);

      await bot.sendMessage(message.chat.id, formattedMessage);
      break;
    }

    case "/testconfirm": {
      // Demo the new tool confirmation UI (UI-only, no actual execution)
      const mockToolCall: ToolCall = {
        id: "test_123",
        function: {
          name: "getWeatherInformation",
          arguments: { city: "Beijing" },
        },
      };

      await TelegramUIManager.sendToolConfirmationUI(
        mockToolCall,
        message.chat.id,
        message.from?.id || 0,
        bot,
        message.message_id
      );

      const testMessage =
        "🔧 **测试工具确认UI / Test Tool Confirmation UI**\n\n" +
        "这演示了新的架构分离:\n" +
        "This demonstrates the new architecture separation:\n\n" +
        "• UI层 (Telegram): 处理用户交互和界面\n" +
        "• UI Layer (Telegram): Handles user interaction and interface\n\n" +
        "• Agent层: 处理工具执行和AI推理\n" +
        "• Agent layer: Handles tool execution and AI reasoning";

      // 🔧 修复：应用 Markdown 转换
      const formattedTestMessage =
        MessageConverter.formatMarkdownForTelegram(testMessage);

      await bot.sendMessage(message.chat.id, formattedTestMessage);
      break;
    }

    case "/teststream": {
      // 演示流式响应功能
      await bot.sendMessage(
        message.chat.id,
        "🌊 开始流式响应测试...\n请稍等，即将展示消息编辑功能！"
      );

      const botToken = env?.TELEGRAM_BOT_TOKEN;
      if (!botToken) {
        await bot.sendMessage(
          message.chat.id,
          "❌ 错误：无法获取Bot Token，无法进行流式测试\n" + "请检查环境配置"
        );
        break;
      }

      try {
        // 使用演示函数测试流式响应
        await simulateAIStreamingResponse(
          message.chat.id,
          botToken,
          "用户请求测试流式响应功能"
        );
      } catch (error) {
        console.error("Stream test error:", error);
        await bot.sendMessage(
          message.chat.id,
          "❌ 流式测试失败：" + (error as Error).message
        );
      }
      break;
    }

    default:
      await bot.sendMessage(
        message.chat.id,
        `Unknown command: ${command}\n\nUse /help to see available commands.`
      );
  }
}
