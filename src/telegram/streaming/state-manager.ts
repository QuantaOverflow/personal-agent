/**
 * 流式状态管理系统
 * 负责跟踪流式会话、消息状态和用户上下文
 */

export interface StreamSession {
  sessionId: string;
  chatId: number;
  userId: number;
  startTime: number;
  lastActivity: number;
  status: SessionStatus;
  messageId: number | null;
  parentMessageId?: number;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  userAgent?: string;
  platform?: string;
  language?: string;
  timezone?: string;
  [key: string]: any;
}

export enum SessionStatus {
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  PAUSED = 'paused',
  FINALIZING = 'finalizing',
  COMPLETED = 'completed',
  ERROR = 'error',
  TIMEOUT = 'timeout'
}

export interface MessageVersion {
  version: number;
  content: string;
  timestamp: number;
  byteLength: number;
  wordCount: number;
  sentToTelegram: boolean;
  telegramMessageId?: number;
  checksum: string;
}

export interface StreamContext {
  sessionId: string;
  messageVersions: MessageVersion[];
  currentVersion: number;
  totalChunks: number;
  processedChunks: number;
  errorCount: number;
  retryCount: number;
  lastCheckpoint: number;
  contextData: Record<string, any>;
}

export interface StateSnapshot {
  timestamp: number;
  sessionId: string;
  chatId: number;
  currentContent: string;
  messageId: number | null;
  status: SessionStatus;
  metrics: StreamMetrics;
}

export interface StreamMetrics {
  totalSessions: number;
  activeSessions: number;
  averageSessionDuration: number;
  totalMessages: number;
  totalChunks: number;
  errorRate: number;
  successRate: number;
  averageResponseTime: number;
}

export interface CleanupConfig {
  maxSessionAge: number; // 最大会话存活时间（毫秒）
  maxInactiveDuration: number; // 最大非活跃时间（毫秒）
  maxSessionsPerUser: number; // 每用户最大会话数
  enableAutoCleanup: boolean;
  cleanupInterval: number; // 清理间隔（毫秒）
}

/**
 * 流式状态管理器
 */
export class StreamStateManager {
  private sessions: Map<string, StreamSession> = new Map();
  private contexts: Map<string, StreamContext> = new Map();
  private userSessions: Map<number, Set<string>> = new Map();
  private cleanupConfig: CleanupConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private metrics: StreamMetrics;

  constructor(cleanupConfig?: Partial<CleanupConfig>) {
    this.cleanupConfig = {
      maxSessionAge: 30 * 60 * 1000, // 30分钟
      maxInactiveDuration: 5 * 60 * 1000, // 5分钟
      maxSessionsPerUser: 5,
      enableAutoCleanup: true,
      cleanupInterval: 60 * 1000, // 1分钟
      ...cleanupConfig
    };

    this.metrics = {
      totalSessions: 0,
      activeSessions: 0,
      averageSessionDuration: 0,
      totalMessages: 0,
      totalChunks: 0,
      errorRate: 0,
      successRate: 100,
      averageResponseTime: 0
    };

    // Note: 不在构造函数中启动自动清理，避免全局作用域中的异步操作
    // 自动清理将在第一次会话创建时启动
  }

  /**
   * 创建新的流式会话
   */
  createSession(
    chatId: number,
    userId: number,
    metadata: SessionMetadata = {}
  ): StreamSession {
    // 在首次创建会话时启动自动清理（避免全局作用域中的异步操作）
    if (this.cleanupConfig.enableAutoCleanup && !this.cleanupTimer) {
      this.startAutoCleanup();
    }
    
    const sessionId = this.generateSessionId(chatId, userId);
    
    // 检查用户会话数限制
    this.enforceUserSessionLimits(userId);

    const session: StreamSession = {
      sessionId,
      chatId,
      userId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      status: SessionStatus.INITIALIZING,
      messageId: null,
      metadata
    };

    // 初始化上下文
    const context: StreamContext = {
      sessionId,
      messageVersions: [],
      currentVersion: 0,
      totalChunks: 0,
      processedChunks: 0,
      errorCount: 0,
      retryCount: 0,
      lastCheckpoint: Date.now(),
      contextData: {}
    };

    this.sessions.set(sessionId, session);
    this.contexts.set(sessionId, context);

    // 维护用户会话映射
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    // 更新指标
    this.metrics.totalSessions++;
    this.updateActiveSessionsCount();

    console.log(`Created stream session ${sessionId} for chat ${chatId}`);
    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): StreamSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * 获取会话上下文
   */
  getContext(sessionId: string): StreamContext | null {
    return this.contexts.get(sessionId) || null;
  }

  /**
   * 更新会话状态
   */
  updateSessionStatus(sessionId: string, status: SessionStatus): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = status;
    session.lastActivity = Date.now();

    // 如果会话完成，更新指标
    if (status === SessionStatus.COMPLETED || status === SessionStatus.ERROR) {
      this.updateSessionMetrics(session);
    }

    return true;
  }

  /**
   * 添加消息版本
   */
  addMessageVersion(
    sessionId: string,
    content: string,
    sentToTelegram: boolean = false,
    telegramMessageId?: number
  ): MessageVersion | null {
    const context = this.contexts.get(sessionId);
    if (!context) return null;

    const version: MessageVersion = {
      version: context.currentVersion + 1,
      content,
      timestamp: Date.now(),
      byteLength: new TextEncoder().encode(content).length,
      wordCount: this.countWords(content),
      sentToTelegram,
      telegramMessageId,
      checksum: this.generateChecksum(content)
    };

    context.messageVersions.push(version);
    context.currentVersion = version.version;

    // 更新会话活动时间
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      if (telegramMessageId) {
        session.messageId = telegramMessageId;
      }
    }

    this.metrics.totalMessages++;
    return version;
  }

  /**
   * 记录流式数据块
   */
  recordChunk(sessionId: string, chunkData?: any): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    context.totalChunks++;
    context.processedChunks++;
    context.lastCheckpoint = Date.now();

    // 更新会话活动时间
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }

    this.metrics.totalChunks++;
    return true;
  }

  /**
   * 记录错误
   */
  recordError(sessionId: string, error: Error): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    context.errorCount++;
    
    // 更新会话状态和活动时间
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      if (context.errorCount > 3) {
        session.status = SessionStatus.ERROR;
      }
    }

    // 更新全局错误率
    this.updateErrorRate();
    return true;
  }

  /**
   * 记录重试
   */
  recordRetry(sessionId: string): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    context.retryCount++;
    
    // 更新会话活动时间
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }

    return true;
  }

  /**
   * 设置上下文数据
   */
  setContextData(sessionId: string, key: string, value: any): boolean {
    const context = this.contexts.get(sessionId);
    if (!context) return false;

    context.contextData[key] = value;
    return true;
  }

  /**
   * 获取上下文数据
   */
  getContextData(sessionId: string, key: string): any {
    const context = this.contexts.get(sessionId);
    return context?.contextData[key];
  }

  /**
   * 创建状态快照
   */
  createSnapshot(sessionId: string): StateSnapshot | null {
    const session = this.sessions.get(sessionId);
    const context = this.contexts.get(sessionId);
    
    if (!session || !context) return null;

    const latestVersion = context.messageVersions[context.messageVersions.length - 1];

    return {
      timestamp: Date.now(),
      sessionId,
      chatId: session.chatId,
      currentContent: latestVersion?.content || '',
      messageId: session.messageId,
      status: session.status,
      metrics: { ...this.metrics }
    };
  }

  /**
   * 获取用户的所有活跃会话
   */
  getUserSessions(userId: number): StreamSession[] {
    const sessionIds = this.userSessions.get(userId) || new Set();
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter(session => session && session.status !== SessionStatus.COMPLETED) as StreamSession[];
  }

  /**
   * 清理会话
   */
  cleanupSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // 从用户会话映射中移除
    const userSessionIds = this.userSessions.get(session.userId);
    if (userSessionIds) {
      userSessionIds.delete(sessionId);
      if (userSessionIds.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    // 删除会话和上下文
    this.sessions.delete(sessionId);
    this.contexts.delete(sessionId);

    this.updateActiveSessionsCount();
    console.log(`Cleaned up session ${sessionId}`);
    return true;
  }

  /**
   * 自动清理过期会话
   */
  performCleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const age = now - session.startTime;
      const inactiveDuration = now - session.lastActivity;

      const shouldCleanup = 
        age > this.cleanupConfig.maxSessionAge ||
        inactiveDuration > this.cleanupConfig.maxInactiveDuration ||
        (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.ERROR);

      if (shouldCleanup) {
        this.cleanupSession(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Auto cleanup: removed ${cleanedCount} sessions`);
    }

    return cleanedCount;
  }

  /**
   * 获取系统指标
   */
  getMetrics(): StreamMetrics {
    this.updateActiveSessionsCount();
    return { ...this.metrics };
  }

  /**
   * 获取会话统计
   */
  getSessionStats(): {
    total: number;
    active: number;
    byStatus: Record<SessionStatus, number>;
    byUser: Record<number, number>;
  } {
    const stats = {
      total: this.sessions.size,
      active: 0,
      byStatus: {} as Record<SessionStatus, number>,
      byUser: {} as Record<number, number>
    };

    // 初始化状态计数
    Object.values(SessionStatus).forEach(status => {
      stats.byStatus[status] = 0;
    });

    for (const session of this.sessions.values()) {
      // 按状态统计
      stats.byStatus[session.status]++;
      
      // 活跃会话统计
      if (session.status === SessionStatus.ACTIVE || session.status === SessionStatus.INITIALIZING) {
        stats.active++;
      }

      // 按用户统计
      stats.byUser[session.userId] = (stats.byUser[session.userId] || 0) + 1;
    }

    return stats;
  }

  /**
   * 销毁状态管理器
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // 清理所有会话
    const sessionIds = Array.from(this.sessions.keys());
    sessionIds.forEach(id => this.cleanupSession(id));

    console.log('StreamStateManager disposed');
  }

  // 私有方法

  private generateSessionId(chatId: number, userId: number): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    return `stream_${chatId}_${userId}_${timestamp}_${random}`;
  }

  private enforceUserSessionLimits(userId: number): void {
    const userSessionIds = this.userSessions.get(userId);
    if (!userSessionIds || userSessionIds.size < this.cleanupConfig.maxSessionsPerUser) {
      return;
    }

    // 找到最旧的会话并清理
    let oldestSession: StreamSession | null = null;
    let oldestSessionId = '';

    for (const sessionId of userSessionIds) {
      const session = this.sessions.get(sessionId);
      if (session && (!oldestSession || session.startTime < oldestSession.startTime)) {
        oldestSession = session;
        oldestSessionId = sessionId;
      }
    }

    if (oldestSessionId) {
      console.log(`Enforcing session limit: cleaning up oldest session ${oldestSessionId} for user ${userId}`);
      this.cleanupSession(oldestSessionId);
    }
  }

  private updateActiveSessionsCount(): void {
    let active = 0;
    for (const session of this.sessions.values()) {
      if (session.status === SessionStatus.ACTIVE || session.status === SessionStatus.INITIALIZING) {
        active++;
      }
    }
    this.metrics.activeSessions = active;
  }

  private updateSessionMetrics(session: StreamSession): void {
    const duration = Date.now() - session.startTime;
    
    // 更新平均会话时长
    const totalDuration = this.metrics.averageSessionDuration * (this.metrics.totalSessions - 1) + duration;
    this.metrics.averageSessionDuration = totalDuration / this.metrics.totalSessions;
  }

  private updateErrorRate(): void {
    let totalErrors = 0;
    let totalAttempts = 0;

    for (const context of this.contexts.values()) {
      totalErrors += context.errorCount;
      totalAttempts += context.totalChunks + context.errorCount;
    }

    if (totalAttempts > 0) {
      this.metrics.errorRate = (totalErrors / totalAttempts) * 100;
      this.metrics.successRate = 100 - this.metrics.errorRate;
    }
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  private generateChecksum(content: string): string {
    // 简单的校验和生成（实际应用中可以使用更强的哈希算法）
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(16);
  }

  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.cleanupConfig.cleanupInterval);
  }
}

/**
 * 全局状态管理器实例
 */
export const globalStreamStateManager = new StreamStateManager(); 