/**
 * Application configuration
 * Loads environment variables and provides typed access
 */

export interface Config {
  // Server
  port: number;
  host: string;
  nodeEnv: string;

  // JWT
  jwtSecret: string;
  jwtExpiresIn: number;

  // Database
  databaseUrl: string;

  // Mock mode
  mockMode: boolean;
}

function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || 'development',

    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    jwtExpiresIn: parseInt(process.env.JWT_EXPIRES_IN || '3600', 10),

    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/network_gateway',

    mockMode: process.env.MOCK_MODE === 'true',
  };
}

export const config = loadConfig();
