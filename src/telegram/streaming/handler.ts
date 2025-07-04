/**
 * 流式响应处理器类
 * 用于管理 Telegram 消息的实时流式更新
 */

import type { TelegramMessage } from "../types";
import {
  AdvancedRateLimiter,
  RequestPriority,
} from "../infrastructure/rate-limiter";
import type {
  RateLimitConfig,
  RateLimitMetrics,
} from "../infrastructure/rate-limiter";
import {
  StreamErrorRecoveryManager,
  type RecoveryContext,
  type RecoveryResult,
} from "./error-recovery";
import {
  StreamStateManager,
  type StreamSession,
  type StreamContext,
  SessionStatus,
  type SessionMetadata,
  globalStreamStateManager,
} from "./state-manager";
import { MessageConverter } from "../messaging/converter";

export interface StreamConfig {
  /** 最小更新间隔(毫秒) */
  minUpdateInterval: number;
  /** 最大消息长度 */
  maxMessageLength: number;
  /** 速率限制配置 */
  rateLimitConfig?: Partial<RateLimitConfig>;
}

export interface StreamState {
  messageId: number | null;
  chatId: number;
  currentText: string;
  lastSentText: string; // 跟踪最后一次实际发送的内容
  lastUpdateTime: number;
  isActive: boolean;
  isPaused: boolean;
}

export class TelegramStreamHandler {
  private state: StreamState;
  private config: StreamConfig;
  private botToken: string;
  private updateQueue: string[] = [];
  private rateLimiter: AdvancedRateLimiter;
  private errorRecoveryManager: StreamErrorRecoveryManager;
  private stateManager: StreamStateManager;
  private sessionId: string | null = null;
  private userId: number;

  constructor(
    chatId: number,
    botToken: string,
    userId: number,
    config?: Partial<StreamConfig>
  ) {
    this.botToken = botToken;
    this.userId = userId;
    this.config = {
      minUpdateInterval: 1000, // 1秒最小间隔
      maxMessageLength: 4096, // Telegram 最大消息长度
      ...config,
    };

    this.state = {
      messageId: null,
      chatId,
      currentText: "",
      lastSentText: "", // 初始化为空字符串
      lastUpdateTime: 0,
      isActive: false,
      isPaused: false,
    };

    // 初始化高级速率限制器
    this.rateLimiter = new AdvancedRateLimiter(this.config.rateLimitConfig);

    // 初始化错误恢复管理器
    this.errorRecoveryManager = new StreamErrorRecoveryManager(this.botToken);

    // 初始化状态管理器（使用全局实例）
    this.stateManager = globalStreamStateManager;
  }

  /**
   * 初始化流式响应
   */
  async initialize(metadata: SessionMetadata = {}): Promise<void> {
    this.state.isActive = true;
    this.state.currentText = "";
    this.state.messageId = null;
    this.state.lastUpdateTime = 0;
    this.updateQueue = [];

    // 创建新的流式会话
    const session = this.stateManager.createSession(
      this.state.chatId,
      this.userId,
      metadata
    );
    this.sessionId = session.sessionId;

    // 更新会话状态为活跃
    this.stateManager.updateSessionStatus(this.sessionId, SessionStatus.ACTIVE);

    console.log(
      `Stream handler initialized for chat ${this.state.chatId} with session ${this.sessionId}`
    );
  }

  /**
   * 处理流式数据块
   */
  async onStreamChunk(chunk: string): Promise<void> {
    if (!this.state.isActive || this.state.isPaused) {
      this.updateQueue.push(chunk);
      return;
    }

    // 记录数据块到状态管理器
    if (this.sessionId) {
      this.stateManager.recordChunk(this.sessionId, {
        chunk,
        timestamp: Date.now(),
      });
    }

    // 检查是否需要等待
    const now = Date.now();
    const timeSinceLastUpdate = now - this.state.lastUpdateTime;

    if (timeSinceLastUpdate < this.config.minUpdateInterval) {
      // 添加到队列，稍后处理（不要重复累积到 currentText）
      this.updateQueue.push(chunk);
      return;
    }

    // 只有在准备立即更新时才累积到 currentText
    this.state.currentText += chunk;

    try {
      await this.updateMessage();
    } catch (error) {
      console.error("Error updating stream:", error);
      // 如果更新失败，从 currentText 中移除这个 chunk，并添加到队列重试
      this.state.currentText = this.state.currentText.substring(
        0,
        this.state.currentText.length - chunk.length
      );
      this.updateQueue.push(chunk);
    }
  }

  /**
   * 完成流式响应
   */
  async finalize(finalText?: string): Promise<void> {
    // 更新会话状态为正在完成
    if (this.sessionId) {
      this.stateManager.updateSessionStatus(
        this.sessionId,
        SessionStatus.FINALIZING
      );
    }

    if (finalText) {
      // 如果提供了最终文本，直接使用（清除之前的累积）
      this.state.currentText = finalText;
      this.updateQueue = []; // 清空队列，避免重复处理
    } else {
      // 处理队列中的剩余更新
      await this.processUpdateQueue();
    }

    // 发送最终的完整消息（如果有内容且与上次不同）
    if (
      this.state.currentText &&
      this.state.currentText !== this.state.lastSentText
    ) {
      await this.updateMessage();
    } else {
      console.log("Final message content unchanged, skipping final update");
    }

    this.state.isActive = false;

    // 完成会话
    if (this.sessionId) {
      this.stateManager.updateSessionStatus(
        this.sessionId,
        SessionStatus.COMPLETED
      );

      // 添加最终消息版本
      if (this.state.currentText) {
        this.stateManager.addMessageVersion(
          this.sessionId,
          this.state.currentText,
          true,
          this.state.messageId || undefined
        );
      }
    }

    console.log(
      `Stream handler finalized for chat ${this.state.chatId} with session ${this.sessionId}`
    );
  }

  /**
   * 暂停流式更新
   */
  pause(): void {
    this.state.isPaused = true;

    // 更新会话状态
    if (this.sessionId) {
      this.stateManager.updateSessionStatus(
        this.sessionId,
        SessionStatus.PAUSED
      );
    }
  }

  /**
   * 恢复流式更新
   */
  async resume(): Promise<void> {
    this.state.isPaused = false;

    // 更新会话状态
    if (this.sessionId) {
      this.stateManager.updateSessionStatus(
        this.sessionId,
        SessionStatus.ACTIVE
      );
    }

    await this.processUpdateQueue();
  }

  /**
   * 停止流式更新
   */
  stop(): void {
    this.state.isActive = false;
    this.state.isPaused = false;
    this.updateQueue = [];
  }

  /**
   * 获取当前状态
   */
  getState(): Readonly<StreamState> {
    return { ...this.state };
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<StreamConfig> {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<StreamConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 处理队列中的更新
   */
  private async processUpdateQueue(): Promise<void> {
    while (this.updateQueue.length > 0) {
      // 一次处理一个 chunk，避免重复累积
      const chunk = this.updateQueue.shift()!;

      // 累积到 currentText
      this.state.currentText += chunk;

      try {
        await this.updateMessage();
        // 成功后更新时间戳，为下一个 chunk 做准备
        this.state.lastUpdateTime = Date.now();

        // 如果队列还有内容，稍微等待一下避免过于频繁的API调用
        if (this.updateQueue.length > 0) {
          await this.delay(this.config.minUpdateInterval);
        }
      } catch (error) {
        console.error("Error processing queued chunk:", error);
        // 如果失败，将这个 chunk 重新加入队列前端
        this.updateQueue.unshift(chunk);
        // 移除已累积的内容
        this.state.currentText = this.state.currentText.substring(
          0,
          this.state.currentText.length - chunk.length
        );
        break; // 停止处理，等待下次重试
      }
    }
  }

  /**
   * 更新 Telegram 消息（增强版，带错误恢复）
   */
  private async updateMessage(): Promise<void> {
    // 截断过长的消息
    let messageText = this.state.currentText;
    if (messageText.length > this.config.maxMessageLength) {
      // 🔧 优化：更智能的截断，尽量保留重要信息（如任务ID）
      const truncateLength = this.config.maxMessageLength - 15;

      // 尝试在合适的位置截断（如换行符）
      const truncatedAtNewline = messageText
        .substring(0, truncateLength)
        .lastIndexOf("\n");
      const cutPoint =
        truncatedAtNewline > truncateLength - 200
          ? truncatedAtNewline
          : truncateLength;

      messageText =
        messageText.substring(0, cutPoint) + "\n\n...(消息过长，已截断)";
    }

    // 应用 Telegram Markdown 格式转换
    messageText = MessageConverter.formatMarkdownForTelegram(messageText);

    // 检查是否需要更新 - 避免发送相同内容
    if (this.state.lastSentText === messageText) {
      console.log("Message content unchanged, skipping API call");
      return;
    }

    try {
      if (!this.state.messageId) {
        // 发送初始消息（高优先级）
        const response = await this.rateLimiter.execute(
          () => this.sendMessage(messageText),
          RequestPriority.HIGH
        );
        if (response?.message_id) {
          this.state.messageId = response.message_id;
          this.state.lastSentText = messageText; // 记录已发送的内容

          // 记录消息版本
          if (this.sessionId) {
            this.stateManager.addMessageVersion(
              this.sessionId,
              messageText,
              true,
              response.message_id
            );
          }
        }
      } else {
        // 更新现有消息（普通优先级）
        await this.rateLimiter.execute(
          () => this.editMessage(messageText),
          RequestPriority.NORMAL
        );
        this.state.lastSentText = messageText; // 记录已发送的内容

        // 记录消息版本
        if (this.sessionId) {
          this.stateManager.addMessageVersion(
            this.sessionId,
            messageText,
            true,
            this.state.messageId
          );
        }
      }

      this.state.lastUpdateTime = Date.now();

      // 重置错误恢复计数器（成功后）
      this.errorRecoveryManager.resetRetryCount(
        this.state.chatId,
        this.state.messageId !== null ? this.state.messageId : undefined
      );
    } catch (error) {
      console.error("Failed to update message, attempting recovery:", error);

      // 记录错误到状态管理器
      if (this.sessionId) {
        this.stateManager.recordError(this.sessionId, error as Error);
      }

      // 创建恢复上下文
      const recoveryContext: RecoveryContext = {
        chatId: this.state.chatId,
        messageId:
          this.state.messageId !== null ? this.state.messageId : undefined,
        currentText: messageText,
        lastSuccessfulText: this.state.lastSentText,
        retryCount: 0,
        operationType: this.state.messageId ? "edit" : "send",
      };

      // 尝试错误恢复
      const recoveryResult = await this.attemptErrorRecovery(
        error as Error,
        recoveryContext,
        messageText
      );

      // 记录重试
      if (this.sessionId && !recoveryResult.success) {
        this.stateManager.recordRetry(this.sessionId);
      }

      if (!recoveryResult.success) {
        console.error("Error recovery failed:", recoveryResult.errorMessage);
        throw new Error(
          `Message update and recovery failed: ${recoveryResult.errorMessage}`
        );
      } else if (recoveryResult.newMessageId) {
        // 如果创建了新消息，更新messageId
        this.state.messageId = recoveryResult.newMessageId;
        this.state.lastSentText = messageText;
        this.state.lastUpdateTime = Date.now();
        console.log(
          `Message recreated with new ID: ${recoveryResult.newMessageId}`
        );
      }
    }
  }

  /**
   * 发送新消息
   */
  private async sendMessage(text: string): Promise<TelegramMessage | null> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    // 尝试使用 Markdown，如果失败则使用纯文本
    try {
      const response = await this.makeApiRequest(url, {
        chat_id: this.state.chatId,
        text: text,
        parse_mode: "Markdown",
      });

      return response?.result || null;
    } catch (error) {
      console.warn("Markdown send failed, trying plain text:", error);
      // 如果 Markdown 失败，智能移除格式，保留内容
      const plainText = text
        .replace(/\*([^*]+)\*/g, "$1") // 移除粗体格式，保留内容
        .replace(/_([^_]+)_/g, "$1") // 移除斜体格式，保留内容
        .replace(/`([^`]+)`/g, "$1") // 移除代码格式，保留内容
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 移除链接格式，保留文本
        .replace(/[[\]()~>#+=|{}.!-]/g, ""); // 移除其他特殊字符

      const response = await this.makeApiRequest(url, {
        chat_id: this.state.chatId,
        text: plainText,
      });

      return response?.result || null;
    }
  }

  /**
   * 编辑现有消息
   */
  private async editMessage(text: string): Promise<void> {
    if (!this.state.messageId) return;

    const url = `https://api.telegram.org/bot${this.botToken}/editMessageText`;

    // 尝试使用 Markdown，如果失败则使用纯文本
    try {
      await this.makeApiRequest(url, {
        chat_id: this.state.chatId,
        message_id: this.state.messageId,
        text: text,
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.warn("Markdown edit failed, trying plain text:", error);
      // 如果 Markdown 失败，智能移除格式，保留内容
      const plainText = text
        .replace(/\*([^*]+)\*/g, "$1") // 移除粗体格式，保留内容
        .replace(/_([^_]+)_/g, "$1") // 移除斜体格式，保留内容
        .replace(/`([^`]+)`/g, "$1") // 移除代码格式，保留内容
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 移除链接格式，保留文本
        .replace(/[[\]()~>#+=|{}.!-]/g, ""); // 移除其他特殊字符

      await this.makeApiRequest(url, {
        chat_id: this.state.chatId,
        message_id: this.state.messageId,
        text: plainText,
      });
    }
  }

  /**
   * 进行 API 请求（简化版本，重试逻辑由速率限制器处理）
   */
  private async makeApiRequest(url: string, body: any): Promise<any> {
    console.log("Making API request:", {
      url: url.split("/").pop(),
      body: { ...body, text: body.text?.substring(0, 100) + "..." },
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API request failed:", {
        status: response.status,
        statusText: response.statusText,
        body: body,
        error: errorText,
      });
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as any;

    if (!data.ok) {
      console.error("Telegram API error:", {
        error_code: data.error_code,
        description: data.description,
        request_body: body,
      });
      throw new Error(
        `Telegram API error: ${data.description || "Unknown error"} (Code: ${data.error_code})`
      );
    }

    return data;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取最后一次发送的内容
   */
  // private getLastSentText(): string {
  //   return this.state.lastSentText;
  // }

  /**
   * 获取速率限制器指标
   */
  getRateLimitMetrics(): RateLimitMetrics {
    return this.rateLimiter.getMetrics();
  }

  /**
   * 获取队列状态
   */
  getQueueStatus() {
    return this.rateLimiter.getQueueStatus();
  }

  /**
   * 更新速率限制器配置
   */
  updateRateLimitConfig(config: Partial<RateLimitConfig>): void {
    // 创建新的速率限制器实例
    this.rateLimiter.dispose();
    this.rateLimiter = new AdvancedRateLimiter({
      ...this.config.rateLimitConfig,
      ...config,
    });
  }

  /**
   * 获取会话信息
   */
  getSessionInfo(): {
    sessionId: string | null;
    session: StreamSession | null;
    context: StreamContext | null;
  } {
    return {
      sessionId: this.sessionId,
      session: this.sessionId
        ? this.stateManager.getSession(this.sessionId)
        : null,
      context: this.sessionId
        ? this.stateManager.getContext(this.sessionId)
        : null,
    };
  }

  /**
   * 获取会话状态快照
   */
  getSessionSnapshot() {
    return this.sessionId
      ? this.stateManager.createSnapshot(this.sessionId)
      : null;
  }

  /**
   * 设置会话上下文数据
   */
  setSessionData(key: string, value: any): boolean {
    return this.sessionId
      ? this.stateManager.setContextData(this.sessionId, key, value)
      : false;
  }

  /**
   * 获取会话上下文数据
   */
  getSessionData(key: string): any {
    return this.sessionId
      ? this.stateManager.getContextData(this.sessionId, key)
      : undefined;
  }

  /**
   * 获取状态管理器指标
   */
  getStateMetrics() {
    return this.stateManager.getMetrics();
  }

  /**
   * 错误恢复处理
   */
  private async attemptErrorRecovery(
    error: Error,
    context: RecoveryContext,
    messageText: string
  ): Promise<RecoveryResult> {
    const sendMessageFn = async (text: string) => {
      return this.sendMessage(text);
    };

    const editMessageFn = async (text: string) => {
      return this.editMessage(text);
    };

    return this.errorRecoveryManager.handleStreamError(
      error,
      context,
      sendMessageFn,
      editMessageFn
    );
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stop();
    this.rateLimiter.dispose();
    console.log(`Stream handler disposed for chat ${this.state.chatId}`);
  }
}
