/**
 * Telegram 错误恢复系统
 * 专门处理流式响应中的各种错误情况
 */

export enum TelegramErrorType {
  RATE_LIMIT = 'rate_limit',
  MESSAGE_TOO_OLD = 'message_too_old',
  MESSAGE_DELETED = 'message_deleted',
  PERMISSION_DENIED = 'permission_denied',
  BOT_BLOCKED = 'bot_blocked',
  CHAT_NOT_FOUND = 'chat_not_found',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  SERVER_ERROR = 'server_error',
  PARSE_ERROR = 'parse_error',
  UNKNOWN = 'unknown'
}

export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  SKIP = 'skip',
  ABORT = 'abort',
  RECREATE_MESSAGE = 'recreate_message'
}

export interface ErrorAnalysis {
  type: TelegramErrorType;
  isRetryable: boolean;
  maxRetries: number;
  strategy: RecoveryStrategy;
  backoffMultiplier: number;
  gracefulDegradation?: string;
}

export interface RecoveryContext {
  chatId: number;
  messageId?: number;
  currentText: string;
  lastSuccessfulText: string;
  retryCount: number;
  operationType: 'send' | 'edit';
}

export interface RecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  fallbackUsed: boolean;
  newMessageId?: number;
  errorMessage?: string;
}

/**
 * Telegram API 错误分析器
 */
export class TelegramErrorAnalyzer {
  /**
   * 分析错误并确定恢复策略
   */
  static analyzeError(error: Error): ErrorAnalysis {
    const message = error.message.toLowerCase();

    // Rate limiting errors
    if (message.includes('rate limit') || message.includes('too many requests') || message.includes('429')) {
      return {
        type: TelegramErrorType.RATE_LIMIT,
        isRetryable: true,
        maxRetries: 5,
        strategy: RecoveryStrategy.RETRY,
        backoffMultiplier: 2.0
      };
    }

    // Message too old to edit
    if (message.includes('message is not modified') || 
        message.includes('message to edit not found') ||
        message.includes('message_id_invalid')) {
      return {
        type: TelegramErrorType.MESSAGE_TOO_OLD,
        isRetryable: false,
        maxRetries: 0,
        strategy: RecoveryStrategy.RECREATE_MESSAGE,
        backoffMultiplier: 1.0,
        gracefulDegradation: '消息已过期，将发送新消息'
      };
    }

    // Message deleted by user
    if (message.includes('message to delete not found') ||
        message.includes('message was deleted')) {
      return {
        type: TelegramErrorType.MESSAGE_DELETED,
        isRetryable: false,
        maxRetries: 0,
        strategy: RecoveryStrategy.RECREATE_MESSAGE,
        backoffMultiplier: 1.0,
        gracefulDegradation: '消息已被删除，将发送新消息'
      };
    }

    // Permission errors
    if (message.includes('forbidden') || 
        message.includes('not enough rights') ||
        message.includes('chat member status')) {
      return {
        type: TelegramErrorType.PERMISSION_DENIED,
        isRetryable: false,
        maxRetries: 0,
        strategy: RecoveryStrategy.ABORT,
        backoffMultiplier: 1.0,
        gracefulDegradation: '权限不足，无法编辑消息'
      };
    }

    // Bot blocked by user
    if (message.includes('bot was blocked') || 
        message.includes('user is deactivated') ||
        message.includes('chat not found')) {
      return {
        type: TelegramErrorType.BOT_BLOCKED,
        isRetryable: false,
        maxRetries: 0,
        strategy: RecoveryStrategy.ABORT,
        backoffMultiplier: 1.0,
        gracefulDegradation: '用户已阻止机器人或聊天不存在'
      };
    }

    // Network/timeout errors
    if (message.includes('timeout') || 
        message.includes('network') ||
        message.includes('connection')) {
      return {
        type: TelegramErrorType.NETWORK_ERROR,
        isRetryable: true,
        maxRetries: 3,
        strategy: RecoveryStrategy.RETRY,
        backoffMultiplier: 1.5
      };
    }

    // Server errors
    if (message.includes('500') || 
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504') ||
        message.includes('internal server error')) {
      return {
        type: TelegramErrorType.SERVER_ERROR,
        isRetryable: true,
        maxRetries: 3,
        strategy: RecoveryStrategy.RETRY,
        backoffMultiplier: 1.2
      };
    }

    // Parse/formatting errors
    if (message.includes('parse_mode') || 
        message.includes('bad request') ||
        message.includes('can\'t parse')) {
      return {
        type: TelegramErrorType.PARSE_ERROR,
        isRetryable: true,
        maxRetries: 1,
        strategy: RecoveryStrategy.FALLBACK,
        backoffMultiplier: 1.0,
        gracefulDegradation: '格式化失败，使用纯文本'
      };
    }

    // Unknown error - be conservative
    return {
      type: TelegramErrorType.UNKNOWN,
      isRetryable: true,
      maxRetries: 2,
      strategy: RecoveryStrategy.RETRY,
      backoffMultiplier: 1.5
    };
  }
}

/**
 * 错误恢复执行器
 */
export class ErrorRecoveryExecutor {
  private botToken: string;

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  /**
   * 执行错误恢复策略
   */
  async executeRecovery(
    error: Error,
    context: RecoveryContext,
    sendMessageFn: (text: string) => Promise<any>,
    editMessageFn: (text: string) => Promise<void>
  ): Promise<RecoveryResult> {
    const analysis = TelegramErrorAnalyzer.analyzeError(error);
    
    console.log(`Executing recovery strategy: ${analysis.strategy} for error: ${analysis.type}`);

    switch (analysis.strategy) {
      case RecoveryStrategy.RETRY:
        return this.executeRetryStrategy(context, editMessageFn, analysis);

      case RecoveryStrategy.FALLBACK:
        return this.executeFallbackStrategy(context, editMessageFn, analysis);

      case RecoveryStrategy.RECREATE_MESSAGE:
        return this.executeRecreateStrategy(context, sendMessageFn, analysis);

      case RecoveryStrategy.SKIP:
        return this.executeSkipStrategy(analysis);

      case RecoveryStrategy.ABORT:
        return this.executeAbortStrategy(analysis);

      default:
        return {
          success: false,
          strategy: analysis.strategy,
          fallbackUsed: false,
          errorMessage: `Unknown recovery strategy: ${analysis.strategy}`
        };
    }
  }

  /**
   * 重试策略
   */
  private async executeRetryStrategy(
    context: RecoveryContext,
    editMessageFn: (text: string) => Promise<void>,
    analysis: ErrorAnalysis
  ): Promise<RecoveryResult> {
    if (context.retryCount >= analysis.maxRetries) {
      return {
        success: false,
        strategy: RecoveryStrategy.RETRY,
        fallbackUsed: false,
        errorMessage: `Maximum retries (${analysis.maxRetries}) exceeded`
      };
    }

    // 计算退避延迟
    const baseDelay = 1000; // 1秒基础延迟
    const delay = baseDelay * Math.pow(analysis.backoffMultiplier, context.retryCount);
    
    console.log(`Retrying in ${delay}ms (attempt ${context.retryCount + 1}/${analysis.maxRetries})`);
    await this.delay(delay);

    try {
      await editMessageFn(context.currentText);
      return {
        success: true,
        strategy: RecoveryStrategy.RETRY,
        fallbackUsed: false
      };
         } catch (retryError) {
       const errorMessage = retryError instanceof Error ? retryError.message : String(retryError);
       return {
         success: false,
         strategy: RecoveryStrategy.RETRY,
         fallbackUsed: false,
         errorMessage: `Retry failed: ${errorMessage}`
       };
     }
  }

  /**
   * 降级策略 - 使用纯文本重试
   */
  private async executeFallbackStrategy(
    context: RecoveryContext,
    editMessageFn: (text: string) => Promise<void>,
    analysis: ErrorAnalysis
  ): Promise<RecoveryResult> {
    try {
      // 移除Markdown格式，使用纯文本
      const plainText = this.stripMarkdown(context.currentText);
      
      // 尝试用纯文本编辑消息
      const plainEditFn = this.createPlainTextEditFunction(context.chatId, context.messageId!);
      await plainEditFn(plainText);

      return {
        success: true,
        strategy: RecoveryStrategy.FALLBACK,
        fallbackUsed: true
      };
         } catch (fallbackError) {
       const errorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
       return {
         success: false,
         strategy: RecoveryStrategy.FALLBACK,
         fallbackUsed: true,
         errorMessage: `Fallback failed: ${errorMessage}`
       };
     }
  }

  /**
   * 重新创建消息策略
   */
  private async executeRecreateStrategy(
    context: RecoveryContext,
    sendMessageFn: (text: string) => Promise<any>,
    analysis: ErrorAnalysis
  ): Promise<RecoveryResult> {
    try {
      const response = await sendMessageFn(context.currentText);
      
      return {
        success: true,
        strategy: RecoveryStrategy.RECREATE_MESSAGE,
        fallbackUsed: false,
        newMessageId: response?.message_id
      };
    } catch (recreateError) {
      const errorMessage = recreateError instanceof Error ? recreateError.message : String(recreateError);
      return {
        success: false,
        strategy: RecoveryStrategy.RECREATE_MESSAGE,
        fallbackUsed: false,
        errorMessage: `Message recreation failed: ${errorMessage}`
      };
    }
  }

  /**
   * 跳过策略
   */
  private executeSkipStrategy(analysis: ErrorAnalysis): RecoveryResult {
    console.log(`Skipping update due to: ${analysis.gracefulDegradation || 'error condition'}`);
    
    return {
      success: true,
      strategy: RecoveryStrategy.SKIP,
      fallbackUsed: false
    };
  }

  /**
   * 中止策略
   */
  private executeAbortStrategy(analysis: ErrorAnalysis): RecoveryResult {
    console.log(`Aborting stream due to: ${analysis.gracefulDegradation || 'unrecoverable error'}`);
    
    return {
      success: false,
      strategy: RecoveryStrategy.ABORT,
      fallbackUsed: false,
      errorMessage: analysis.gracefulDegradation || 'Stream aborted due to unrecoverable error'
    };
  }

  /**
   * 移除Markdown格式
   */
  private stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
      .replace(/\*(.*?)\*/g, '$1')      // Italic
      .replace(/`(.*?)`/g, '$1')        // Code
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
      .replace(/_{2}(.*?)_{2}/g, '$1')  // Underline
      .replace(/~(.*?)~/g, '$1')        // Strikethrough
      .replace(/```[\s\S]*?```/g, (match) => {
        // Code blocks - keep content but remove formatting
        return match.replace(/```[\w]*\n?/g, '').replace(/```/g, '');
      });
  }

  /**
   * 创建纯文本编辑函数
   */
  private createPlainTextEditFunction(chatId: number, messageId: number) {
    return async (text: string): Promise<void> => {
      const url = `https://api.telegram.org/bot${this.botToken}/editMessageText`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: text
          // 注意：没有 parse_mode
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Plain text edit failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as any;
      if (!data.ok) {
        throw new Error(`Telegram API error: ${data.description || 'Unknown error'} (Code: ${data.error_code})`);
      }
    };
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 流式响应错误恢复管理器
 */
export class StreamErrorRecoveryManager {
  private executor: ErrorRecoveryExecutor;
  private recoveryAttempts: Map<string, number> = new Map();

  constructor(botToken: string) {
    this.executor = new ErrorRecoveryExecutor(botToken);
  }

  /**
   * 处理流式响应错误
   */
  async handleStreamError(
    error: Error,
    context: RecoveryContext,
    sendMessageFn: (text: string) => Promise<any>,
    editMessageFn: (text: string) => Promise<void>
  ): Promise<RecoveryResult> {
    const contextKey = `${context.chatId}-${context.messageId || 'new'}`;
    const currentAttempts = this.recoveryAttempts.get(contextKey) || 0;
    
    // 更新重试计数
    context.retryCount = currentAttempts;
    this.recoveryAttempts.set(contextKey, currentAttempts + 1);

    try {
      const result = await this.executor.executeRecovery(
        error,
        context,
        sendMessageFn,
        editMessageFn
      );

      // 如果成功，重置重试计数
      if (result.success) {
        this.recoveryAttempts.delete(contextKey);
      }

      return result;
    } catch (recoveryError) {
      const errorMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
      console.error('Recovery execution failed:', recoveryError);
      
      return {
        success: false,
        strategy: RecoveryStrategy.ABORT,
        fallbackUsed: false,
        errorMessage: `Recovery execution failed: ${errorMessage}`
      };
    }
  }

  /**
   * 重置特定上下文的重试计数
   */
  resetRetryCount(chatId: number, messageId?: number): void {
    const contextKey = `${chatId}-${messageId || 'new'}`;
    this.recoveryAttempts.delete(contextKey);
  }

  /**
   * 清理所有重试计数
   */
  clearAllRetryCounters(): void {
    this.recoveryAttempts.clear();
  }

  /**
   * 获取恢复统计
   */
  getRecoveryStats(): { activeContexts: number; totalAttempts: number } {
    const totalAttempts = Array.from(this.recoveryAttempts.values())
      .reduce((sum, attempts) => sum + attempts, 0);
    
    return {
      activeContexts: this.recoveryAttempts.size,
      totalAttempts
    };
  }
} 