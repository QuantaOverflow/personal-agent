/**
 * 工具返回值的 Zod Schema 定义
 * 
 * 所有工具的结构化返回数据模式定义
 * 保持类型安全和一致性，便于维护和重用
 */
import { z } from "zod";

// ===== 天气相关 Schema =====

/**
 * 天气数据返回结构
 */
export const weatherDataSchema = z.object({
  city: z.string().describe("The name of the city."),
  temperature: z.number().describe("The current temperature in Celsius."),
  temperatureString: z.string().describe("Temperature with unit (e.g., '25°C')"),
  condition: z.string().describe("A brief description of the weather condition."),
  humidity: z.number().describe("The current humidity percentage."),
  windSpeed: z.number().describe("The current wind speed in meters per second."),
  country: z.string().optional().describe("Country name"),
  coordinates: z.object({
    lat: z.number(),
    lon: z.number(),
  }).optional(),
});

/**
 * 单个天气预报项数据结构
 */
export const weatherForecastItemSchema = z.object({
  dateTime: z.string().describe("Forecast date and time (YYYY-MM-DD HH:mm:ss)"),
  timestamp: z.number().describe("Unix timestamp for the forecast time"),
  temperature: z.number().describe("Temperature in Celsius"),
  temperatureString: z.string().describe("Temperature with unit (e.g., '25°C')"),
  condition: z.string().describe("Weather condition description"),
  humidity: z.number().describe("Humidity percentage"),
  windSpeed: z.number().describe("Wind speed in meters per second"),
  precipitation: z.number().optional().describe("Precipitation probability (0-1)"),
});

/**
 * 天气预报数据返回结构（5天预报）
 */
export const weatherForecastSchema = z.object({
  city: z.string().describe("The name of the city"),
  country: z.string().describe("Country name"),
  coordinates: z.object({
    lat: z.number(),
    lon: z.number(),
  }),
  forecastDays: z.number().describe("Number of forecast days"),
  forecasts: z.array(weatherForecastItemSchema).describe("Array of weather forecast items"),
  timezone: z.string().optional().describe("Timezone information"),
});

// ===== 任务管理相关 Schema =====

/**
 * 任务信息结构
 */
export const taskInfoSchema = z.object({
  id: z.string(),
  description: z.string(),
  executionTime: z.string(),
  executionTimestamp: z.number(),
  timeRemaining: z.string().optional(),
  timeRemainingMs: z.number().optional(),
  status: z.enum(["pending", "expired", "unknown"]),
});

/**
 * 任务列表返回结构
 */
export const taskListSchema = z.object({
  tasks: z.array(taskInfoSchema),
  totalCount: z.number(),
  validCount: z.number(),
  expiredCount: z.number(),
});

/**
 * 任务操作结果结构（创建、取消等操作的返回值）
 */
export const taskActionResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  taskId: z.string().optional(),
  description: z.string().optional(),
  executionTime: z.string().optional(),
  timeRemaining: z.string().optional(),
});

/**
 * 任务清理操作返回结构
 */
export const taskCleanupResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  cleanedCount: z.number(),
  remainingCount: z.number(),
  details: z.string().optional(),
});

// ===== 时间相关 Schema =====

/**
 * 本地时间查询返回结构
 */
export const localTimeSchema = z.object({
  location: z.string(),
  timeString24: z.string(),
  timeString12: z.string(),
  dayOfWeek: z.string(),
  date: z.string(),
  timezone: z.string(),
  timestamp: z.number(),
  utcString: z.string().optional(),
});

// ===== 对话管理相关 Schema =====

/**
 * 对话统计信息返回结构
 */
export const conversationStatsSchema = z.object({
  messageCount: z.number(),
  userId: z.string().optional(),
  chatId: z.string().optional(),
});

/**
 * 对话历史操作返回结构
 */
export const conversationActionResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  action: z.enum(["view", "clear"]),
  details: z.string().optional(),
});

// ===== 数据库相关 Schema =====

/**
 * 数据库搜索返回结构
 */
export const databaseSearchSchema = z.object({
  query: z.string(),
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().optional(),
    department: z.string().optional(),
  })),
  totalCount: z.number(),
  searchTime: z.number(),
});

// ===== 通用 Schema =====

/**
 * 通用错误返回结构
 */
export const errorResultSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  details: z.string().optional(),
}); 