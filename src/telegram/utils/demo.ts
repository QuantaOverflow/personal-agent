import { TelegramBot } from "../core/bot";
import { TelegramStreamHandler } from "../streaming/handler";
import { globalStreamStateManager } from "../streaming/state-manager";
import { StreamErrorRecoveryManager } from "../streaming/error-recovery";
import type { StreamConfig } from "../streaming/handler";

/**
 * 演示流式响应功能
 */
export async function demonstrateStreamingResponse(
  bot: TelegramBot,
  chatId: number,
  userId: number,
  botToken: string,
  messageText: string = "这是一个演示流式响应的测试消息..."
): Promise<void> {
  const streamHandler = new TelegramStreamHandler(chatId, botToken, userId);
  
  // 初始化流处理器
  await streamHandler.initialize();
  
  // 模拟 AI 流式响应
  const mockStream = simulateAIStreamingResponse(messageText);
  
  // 处理流式数据
  for await (const chunk of mockStream) {
    await streamHandler.onStreamChunk(chunk);
  }
  
  // 完成流式响应
  await streamHandler.finalize();
}

/**
 * 模拟 AI 流式响应
 */
export async function* simulateAIStreamingResponse(
  fullText: string,
  chunkSize: number = 10,
  delay: number = 200
): AsyncGenerator<string, void, unknown> {
  const words = fullText.split(' ');
  
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    yield chunk + (i + chunkSize < words.length ? ' ' : '');
    
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * 演示错误恢复功能
 */
export async function demonstrateErrorRecovery(
  bot: TelegramBot,
  chatId: number,
  botToken: string
): Promise<void> {
  const errorRecovery = new StreamErrorRecoveryManager(botToken);
  
  // 模拟一个会失败的操作
  const mockError = new Error("模拟的 Telegram API 错误");
  
  try {
    // 尝试发送消息（模拟失败）
    throw mockError;
  } catch (error) {
    console.log("检测到错误，开始错误恢复流程...");
    
    const sendMessageFn = async (text: string) => {
      return await bot.sendMessage(chatId, text);
    };
    
    const editMessageFn = async (text: string) => {
      // 假设有一个消息ID
      await bot.editMessageText(chatId, 123, text);
    };
    
    const result = await errorRecovery.handleStreamError(
      error as Error,
      {
        chatId,
        messageId: 123,
        currentText: "测试消息",
        lastSuccessfulText: "",
        retryCount: 0,
        operationType: "send"
      },
      sendMessageFn,
      editMessageFn
    );
    
    console.log("错误恢复结果:", result);
  }
}

/**
 * 获取流状态信息
 */
export function getStreamStatus(chatId: number): any {
  const sessions = globalStreamStateManager.getUserSessions(chatId);
  
  if (sessions.length === 0) {
    return {
      status: "inactive",
      message: "没有活动的流会话"
    };
  }
  
  const session = sessions[0]; // 获取第一个会话
  const context = globalStreamStateManager.getContext(session.sessionId);
  
  return {
    status: session.status,
    messageCount: context?.messageVersions.length || 0,
    errorCount: context?.errorCount || 0,
    lastActivity: session.lastActivity,
    metrics: globalStreamStateManager.getMetrics()
  };
}

/**
 * 更新流配置
 */
export function updateStreamConfig(
  chatId: number,
  newConfig: Partial<StreamConfig>
): boolean {
  const sessions = globalStreamStateManager.getUserSessions(chatId);
  
  if (sessions.length === 0) {
    console.log("没有找到活动的流会话");
    return false;
  }
  
  // 更新配置（这里只是示例，实际实现可能需要更复杂的逻辑）
  console.log("更新流配置:", newConfig);
  return true;
}

/**
 * 清理演示数据
 */
export function cleanupDemoData(chatId: number): void {
  const sessions = globalStreamStateManager.getUserSessions(chatId);
  
  sessions.forEach(session => {
    globalStreamStateManager.cleanupSession(session.sessionId);
  });
  
  console.log(`已清理聊天 ${chatId} 的演示数据`);
}

/**
 * 获取演示统计信息
 */
export function getDemoStats(): {
  activeSessions: number;
  totalMessages: number;
  totalErrors: number;
} {
  const metrics = globalStreamStateManager.getMetrics();
  const stats = globalStreamStateManager.getSessionStats();
  
  return {
    activeSessions: stats.active,
    totalMessages: metrics.totalMessages,
    totalErrors: Math.round(metrics.errorRate * metrics.totalSessions / 100)
  };
} 