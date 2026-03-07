export const env = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || true,
  mysql: {
    host: process.env.MYSQL_HOST || '192.168.0.62',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'text',
    password: process.env.MYSQL_PASSWORD || 'text',
    database: process.env.MYSQL_DATABASE || 'text',
  },
};
