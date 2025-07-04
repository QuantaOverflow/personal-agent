/**
 * Telegram Integration Module
 *
 * This file serves as the main entry point for all Telegram-related functionality.
 * The implementation has been refactored into smaller, focused modules in the ./telegram/ directory.
 *
 * All original functionality is preserved and exported from this file for backward compatibility.
 */

// Re-export all types and functionality from the refactored modules
export * from "./telegram";

// For backward compatibility, also export the main handler as a named export
export { handleTelegramWebhook } from "./telegram/core/handlers";
