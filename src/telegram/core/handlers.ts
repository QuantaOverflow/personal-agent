import { TelegramBot } from "./bot";
import { MessageConverter } from "../messaging/converter";
import { handleCommand } from "../messaging/commands";
import { validateTelegramRequest } from "./validation";
import type {
  TelegramUpdate,
  TelegramMessage,
  TelegramCallbackQuery,
} from "../types";
import type { Env } from "../../server";

/**
 * Main webhook handler for Telegram updates
 */
export async function handleTelegramWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Validate the request comes from Telegram
    const validationResult = await validateTelegramRequest(request, env);
    if (!validationResult.isValid) {
      console.warn("Invalid Telegram request:", validationResult.reason);
      return new Response("Forbidden", { status: 403 });
    }

    // Log the incoming request for debugging
    console.log("Received valid Telegram webhook request");

    // Parse the JSON payload
    const update: TelegramUpdate = await request.json();
    console.log("Parsed update:", JSON.stringify(update, null, 2));

    // Create bot instance
    const bot = new TelegramBot(env.TELEGRAM_BOT_TOKEN);

    // Process different types of updates
    if (update.message) {
      console.log("Processing regular message update");
      await handleMessage(update.message, bot, env);
    } else if (update.edited_message) {
      console.log("Processing edited message update");
      await handleEditedMessage(update.edited_message, bot);
    } else if (update.channel_post) {
      console.log("Processing channel post update");
      await handleChannelPost(update.channel_post, bot);
    } else if (update.edited_channel_post) {
      console.log("Processing edited channel post update");
      await handleEditedChannelPost(update.edited_channel_post, bot);
    } else if (update.callback_query) {
      console.log("Processing callback query update");
      await handleCallbackQuery(update.callback_query, bot, env);
    } else {
      console.log(
        "Unhandled update type. Available fields:",
        Object.keys(update)
      );
      console.log("Update details:", JSON.stringify(update, null, 2));
    }

    // Always return OK to acknowledge receipt
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing Telegram webhook:", error);

    // Return 500 to signal error to Telegram
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * Process a Telegram message through the AI agent pipeline
 */
async function processAgentMessage(
  message: TelegramMessage,
  bot: TelegramBot,
  env: Env
): Promise<void> {
  // 所有消息都通过agent来处理，而不是直接在telegram context中执行
  await processAgentMessageThroughDO(message, bot, env);
}

// 全局变量用于跟踪最近的响应，防止重复
const recentResponses = new Map<
  number,
  { content: string; timestamp: number }
>();

/**
 * Process message through Durable Object agent context
 */
async function processAgentMessageThroughDO(
  message: TelegramMessage,
  bot: TelegramBot,
  env: Env
): Promise<void> {
  // 检查是否是重复消息（5秒内相同内容）
  const chatId = message.chat.id;
  const now = Date.now();
  const recent = recentResponses.get(chatId);

  // 🔧 添加日志：记录消息处理开始
  console.log("🔧🔧🔧 [PROCESS_MESSAGE] 开始处理Telegram消息:", {
    chatId,
    userId: message.from?.id || 0,
    messageId: message.message_id,
    messageText: message.text?.substring(0, 100) + (message.text && message.text.length > 100 ? '...' : ''),
    timestamp: new Date().toISOString(),
    isDuplicate: recent && now - recent.timestamp < 5000 && recent.content === message.text,
  });

  if (
    recent &&
    now - recent.timestamp < 5000 &&
    recent.content === message.text
  ) {
    console.log("Ignoring duplicate message within 5 seconds");
    return;
  }

  try {
    // Convert Telegram message to internal agent format
    const agentMessage = MessageConverter.telegramToAgentMessage(message);
    console.log("Converted to agent message:", agentMessage);

    // 🔧 添加日志：记录消息转换结果
    console.log("🔧🔧🔧 [PROCESS_MESSAGE] 消息转换完成:", {
      originalTelegramMessage: {
        id: message.message_id,
        text: message.text?.substring(0, 100),
        from: message.from?.username || message.from?.first_name,
        chatType: message.chat.type,
      },
      convertedAgentMessage: {
        id: agentMessage.id,
        role: agentMessage.role,
        content: typeof agentMessage.content === 'string' 
          ? agentMessage.content.substring(0, 100) + (agentMessage.content.length > 100 ? '...' : '')
          : '[非字符串内容]',
        createdAt: agentMessage.createdAt,
        hasMetadata: !!(agentMessage as any).metadata,
      },
    });

    // Get or create agent instance
    const agentId = env.Chat.idFromName(`telegram_${chatId}`);
    const agent = env.Chat.get(agentId);

    // 🔧 添加日志：记录DO实例信息
    console.log("🔧🔧🔧 [PROCESS_MESSAGE] DO实例信息:", {
      agentIdString: `telegram_${chatId}`,
      chatId,
      agentInstance: !!agent,
      timestamp: new Date().toISOString(),
    });

    // Send message to agent for processing - agent will handle all tool execution
    const agentRequest = new Request("https://agent/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Chat-Id": chatId.toString(),
        "X-Telegram-Bot-Token": env.TELEGRAM_BOT_TOKEN,
        "X-Telegram-User-Id": (message.from?.id || 0).toString(),
      },
      body: JSON.stringify({
        messages: [agentMessage],
      }),
    });

    // 🔧 添加日志：记录发送给Agent的请求详情
    console.log("🔧🔧🔧 [PROCESS_MESSAGE] 发送给Agent的请求:", {
      url: agentRequest.url,
      method: agentRequest.method,
      headers: {
        chatId: agentRequest.headers.get("X-Telegram-Chat-Id"),
        userId: agentRequest.headers.get("X-Telegram-User-Id"),
        hasToken: !!agentRequest.headers.get("X-Telegram-Bot-Token"),
      },
      bodyPreview: JSON.stringify({
        messages: [{
          ...agentMessage,
          content: typeof agentMessage.content === 'string' 
            ? agentMessage.content.substring(0, 100) + '...'
            : agentMessage.content
        }]
      }),
    });

    // Process through agent - this ensures all tools execute in agent context
    const response = await agent.fetch(agentRequest);

    // 🔧 添加日志：记录Agent响应结果
    console.log("🔧🔧🔧 [PROCESS_MESSAGE] Agent响应结果:", {
      chatId,
      responseOk: response.ok,
      responseStatus: response.status,
      responseStatusText: response.statusText,
      hasBody: !!response.body,
      timestamp: new Date().toISOString(),
    });

    if (!response.ok) {
      console.error("Agent processing failed:", await response.text());
      await bot.sendMessage(
        chatId,
        "抱歉，处理您的请求时出现了问题。请稍后重试。"
      );
    }

    // Update recent responses tracking
    recentResponses.set(chatId, {
      content: message.text || "",
      timestamp: now,
    });

    // 🔧 添加日志：记录处理完成
    console.log("🔧🔧🔧 [PROCESS_MESSAGE] 消息处理完成:", {
      chatId,
      success: response.ok,
      recentResponsesSize: recentResponses.size,
      endTimestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Failed to process message for chat ${chatId}:`, error);
    
    // 🔧 添加日志：记录处理错误
    console.log("🔧🔧🔧 [PROCESS_MESSAGE] 处理失败:", {
      chatId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    await bot.sendMessage(
      chatId,
      "抱歉，处理您的消息时出现了错误。请稍后重试。"
    );
  }
}

/**
 * Handle regular messages
 */
async function handleMessage(
  message: TelegramMessage,
  bot: TelegramBot,
  env: Env
): Promise<void> {
  const chatId = message.chat.id;

  // 检查是否是 /start 命令
  if (message.text && message.text.startsWith("/start")) {
    console.log(`Processing /start command for chat ${chatId}`);

    try {
      // Get agent instance
      const agentId = env.Chat.idFromName(`telegram_${chatId}`);
      const agent = env.Chat.get(agentId);

      // Call the /reset endpoint on the agent
      const resetRequest = new Request("https://agent/reset", {
        method: "POST",
      });
      const response = await agent.fetch(resetRequest);

      if (response.ok) {
        console.log(`Successfully reset state for chat ${chatId}`);
        await bot.sendMessage(
          chatId,
          "你好! 对话历史已重置，我们可以开始新的会话了。\n有什么可以帮您的吗？"
        );
      } else {
        const errorText = await response.text();
        console.error(`Failed to reset state for chat ${chatId}:`, {
          status: response.status,
          error: errorText,
        });
        await bot.sendMessage(
          chatId,
          "抱歉，重置对话时出现问题，请稍后重试。"
        );
      }
    } catch (error) {
      console.error(`Error processing /start command for chat ${chatId}:`, error);
      await bot.sendMessage(
        chatId,
        "抱歉，处理/start命令时发生内部错误。"
      );
    }
    return;
  }

  // 检查是否是其他命令
  if (message.text && message.text.startsWith("/")) {
    return handleCommand(message, bot);
  }

  // 默认使用 agent 处理
  console.log(`Processing message from ${message.from?.id} in chat ${chatId}: ${message.text}`);
  await processAgentMessage(message, bot, env);
}

/**
 * Handle edited messages
 */
async function handleEditedMessage(
  message: TelegramMessage,
  bot: TelegramBot
): Promise<void> {
  console.log("Handling edited message:", message.text);

  // For now, just acknowledge the edit
  await bot.sendMessage(
    message.chat.id,
    "I noticed you edited your message. (Edit handling will be improved later)"
  );
}

/**
 * Handle callback queries (inline keyboard button presses)
 * All callback handling is now delegated to the agent
 */
async function handleCallbackQuery(
  callbackQuery: TelegramCallbackQuery,
  bot: TelegramBot,
  env?: Env
): Promise<void> {
  console.log("Handling callback query:", callbackQuery.data);

  if (!callbackQuery.data) {
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "无效的回调数据 / Invalid callback data",
      show_alert: true,
    });
    return;
  }

  // 将callback query转换为消息，发送给agent处理
  if (env && callbackQuery.message) {
    const callbackMessage: TelegramMessage = {
      message_id: callbackQuery.message.message_id + 1, // Generate a new ID
      from: callbackQuery.from,
      chat: callbackQuery.message.chat,
      date: Math.floor(Date.now() / 1000),
      text: `[CALLBACK] ${callbackQuery.data}`, // Mark as callback for agent processing
    };

    // Process callback through agent like a regular message
    await processAgentMessage(callbackMessage, bot, env);
  } else {
    // Fallback response
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: "无法处理回调 / Cannot process callback",
      show_alert: true,
    });
  }
}

/**
 * Handle channel posts
 */
async function handleChannelPost(
  message: TelegramMessage,
  bot: TelegramBot
): Promise<void> {
  console.log("Processing channel post:", message.text);

  // For now, we don't respond to channel posts to avoid spam
  // But we log them for monitoring purposes
  console.log(
    `Channel post in ${message.chat.title || message.chat.id}: ${message.text}`
  );
}

/**
 * Handle edited channel posts
 */
async function handleEditedChannelPost(
  message: TelegramMessage,
  bot: TelegramBot
): Promise<void> {
  console.log("Processing edited channel post:", message.text);

  // For now, we don't respond to edited channel posts to avoid spam
  // But we log them for monitoring purposes
  console.log(
    `Edited channel post in ${message.chat.title || message.chat.id}: ${message.text}`
  );
}
