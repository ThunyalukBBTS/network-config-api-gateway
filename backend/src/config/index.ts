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

  // gNMI
  gnmiHost: string;
  gnmiPort: number;
  gnmiUsername: string;
  gnmiPassword: string;
  gnmiInsecure: boolean;

  // NETCONF
  netconfHost: string;
  netconfPort: number;
  netconfUsername: string;
  netconfPassword: string;

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

    gnmiHost: process.env.GNMI_HOST || '192.168.1.1',
    gnmiPort: parseInt(process.env.GNMI_PORT || '9339', 10),
    gnmiUsername: process.env.GNMI_USERNAME || 'admin',
    gnmiPassword: process.env.GNMI_PASSWORD || 'admin',
    gnmiInsecure: process.env.GNMI_INSECURE === 'true',

    netconfHost: process.env.NETCONF_HOST || '192.168.1.1',
    netconfPort: parseInt(process.env.NETCONF_PORT || '830', 10),
    netconfUsername: process.env.NETCONF_USERNAME || 'admin',
    netconfPassword: process.env.NETCONF_PASSWORD || 'admin',

    mockMode: process.env.MOCK_MODE === 'true',
  };
}

export const config = loadConfig();
