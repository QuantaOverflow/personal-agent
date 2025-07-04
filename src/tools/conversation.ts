/**
 * 对话管理工具模块
 * 
 * 提供对话统计、历史清理等功能
 */
import { tool } from "ai";
import { z } from "zod";
import type { Chat } from "../server";
import type { 
  ConversationStats, 
  ConversationActionResult 
} from "./types";

/**
 * 创建查看对话统计工具
 */
export const createViewConversationStatsTool = (agent: Chat) => {
  return tool({
    description: "查看当前对话的统计信息，包括消息数量等",
    parameters: z.object({}),
    execute: async (): Promise<ConversationStats> => {
      try {
        // 使用 AIChatAgent 内置的消息管理
        const messageCount = agent.messages.length;
        const telegramContext = agent.getTelegramContext();

        return {
          messageCount,
          userId: telegramContext?.userId?.toString() || undefined,
          chatId: telegramContext?.chatId?.toString() || undefined,
        };
      } catch (error) {
        console.error("Failed to get conversation stats:", error);
        return {
          messageCount: 0,
          userId: undefined,
          chatId: undefined,
        };
      }
    },
  });
};

/**
 * 创建清理对话历史工具
 */
export const createClearConversationHistoryTool = (agent: Chat) => {
  return tool({
    description: "清理当前对话的所有历史消息（谨慎使用）",
    parameters: z.object({
      confirm: z.boolean().describe("确认清理历史记录"),
    }),
    execute: async ({ confirm }): Promise<ConversationActionResult> => {
      if (!confirm) {
        return {
          success: false,
          message: "需要确认才能清理历史记录",
          action: "clear",
          details: "请使用 confirm: true 参数。"
        };
      }

      try {
        // AIChatAgent 会自动管理消息持久化，只需清空消息数组
        agent.messages = [];

        return {
          success: true,
          message: "对话历史已清理完毕",
          action: "clear",
          details: "新的对话开始，之前的所有消息记录已被清除。AIChatAgent 将自动处理持久化。"
        };
      } catch (error) {
        console.error("Failed to clear conversation history:", error);
        return {
          success: false,
          message: "清理对话历史失败",
          action: "clear",
          details: error instanceof Error ? error.message : String(error)
        };
      }
    },
  });
}; 