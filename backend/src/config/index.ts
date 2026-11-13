import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://crm_user:crm_password@localhost:5432/crm_db?schema=public',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  waha: {
    baseUrl: process.env.WAHA_BASE_URL || 'http://localhost:3000',
    apiKey: process.env.WAHA_API_KEY || '',
    session: process.env.WAHA_SESSION || 'default',
  },
  webhookUrl: process.env.WEBHOOK_URL || 'http://localhost:5000/api/waha/webhook',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
};

