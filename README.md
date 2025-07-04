# 🤖 AI 聊天代理启动套件

![agents-header](https://github.com/user-attachments/assets/f6d99eeb-1803-4495-9c5e-3cf07a37b402)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents-starter"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

一个使用 Cloudflare 代理平台构建 AI 驱动聊天代理的启动模板，由 [`agents`](https://www.npmjs.com/package/agents) 提供支持。该项目为创建交互式聊天体验提供了基础，具有现代化 UI 和工具集成功能，包括完整的 Telegram 机器人集成。

## ✨ 核心特性

- 💬 **交互式聊天界面**：基于 React 构建的现代响应式 Web UI，提供无缝用户交互体验
- 🤖 **AI 后端**：利用 Cloudflare Workers 和 Durable Objects 实现可扩展且持久的 AI 聊天会话
- 🛠️ **可扩展工具系统**：
  - **自动执行工具**：无需用户干预即可执行操作的工具（如获取当前时间、安排任务）
  - **人工确认工具**：需要用户明确批准才能执行的工具，增强安全性和控制力
- 📅 **高级任务调度**：支持一次性、延迟和定期任务，包含完整的列表、取消和清理功能
- 📱 **Telegram 集成**：
  - **Webhook 处理**：处理传入的 Telegram 消息和更新
  - **机器人 API 客户端**：管理向 Telegram 发送消息和 UI 更新
  - **流式响应**：实时向 Telegram 用户传递 AI 响应，具有消息编辑功能
  - **速率限制和错误恢复**：包含复杂的机制来处理 API 限制和瞬态错误
  - **UI 管理**：支持 Telegram 特定的 UI 元素，如工具确认的内联键盘
- 🌓 **主题支持**：Web UI 中的明暗主题切换
- ⚡️ **实时流式响应**：减少感知延迟的增量消息更新
- 🔄 **状态管理**：使用 Cloudflare Durable Objects 持久存储对话历史和代理状态
- 🎨 **现代响应式 UI**：基于 Tailwind CSS 的美观界面设计
- 📊 **全面日志记录**：集成日志中间件用于跟踪 AI 模型输入和输出

## 🏗️ 项目架构

### 整体架构

系统采用清晰的关注点分离设计：

1. **前端 UI（Web/Telegram）**：处理用户交互
   - **Web UI**：用于直接聊天交互的 React 应用程序
   - **Telegram 机器人**：作为消息接口，处理来自 Telegram 的用户命令和消息

2. **Cloudflare Worker / Durable Object（后端逻辑）**：托管在 Cloudflare 全球网络上的 AI 代理核心
   - **`Chat` Durable Object**：每个对话的持久单实例对象，维护对话历史和代理状态
   - **AI 模型集成**：与外部 AI 提供商（如 OpenAI）通信
   - **工具执行**：包含基于 AI 模型决策执行各种工具的逻辑

3. **外部 API**：OpenAI、OpenWeatherMap 和 Telegram Bot API 等服务

## 📋 前置条件

开始之前，请确保您拥有：

- Cloudflare 账户
- OpenAI API 密钥（或其他 AI 模型提供商的密钥）
- Telegram Bot Token（如果打算使用 Telegram 集成）
- OpenWeatherMap API 密钥（用于天气功能）
- 已安装 Node.js 和 npm

## 🚀 快速开始

### 1. 创建新项目

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境

创建 `.dev.vars` 文件：

```env
OPENAI_API_KEY=your_openai_api_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
OPENWEATHER_API_KEY=your_openweather_api_key
```

**生产环境配置（推荐）**：

```bash
# 设置 Cloudflare Workers 密钥
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put OPENWEATHER_API_KEY
```

### 4. 本地运行

```bash
npm start
```

访问 `http://localhost:5173` 查看 Web 界面。

### 5. 部署

```bash
npm run deploy
```

### 6. Telegram Webhook 设置

部署后，设置 Telegram webhook：

```bash
curl -F "url=YOUR_WORKER_URL/telegram/webhook" https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook
```

例如：
```bash
curl -F "url=https://my-chat-agent.my-user.workers.dev/telegram/webhook" https://api.telegram.org/bot7757487340:AAF-crV6olrBN7kzyki5mji_hMKFBoru10g/setWebhook
```

## 📁 项目结构

```
src/telegram/
├── core/                    # 核心功能模块
│   ├── bot.ts              # Telegram Bot API 客户端
│   ├── handlers.ts         # 主要的 webhook 处理器
│   └── validation.ts       # 请求验证逻辑
├── infrastructure/          # 基础设施层
│   ├── rate-limiter.ts     # 高级速率限制器（从根目录移动）
│   └── ui-manager.ts       # UI 管理器
├── messaging/              # 消息处理模块
│   ├── commands.ts         # 命令处理
│   ├── converter.ts        # 消息转换器
│   └── formatters/         # 格式化器
│       ├── base.ts
│       ├── index.ts
│       ├── result.ts
│       └── schedule.ts
├── streaming/              # 流式响应模块
│   ├── error-recovery.ts   # 错误恢复管理（从根目录移动）
│   ├── handler.ts          # 流式响应处理器
│   └── state-manager.ts    # 状态管理器（从根目录移动）
├── utils/                  # 工具函数
│   └── demo.ts            # 演示函数（新创建）
├── index.ts               # 主导出文件
└── types.ts               # 类型定义
```

## 🛠️ 工具系统

### 自动执行工具

这些工具包含 `execute` 函数，由 AI 代理直接运行：

- `getLocalTime`：获取指定位置的当前本地时间
- `scheduleTask`：创建计划提醒或任务
- `getScheduledTasks`：列出所有待处理的计划任务
- `cancelScheduledTask`：按描述或 ID 取消特定计划任务
- `cleanupExpiredTasks`：清理已过期的任务
- `viewConversationStats`：检索当前对话的统计信息
- `clearConversationHistory`：清除对话中的所有历史消息
- `getWeatherInformation`：获取城市的实时天气数据
- `getWeatherForecast`：获取城市的 5 天天气预报

### 人工确认工具

这些工具需要用户明确批准才能执行：

- `searchDatabase`：搜索模拟用户数据库（示例工具）

### 添加新工具

在 `src/tools/` 目录中定义新工具：

```typescript
// 自动执行工具示例
const getCurrentTime = tool({
  description: "获取当前服务器时间",
  parameters: z.object({}),
  execute: async () => new Date().toISOString(),
});

// 需要确认的工具示例
const searchDatabase = tool({
  description: "搜索数据库中的用户记录",
  parameters: z.object({
    query: z.string(),
    limit: z.number().optional(),
  }),
  // 没有 execute 函数 = 需要确认
});
```

## 📱 使用示例

### Web UI 交互

1. 在浏览器中打开应用程序
2. 开始对话：
   - "你好，你是谁？"
   - "伦敦的天气怎么样？"
   - "告诉我东京的当前时间"
   - "5分钟后提醒我喝水"
   - "显示我的任务"

### Telegram 机器人交互

1. **基本命令**：
   - `/start`：初始化新对话
   - `/help`：显示机器人架构信息
   - `/testconfirm`：演示工具确认 UI
   - `/teststream`：启动流式响应测试

2. **自然语言查询**：
   - **天气查询**：
     - "北京的天气怎么样？"
     - "上海未来几天天气预报"
   - **时间查询**：
     - "东京现在几点？"
     - "当前北京时间"
   - **任务管理**：
     - "提醒我明天早上8点开会"
     - "5分钟后提醒我喝水"
     - "查看我的任务"
     - "取消喝水提醒"

## 🔧 自定义指南

### 更换 AI 模型提供商

项目默认使用 `@ai-sdk/openai`。您可以切换到其他提供商：

1. 安装新的提供商包：
```bash
npm install workers-ai-provider
```

2. 更新 `src/server.ts`：
```typescript
// 更改导入
import { createWorkersAI } from 'workers-ai-provider';

// 创建 Workers AI 实例
const workersai = createWorkersAI({ binding: env.AI });
const model = workersai("@cf/deepseek-ai/deepseek-r1-distill-qwen-32b");
```

3. 更新 `wrangler.jsonc`（如有必要）：
```jsonc
{
  "ai": {
    "binding": "AI"
  }
}
```

### 修改 UI

- **`src/app.tsx`**：包含主要聊天界面逻辑
- **`src/components/`**：可重用的 UI 组件
- **`src/styles.css`**：使用 Tailwind CSS 的应用程序样式

## 🎯 示例用例

1. **客服代理**：票务创建/查找、订单状态检查、产品推荐
2. **开发助手**：代码检查、Git 操作、文档搜索
3. **数据分析助手**：数据库查询、数据可视化、统计分析
4. **个人生产力助手**：任务调度、任务跟踪、邮件起草
5. **调度助手**：一次性事件调度、延迟任务执行、定期任务

## 🔍 故障排除

- **缺少 API 密钥**：检查 `.dev.vars` 文件和 Cloudflare Worker 密钥配置
- **Telegram Webhook 错误**：确保 webhook URL 正确设置且可从 Telegram 访问
- **速率限制**：系统包含强大的速率限制，会自动退避
- **Durable Object 状态问题**：验证 `wrangler.jsonc` 中的绑定配置

## 📚 了解更多

- [`agents`](https://github.com/cloudflare/agents/blob/main/packages/agents/README.md)
- [Cloudflare Agents 文档](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)

## 📄 许可证

MIT
