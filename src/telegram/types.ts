/**
 * Telegram Bot API types and interfaces
 */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  edited_channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  sender_chat?: TelegramChat;
  date: number;
  chat: TelegramChat;
  forward_origin?: any;
  reply_to_message?: TelegramMessage;
  edit_date?: number;
  text?: string;
  entities?: TelegramMessageEntity[];
  // Add more fields as needed
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  inline_message_id?: string;
  chat_instance: string;
  data?: string;
  game_short_name?: string;
}

export interface TelegramMessageEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TelegramUser;
  language?: string;
}

/**
 * Internal agent message format compatible with AI SDK
 */
export interface AgentMessage {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    id: string;
    result: unknown;
  }>;
  createdAt?: Date;
}

/**
 * Enhanced conversion context for better handling
 */
export interface ConversionContext {
  chatId: number;
  userId: number;
  messageId?: number;
  username?: string;
  firstName?: string;
  timestamp: Date;
}

/**
 * Tool confirmation system interfaces
 */
export interface ToolConfirmation {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
  chatId: number;
  userId: number;
  messageId?: number;
  timestamp: Date;
  expiresAt: Date;
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Tool confirmation state (UI-only, no execution logic)
 */
export interface TelegramToolConfirmation {
  id: string;
  toolName: string;
  parameters: Record<string, unknown>;
  chatId: number;
  userId: number;
  messageId?: number;
  timestamp: Date;
  expiresAt: Date;
  // No execution state - that belongs to Agent layer
}

/**
 * Agent-Telegram Communication Bridge
 * Defines the interface for communication between Agent and Telegram layers
 */
export interface AgentTelegramBridge {
  /**
   * Request tool confirmation from user via Telegram UI
   * Returns a promise that resolves to true if confirmed, false if denied
   */
  requestToolConfirmation(
    chatId: number,
    userId: number,
    toolCall: ToolCall,
    agentSessionId?: string
  ): Promise<boolean>;

  /**
   * Handle user's confirmation callback from Telegram
   * Returns true if the callback was handled, false otherwise
   */
  handleConfirmationCallback(
    callbackData: string,
    userId: number
  ): Promise<boolean>;

  // Legacy methods for compatibility - should not be used in new architecture
  onToolConfirmation(
    confirmationId: string,
    approved: boolean,
    chatId: number
  ): Promise<void>;

  displayToolResult(
    chatId: number,
    toolName: string,
    result: any,
    success: boolean
  ): Promise<void>;

  updateToolStatus(
    chatId: number,
    messageId: number,
    status: "executing" | "completed" | "failed" | "cancelled"
  ): Promise<void>;
}
