// lib/logger.js - Version simple
const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data);
};

export const logger = {
  info: (message, data = {}) => log('info', message, data),
  warn: (message, data = {}) => log('warn', message, data),
  error: (message, data = {}) => log('error', message, data),
};