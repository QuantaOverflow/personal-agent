import type {
  TelegramMessage,
  TelegramMessageEntity,
  AgentMessage,
  ConversionContext,
} from "../types";
import { UnifiedResultFormatter } from "./formatters";

/**
 * Message Format Conversion System
 * Handles bidirectional conversion between Telegram messages and internal agent messages
 */
export class MessageConverter {
  /**
   * Convert Telegram message to internal agent message format
   */
  static telegramToAgentMessage(
    telegramMsg: TelegramMessage,
    context?: Partial<ConversionContext>
  ): AgentMessage {
    // 🔧 添加日志：记录转换开始
    console.log("🔧🔧🔧 [MESSAGE_CONVERTER] 开始转换消息:", {
      telegramMessageId: telegramMsg.message_id,
      chatId: telegramMsg.chat.id,
      userId: telegramMsg.from?.id || 0,
      userName: telegramMsg.from?.username || telegramMsg.from?.first_name,
      messageText: telegramMsg.text?.substring(0, 100) + (telegramMsg.text && telegramMsg.text.length > 100 ? '...' : ''),
      hasEntities: !!(telegramMsg.entities && telegramMsg.entities.length > 0),
      timestamp: new Date().toISOString(),
    });

    let content = telegramMsg.text || "";

    // Extract context information
    const conversionContext: ConversionContext = {
      chatId: telegramMsg.chat.id,
      userId: telegramMsg.from?.id || 0,
      messageId: telegramMsg.message_id,
      username: telegramMsg.from?.username,
      firstName: telegramMsg.from?.first_name,
      timestamp: new Date(telegramMsg.date * 1000),
      ...context,
    };

    // 🔧 添加日志：记录转换上下文
    console.log("🔧🔧🔧 [MESSAGE_CONVERTER] 转换上下文:", {
      chatId: conversionContext.chatId,
      userId: conversionContext.userId,
      messageId: conversionContext.messageId,
      username: conversionContext.username,
      firstName: conversionContext.firstName,
      timestamp: conversionContext.timestamp,
      providedContext: context ? Object.keys(context) : '无额外上下文',
    });

    // Handle commands as system context
    if (content.startsWith("/")) {
      const commandMessage = {
        id: `telegram_${telegramMsg.message_id}`,
        role: "user" as const,
        content: content,
        createdAt: conversionContext.timestamp,
      };

      // 🔧 添加日志：记录命令消息转换
      console.log("🔧🔧🔧 [MESSAGE_CONVERTER] 命令消息转换:", {
        isCommand: true,
        command: content.split(' ')[0],
        messageId: commandMessage.id,
        content: commandMessage.content,
      });

      return commandMessage;
    }

    // Handle mentions and entities
    if (telegramMsg.entities && telegramMsg.entities.length > 0) {
      const originalContent = content;
      content = MessageConverter.processEntities(content, telegramMsg.entities);
      
      // 🔧 添加日志：记录实体处理
      console.log("🔧🔧🔧 [MESSAGE_CONVERTER] 实体处理:", {
        hasEntities: true,
        entityCount: telegramMsg.entities.length,
        originalContent: originalContent.substring(0, 100) + '...',
        processedContent: content.substring(0, 100) + '...',
        contentChanged: originalContent !== content,
      });
    }

    const finalMessage = {
      id: `telegram_${telegramMsg.message_id}`,
      role: "user" as const,
      content,
      createdAt: conversionContext.timestamp,
    };

    // 🔧 添加日志：记录最终转换结果
    console.log("🔧🔧🔧 [MESSAGE_CONVERTER] 转换完成:", {
      finalMessageId: finalMessage.id,
      finalContent: finalMessage.content.substring(0, 150) + (finalMessage.content.length > 150 ? '...' : ''),
      contentLength: finalMessage.content.length,
      createdAt: finalMessage.createdAt,
      hasSpecialCharacters: /[^\x00-\x7F]/.test(finalMessage.content), // 检查是否包含非ASCII字符
      possibleIssues: {
        emptyContent: !finalMessage.content.trim(),
        tooLong: finalMessage.content.length > 4000,
        containsUrls: finalMessage.content.includes('http'),
        containsMarkdown: finalMessage.content.includes('*') || finalMessage.content.includes('_'),
      },
    });

    return finalMessage;
  }

  /**
   * Convert agent message to Telegram-formatted text
   */
  static agentToTelegramMessage(agentMsg: AgentMessage): string {
    let content = agentMsg.content;

    // Handle tool calls in the message
    if (agentMsg.toolCalls && agentMsg.toolCalls.length > 0) {
      const toolCallsText = agentMsg.toolCalls
        .map((tool) => `🔧 Using tool: ${tool.name}`)
        .join("\n");
      content = `${content}\n\n${toolCallsText}`;
    }

    // Handle tool results with unified formatting
    if (agentMsg.toolResults && agentMsg.toolResults.length > 0) {
      const resultsText = agentMsg.toolResults
        .map((result) => {
          // 🔧 优化：使用统一格式化器处理工具结果
          if (typeof result.result === "string") {
            // 如果结果已经是格式化的字符串，检查是否需要进一步格式化
            if (
              result.result.includes("**") ||
              result.result.includes("✅") ||
              result.result.includes("❌")
            ) {
              // 已经格式化过的结果，直接使用
              return result.result;
            } else {
              // 简单字符串结果，使用统一格式化器
              return UnifiedResultFormatter.formatToolResult(
                result.id || "unknown",
                result.result,
                true
              );
            }
          }
          // 对于非字符串结果，使用通用格式化器
          return UnifiedResultFormatter.formatToolResult(
            result.id || "unknown",
            result.result,
            true
          );
        })
        .join("\n\n");
      content = `${content}\n\n${resultsText}`;
    }

    // Convert markdown formatting for Telegram
    return MessageConverter.formatMarkdownForTelegram(content);
  }

  /**
   * Format markdown content for Telegram's Markdown format (legacy)
   */
  static formatMarkdownForTelegram(content: string): string {
    // 🔧 调试：记录输入内容
    console.log(
      "🔧🔧🔧 [FORMATTER] 被调用！输入内容:",
      content.substring(0, 200)
    );
    console.log("🔧🔧🔧 [FORMATTER] 包含 ** 语法:", content.includes("**"));

    // Convert common markdown patterns to Telegram Markdown (legacy)
    const result = content
      // Handle code blocks first (preserve them)
      .replace(/```(\w+)?\n?([\s\S]*?)```/g, (match, lang, code) => {
        return `\`\`\`${lang || ""}\n${code}\`\`\``;
      })
      // Handle inline code (preserve as-is for legacy Markdown)
      .replace(/`([^`]+)`/g, "`$1`")
      // Handle bold text - convert **text** to *text* for Telegram legacy Markdown
      // 🔧 修复：使用更精确的匹配，避免跨行匹配问题
      .replace(/\*\*([^*\n]+?)\*\*/g, (match, text) => {
        console.log(`🔧🔧🔧 [FORMATTER] 转换粗体: "${match}" -> "*${text}*"`);
        return `*${text}*`;
      })
      // Handle strikethrough
      .replace(/~~(.*?)~~/g, "~$1~");
    // Note: No need to escape characters for legacy Markdown mode
    // 🔧 调试：记录输出内容
    console.log("🔧🔧🔧 [FORMATTER] 输出内容:", result.substring(0, 200));
    console.log(
      "🔧🔧🔧 [FORMATTER] 输出仍包含 ** 语法:",
      result.includes("**")
    );

    return result;
  }

  /**
   * Process Telegram message entities (mentions, links, etc.)
   */
  static processEntities(
    text: string,
    entities: TelegramMessageEntity[]
  ): string {
    let processedText = text;

    // Sort entities by offset (reverse order to avoid index shifting)
    const sortedEntities = [...entities].sort((a, b) => b.offset - a.offset);

    for (const entity of sortedEntities) {
      const entityText = text.slice(
        entity.offset,
        entity.offset + entity.length
      );
      let replacement = entityText;

      switch (entity.type) {
        case "mention":
          replacement = `@${entityText.slice(1)}`; // Keep as is
          break;
        case "url":
          replacement = `[${entityText}](${entityText})`;
          break;
        case "text_link":
          replacement = `[${entityText}](${entity.url})`;
          break;
        case "code":
          replacement = `\`${entityText}\``;
          break;
        case "pre":
          replacement = `\`\`\`${entity.language || ""}\n${entityText}\n\`\`\``;
          break;
        case "bold":
          replacement = `**${entityText}**`;
          break;
        case "italic":
          replacement = `*${entityText}*`;
          break;
        case "underline":
          replacement = `__${entityText}__`;
          break;
        case "strikethrough":
          replacement = `~~${entityText}~~`;
          break;
      }

      processedText =
        processedText.slice(0, entity.offset) +
        replacement +
        processedText.slice(entity.offset + entity.length);
    }

    return processedText;
  }

  /**
   * Create a context object from Telegram message
   */
  static createConversionContext(
    telegramMsg: TelegramMessage
  ): ConversionContext {
    return {
      chatId: telegramMsg.chat.id,
      userId: telegramMsg.from?.id || 0,
      messageId: telegramMsg.message_id,
      username: telegramMsg.from?.username,
      firstName: telegramMsg.from?.first_name,
      timestamp: new Date(telegramMsg.date * 1000),
    };
  }

  /**
   * Helper to split long messages for Telegram's character limit
   */
  static splitLongMessage(content: string, maxLength: number = 4096): string[] {
    if (content.length <= maxLength) {
      return [content];
    }

    const messages: string[] = [];
    let currentMessage = "";
    const lines = content.split("\n");

    for (const line of lines) {
      if (`${currentMessage}\n${line}`.length > maxLength) {
        if (currentMessage) {
          messages.push(currentMessage.trim());
          currentMessage = line;
        } else {
          // Single line is too long, split it
          const chunks = MessageConverter.splitLine(line, maxLength);
          messages.push(...chunks.slice(0, -1));
          currentMessage = chunks[chunks.length - 1];
        }
      } else {
        currentMessage += (currentMessage ? "\n" : "") + line;
      }
    }

    if (currentMessage) {
      messages.push(currentMessage.trim());
    }

    return messages;
  }

  /**
   * Split a single line that's too long
   */
  static splitLine(line: string, maxLength: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < line.length; i += maxLength) {
      chunks.push(line.slice(i, i + maxLength));
    }
    return chunks;
  }
}
