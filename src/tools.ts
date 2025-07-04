/**
 * 工具定义 - 重构后的模块化架构
 * 
 * 此文件现在作为向后兼容的入口点，
 * 实际的工具实现已拆分到 tools/ 目录下的各个模块中
 * 
 * 架构优势：
 * 1. 职责分离：每个模块负责特定功能领域
 * 2. 可维护性：代码更易理解和修改
 * 3. 可扩展性：新工具可以独立开发和测试
 * 4. 类型安全：统一的 schema 和类型定义
 * 5. 向后兼容：保持原有 API 接口不变
 * 
 * 模块结构：
 * - tools/schemas.ts: 所有 Zod schema 定义
 * - tools/types.ts: TypeScript 类型定义
 * - tools/weather.ts: 天气查询工具
 * - tools/task-management.ts: 任务管理工具
 * - tools/conversation.ts: 对话管理工具
 * - tools/base-tools.ts: 基础独立工具
 * - tools/index.ts: 主索引文件
 */

// 重新导出所有工具模块的内容，保持向后兼容性
export * from "./tools/index";

// 为了完全向后兼容，也可以直接导入并重新导出主要函数
import { 
  createAgentTools as _createAgentTools,
  baseTools as _baseTools,
  executions as _executions
} from "./tools/index";

import type { Chat } from "./server";

// 保持原有的导出名称和接口
export const createAgentTools = _createAgentTools;
export const baseTools = _baseTools;
export const executions = _executions;

/**
 * 向后兼容的工具创建函数
 * 保持与原有代码的完全兼容性
 */
export function createTools(agent: Chat, env?: any) {
  return createAgentTools(agent, env);
} 