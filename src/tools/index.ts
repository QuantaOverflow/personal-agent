/**
 * 工具模块主索引文件
 * 
 * 整合所有工具模块，提供统一的接口
 * 重构后的模块化架构，提高可维护性和扩展性
 */

// ===== 导出 Schema 和类型 =====
export * from "./schemas";
export * from "./types";

// ===== 导出各模块工具 =====
export * from "./weather";
export * from "./task-management";
export * from "./conversation";
export * from "./base-tools";

// ===== 导入所有工具创建函数 =====
import { createWeatherTool, createWeatherForecastTool } from "./weather";
import { 
  createScheduleTaskTool,
  createGetScheduledTasksTool,
  createCancelScheduledTaskTool,
  createCleanupExpiredTasksTool
} from "./task-management";
import {
  createViewConversationStatsTool,
  createClearConversationHistoryTool
} from "./conversation";
import { getLocalTime, searchDatabase } from "./base-tools";

import type { Chat } from "../server";

/**
 * 创建需要 agent 上下文的工具集合
 * 
 * @param agent - Chat agent 实例
 * @param env - 环境变量对象
 * @returns 包含所有 agent 相关工具的对象
 */
export function createAgentTools(agent: Chat, env?: any) {
  console.log("🔧 创建 Agent 特定工具，agent 上下文已注入");
  console.log("🔧 环境变量状态:", {
    envExists: !!env,
    hasOpenWeatherKey: !!env?.OPENWEATHER_API_KEY,
    keyLength: env?.OPENWEATHER_API_KEY?.length || 0,
  });

  return {
    // 任务管理工具
    scheduleTask: createScheduleTaskTool(agent),
    getScheduledTasks: createGetScheduledTasksTool(agent),
    cancelScheduledTask: createCancelScheduledTaskTool(agent),
    cleanupExpiredTasks: createCleanupExpiredTasksTool(agent),
    
    // 对话管理工具
    viewConversationStats: createViewConversationStatsTool(agent),
    clearConversationHistory: createClearConversationHistoryTool(agent),
    
    // 天气工具（需要环境变量）
    getWeatherInformation: createWeatherTool(env),
    getWeatherForecast: createWeatherForecastTool(env),
  };
}

/**
 * 基础工具集合
 * 不需要 agent 上下文的独立工具
 */
export const baseTools = {
  searchDatabase,
  getLocalTime,
};

/**
 * 执行状态跟踪对象
 * 保持与原有架构的兼容性
 */
export const executions = {};

/**
 * 工具配置选项接口
 */
export interface ToolConfig {
  agent?: Chat;
  env?: any;
  enableWeather?: boolean;
  enableTasks?: boolean;
  enableConversation?: boolean;
  enableDatabase?: boolean;
  enableTime?: boolean;
}

/**
 * 根据配置创建工具集合
 * 
 * @param config - 工具配置选项
 * @returns 配置的工具集合
 */
export function createToolsFromConfig(config: ToolConfig) {
  const tools: Record<string, any> = {};

  // 添加基础工具
  if (config.enableTime !== false) {
    tools.getLocalTime = getLocalTime;
  }
  
  if (config.enableDatabase !== false) {
    tools.searchDatabase = searchDatabase;
  }

  // 添加需要 agent 的工具
  if (config.agent) {
    if (config.enableTasks !== false) {
      tools.scheduleTask = createScheduleTaskTool(config.agent);
      tools.getScheduledTasks = createGetScheduledTasksTool(config.agent);
      tools.cancelScheduledTask = createCancelScheduledTaskTool(config.agent);
      tools.cleanupExpiredTasks = createCleanupExpiredTasksTool(config.agent);
    }

    if (config.enableConversation !== false) {
      tools.viewConversationStats = createViewConversationStatsTool(config.agent);
      tools.clearConversationHistory = createClearConversationHistoryTool(config.agent);
    }

    if (config.enableWeather !== false && config.env) {
      tools.getWeatherInformation = createWeatherTool(config.env);
      tools.getWeatherForecast = createWeatherForecastTool(config.env);
    }
  }

  return tools;
} 