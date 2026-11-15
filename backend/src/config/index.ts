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
  reneo: {
    panelUrl: process.env.RENEO_PANEL_URL || 'http://host.docker.internal:8000',
    oauthUrl: process.env.RENEO_OAUTH_URL || '',
    appToken: process.env.RENEO_APP_TOKEN || '',
    enforceDomain: process.env.CRM_ENFORCE_DOMAIN === 'true',
    allowedDomains: (process.env.CRM_ALLOWED_DOMAINS || '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
  },
  meta: {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    threadsAppId: process.env.THREADS_APP_ID || '',
    threadsAppSecret: process.env.THREADS_APP_SECRET || '',
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  },
};

