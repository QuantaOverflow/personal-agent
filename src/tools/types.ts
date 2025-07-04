/**
 * 工具类型定义
 * 
 * 从 Zod schema 推导出的 TypeScript 类型
 * 确保类型安全和一致性
 */
import { z } from "zod";
import * as schemas from "./schemas";

// ===== 天气相关类型 =====
export type WeatherData = z.infer<typeof schemas.weatherDataSchema>;
export type WeatherForecastItem = z.infer<typeof schemas.weatherForecastItemSchema>;
export type WeatherForecast = z.infer<typeof schemas.weatherForecastSchema>;

// ===== 任务管理相关类型 =====
export type TaskInfo = z.infer<typeof schemas.taskInfoSchema>;
export type TaskList = z.infer<typeof schemas.taskListSchema>;
export type TaskActionResult = z.infer<typeof schemas.taskActionResultSchema>;
export type TaskCleanupResult = z.infer<typeof schemas.taskCleanupResultSchema>;

// ===== 时间相关类型 =====
export type LocalTime = z.infer<typeof schemas.localTimeSchema>;

// ===== 对话管理相关类型 =====
export type ConversationStats = z.infer<typeof schemas.conversationStatsSchema>;
export type ConversationActionResult = z.infer<typeof schemas.conversationActionResultSchema>;

// ===== 数据库相关类型 =====
export type DatabaseSearchResult = z.infer<typeof schemas.databaseSearchSchema>;

// ===== 通用类型 =====
export type ErrorResult = z.infer<typeof schemas.errorResultSchema>;

// ===== 工具上下文类型 =====
export interface ToolContext {
  env?: any;
  agent?: any;
} 