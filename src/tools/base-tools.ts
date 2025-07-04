/**
 * 基础工具模块
 * 
 * 提供不需要 agent 上下文的独立工具
 * 如时间查询、数据库搜索等
 */
import { tool } from "ai";
import { z } from "zod";
import type { LocalTime, DatabaseSearchResult } from "./types";

/**
 * 本地时间查询工具
 * 自动执行，无需用户确认，适用于低风险操作
 */
export const getLocalTime = tool({
  description: "get the local time for a specified location",
  parameters: z.object({
    location: z
      .string()
      .describe(
        "Location name (city, country, or timezone) to get the current time for"
      ),
  }),
  execute: async ({ location }): Promise<LocalTime> => {
    console.log(`Getting local time for ${location}`);

    try {
      // 映射常见中文城市名到时区ID
      const timezoneMap: Record<string, string> = {
        北京: "Asia/Shanghai",
        上海: "Asia/Shanghai",
        广州: "Asia/Shanghai",
        深圳: "Asia/Shanghai",
        杭州: "Asia/Shanghai",
        成都: "Asia/Shanghai",
        重庆: "Asia/Shanghai",
        西安: "Asia/Shanghai",
        南京: "Asia/Shanghai",
        武汉: "Asia/Shanghai",
        中国: "Asia/Shanghai",
        香港: "Asia/Hong_Kong",
        澳门: "Asia/Macau",
        台北: "Asia/Taipei",
        东京: "Asia/Tokyo",
        首尔: "Asia/Seoul",
        新加坡: "Asia/Singapore",
        曼谷: "Asia/Bangkok",
        雅加达: "Asia/Jakarta",
        马尼拉: "Asia/Manila",
        悉尼: "Australia/Sydney",
        墨尔本: "Australia/Melbourne",
        伦敦: "Europe/London",
        巴黎: "Europe/Paris",
        柏林: "Europe/Berlin",
        莫斯科: "Europe/Moscow",
        纽约: "America/New_York",
        洛杉矶: "America/Los_Angeles",
        芝加哥: "America/Chicago",
        多伦多: "America/Toronto",
        温哥华: "America/Vancouver",
      };

      // 获取位置对应的时区
      let timezone = timezoneMap[location];

      // 如果映射表中没有找到，尝试直接使用位置作为时区
      if (!timezone) {
        // 常见时区模式
        if (
          location.toLowerCase().includes("utc") ||
          location.toLowerCase().includes("gmt")
        ) {
          timezone = "UTC";
        } else {
          // 默认使用上海时区处理中文位置
          timezone = "Asia/Shanghai";
        }
      }

      // 获取指定时区的当前时间
      const now = new Date();
      const timestamp = now.getTime();
      
      const timeString = now.toLocaleString("zh-CN", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const time12Hour = now.toLocaleString("zh-CN", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });

      // 获取中文星期
      const dayOfWeek = now.toLocaleDateString("zh-CN", {
        timeZone: timezone,
        weekday: "long",
      });

      const utcString = now.toISOString();

      return {
        location,
        timeString24: timeString.split(" ")[1],
        timeString12: time12Hour,
        dayOfWeek,
        date: timeString.split(" ")[0],
        timezone,
        timestamp,
        utcString,
      };
    } catch (error) {
      console.error("Error getting local time:", error);
      throw error;
    }
  },
});

/**
 * 数据库搜索工具
 * 通过 agent 自动执行
 */
export const searchDatabase = tool({
  description:
    "search the users database for people by name, email, or department",
  parameters: z.object({
    query: z
      .string()
      .describe("Search query to find users by name, email, or department"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return (default: 10)"),
  }),
  execute: async ({ query, limit = 10 }): Promise<DatabaseSearchResult> => {
    console.log(`Searching database for: ${query} (limit: ${limit})`);

    try {
      // TODO: 实现真实的数据库搜索功能
      const startTime = Date.now();
      const searchTime = Date.now() - startTime;

      return {
        query,
        results: [], // 暂时返回空结果
        totalCount: 0,
        searchTime,
      };
    } catch (error) {
      console.error("Database search failed:", error);
      throw error;
    }
  },
}); 