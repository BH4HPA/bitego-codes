import dotenv from 'dotenv'
dotenv.config()

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  h5AppDomain: String(process.env.H5APP_DOMAIN || '')
    .trim()
    .replace(/\/+$/, ''),
  webAdminDomain: String(process.env.WEBADMIN_DOMAIN || '')
    .trim()
    .replace(/\/+$/, ''),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    pass: process.env.DB_PASS || 'password',
    name: process.env.DB_NAME || 'bitego'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
  },
  cos: {
    secretId: process.env.QCLOUD_SECRET_ID || '',
    secretKey: process.env.QCLOUD_SECRET_KEY || '',
    bucket: process.env.QCLOUD_COS_BUCKET || '',
    region: process.env.QCLOUD_COS_REGION || '',
    cdnDomain: process.env.QCLOUD_COS_CDN_DOMAIN || '',
    maxImageSizeBytes: parseInt(process.env.COS_MAX_IMAGE_SIZE_BYTES || String(10 * 1024 * 1024), 10)
  },
  wechatMiniProgram: {
    appId: process.env.WX_MINIPROGRAM_APPID || '',
    secret: process.env.WX_MINIPROGRAM_SECRET || '',
    sessionKeyTtlSeconds: parseInt(process.env.WX_SESSION_KEY_TTL_SECONDS || '86400', 10),
    qrcodePagePath: process.env.WX_MINIPROGRAM_QRCODE_PAGE_PATH || 'pages/order-meal/index',
    envVersion: (process.env.WX_MINIPROGRAM_ENV_VERSION || 'release') as 'release' | 'trial' | 'develop'
  },
  jwtSecret: process.env.JWT_SECRET || 'bitego-secret'
}
