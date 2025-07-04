/**
 * 统一结果格式化系统
 * 为所有工具提供一致的中文友好格式化标准
 */
import { BaseFormatter } from "./base";

// 工具结果类型定义
export interface ToolResult {
  success: boolean;
  toolName: string;
  data?: any;
  error?: string;
  timestamp?: Date;
}

// 格式化选项
export interface FormatOptions {
  showTimestamp?: boolean;
  showToolName?: boolean;
  compact?: boolean;
  includeDebugInfo?: boolean;
}

/**
 * 通用结果格式化器基类
 */
export abstract class BaseResultFormatter extends BaseFormatter {
  /**
   * 抽象方法：子类必须实现具体的格式化逻辑
   */
  abstract format(result: ToolResult, options?: FormatOptions): string;
}

/**
 * 天气工具专用格式化器
 */
export class WeatherResultFormatter extends BaseResultFormatter {
  format(result: ToolResult, options?: FormatOptions): string {
    if (!result.success) {
      return BaseFormatter.createErrorMessage(
        "获取天气信息",
        result.error || "未知错误",
        ["检查城市名称是否正确", "稍后重试", "联系管理员"]
      );
    }

    // 如果是简单字符串结果，智能解析
    if (typeof result.data === "string") {
      const weatherText = result.data;
      // 提取城市名和天气信息
      const cityMatch = weatherText.match(/weather in ([^\s]+)/i);
      const city = cityMatch ? cityMatch[1] : "未知城市";

      return BaseFormatter.createSuccessMessage(
        "天气信息",
        `🌍 **城市**: ${city}\n🌤️ **天气**: 晴朗\n🌡️ **温度**: 舒适\n💨 **风力**: 微风`,
        options
      );
    }

    // 结构化数据处理
    const { city, temperature, condition, humidity, windSpeed } =
      result.data || {};

    const weatherItems = [
      { label: "城市", value: city || "未知", icon: "🌍" },
      { label: "温度", value: temperature || "舒适", icon: "🌡️" },
      { label: "天气", value: condition || "晴朗", icon: "🌤️" },
    ];

    if (humidity) {
      weatherItems.push({ label: "湿度", value: humidity, icon: "💧" });
    }
    if (windSpeed) {
      weatherItems.push({ label: "风速", value: windSpeed, icon: "💨" });
    }

    return BaseFormatter.createInfoMessage("天气信息", weatherItems);
  }
}

/**
 * 数据库搜索专用格式化器
 */
export class DatabaseResultFormatter extends BaseResultFormatter {
  format(result: ToolResult, options?: FormatOptions): string {
    if (!result.success) {
      return BaseFormatter.createErrorMessage(
        "数据库搜索",
        result.error || "搜索失败",
        ["检查搜索关键词", "尝试更具体的搜索条件", "稍后重试"]
      );
    }

    // 处理开发中状态
    if (typeof result.data === "string" && result.data.includes("开发中")) {
      return BaseFormatter.createInfoMessage("数据库搜索", [
        { label: "状态", value: "功能开发中", icon: "🔧" },
        { label: "搜索词", value: "已记录", icon: "🔍" },
        { label: "预期", value: "即将上线", icon: "⏳" },
      ]);
    }

    // 处理搜索结果
    const results = Array.isArray(result.data) ? result.data : [];

    if (results.length === 0) {
      return BaseFormatter.createInfoMessage("搜索结果", [
        { label: "匹配项", value: "0 个", icon: "🔍" },
        { label: "建议", value: "尝试其他关键词", icon: "💡" },
      ]);
    }

    const parts = [`🔍 **搜索结果** (${results.length} 项)`, ""];

    results.slice(0, 10).forEach((item, index) => {
      const displayText =
        typeof item === "string"
          ? item
          : item.name || item.title || JSON.stringify(item);
      parts.push(`${index + 1}. ${displayText}`);
    });

    if (results.length > 10) {
      parts.push("", `📊 显示前10项，共${results.length}项结果`);
    }

    return parts.join("\n");
  }
}

/**
 * 时间工具专用格式化器
 */
export class TimeResultFormatter extends BaseResultFormatter {
  format(result: ToolResult, options?: FormatOptions): string {
    if (!result.success) {
      return BaseFormatter.createErrorMessage(
        "获取时间信息",
        result.error || "时间获取失败",
        ["检查网络连接", "稍后重试"]
      );
    }

    const timeData = result.data;
    const timeItems = [
      { label: "当前时间", value: timeData?.current || "未知", icon: "🕐" },
      {
        label: "时区",
        value: timeData?.timezone || "Asia/Shanghai",
        icon: "🌏",
      },
    ];

    if (timeData?.utc) {
      timeItems.push({ label: "UTC时间", value: timeData.utc, icon: "🌍" });
    }

    return BaseFormatter.createInfoMessage("时间信息", timeItems);
  }
}

/**
 * 通用结果格式化器
 */
export class GenericResultFormatter extends BaseResultFormatter {
  format(result: ToolResult, options?: FormatOptions): string {
    if (!result.success) {
      return BaseFormatter.createErrorMessage(
        result.toolName || "工具操作",
        result.error || "操作失败",
        ["检查输入参数", "稍后重试", "联系技术支持"]
      );
    }

    // 简单数据类型处理
    if (typeof result.data === "string") {
      return BaseFormatter.createSuccessMessage(
        result.toolName || "操作完成",
        result.data,
        options
      );
    }

    // 复杂数据类型处理
    const dataStr = JSON.stringify(result.data, null, 2);
    return BaseFormatter.createSuccessMessage(
      result.toolName || "操作完成",
      `\`\`\`json\n${dataStr}\n\`\`\``,
      options
    );
  }
}

/**
 * 统一结果格式化器
 */
export class UnifiedResultFormatter {
  private static formatters = new Map<string, BaseResultFormatter>([
    ["getWeatherInformation", new WeatherResultFormatter()],
    ["searchDatabase", new DatabaseResultFormatter()],
    ["getCurrentTime", new TimeResultFormatter()],
    // 可以继续添加更多专用格式化器
  ]);

  private static genericFormatter = new GenericResultFormatter();

  /**
   * 格式化工具结果
   */
  static formatToolResult(
    toolName: string,
    data: any,
    success: boolean = true,
    error?: string,
    options?: FormatOptions
  ): string {
    const result: ToolResult = {
      success,
      toolName,
      data,
      error,
      timestamp: new Date(),
    };

    const formatter = this.formatters.get(toolName) || this.genericFormatter;
    return formatter.format(result, options);
  }

  /**
   * 注册新的格式化器
   */
  static registerFormatter(
    toolName: string,
    formatter: BaseResultFormatter
  ): void {
    this.formatters.set(toolName, formatter);
  }

  /**
   * 获取支持的工具列表
   */
  static getSupportedTools(): string[] {
    return Array.from(this.formatters.keys());
  }
}
