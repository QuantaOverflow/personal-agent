// Core components
export { TelegramBot } from "./core/bot";
export { TelegramStreamHandler } from "./streaming/handler";

// Message handling and conversion
export { MessageConverter } from "./messaging/converter";
export { ResponseFormatter } from "./messaging/formatters/base";

// UI and presentation
export { TelegramUIManager } from "./infrastructure/ui-manager";

// State and error management
export { StreamStateManager as TelegramStreamStateManager } from "./streaming/state-manager";
export { StreamErrorRecoveryManager as TelegramErrorRecoveryManager } from "./streaming/error-recovery";

// Rate limiting
export { AdvancedRateLimiter as TelegramRateLimiter } from "./infrastructure/rate-limiter";

// Main handler
export { handleTelegramWebhook } from "./core/handlers";

// Core types
export type {
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramUser,
  TelegramChat,
  AgentMessage,
  ToolCall,
  TelegramToolConfirmation,
} from "./types";

// Core classes and utilities
export type { StreamConfig, StreamState } from "./streaming/handler";

// Advanced rate limiting system
export {
  TokenBucket,
  RateLimitMonitor,
  BackoffStrategy,
  RequestPriority,
} from "./infrastructure/rate-limiter";
export type {
  RateLimitConfig,
  RateLimitMetrics,
  QueuedRequest,
} from "./infrastructure/rate-limiter";

// Error recovery system
export {
  TelegramErrorAnalyzer,
  ErrorRecoveryExecutor,
  TelegramErrorType,
  RecoveryStrategy,
} from "./streaming/error-recovery";
export type {
  ErrorAnalysis,
  RecoveryContext,
  RecoveryResult,
} from "./streaming/error-recovery";

// Stream state management system
export {
  SessionStatus,
  globalStreamStateManager,
} from "./streaming/state-manager";
export type {
  StreamSession,
  StreamContext,
  SessionMetadata,
  MessageVersion,
  StateSnapshot,
  StreamMetrics,
  CleanupConfig,
} from "./streaming/state-manager";

// Stream demo functions
export {
  demonstrateStreamingResponse,
  simulateAIStreamingResponse,
  demonstrateErrorRecovery,
  getStreamStatus,
  updateStreamConfig,
} from "./utils/demo";

// Command and message handling
export { handleCommand } from "./messaging/commands";

// Validation
export { validateTelegramRequest } from "./core/validation";

// Formatters
export {
  BaseFormatter,
  UnifiedResultFormatter,
  ScheduleFormatter,
  TelegramScheduleFormatter,
} from "./messaging/formatters";

// Backward compatibility exports
/** @deprecated Use TelegramUIManager instead */
export { ToolConfirmationManager } from "./infrastructure/ui-manager";

// Re-export main webhook handler as default export for convenience
export { handleTelegramWebhook as default } from "./core/handlers";
