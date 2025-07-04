# OpenWeatherMap API 集成配置指南

## 概述

已将天气查询功能从模拟数据升级为真实的 OpenWeatherMap API 集成。现在您可以获取世界各地城市的实时天气信息。

## 功能特性

✅ **两步精确查询**：城市名 → 经纬度 → 天气数据  
✅ **全球城市支持**：支持中英文城市名查询  
✅ **中文天气描述**：返回中文天气状况描述  
✅ **结构化数据**：温度、湿度、风速等详细信息  
✅ **错误处理**：友好的错误提示和建议  

## 配置步骤

### 1. 获取 OpenWeatherMap API Key

1. 访问 [OpenWeatherMap](https://openweathermap.org/api)
2. 注册免费账户
3. 在仪表板中生成 API Key
4. 免费账户每分钟可调用 60 次，每月调用 1,000,000 次

### 2. 配置环境变量

#### 方法 A：使用 Wrangler Secret（推荐用于生产环境）

```bash
# 安全地设置 API Key
npx wrangler secret put OPENWEATHER_API_KEY

# 系统会提示您输入 API Key 值
# 输入您的实际 API Key，例如：abc123def456ghi789
```

#### 方法 B：修改 wrangler.jsonc（用于开发测试）

在 `wrangler.jsonc` 中：

```jsonc
{
  "vars": { 
    "OPENWEATHER_API_KEY": "your_actual_api_key_here"
  }
}
```

⚠️ **注意**：方法 B 会将 API Key 存储在代码文件中，不建议用于生产环境。

### 3. 测试配置

运行测试脚本验证配置：

```bash
# 设置环境变量（如果使用方法 B 配置）
export OPENWEATHER_API_KEY="your_api_key_here"

# 运行测试脚本
node scripts/test-weather-api.js
```

成功输出示例：
```
🌤️ OpenWeatherMap API 测试脚本
=====================================
✅ API Key 已配置
🔍 测试地理编码 API...
📍 测试城市：北京
✅ 地理编码成功：Beijing, CN (39.9042, 116.4074)
🌡️ 测试天气数据 API...
✅ 天气数据获取成功！
📊 解析的天气信息：
   🌍 城市：Beijing, CN
   🌡️ 温度：24°C
   🌤️ 天气：多云
   💧 湿度：60%
   💨 风速：3.5 m/s

🎉 API 测试完成！OpenWeatherMap 配置正确。
```

## 使用方法

配置完成后，您可以通过以下方式查询天气：

### 聊天机器人查询

用户可以直接在聊天中询问天气：

- "北京的天气怎么样？"
- "查询上海天气"
- "What's the weather in London?"
- "纽约天气如何"

### API 集成

天气工具会自动：

1. **地理编码**：将城市名转换为精确的经纬度坐标
2. **天气查询**：使用坐标获取实时天气数据
3. **数据格式化**：将原始数据转换为友好的中文格式
4. **错误处理**：提供明确的错误信息和解决建议

## 支持的查询格式

| 查询类型 | 示例 | 说明 |
|---------|------|------|
| 中文城市名 | 北京、上海、广州 | 自动匹配中国城市 |
| 英文城市名 | London, New York | 国际城市英文名 |
| 城市+国家 | Paris, France | 避免同名城市混淆 |
| 拼音城市名 | Beijing, Shanghai | 中国城市拼音 |

## 返回数据格式

工具返回结构化的天气信息：

```javascript
{
  city: "北京, CN",           // 规范化城市名
  temperature: "24°C",        // 摄氏度温度
  condition: "多云",          // 中文天气描述
  humidity: "60%",           // 湿度百分比
  windSpeed: "3.5 m/s"       // 风速（米/秒）
}
```

## 错误处理

常见错误及解决方案：

| 错误类型 | 解决方案 |
|---------|----------|
| API Key 未配置 | 按照配置步骤设置环境变量 |
| 城市未找到 | 检查城市名拼写，尝试添加国家名 |
| API 调用失败 | 检查网络连接，确认 API Key 有效 |
| 请求超限 | 等待一分钟后重试，或升级 API 套餐 |

## API 限制

免费账户限制：
- **调用频率**：60 次/分钟
- **每月总量**：1,000,000 次
- **数据延迟**：实时数据
- **历史数据**：不支持

如需更高频率或更多功能，可升级到付费套餐。

## 技术实现

### 两步查询流程

1. **Geocoding API**：`http://api.openweathermap.org/geo/1.0/direct`
   - 将城市名转换为经纬度
   - 支持模糊匹配和多语言

2. **Current Weather API**：`https://api.openweathermap.org/data/2.5/weather`
   - 使用精确坐标获取天气数据
   - 返回摄氏度温度和中文描述

### 数据处理

- **温度转换**：自动转换为摄氏度并四舍五入
- **语言本地化**：使用 `lang=zh_cn` 参数获取中文描述
- **单位标准化**：使用 `units=metric` 获取公制单位
- **错误回退**：在数据缺失时提供默认值

## 故障排除

### 测试失败

如果测试脚本失败，请检查：

1. **API Key 正确性**：确认从 OpenWeatherMap 复制的完整 Key
2. **网络连接**：确认可以访问外部 API
3. **环境变量**：确认 `OPENWEATHER_API_KEY` 已正确设置
4. **账户状态**：登录 OpenWeatherMap 检查账户是否正常

### 生产环境部署

部署到 Cloudflare Workers 时：

```bash
# 部署前设置密钥
npx wrangler secret put OPENWEATHER_API_KEY

# 部署应用
npx wrangler deploy
```

### 监控使用量

定期检查 OpenWeatherMap 仪表板：
- 监控 API 调用次数
- 查看错误率统计
- 确保未超出免费限额

---

🎉 **配置完成后，您的天气查询功能将提供真实、准确的全球天气数据！** 