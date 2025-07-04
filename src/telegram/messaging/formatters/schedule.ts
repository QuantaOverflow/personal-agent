/**
 * 专门用于格式化调度工具结果的Telegram显示格式化器
 * 提供统一的中文友好显示格式
 */
import { BaseFormatter } from "./base";

interface ScheduledTaskInfo {
  id: string;
  description: string;
  executionTime: string;
  timeRemaining?: string;
  status: "pending" | "expired" | "unknown";
}

interface TaskListInfo {
  tasks: ScheduledTaskInfo[];
  totalCount: number;
  validCount: number;
  showIds?: boolean;
}

export class ScheduleFormatter extends BaseFormatter {
  /**
   * 格式化任务创建成功的消息
   */
  static formatTaskCreated(
    description: string,
    executionTime: string,
    taskId: string,
    timeRemaining?: string,
    showTaskId: boolean = true
  ): string {
    let content = [
      "✅ **任务创建成功！**",
      "",
      `📝 **任务描述**: ${description}`,
      `⏰ **执行时间**: ${executionTime}`,
    ];

    if (timeRemaining) {
      content.push(`⏱️ **倒计时**: ${timeRemaining}`);
    }

    if (showTaskId) {
      content.push(`🆔 **任务ID**: ${taskId}`);
    }

    content.push("", "任务已加入调度系统，届时将自动提醒您！");

    return content.join("\n");
  }

  /**
   * 格式化任务列表显示
   */
  static formatTaskList(taskListInfo: TaskListInfo): string {
    const { tasks, totalCount, validCount, showIds = true } = taskListInfo;

    if (totalCount === 0) {
      return [
        "📋 **当前任务状态**",
        "",
        "🎉 当前没有正在进行的任务",
        "所有任务已完成或过期",
        "",
        "💡 需要安排新的任务吗？",
      ].join("\n");
    }

    const header = `📋 **当前任务列表** (${validCount}/${totalCount} 个有效)`;

    let content = [header, ""];

    tasks.forEach((task, index) => {
      const statusIcon = ScheduleFormatter.getStatusIcon(task.status);
      const taskNumber = `${index + 1}.`;

      content.push(
        `${taskNumber} ${statusIcon} **${task.description}**`,
        `   ⏰ ${task.executionTime}`
      );

      if (task.timeRemaining) {
        content.push(`   ⏱️ ${task.timeRemaining}`);
      }

      if (showIds) {
        content.push(`   🆔 ${task.id}`);
      }

      content.push("");
    });

    if (validCount < totalCount) {
      const expiredCount = totalCount - validCount;
      content.push(`🧹 已自动清理 ${expiredCount} 个过期任务`);
    }

    return content.join("\n");
  }

  /**
   * 格式化任务取消的消息
   */
  static formatTaskCancelled(
    taskId: string,
    description?: string,
    wasScheduled?: boolean,
    showTaskId: boolean = true
  ): string {
    let content = ["🗑️ **任务已取消**", ""];

    if (description) {
      content.push(`📝 **任务内容**: ${description}`);
    }

    if (showTaskId) {
      content.push(`🆔 **任务ID**: ${taskId}`);
    }

    if (wasScheduled) {
      content.push(`✅ **状态**: 已从调度系统中移除`);
    }

    content.push("", "💡 任务已成功取消，不会再发送提醒");

    return content.join("\n");
  }

  /**
   * 格式化时间剩余显示
   */
  static formatTimeRemaining(timeDiffMs: number): string {
    if (timeDiffMs <= 0) {
      return "⚠️ 已过期";
    }

    const minutes = Math.round(timeDiffMs / 60000);

    if (minutes < 1) {
      return "⚡ 即将执行";
    } else if (minutes < 60) {
      return `还有 ${minutes} 分钟`;
    } else {
      const hours = Math.round(minutes / 60);
      if (hours < 24) {
        return `还有 ${hours} 小时`;
      } else {
        const days = Math.round(hours / 24);
        return `还有 ${days} 天`;
      }
    }
  }

  /**
   * 格式化友好的时间显示
   */
  static formatFriendlyTime(dateTime: Date): string {
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

    if (dayDiff === 0) {
      return `今天 ${timeStr}`;
    } else if (dayDiff === 1) {
      return `明天 ${timeStr}`;
    } else if (dayDiff === -1) {
      return `昨天 ${timeStr}`;
    } else if (dayDiff > 1 && dayDiff <= 7) {
      const weekday = dateTime.toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        weekday: "long",
      });
      return `${weekday} ${timeStr}`;
    } else {
      return dateTime.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
  }

  /**
   * 获取状态图标
   */
  private static getStatusIcon(
    status: "pending" | "expired" | "unknown"
  ): string {
    switch (status) {
      case "pending":
        return "⏳";
      case "expired":
        return "⚠️";
      case "unknown":
      default:
        return "❓";
    }
  }

  /**
   * 格式化错误消息
   */
  static formatError(operation: string, error: string): string {
    return BaseFormatter.createErrorMessage(operation, error, [
      "检查输入格式",
      "稍后重试",
      "联系技术支持",
    ]);
  }
}

// 向后兼容性导出
export const TelegramScheduleFormatter = ScheduleFormatter;
