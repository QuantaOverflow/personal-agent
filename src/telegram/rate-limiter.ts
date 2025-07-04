/**
 * 高级速率限制系统
 * 实现令牌桶算法、优先级队列、监控和动态退避策略
 */

export interface RateLimitMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  queueSize: number;
  tokensAvailable: number;
  lastThrottleTime: number;
  burstCount: number;
}

export interface RateLimitConfig {
  /** 令牌桶容量（最大突发请求数） */
  bucketCapacity: number;
  /** 令牌补充速率（每秒补充的令牌数） */
  refillRate: number;
  /** 最大队列大小 */
  maxQueueSize: number;
  /** 基础退避延迟（毫秒） */
  baseBackoffDelay: number;
  /** 最大退避延迟（毫秒） */
  maxBackoffDelay: number;
  /** 监控窗口大小（秒） */
  monitoringWindow: number;
}

export enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3,
}

export interface QueuedRequest {
  id: string;
  priority: RequestPriority;
  timestamp: number;
  retryCount: number;
  data: any;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

/**
 * 令牌桶算法实现
 */
export class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.tokens = config.bucketCapacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * 尝试消费令牌
   */
  consume(count: number = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * 获取可用令牌数
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * 计算下次令牌可用时间
   */
  getNextTokenTime(requiredTokens: number = 1): number {
    this.refill();

    if (this.tokens >= requiredTokens) {
      return 0;
    }

    const tokensNeeded = requiredTokens - this.tokens;
    return Math.ceil(tokensNeeded / this.config.refillRate) * 1000;
  }

  /**
   * 补充令牌
   */
  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefillTime) / 1000;

    if (timePassed > 0) {
      const tokensToAdd = timePassed * this.config.refillRate;
      this.tokens = Math.min(
        this.config.bucketCapacity,
        this.tokens + tokensToAdd
      );
      this.lastRefillTime = now;
    }
  }

  /**
   * 重置令牌桶
   */
  reset(): void {
    this.tokens = this.config.bucketCapacity;
    this.lastRefillTime = Date.now();
  }
}

/**
 * 速率限制监控器
 */
export class RateLimitMonitor {
  private metrics: RateLimitMetrics;
  private latencyHistory: number[] = [];
  private requestTimestamps: number[] = [];
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      queueSize: 0,
      tokensAvailable: 0,
      lastThrottleTime: 0,
      burstCount: 0,
    };
  }

  /**
   * 记录请求开始
   */
  recordRequestStart(): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.metrics.totalRequests++;
    this.requestTimestamps.push(Date.now());
    this.cleanOldTimestamps();
    return requestId;
  }

  /**
   * 记录请求成功
   */
  recordRequestSuccess(requestId: string, latency: number): void {
    this.metrics.successfulRequests++;
    this.recordLatency(latency);
  }

  /**
   * 记录请求失败
   */
  recordRequestFailure(requestId: string, error: Error): void {
    this.metrics.failedRequests++;
  }

  /**
   * 记录节流事件
   */
  recordThrottle(tokensAvailable: number): void {
    this.metrics.lastThrottleTime = Date.now();
    this.metrics.tokensAvailable = tokensAvailable;
  }

  /**
   * 记录突发计数
   */
  recordBurst(): void {
    this.metrics.burstCount++;
  }

  /**
   * 更新队列大小
   */
  updateQueueSize(size: number): void {
    this.metrics.queueSize = size;
  }

  /**
   * 获取当前指标
   */
  getMetrics(): RateLimitMetrics {
    this.updateAverageLatency();
    return { ...this.metrics };
  }

  /**
   * 获取请求速率（每秒）
   */
  getRequestRate(): number {
    const now = Date.now();
    const windowStart = now - this.config.monitoringWindow * 1000;
    const recentRequests = this.requestTimestamps.filter(
      (ts) => ts >= windowStart
    );
    return recentRequests.length / this.config.monitoringWindow;
  }

  /**
   * 记录延迟
   */
  private recordLatency(latency: number): void {
    this.latencyHistory.push(latency);

    // 保持延迟历史在合理大小
    if (this.latencyHistory.length > 100) {
      this.latencyHistory = this.latencyHistory.slice(-50);
    }
  }

  /**
   * 更新平均延迟
   */
  private updateAverageLatency(): void {
    if (this.latencyHistory.length > 0) {
      const sum = this.latencyHistory.reduce((a, b) => a + b, 0);
      this.metrics.averageLatency = sum / this.latencyHistory.length;
    }
  }

  /**
   * 清理旧的时间戳
   */
  private cleanOldTimestamps(): void {
    const now = Date.now();
    const windowStart = now - this.config.monitoringWindow * 1000;
    this.requestTimestamps = this.requestTimestamps.filter(
      (ts) => ts >= windowStart
    );
  }

  /**
   * 重置指标
   */
  reset(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      queueSize: 0,
      tokensAvailable: 0,
      lastThrottleTime: 0,
      burstCount: 0,
    };
    this.latencyHistory = [];
    this.requestTimestamps = [];
  }
}

/**
 * 动态退避策略
 */
export class BackoffStrategy {
  private consecutiveFailures: number = 0;
  // private _lastFailureTime: number = 0;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * 计算退避延迟
   */
  calculateDelay(error?: Error): number {
    // 根据错误类型调整策略
    let multiplier = 1;
    if (error) {
      multiplier = this.getErrorMultiplier(error);
    }

    // 指数退避
    const exponentialDelay = Math.min(
      this.config.baseBackoffDelay * Math.pow(2, this.consecutiveFailures),
      this.config.maxBackoffDelay
    );

    // 添加抖动以避免雷群效应
    const jitter = Math.random() * 0.3 + 0.85; // 85% - 115%

    return Math.floor(exponentialDelay * multiplier * jitter);
  }

  /**
   * 记录成功
   */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * 记录失败
   */
  recordFailure(error?: Error): void {
    this.consecutiveFailures++;
    // this._lastFailureTime = Date.now();
  }

  /**
   * 获取错误类型的倍数
   */
  private getErrorMultiplier(error: Error): number {
    const message = error.message.toLowerCase();

    if (
      message.includes("rate limit") ||
      message.includes("too many requests")
    ) {
      return 2.0; // 速率限制错误，更长退避
    }

    if (message.includes("timeout")) {
      return 1.5; // 超时错误，适中退避
    }

    if (
      message.includes("server error") ||
      message.includes("internal error")
    ) {
      return 1.2; // 服务器错误，轻微退避
    }

    return 1.0; // 默认倍数
  }

  /**
   * 重置退避状态
   */
  reset(): void {
    this.consecutiveFailures = 0;
    // this._lastFailureTime = 0;
  }
}

/**
 * 高级速率限制器
 */
export class AdvancedRateLimiter {
  private tokenBucket: TokenBucket;
  private monitor: RateLimitMonitor;
  private backoffStrategy: BackoffStrategy;
  private requestQueue: QueuedRequest[] = [];
  private processing: boolean = false;
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      bucketCapacity: 30, // Telegram限制：每分钟30条消息
      refillRate: 0.5, // 每秒0.5个令牌 (30/60)
      maxQueueSize: 100,
      baseBackoffDelay: 1000,
      maxBackoffDelay: 30000,
      monitoringWindow: 60,
      ...config,
    };

    this.tokenBucket = new TokenBucket(this.config);
    this.monitor = new RateLimitMonitor(this.config);
    this.backoffStrategy = new BackoffStrategy(this.config);
  }

  /**
   * 执行受速率限制的请求
   */
  async execute<T>(
    request: () => Promise<T>,
    priority: RequestPriority = RequestPriority.NORMAL,
    retryCount: number = 0
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        priority,
        timestamp: Date.now(),
        retryCount,
        data: request,
        resolve,
        reject,
      };

      this.enqueueRequest(queuedRequest);
      this.processQueue();
    });
  }

  /**
   * 将请求加入队列
   */
  private enqueueRequest(request: QueuedRequest): void {
    if (this.requestQueue.length >= this.config.maxQueueSize) {
      request.reject(new Error("Request queue is full"));
      return;
    }

    // 按优先级插入
    let insertIndex = this.requestQueue.length;
    for (let i = 0; i < this.requestQueue.length; i++) {
      if (this.requestQueue[i].priority < request.priority) {
        insertIndex = i;
        break;
      }
    }

    this.requestQueue.splice(insertIndex, 0, request);
    this.monitor.updateQueueSize(this.requestQueue.length);
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()!;
      this.monitor.updateQueueSize(this.requestQueue.length);

      try {
        await this.executeRequest(request);
      } catch (error) {
        console.error("Error processing request:", error);
      }
    }

    this.processing = false;
  }

  /**
   * 执行单个请求
   */
  private async executeRequest(request: QueuedRequest): Promise<void> {
    // 检查令牌可用性
    if (!this.tokenBucket.consume(1)) {
      const waitTime = this.tokenBucket.getNextTokenTime(1);

      if (waitTime > 0) {
        this.monitor.recordThrottle(this.tokenBucket.getAvailableTokens());
        await this.delay(waitTime);
      }
    }

    const requestId = this.monitor.recordRequestStart();
    const startTime = Date.now();

    try {
      const result = await request.data();
      const latency = Date.now() - startTime;

      this.monitor.recordRequestSuccess(requestId, latency);
      this.backoffStrategy.recordSuccess();
      request.resolve(result);
    } catch (error) {
      this.monitor.recordRequestFailure(requestId, error as Error);
      this.backoffStrategy.recordFailure(error as Error);

      // 重试逻辑
      if (request.retryCount < 3 && this.shouldRetry(error as Error)) {
        const delay = this.backoffStrategy.calculateDelay(error as Error);
        await this.delay(delay);

        request.retryCount++;
        this.enqueueRequest(request);
      } else {
        request.reject(error as Error);
      }
    }
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: Error): boolean {
    const message = error.message.toLowerCase();

    // 这些错误应该重试
    return (
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("server error") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("504")
    );
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取监控指标
   */
  getMetrics(): RateLimitMetrics {
    const metrics = this.monitor.getMetrics();
    metrics.tokensAvailable = this.tokenBucket.getAvailableTokens();
    return metrics;
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): {
    size: number;
    pending: number;
    priorityDistribution: Record<RequestPriority, number>;
  } {
    const priorityDistribution: Record<RequestPriority, number> = {
      [RequestPriority.LOW]: 0,
      [RequestPriority.NORMAL]: 0,
      [RequestPriority.HIGH]: 0,
      [RequestPriority.URGENT]: 0,
    };

    this.requestQueue.forEach((req) => {
      priorityDistribution[req.priority]++;
    });

    return {
      size: this.requestQueue.length,
      pending: this.processing ? 1 : 0,
      priorityDistribution,
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.requestQueue.forEach((req) => {
      req.reject(new Error("Rate limiter disposed"));
    });
    this.requestQueue = [];
    this.monitor.reset();
    this.backoffStrategy.reset();
    this.tokenBucket.reset();
  }
}
