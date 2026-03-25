/**
 * Health check routes
 * GET /api/health - API health check
 * GET /api/health/router - Router connectivity check (ping)
 * GET /api/health/router/gnmi - gNMI port test
 */

import { Elysia } from 'elysia';
import { config } from '../config/index.js';
import { getDb } from '../db/index.js';
import { GNMIClient } from '../services/gnmi-client.js';
import { routerConfigService } from '../services/router-config.service.js';

// Default values for display when router not configured
const DEFAULT_GNMI_PORT = 57400;

export const healthRoutes = new Elysia({ prefix: '/api/health' })

  /**
   * GET /api/health
   * API health check (includes database status)
   */
  .get(
    '/',
    async () => {
      // Check database connection
      let dbStatus = 'disconnected';
      let dbMessage = '';

      try {
        const sql = getDb();
        await sql`SELECT 1`;
        dbStatus = 'connected';
      } catch (error) {
        dbStatus = 'error';
        dbMessage = error instanceof Error ? error.message : 'Unknown error';
      }

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'network-api-gateway',
        version: '1.0.0',
        database: {
          status: dbStatus,
          message: dbMessage,
        },
        mockMode: config.mockMode,
        protocol: 'gNMI',
      };
    },
    {
      detail: {
        description: 'Health check endpoint for API and database',
        tags: ['Health'],
        responses: {
          200: {
            description: 'Service is healthy',
          },
          503: {
            description: 'Service is unhealthy',
          },
        },
      },
    }
  )

  /**
   * GET /api/health/router
   * Router connectivity check via ping
   */
  .get(
    '/router',
    async () => {
      // Use runtime router config
      if (!config.mockMode && !routerConfigService.isConfigured()) {
        return {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          router: {
            reachable: false,
            message: 'Router not configured. Please call POST /api/config/router first.',
          },
        };
      }

      const routerInfo = routerConfigService.getRouterInfo();

      // In mock mode, return mock response
      if (config.mockMode) {
        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          router: {
            ip: routerInfo.ip,
            reachable: true,
            mode: 'mock',
            protocol: 'gNMI',
            port: routerInfo.port,
            message: 'Mock mode - router connection simulated',
          },
        };
      }

      const routerIp = routerInfo.ip;

      // Real ping test
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);

      try {
        const { stdout } = await execPromise(
          `ping -c 3 -W 2 ${routerIp}`,
          { timeout: 10000 }
        );

        // Parse ping output for statistics
        const packetsMatch = stdout.match(/(\d+) packets transmitted, (\d+) received/);
        const rttMatch = stdout.match(/min\/avg\/max(?:\/mdev)? = ([\d.]+)\/([\d.]+)\/([\d.]+)/);

        const transmitted = packetsMatch ? parseInt(packetsMatch[1], 10) : 3;
        const received = packetsMatch ? parseInt(packetsMatch[2], 10) : 0;
        const packetLoss = transmitted > 0 ? ((transmitted - received) / transmitted) * 100 : 100;

        const reachable = received > 0;

        return {
          status: reachable ? 'ok' : 'unhealthy',
          timestamp: new Date().toISOString(),
          router: {
            ip: routerIp,
            reachable,
            packetLoss: `${packetLoss.toFixed(1)}%`,
            rtt: rttMatch ? {
              min: parseFloat(rttMatch[1]),
              avg: parseFloat(rttMatch[2]),
              max: parseFloat(rttMatch[3]),
              unit: 'ms',
            } : null,
            protocol: 'gNMI',
            port: routerInfo.port,
            message: reachable ? 'Router is reachable' : 'Router is unreachable',
          },
        };
      } catch (error: any) {
        return {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          router: {
            ip: routerIp,
            reachable: false,
            error: error.killed ? 'Ping timeout' : error.message,
            protocol: 'gNMI',
            port: routerInfo.port,
            message: 'Failed to ping router',
          },
        };
      }
    },
    {
      detail: {
        description: 'Check router connectivity via ping test',
        tags: ['Health'],
        responses: {
          200: {
            description: 'Router health status',
          },
          503: {
            description: 'Router is unreachable',
          },
        },
      },
    }
  )

  /**
   * GET /api/health/router/gnmi
   * Test gNMI port connectivity and capabilities
   */
  .get(
    '/router/gnmi',
    async () => {
      // Use runtime router config
      if (!config.mockMode && !routerConfigService.isConfigured()) {
        return {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          service: {
            name: 'gnmi',
            reachable: false,
            message: 'Router not configured. Please call POST /api/config/router first.',
          },
        };
      }

      const routerInfo = routerConfigService.getRouterInfo();

      // In mock mode, return mock response
      if (config.mockMode) {
        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          service: {
            name: 'gnmi',
            host: routerInfo.ip,
            port: routerInfo.port,
            reachable: true,
            mode: 'mock',
            message: 'Mock mode - gNMI connection simulated',
          },
        };
      }

      const routerIp = routerInfo.ip;
      const port = routerInfo.port;

      // First, test TCP connection to gNMI port
      const { exec } = await import('child_process');
      const util = await import('util');
      const execPromise = util.promisify(exec);

      try {
        // Test TCP port first
        const { stdout: ncOutput } = await execPromise(
          `nc -zv -w 3 ${routerIp} ${port} 2>&1`,
          { timeout: 5000 }
        );

        const portReachable = ncOutput.includes('succeeded') || ncOutput.includes('open');

        if (!portReachable) {
          return {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            service: {
              name: 'gnmi',
              host: routerIp,
              port,
              reachable: false,
              message: 'gNMI port is not reachable',
            },
          };
        }

        // Port is open, try gNMI capabilities check using runtime config
        const routerConfig = routerConfigService.getConfig();
        const gnmiClient = new GNMIClient(routerConfig);

        const capsResponse = await gnmiClient.capabilities();

        return {
          status: capsResponse.success ? 'ok' : 'degraded',
          timestamp: new Date().toISOString(),
          service: {
            name: 'gnmi',
            host: routerIp,
            port,
            reachable: true,
            capabilities: capsResponse.success,
            message: capsResponse.success
              ? 'gNMI service is healthy'
              : 'gNMI port reachable but capabilities check failed',
            error: capsResponse.error,
          },
        };
      } catch (error: any) {
        return {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          service: {
            name: 'gnmi',
            host: routerIp,
            port,
            reachable: false,
            message: 'gNMI port connection failed',
            error: error.message,
          },
        };
      }
    },
    {
      detail: {
        description: 'Test gNMI port (57400) connectivity and capabilities',
        tags: ['Health'],
        responses: {
          200: {
            description: 'gNMI service status',
          },
          503: {
            description: 'gNMI service is not reachable',
          },
        },
      },
    }
  );
