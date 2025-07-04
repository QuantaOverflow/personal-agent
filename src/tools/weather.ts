/**
 * 天气查询工具模块
 * 
 * 提供天气信息查询功能
 */
import { tool } from "ai";
import { z } from "zod";
import type { WeatherData, WeatherForecast, WeatherForecastItem } from "./types";

/**
 * 天气查询函数 - 返回结构化数据
 */
export const getWeatherData = async (city: string, apiKey: string): Promise<WeatherData> => {
  console.log(`🌤️ 工具内部方法: 正在获取 ${city} 的天气信息...`);

  try {
    if (!apiKey) {
      throw new Error("OpenWeatherMap API Key 未配置。请联系管理员设置 OPENWEATHER_API_KEY 环境变量。");
    }

    console.log(`🔍 第1步：将城市名 "${city}" 转换为经纬度坐标...`);

    // 第1步：使用地理编码 API 将城市名转换为经纬度
    const geocodingUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${apiKey}`;

    const geocodingResponse = await fetch(geocodingUrl);
    if (!geocodingResponse.ok) {
      throw new Error(
        `地理编码请求失败: ${geocodingResponse.status} ${geocodingResponse.statusText}`
      );
    }

    const geocodingData = (await geocodingResponse.json()) as Array<{
      name: string;
      lat: number;
      lon: number;
      country: string;
      state?: string;
    }>;

    if (!geocodingData || geocodingData.length === 0) {
      throw new Error(`未找到城市 "${city}"，请检查城市名称是否正确。`);
    }

    const { lat, lon, name: foundCityName, country } = geocodingData[0];
    console.log(`✅ 找到城市：${foundCityName}, ${country} (${lat}, ${lon})`);

    console.log(`🌡️ 第2步：获取天气数据...`);

    // 第2步：使用经纬度获取天气数据
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=zh_cn`;

    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) {
      throw new Error(
        `天气数据请求失败: ${weatherResponse.status} ${weatherResponse.statusText}`
      );
    }

    const weatherData = (await weatherResponse.json()) as {
      weather: Array<{
        description: string;
        main: string;
      }>;
      main: {
        temp: number;
        humidity: number;
      };
      wind?: {
        speed: number;
      };
      name: string;
    };
    console.log(`🌤️ 成功获取天气数据:`, weatherData);

    // 返回结构化天气数据
    return {
      city: foundCityName,
      temperature: Math.round(weatherData.main.temp),
      temperatureString: `${Math.round(weatherData.main.temp)}°C`,
      condition: weatherData.weather[0]?.description || "未知",
      humidity: weatherData.main.humidity,
      windSpeed: weatherData.wind?.speed || 0,
      country,
      coordinates: { lat, lon },
    };
  } catch (error) {
    console.error(`❌ 获取天气信息失败:`, error);
    throw error;
  }
};

/**
 * 天气预报查询函数 - 返回5天预报数据
 */
export const getWeatherForecast = async (city: string, apiKey: string): Promise<WeatherForecast> => {
  console.log(`🌦️ 工具内部方法: 正在获取 ${city} 的5天天气预报...`);

  try {
    if (!apiKey) {
      throw new Error("OpenWeatherMap API Key 未配置。请联系管理员设置 OPENWEATHER_API_KEY 环境变量。");
    }

    console.log(`🔍 第1步：将城市名 "${city}" 转换为经纬度坐标...`);

    // 第1步：使用地理编码 API 将城市名转换为经纬度（与当前天气相同的逻辑）
    const geocodingUrl = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${apiKey}`;

    const geocodingResponse = await fetch(geocodingUrl);
    if (!geocodingResponse.ok) {
      throw new Error(
        `地理编码请求失败: ${geocodingResponse.status} ${geocodingResponse.statusText}`
      );
    }

    const geocodingData = (await geocodingResponse.json()) as Array<{
      name: string;
      lat: number;
      lon: number;
      country: string;
      state?: string;
    }>;

    if (!geocodingData || geocodingData.length === 0) {
      throw new Error(`未找到城市 "${city}"，请检查城市名称是否正确。`);
    }

    const { lat, lon, name: foundCityName, country } = geocodingData[0];
    console.log(`✅ 找到城市：${foundCityName}, ${country} (${lat}, ${lon})`);

    console.log(`📅 第2步：获取5天天气预报数据...`);

    // 第2步：使用经纬度获取5天预报数据
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=zh_cn`;

    const forecastResponse = await fetch(forecastUrl);
    if (!forecastResponse.ok) {
      throw new Error(
        `天气预报请求失败: ${forecastResponse.status} ${forecastResponse.statusText}`
      );
    }

    const forecastData = (await forecastResponse.json()) as {
      list: Array<{
        dt: number;
        dt_txt: string;
        main: {
          temp: number;
          humidity: number;
        };
        weather: Array<{
          description: string;
          main: string;
        }>;
        wind?: {
          speed: number;
        };
        pop?: number; // precipitation probability
      }>;
      city: {
        name: string;
        country: string;
        timezone: number;
      };
    };

    console.log(`🌦️ 成功获取预报数据，包含 ${forecastData.list.length} 个时间点`);

    // 转换预报数据格式
    const forecasts: WeatherForecastItem[] = forecastData.list.map((item) => ({
      dateTime: item.dt_txt,
      timestamp: item.dt * 1000, // 转换为毫秒
      temperature: Math.round(item.main.temp),
      temperatureString: `${Math.round(item.main.temp)}°C`,
      condition: item.weather[0]?.description || "未知",
      humidity: item.main.humidity,
      windSpeed: item.wind?.speed || 0,
      precipitation: item.pop || 0,
    }));

    // 计算预报天数（通常是5天）
    const forecastDays = Math.ceil(forecasts.length / 8); // 每天8个时间点（3小时间隔）

    // 返回结构化天气预报数据
    return {
      city: foundCityName,
      country,
      coordinates: { lat, lon },
      forecastDays,
      forecasts,
      timezone: `UTC${forecastData.city.timezone >= 0 ? '+' : ''}${forecastData.city.timezone / 3600}`,
    };
  } catch (error) {
    console.error(`❌ 获取天气预报失败:`, error);
    throw error;
  }
};

/**
 * 创建天气查询工具
 */
export const createWeatherTool = (env?: any) => {
  return tool({
    description:
      "获取指定城市的实时天气信息。必须在用户询问当前天气、现在气温、今天天气情况等实时天气问题时调用此工具。支持中文和英文城市名。",
    parameters: z.object({
      city: z
        .string()
        .describe(
          "要查询天气的城市名称，如：北京、上海、广州、Beijing、London、Tokyo等"
        ),
    }),
    execute: async ({ city }) => {
      console.log(`🌤️ [TOOL] 天气工具被调用 - 查询城市: ${city}`);

      try {
        const apiKey = env?.OPENWEATHER_API_KEY;
        const result = await getWeatherData(city, apiKey);
        console.log(`🌤️ [TOOL] 天气查询返回结果:`, result);
        return result;
      } catch (error) {
        console.error(`❌ [TOOL] 天气查询失败:`, error);
        throw error;
      }
    },
  });
};

/**
 * 创建天气预报查询工具
 */
export const createWeatherForecastTool = (env?: any) => {
  return tool({
    description:
      "获取指定城市的5天天气预报信息。必须在用户询问天气预报、未来几天天气、明天天气、这周天气等预报类问题时调用此工具。支持中文和英文城市名。",
    parameters: z.object({
      city: z
        .string()
        .describe(
          "要查询天气预报的城市名称，如：北京、上海、广州、Beijing、London、Tokyo等"
        ),
    }),
    execute: async ({ city }) => {
      console.log(`🌦️ [TOOL] 天气预报工具被调用 - 查询城市: ${city}`);

      try {
        const apiKey = env?.OPENWEATHER_API_KEY;
        const result = await getWeatherForecast(city, apiKey);
        console.log(`🌦️ [TOOL] 天气预报查询返回结果:`, result);
        return result;
      } catch (error) {
        console.error(`❌ [TOOL] 天气预报查询失败:`, error);
        throw error;
      }
    },
  });
}; 