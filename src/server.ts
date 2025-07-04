import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";

import {
  createDataStreamResponse,
  streamText,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type CoreMessage,
  wrapLanguageModel,
  type LanguageModelV1Middleware,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { createAgentTools, baseTools } from "./tools";
import { handleTelegramWebhook } from "./telegram";
import { TelegramStreamHandler } from "./telegram/streaming/handler";
import { TelegramBot } from "./telegram/core/bot";
import { MessageConverter } from "./telegram/messaging/converter";

// 1. 创建一个日志中间件
const loggingMiddleware: LanguageModelV1Middleware = {
  wrapStream: async ({ doStream, params }) => {
    console.log("=============== AI 模型原始输出追踪 - 开始 ===============");
    console.log("发送给模型的完整参数:", JSON.stringify(params, null, 2));

    // 调用原始模型的 doStream 方法
    const result = await doStream();

    // 创建一个新的可读流来拦截和打印原始数据块
    const [logStream, forwardStream] = result.stream.tee();

    // 异步地读取和打印日志流
    (async () => {
      const reader = logStream.getReader();
      let chunkCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(
            `=============== AI 模型原始输出追踪 - 结束 (总共 ${chunkCount} 个数据块) ===============`
          );
          break;
        }
        // 在这里打印从模型接收到的每一个原始数据块！
        chunkCount++;
        console.log(`原始数据块 #${chunkCount} (raw chunk):`, value);
      }
    })();

    // 返回一个新的结果对象，其中包含用于下游处理的流
    return {
      ...result,
      stream: forwardStream,
    };
  },
};

// 2. 创建基础模型并应用日志中间件
const baseModel = openai("gpt-4.1-mini-2025-04-14");
const model = wrapLanguageModel({
  model: baseModel,
  middleware: loggingMiddleware,
});

/**
 * 系统提示词 - 统一管理，避免重复
 */
const SYSTEM_PROMPT = `你是一个智能AI助手，专长于任务调度和提醒，响应语言为中文。

**🧠 关键思维流程：每次回答前必须执行的内心分析**

在回应用户前，你必须先进行以下思考（不要输出这些思考过程）：

1. **【当前消息意图分析】**：
   - 用户这条最新消息的字面意思是什么？
   - 这是什么类型的请求？
     * 🔍 **信息查询**：询问信息（如"我是谁"、"天气如何"）
     * ⏰ **新任务创建**：设置新的提醒/任务（如"X分钟后提醒我Y"）
     * ✏️ **任务修改**：修改已有任务（如"把它改成明天"、"取消刚才的提醒"）
     * 💬 **社交互动**：问候/感谢（如"你好"、"谢谢"）

2. **【历史依赖检查】**：
   - 当前消息是否包含指代词（它、这个、那个、刚才、上面的）？
   - 当前消息是否是对我之前问题的补充回答？
   - 如果都不是：历史信息仅作背景参考，专注于当前消息的字面意思

3. **【工具调用决策】**：
   - 只有明确的任务创建或任务修改请求才需要调用工具
   - 信息查询、问候、闲聊等都不需要调用任务相关工具
   - 警惕：不要因为看到历史有任务就主动询问或建议任务操作

**💡 核心提醒：历史对话 ≠ 当前指令**
- 历史对话是你的"记忆"，帮助了解用户背景
- 只有当前消息才是用户现在的真实意图
- 除非明确引用，否则不要让历史内容影响当前回应

**🎯 核心心智模型：将对话视为"焦点"与"背景"**

在分析用户输入时，你必须始终区分两个概念：

1.  **【焦点 (Focus)】**: 用户的**最新一条消息**。这是你所有行动的出发点和最高优先级。你的首要任务是回答："这条消息本身, 最直接的意图是什么？"

2.  **【背景 (Background)】**: **全部的历史对话记录**。它不是你的指令来源, 而是你的"记忆"或"词典"。只有当【焦点】信息不完整或有指代时, 你才应该去【背景】里查找线索来理解它。

---

**💡 你的工作流程应该是这样的：**

**第一步：聚焦当前, 判断意图**
永远先分析用户的最新消息。它是一个全新的、完整的指令吗？
*   **新任务/查询**："提醒我下午三点开会", "明天北京天气如何？"
    *   **行动**：直接执行。这表明一个新的"对话主题"开始了, 应忽略之前的任务背景。
*   **简单社交互动**："你好", "谢谢", "好的"
    *   **行动**：简单礼貌地回应, 然后**立刻清空你的短期注意力**，等待下一个全新的指令。绝不能因为背景里有任务, 就画蛇添足地追问。

**第二步：在必要时, 才回溯背景**
仅当最新消息（焦点）无法独立理解时, 才动用你的"记忆"（背景）。
*   **何时回溯？**
    *   **修正/更改**："把它改成明天", "取消刚才那个提醒"。你需要回溯背景找到"它"和"刚才那个提醒"指的是什么。
    *   **补充信息**：你问："何时提醒？"，用户答："晚上8点"。你需要回溯你的问题来理解这个答案。
    *   **对比/关联查询**：用户问完北京天气后，紧接着问："那上海呢？"。你需要回溯背景知道用户仍在查询天气。

**第三步：警惕过度联想的陷阱**
历史记录最大的风险是让你做出错误的假设。你必须时刻提醒自己：
*   **用户完成一个任务不代表他想做另一个。**
*   **用户的一个简单回复（如"OK"）只是表示收到，而不是在寻求你对之前任务的确认或总结。**

---

**✅ 黄金法则：把历史当作【词典】来查，而不是当作【剧本】来演。**

*   **词典 (正确用法)**：遇到不认识的词（如"它"），才去翻查。
*   **剧本 (错误用法)**：因为上一幕是"安排会议"，就擅自认为下一幕也和会议有关。

---

**💭 思维过程示例：**

*   **例子1: 独立信息查询**
    *   【背景】：历史有"1分钟后提醒我喝水"的任务
    *   【当前】：用户说"我是谁"
    *   【思考】：这是信息查询，无指代词，与历史任务无关
    *   【回应】：直接回答身份信息，不提及任务

*   **例子2: 需要历史的任务修改**
    *   【背景】：刚设置了"明天3点开会"的提醒
    *   【当前】：用户说"把它改成下午4点"
    *   【思考】：包含指代词"它"，需要查找历史中的任务
    *   【回应】：找到会议提醒，修改时间

*   **例子3: 社交互动**
    *   【背景】：历史有多个任务设置
    *   【当前】：用户说"谢谢"
    *   【思考】：这是社交感谢，无需任何工具调用
    *   【回应】：简单礼貌回应，不询问任务相关内容

**场景示例：**

*   **场景1: 正确使用全上下文进行修正**
    *   用户: "提醒我今晚8点看电影"
    *   AI: "好的，已安排。"
    *   用户: "然后10点钟提醒我睡觉"
    *   AI: "没问题，10点钟的提醒也设置好了。"
    *   用户: "第一个提醒改成9点吧"
    *   AI: (回溯整个背景，找到"第一个提醒"是"看电影"那个) "好的，看电影的提醒时间已为您修改为晚上9点。"

*   **场景2: 成功避免历史污染**
    *   用户: "明天下午3点有个重要的会，提醒我一下"
    *   AI: "好的，已为您安排提醒。"
    *   *(对话暂停了一段时间)*
    *   用户: "你好"
    *   AI: "你好！有什么可以帮您的吗？" (回答干净利落，完全不受之前"重要的会"的影响)

*   **场景3: 优雅地结束一个话题**
    *   用户: "5分钟后提醒我喝水"
    *   AI: "好的，提醒已设置。"
    *   用户: "太棒了，谢谢！"
    *   AI: "不客气！如果还有其他事，随时叫我。" (完美结束，没有画蛇添足)

**时区设置**: 所有时间均基于北京时间 (UTC+8)。

**🌤️ 天气工具使用指南：**

你有两个天气相关的工具，请根据用户的具体需求选择合适的工具：

1. **getWeatherInformation** - 当前天气查询
   - 用于：用户询问**当前/现在的天气**（如："现在北京天气怎么样"、"今天天气如何"、"当前温度是多少"）
   - 返回：实时天气数据（当前温度、湿度、风速、天气状况）

2. **getWeatherForecast** - 天气预报查询  
   - 用于：用户询问**未来的天气**（如："明天天气怎么样"、"这周天气预报"、"未来几天天气如何"、"北京5天天气预报"）
   - 返回：5天天气预报数据（包含多个时间点的详细预报信息）
   - 注意：当进行未来天气查询的时候，你需要先注意当前的时间，与获得的未来天气预报数据进行对比，如果未来天气预报数据的时间与当前时间相差太大，
   则需要提醒用户，未来天气预报数据的时间与当前时间相差太大，无法进行查询。如果得到的预测时间点过多，可以进行摘要，比如计算一天内的平均气温等。
**选择原则：**
- 包含"现在"、"当前"、"今天"等词汇 → 使用 getWeatherInformation
- 包含"明天"、"未来"、"预报"、"几天"、"这周"等词汇 → 使用 getWeatherForecast
- 如果用户只说"天气"而没有明确时间，默认理解为当前天气，使用 getWeatherInformation
- 如果新的查询明确指定了与之前不同的时间范围（例如从“明天”切换到“今天”），你必须强制性地清空你对之前特定日期时间（如“明天”）的关注，只聚焦于当前查询中明确指定的时间范围（如“今天”），使用历史中正确时间的上下文或调用正确的工具（例如 getWeatherInformation）
- 对于天气和时间这样的基于事实的回答，一定不能编造，一定要基于工具查询得到的事实进行回答，如果
用户询问的查询时间比较模糊，你应该选择距离用户想问的时间最近的天气预报数据进行回答。

**天气预报回复规则 (适用于 getWeatherForecast 工具结果):**
当你收到 getWeatherForecast 的结果时，请遵循以下步骤生成回复:
1. **理解当前时间**: 你会在消息历史中收到一条明确的"当前时间是：YYYY-MM-DD HH:MM:SS"的系统消息。以此作为判断"未来"的基准，当前时间以时间戳最大的为准，不要错误地将历史时间当作当前时间。
2. **筛选相关数据**: 如果用户指定了"未来 N 小时"或"明天"，请从 getWeatherForecast 返回的 \`forecasts\` 数组中，选择**从当前时间之后**并符合用户请求时间范围（例如未来 9 小时或明天全天）的数据点。
3. **精准呈现时间点**: 对于筛选出的每个数据点，请使用其原始的 \`dateTime\` 或根据当前时间推算出的相对时间（如"3小时后"、"明天上午"）来表示，而不是虚构的时间。
4. **总结与概括**:
   - 如果数据点很多，可以适当地进行概括，例如给出每天的最高/最低温度、主要天气类型。
   - 如果用户请求的时间范围较短（如未来 9 小时），则可以列出每个关键时间点的详细信息。
   - 特别注意：**OpenWeatherMap 的预测数据是每 3 小时一个时间点** [[https://openweathermap.org/forecast5](https://openweathermap.org/forecast5)]。在给出"未来 9 小时"等短时预报时，你需要从工具返回的 \`forecasts\` 列表中，精确找到从当前时间最近的未来 3 小时、6 小时、9 小时等对应的数据点进行展示，而不是随机选择或生成。
5. **格式化输出**: 使用清晰的列表或段落格式，明确指出日期和时间，以及对应的天气状况、温度、湿度和风速等信息。如果涉及降水，请说明降水概率或降水量。
6. **补充提醒**: 根据预报内容，给出适当的出行或生活建议（例如："请注意携带雨具"、"气温变化较大，请注意保暖"）。`

/**
 * 生成完整的系统提示词（包含动态内容）
 */
function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Chat Agent state interface - 简化版本，移除冗余的消息历史管理
 */
interface ChatState {
  telegramContext?: {
    chatId: number;
    botToken: string;
    userId: number;
    timestamp: number;
  };
  messages?: CoreMessage[];
}

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env, ChatState> {
  // Agent 的当前上下文状态
  private currentContext: {
    telegram?: {
      chatId: number;
      botToken: string;
      userId: number;
      timestamp: number;
    };
  } = {};

  /**
   * Override fetch to handle custom Telegram streaming requests
   */
  async fetch(request: Request, env?: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle a reset request to clear the conversation history
    if (url.pathname === "/reset" && request.method === "POST") {
      this.messages = []; // Clear in-memory messages
      await this.setState({ messages: [] }); // Clear persisted messages
      console.log(
        `✅ Conversation history reset for chat ${this.state.telegramContext?.chatId}`
      );
      return new Response("Conversation reset.", { status: 200 });
    }

    // Handle Telegram streaming chat requests
    if (url.pathname === "/chat" && request.method === "POST") {
      const telegramChatId = request.headers.get("X-Telegram-Chat-Id");
      const telegramBotToken = request.headers.get("X-Telegram-Bot-Token");
      const telegramUserId = request.headers.get("X-Telegram-User-Id");

      if (telegramChatId && telegramBotToken) {
        return this.handleTelegramChat(request, {
          chatId: parseInt(telegramChatId),
          botToken: telegramBotToken,
          userId: parseInt(telegramUserId || "0"),
        });
      }
    }

    // Fallback to default agent behavior
    return super.fetch(request);
  }

  /**
   * Handle Telegram chat endpoint - 简化版本，移除手动消息历史管理
   */
  private async handleTelegramChat(
    request: Request,
    telegramContext: {
      chatId: number;
      botToken: string;
      userId: number;
    }
  ): Promise<Response> {
    // 从持久化存储中恢复状态
    try {
      // this.state 由 AIChatAgent 框架在 DO 实例化时从存储中自动填充。
      // 我们需要确保内存中的 this.messages 与持久化的 this.state.messages 同步。
      if (
        this.state?.messages &&
        this.state.messages.length > this.messages.length
      ) {
        console.log(
          `[STATE_RECOVERY] 检测到内存与状态不一致，正在从 this.state 恢复消息。内存: ${this.messages.length}, 状态: ${this.state.messages.length}`
        );
        this.messages = this.state.messages as any;
      }
    } catch (error) {
      console.error("[STATE_RECOVERY] 从 this.state 恢复状态失败:", error);
    }
    // 记录当前处理的聊天上下文
    console.log(
      `[CHAT_HANDLER] Processing Telegram request for chat: ${telegramContext.chatId}`
    );


    // 设置 Telegram 上下文
    await this.setTelegramContext(telegramContext);

    // 添加当前用户消息到上下文
    const requestBody = (await request.json()) as { messages?: Array<any> };
    const currentMessages = requestBody.messages || [];
    const latestUserMessage = currentMessages[currentMessages.length - 1];


    if (latestUserMessage && latestUserMessage.role === "user") {
      this.messages.push(latestUserMessage as any);
      console.log(
        `[CHAT_HANDLER] Added current user message to context: ${latestUserMessage.content}`
      );


      await this.persistState();
    }

    // 🎯 重构：直接使用标准的 onChatMessage 而不是冗余的流处理
    return this.onChatMessage(async (result) => {
      // 🔍 监控日志：记录AI响应完成后的状态
      console.log(`[CONTEXT_MONITOR] === AI响应完成后的消息上下文状态 ===`);
      console.log(`[CONTEXT_MONITOR] Chat ID: ${telegramContext.chatId}`);
      console.log(
        `[CONTEXT_MONITOR] AI响应后 this.messages 长度: ${this.messages.length}`
      );
      console.log(`[CONTEXT_MONITOR] AI响应后 this.messages 内容:`);
      this.messages.forEach((msg, index) => {
        console.log(
          `[CONTEXT_MONITOR]   [${index}] Role: ${msg.role}, ID: ${(msg as any).id || "no-id"}, Content: ${typeof msg.content === "string" ? msg.content.substring(0, 100) + "..." : JSON.stringify(msg.content).substring(0, 100) + "..."}`
        );
      });

      // 创建 Telegram 流处理器
      const streamHandler = new TelegramStreamHandler(
        telegramContext.chatId,
        telegramContext.botToken,
        telegramContext.userId,
        {
          minUpdateInterval: 1500,
          maxMessageLength: 4096,
          rateLimitConfig: {
            bucketCapacity: 15,
            refillRate: 0.25,
          },
        }
      );

      try {
        await streamHandler.initialize();

        // AI SDK 已经自动处理了工具结果和 AI 回复的组合
        // args.text 就是最终的完整回复内容，包含工具结果
        const finalText = result.text;
        console.log(`[CHAT_HANDLER] Final AI response (includes tool results): ${finalText}`);

        // 应用 Markdown 转换
        const formattedText =
          MessageConverter.formatMarkdownForTelegram(finalText);

        // 发送格式化后的消息
        const bot = new TelegramBot(telegramContext.botToken);
        await bot.sendMessage(telegramContext.chatId, formattedText, {
          parse_mode: "Markdown",
        });

        console.log(
          `[TELEGRAM] Successfully sent message to chat ${telegramContext.chatId}`
        );

        // 🔍 监控日志：记录消息发送后的最终状态
        console.log(`[CONTEXT_MONITOR] === 消息发送完成后的最终状态 ===`);
        console.log(
          `[CONTEXT_MONITOR] 最终 this.messages 长度: ${this.messages.length}`
        );
        console.log(
          `[CONTEXT_MONITOR] 对话处理完成，Chat ID: ${telegramContext.chatId}`
        );

        await this.persistState();
      } catch (error) {
        console.error("[TELEGRAM] Error in message handling:", error);
        const bot = new TelegramBot(telegramContext.botToken);
        await bot.sendMessage(
          telegramContext.chatId,
          "抱歉，处理您的消息时出现了错误。请稍后重试。",
          { parse_mode: "Markdown" }
        );
      } finally {
        streamHandler.dispose();
      }
    });
  }

  /**
   * 3. 创建一个统一的持久化方法
   * Persists the current agent state (context and messages) to Durable Object storage.
   */
  private async persistState(): Promise<void> {
    try {
      // 确保 this.state.telegramContext 与 this.currentContext 同步
      if (this.currentContext.telegram) {
        this.state.telegramContext = this.currentContext.telegram;
      }

      await this.setState({
        telegramContext: this.state.telegramContext,
        messages: this.messages as CoreMessage[],
      });

      console.log(
        `[DO_STATE] Persisted state for chat ${
          this.state.telegramContext?.chatId
        }, messages: ${this.messages.length}`
      );
    } catch (error) {
      console.error("[DO_STATE] Failed to persist state:", error);
    }
  }

  /**
   * 设置 Telegram 上下文 - 简化版本，只处理 Telegram 特定上下文
   */
  private async setTelegramContext(context: {
    chatId: number;
    botToken: string;
    userId: number;
  }): Promise<void> {
    const telegramContext = {
      chatId: context.chatId,
      botToken: context.botToken,
      userId: context.userId,
      timestamp: Date.now(),
    };

    // 设置内存中的上下文
    this.currentContext.telegram = telegramContext;

    // ✅ 只更新内存中的上下文，持久化操作将由 persistState 方法统一处理
    this.state.telegramContext = telegramContext;
    console.log(
      `[CONTEXT] Set in-memory Telegram context for chat ${context.chatId}`
    );
  }

  /**
   * 从DO持久化存储获取 Telegram 上下文
   */
  getTelegramContext(): {
    chatId: number;
    botToken: string;
    userId: number;
  } | null {
    // 1. 优先使用内存中的上下文（性能考虑）
    if (this.currentContext.telegram) {
      return {
        chatId: this.currentContext.telegram.chatId,
        botToken: this.currentContext.telegram.botToken,
        userId: this.currentContext.telegram.userId,
      };
    }

    // 2. 从DO持久化存储恢复上下文
    try {
      const storedContext = this.state?.telegramContext;
      if (storedContext && typeof storedContext === "object") {
        const context = {
          chatId: storedContext.chatId,
          botToken: storedContext.botToken,
          userId: storedContext.userId,
        };

        // 恢复到内存以提高后续访问性能
        this.currentContext.telegram = {
          ...context,
          timestamp: storedContext.timestamp || Date.now(),
        };

        return context;
      }
    } catch (error) {
      console.error(
        "Error retrieving Telegram context from DO storage:",
        error
      );
    }

    return null;
  }

  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const agentSpecificTools = createAgentTools(this, this.env);

    // 统一管理所有工具
    const allTools = {
      ...baseTools,
      ...agentSpecificTools,
      ...this.mcp.unstable_getAITools(),
    };

    const currentTelegramContext = this.getTelegramContext();
    console.log(
      `[CHAT_MESSAGE] Processing message for chat: ${
        currentTelegramContext?.chatId
      }, user: ${currentTelegramContext?.userId}, messages: ${
        this.messages.length
      }`
    );



    // Create a streaming response that handles both text and tool outputs
    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // 🔧 按照 Cloudflare Agents 文档：this.messages 已包含完整对话历史（包括当前消息）
        const allMessages = this.messages;

        // Step 1: 识别当前用户消息（最后一条用户消息）
        const currentUserMessage = allMessages
          .slice() // 创建副本
          .reverse() // 从最新开始
          .find(
            (msg) =>
              msg.role === "user" &&
              "id" in msg &&
              (msg as any).id &&
              (msg as any).id.startsWith("telegram_") // 确保是真正的用户消息
          );


        // 如果没有找到当前用户消息，则发出警告并尝试使用最后一条消息作为回退
        let messagesToSend: CoreMessage[] = [];
        if (currentUserMessage) {
          messagesToSend = allMessages as CoreMessage[];
        } else {
          console.warn(
            "[CONTEXT] Current user message not found. Using last message as fallback."
          );
          const lastMessage = allMessages[allMessages.length - 1];
          if (lastMessage) {
            messagesToSend = [lastMessage as CoreMessage];
            // console.log(
            //   `[CONTEXT_MONITOR] 使用回退消息 - Role: ${lastMessage.role}, Content: ${typeof lastMessage.content === "string" ? lastMessage.content : JSON.stringify(lastMessage.content)}`
            // );
          } else {
            // If no messages at all, send an empty array or handle as error
            console.error("[CONTEXT] No messages found to send to AI model.");
          }
        }

        // 注入当前时间作为上下文
        const now = new Date();
        const currentDateTimeString = now.toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Shanghai",
        });

        const currentTimestamp = now.getTime();

        const tineContextMessage: CoreMessage = {
          role: "system",
          content: `当前时间是: ${currentDateTimeString}(Unix 时间戳: ${currentTimestamp})。请以此为基准来理解和响应时间相关的请求`,
        };
        messagesToSend.unshift(tineContextMessage);
        // 🔍 监控日志：记录发送给AI的最终消息
        console.log(`[CONTEXT_MONITOR] === 发送给AI模型的消息 ===`);
        console.log(
          `[CONTEXT_MONITOR] 发送给AI的消息数量: ${messagesToSend.length}`
        );
        messagesToSend.forEach((msg, index) => {
          console.log(
            `[CONTEXT_MONITOR]   发送消息[${index}] - Role: ${msg.role}, ID: ${(msg as any).id || "no-id"}, Content: ${typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}`
          );
        });

        const result = streamText({
          model,
          system: getSystemPrompt(),
          messages: messagesToSend, // Pass only the current user message or fallback
          tools: allTools,
          maxTokens: 1500,
          onFinish: (args) => {
            console.log(
              `[AI_RESPONSE] Finished for chat ${
                currentTelegramContext?.chatId
              }, reason: ${args.finishReason}`
            );

            // AI SDK 已经自动将工具结果整合到 args.text 中
            // 直接使用 args.text 作为完整的助手回复内容
            const assistantResponseContent = args.text || "";
            console.log(
              `[AI_RESPONSE] Complete AI response (includes tool results): ${assistantResponseContent}`
            );

            this.messages.push({
              role: "assistant",
              content: assistantResponseContent,
              id: `ai_response_${Date.now()}`,
            });


            onFinish(
              args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
            );
          },
          onError: (error) => {
            console.error("Error while streaming:", error);
          },
          maxSteps: 10,
        });

        // Merge the AI response stream with tool execution outputs
        result.mergeIntoDataStream(dataStream);
      },
    });

    return dataStreamResponse;
  }

  /**
   * Execute scheduled task with proper DO context consistency
   */
  async executeTask(description: string, task: Schedule<string>) {
    console.log(
      `[TASK_RUNNER] Executing task: ${description} (ID: ${task.id})`
    );

    // 直接使用 getTelegramContext()，让它按正常逻辑工作
    const telegramContext = this.getTelegramContext();

    if (telegramContext) {
      try {
        // 构建提醒消息 - 🔧 修复：使用与成功格式化器完全相同的模式
        const reminderMessage = [
          "🔔 **提醒时间到了！**",
          "",
          `📝 **任务描述**: ${description}`,
          "",
          "✅ 这是您之前设置的提醒",
        ].join("\n");

        // 🔧 修复：应用 Markdown 转换，将 ** 转换为 * 用于 Telegram
        const formattedMessage =
          MessageConverter.formatMarkdownForTelegram(reminderMessage);

        const bot = new TelegramBot(telegramContext.botToken);
        await bot.sendMessage(telegramContext.chatId, formattedMessage, {
          parse_mode: "Markdown", // 🔧 关键修复：指定Markdown解析模式
        });
        console.log(
          `[TASK_RUNNER] Sent reminder to Telegram chat ${telegramContext.chatId}`
        );

        // ✅ 移除手动添加消息到历史 - AIChatAgent 自动处理对话上下文
      } catch (error) {
        console.error("[TASK_RUNNER] Failed to send task reminder:", error);
      }
    } else {
      console.error(
        "[TASK_RUNNER] No Telegram context available for task reminder"
      );
    }

    // 清理已执行的任务
    try {
      await this.cancelSchedule(task.id);
      console.log(`[TASK_RUNNER] Cleaned up executed task: ${task.id}`);
    } catch (cleanupError) {
      console.error(
        `[TASK_RUNNER] Failed to cleanup task ${task.id}:`,
        cleanupError
      );
    }
  }
}

export interface Env {
  OPENAI_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  Chat: DurableObjectNamespace<Chat>;
  DB: D1Database;
  OPENWEATHER_API_KEY: string;
}

/**
 * Helper function to add CORS headers for development
 */
function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Middleware for logging requests in development
 */
function logRequest(request: Request): void {
  const url = new URL(request.url);
  console.log(
    `[REQUEST] ${new Date().toISOString()} - ${request.method} ${url.pathname}`
  );

  // Log additional details for webhook requests
  if (url.pathname === "/telegram/webhook") {
    const headersObj: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    console.log("[WEBHOOK] Telegram request received:", {
      method: request.method,
      headers: headersObj,
      contentType: request.headers.get("content-type"),
    });
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Log requests for debugging
    logRequest(request);

    try {
      // Handle preflight CORS requests
      if (request.method === "OPTIONS") {
        return addCorsHeaders(new Response(null, { status: 204 }));
      }

      // Telegram webhook handler - use the dedicated module
      if (url.pathname === "/telegram/webhook") {
        if (request.method !== "POST") {
          console.warn(`Invalid method ${request.method} for webhook endpoint`);
          return addCorsHeaders(
            new Response("Method not allowed", { status: 405 })
          );
        }

        // Ensure required environment variables are available
        if (!env.TELEGRAM_BOT_TOKEN) {
          console.error("TELEGRAM_BOT_TOKEN is not configured");
          return addCorsHeaders(
            new Response("Bot token not configured", { status: 500 })
          );
        }

        const response = await handleTelegramWebhook(request, env);
        return addCorsHeaders(response);
      }

      // Health check endpoints with improved responses
      if (url.pathname === "/check-open-ai-key") {
        const hasOpenAIKey = !!env.OPENAI_API_KEY;
        return addCorsHeaders(
          Response.json({
            success: hasOpenAIKey,
            service: "OpenAI",
            timestamp: new Date().toISOString(),
          })
        );
      }

      // Test endpoint to verify Telegram bot token is accessible
      if (url.pathname === "/check-telegram-token") {
        const hasTelegramToken = !!env.TELEGRAM_BOT_TOKEN;
        return addCorsHeaders(
          Response.json({
            success: hasTelegramToken,
            hasToken: hasTelegramToken,
            service: "Telegram Bot",
            timestamp: new Date().toISOString(),
          })
        );
      }

      // Health check endpoint for the entire service
      if (url.pathname === "/health") {
        return addCorsHeaders(
          Response.json({
            status: "healthy",
            services: {
              openai: !!env.OPENAI_API_KEY,
              telegram: !!env.TELEGRAM_BOT_TOKEN,
            },
            timestamp: new Date().toISOString(),
          })
        );
      }

      // Environment warning for missing OpenAI key
      if (!env.OPENAI_API_KEY) {
        console.error(
          "OPENAI_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
        );
      }

      // Route to existing agent infrastructure
      const agentResponse = await routeAgentRequest(request, env);
      if (agentResponse) {
        return addCorsHeaders(agentResponse);
      }

      // 404 for unmatched routes
      console.warn(`Route not found: ${request.method} ${url.pathname}`);
      return addCorsHeaders(new Response("Not found", { status: 404 }));
    } catch (error) {
      console.error("Unhandled error in request handler:", error);
      return addCorsHeaders(
        new Response("Internal server error", { status: 500 })
      );
    }
  },
} satisfies ExportedHandler<Env>;
