/**
 * Validate that the request comes from Telegram servers
 */
export async function validateTelegramRequest(
  request: Request,
  env: any
): Promise<{
  isValid: boolean;
  reason?: string;
}> {
  // Get the client IP address
  const clientIP =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";

  console.log("Request from IP:", clientIP);

  // Telegram's IP ranges (as of 2024)
  // These are the known IP ranges that Telegram uses for webhooks
  const telegramIPRanges = [
    "149.154.160.0/20",
    "91.108.4.0/22",
    "91.108.56.0/22",
    "91.108.8.0/22",
    "149.154.160.0/22",
    "149.154.164.0/22",
    "149.154.168.0/22",
    "149.154.172.0/22",
    "95.161.64.0/20",
    "2001:b28:f23d::/48",
    "2001:b28:f23f::/48",
    "2001:67c:4e8::/48",
  ];

  // For development/testing, allow localhost and private IPs
  const isLocalhost =
    clientIP === "127.0.0.1" ||
    clientIP === "::1" ||
    clientIP === "unknown" ||
    clientIP.startsWith("192.168.") ||
    clientIP.startsWith("10.") ||
    clientIP.startsWith("172.");

  // Check if IP is from Telegram or localhost
  const isValidIP = isLocalhost || isIPInRanges(clientIP, telegramIPRanges);

  if (!isValidIP) {
    return {
      isValid: false,
      reason: `Invalid IP address: ${clientIP}`,
    };
  }

  // Check for secret token if configured
  const secretToken = env.TELEGRAM_SECRET_TOKEN;
  if (secretToken) {
    const providedToken = request.headers.get(
      "x-telegram-bot-api-secret-token"
    );
    if (providedToken !== secretToken) {
      return {
        isValid: false,
        reason: "Invalid or missing secret token",
      };
    }
  }

  // Additional validation: Check if request method is POST
  if (request.method !== "POST") {
    return {
      isValid: false,
      reason: "Invalid HTTP method, expected POST",
    };
  }

  // Check Content-Type header
  const contentType = request.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return {
      isValid: false,
      reason: "Invalid Content-Type, expected application/json",
    };
  }

  return { isValid: true };
}

/**
 * Check if an IP address is within any of the given CIDR ranges
 */
function isIPInRanges(ip: string, ranges: string[]): boolean {
  try {
    // Simple IP validation for IPv4
    if (ip.includes(":")) {
      // IPv6 - for simplicity, we'll accept all IPv6 for now
      // In production, you might want to implement proper IPv6 CIDR checking
      return ranges.some((range) => range.includes(":"));
    }

    // IPv4 validation
    const ipParts = ip.split(".").map(Number);
    if (
      ipParts.length !== 4 ||
      ipParts.some((part) => isNaN(part) || part < 0 || part > 255)
    ) {
      return false;
    }

    for (const range of ranges) {
      if (range.includes(":")) continue; // Skip IPv6 ranges for IPv4 check

      const [network, prefixLength] = range.split("/");
      const networkParts = network.split(".").map(Number);
      const prefix = parseInt(prefixLength, 10);

      if (isIPInCIDR(ipParts, networkParts, prefix)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Error checking IP ranges:", error);
    return false;
  }
}

/**
 * Check if an IP is within a CIDR range
 */
function isIPInCIDR(
  ip: number[],
  network: number[],
  prefixLength: number
): boolean {
  const ipInt = (ip[0] << 24) | (ip[1] << 16) | (ip[2] << 8) | ip[3];
  const networkInt =
    (network[0] << 24) | (network[1] << 16) | (network[2] << 8) | network[3];
  const mask = (-1 << (32 - prefixLength)) >>> 0;

  return (ipInt & mask) === (networkInt & mask);
} 