/**
 * 任务管理工具模块
 * 
 * 提供任务调度、查看、取消、清理等功能
 */
import { tool } from "ai";
import { z } from "zod";
import { unstable_scheduleSchema } from "agents/schedule";
import type { Chat } from "../server";
import type { 
  TaskActionResult, 
  TaskList, 
  TaskCleanupResult 
} from "./types";

/**
 * 时间格式化工具函数
 */
const formatTimeRemaining = (ms: number): string => {
  if (ms <= 0) return "已过期";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "即将执行";
  if (minutes < 60) return `还有 ${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `还有 ${hours} 小时`;
  const days = Math.round(hours / 24);
  return `还有 ${days} 天`;
};

const formatFriendlyTime = (dateTime: Date): string => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDate = new Date(
    dateTime.getFullYear(),
    dateTime.getMonth(),
    dateTime.getDate()
  );

  const timeStr = dateTime.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const dayDiff = Math.round(
    (taskDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
  );

  if (dayDiff === 0) return `今天 ${timeStr}`;
  if (dayDiff === 1) return `明天 ${timeStr}`;
  if (dayDiff === -1) return `昨天 ${timeStr}`;
  if (dayDiff > 1 && dayDiff <= 7) {
    const weekday = dateTime.toLocaleDateString("zh-CN", {
      timeZone: "Asia/Shanghai",
      weekday: "long",
    });
    return `${weekday} ${timeStr}`;
  }
  return dateTime.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

/**
 * 创建任务调度工具
 */
export const createScheduleTaskTool = (agent: Chat) => {
  return tool({
    description:
      "Create scheduled reminders/tasks when user requests time-based reminders. Use when user says: '1分钟后提醒我', '明天8点提醒我', '设置提醒' etc. Extract time and description from user input.",
    parameters: unstable_scheduleSchema,
    execute: async ({ when, description }): Promise<TaskActionResult> => {
      console.log("🔧 scheduleTask 工具被调用!");
      console.log("🔧 收到参数:", { when, description });

      if (when.type === "no-schedule") {
        console.log("🔧 无效的调度输入类型:", when.type);
        return {
          success: false,
          message: "无效的调度输入",
          taskId: undefined,
          description,
        };
      }

      const input =
        when.type === "scheduled"
          ? when.date
          : when.type === "delayed"
            ? when.delayInSeconds
            : null;

      if (input === null || input === undefined) {
        return {
          success: false,
          message: "无效的调度参数",
          taskId: undefined,
          description,
        };
      }

      try {
        const newTask = await agent.schedule(input, "executeTask", description);
        console.log("🔧 任务调度成功!", { taskId: newTask.id, description });

        // 处理时间显示和消息格式
        let executionDateTime: Date;
        let timeRemainingMs: number;

        if (when.type === "delayed" && when.delayInSeconds) {
          executionDateTime = new Date(Date.now() + when.delayInSeconds * 1000);
          timeRemainingMs = when.delayInSeconds * 1000;
        } else if (when.type === "scheduled" && when.date) {
          if (typeof when.date === "string") {
            executionDateTime = new Date(when.date);
          } else if (typeof when.date === "number") {
            if (when.date < 2147483647) {
              executionDateTime = new Date(when.date * 1000);
            } else {
              executionDateTime = new Date(when.date);
            }
          } else {
            executionDateTime = when.date;
          }
          timeRemainingMs = executionDateTime.getTime() - Date.now();
        } else {
          throw new Error("无效的时间参数");
        }

        const friendlyTime = formatFriendlyTime(executionDateTime);
        const timeRemaining = formatTimeRemaining(timeRemainingMs);

        return {
          success: true,
          message: "任务创建成功",
          taskId: newTask.id,
          description,
          executionTime: friendlyTime,
          timeRemaining,
        };
      } catch (error) {
        console.log("🔧 调度任务失败:", error);
        return {
          success: false,
          message: "创建任务失败",
          taskId: undefined,
          description,
        };
      }
    },
  });
};

/**
 * 创建获取任务列表工具
 */
export const createGetScheduledTasksTool = (agent: Chat) => {
  return tool({
    description:
      "📋 LIST existing scheduled tasks. Use when user asks: '查看任务', '任务列表', '当前任务', '我有什么任务', '任务状态'. Shows all pending reminders with time and descriptions including task IDs.",
    parameters: z.object({}),
    execute: async (): Promise<TaskList> => {
      console.log("🔧 getScheduledTasks 工具被调用! 查询现有任务列表");

      try {
        const tasks = agent.getSchedules();
        const now = new Date();

        // 清理过期任务
        const expiredTasks = tasks.filter((task) => {
          let isExpired = false;

          if (task.type === "scheduled") {
            let scheduledTime: Date;
            if (typeof task.time === "number" && task.time < 2147483647) {
              scheduledTime = new Date(task.time * 1000);
            } else {
              scheduledTime = new Date(task.time);
            }
            isExpired = scheduledTime.getTime() < now.getTime() - 5 * 60 * 1000;
          } else if (task.type === "delayed") {
            const executionTime = new Date(task.time * 1000);
            isExpired = executionTime.getTime() < now.getTime() - 5 * 60 * 1000;
          }

          return isExpired;
        });

        // 清理过期任务
        for (const expiredTask of expiredTasks) {
          try {
            console.log(`🧹 自动清理过期任务: ${expiredTask.id} - ${expiredTask.payload}`);
            await agent.cancelSchedule(expiredTask.id);
          } catch (cleanupError) {
            console.warn(`清理过期任务失败: ${expiredTask.id}`, cleanupError);
          }
        }

        // 重新获取清理后的任务列表
        const currentTasks = agent.getSchedules();
        const totalCount = currentTasks.length;
        const taskInfos: TaskList["tasks"] = [];
        let validCount = 0;

        currentTasks.forEach((task) => {
          let executionDateTime: Date;
          let status: "pending" | "expired" | "unknown" = "unknown";

          if (task.type === "scheduled") {
            if (typeof task.time === "number" && task.time < 2147483647) {
              executionDateTime = new Date(task.time * 1000);
            } else {
              executionDateTime = new Date(task.time);
            }
          } else if (task.type === "delayed") {
            executionDateTime = new Date(task.time * 1000);
          } else {
            taskInfos.push({
              id: task.id,
              description: task.payload,
              executionTime: `${task.time} (${task.type})`,
              executionTimestamp: typeof task.time === 'number' ? task.time : Date.now(),
              status: "unknown",
            });
            return;
          }

          const timeDiff = executionDateTime.getTime() - now.getTime();
          if (timeDiff > 0) {
            status = "pending";
            validCount++;
          } else {
            status = "expired";
          }

          taskInfos.push({
            id: task.id,
            description: task.payload,
            executionTime: formatFriendlyTime(executionDateTime),
            executionTimestamp: executionDateTime.getTime(),
            timeRemaining: formatTimeRemaining(timeDiff),
            timeRemainingMs: timeDiff,
            status,
          });
        });

        return {
          tasks: taskInfos,
          totalCount,
          validCount,
          expiredCount: totalCount - validCount,
        };
      } catch (error) {
        console.error("Error listing scheduled tasks", error);
        return {
          tasks: [],
          totalCount: 0,
          validCount: 0,
          expiredCount: 0,
        };
      }
    },
  });
};

/**
 * 创建取消任务工具
 */
export const createCancelScheduledTaskTool = (agent: Chat) => {
  return tool({
    description:
      "🗑️ CANCEL scheduled task. Use when user says: '取消任务', '删除提醒', '取消锻炼提醒', '取消XXX任务'. Can work with task description or ID.",
    parameters: z.object({
      taskDescription: z
        .string()
        .describe(
          "Description of the task to cancel (e.g., '锻炼', '提醒') or exact task ID"
        ),
    }),
    execute: async ({ taskDescription }): Promise<TaskActionResult> => {
      try {
        const tasks = agent.getSchedules();

        // 智能匹配：优先通过描述匹配，其次通过ID
        let taskToCancel = tasks.find((task) =>
          task.payload.toLowerCase().includes(taskDescription.toLowerCase())
        );

        if (!taskToCancel) {
          taskToCancel = tasks.find((task) => task.id === taskDescription);
        }

        if (!taskToCancel) {
          return {
            success: false,
            message: `未找到匹配的任务："${taskDescription}"`,
            taskId: undefined,
            description: taskDescription,
          };
        }

        await agent.cancelSchedule(taskToCancel.id);

        return {
          success: true,
          message: "任务已取消",
          taskId: taskToCancel.id,
          description: taskToCancel.payload,
        };
      } catch (error) {
        console.error("Error canceling scheduled task", error);
        return {
          success: false,
          message: "取消任务失败",
          taskId: undefined,
          description: taskDescription,
        };
      }
    },
  });
};

/**
 * 创建清理过期任务工具
 */
export const createCleanupExpiredTasksTool = (agent: Chat) => {
  return tool({
    description: "Clean up all expired tasks from the system",
    parameters: z.object({}),
    execute: async (): Promise<TaskCleanupResult> => {
      console.log("🧹 清理过期任务工具被调用");

      try {
        const tasks = agent.getSchedules();
        const now = new Date();
        let cleanedCount = 0;

        console.log(`🧹 当前任务总数: ${tasks.length}`);

        for (const task of tasks) {
          let isExpired = false;

          if (task.type === "scheduled") {
            let scheduledTime: Date;
            if (typeof task.time === "number" && task.time < 2147483647) {
              scheduledTime = new Date(task.time * 1000);
            } else {
              scheduledTime = new Date(task.time);
            }
            isExpired = scheduledTime.getTime() < now.getTime() - 2 * 60 * 1000;
          } else if (task.type === "delayed") {
            const executionTime = new Date(task.time * 1000);
            isExpired = executionTime.getTime() < now.getTime() - 2 * 60 * 1000;
          }

          if (isExpired) {
            try {
              console.log(`🧹 清理过期任务: ${task.id} - ${task.payload}`);
              await agent.cancelSchedule(task.id);
              cleanedCount++;
            } catch (cleanupError) {
              console.warn(`清理任务失败: ${task.id}`, cleanupError);
            }
          }
        }

        const remainingTasks = agent.getSchedules();

        return {
          success: true,
          message: "任务清理完成",
          cleanedCount,
          remainingCount: remainingTasks.length,
          details: cleanedCount > 0 ? "已自动清理过期任务，系统更清爽了！" : "没有发现过期任务需要清理。"
        };
      } catch (error) {
        console.error("清理过期任务时出错:", error);
        return {
          success: false,
          message: "清理过期任务失败",
          cleanedCount: 0,
          remainingCount: 0,
          details: error instanceof Error ? error.message : String(error)
        };
      }
    },
  });
}; 