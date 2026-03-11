/**
 * Health check routes
 * GET /api/health - API health check
 * GET /api/health/router - Router connectivity check (ping)
 */

import { Elysia } from 'elysia';
import { config } from '../config/index.js';
import { getDb } from '../db/index.js';

export const healthRoutes = new Elysia({ prefix: '/api/health' })

  /**
   * GET /api/health
   * API health check (includes database status)
   */
  .get('/', async () => {
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
    };
  }, {
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
  })

  /**
   * GET /api/health/router
   * Router connectivity check via ping
   */
  .get('/router', async () => {
    const routerIp = config.netconfHost;

    // In mock mode, return mock response
    if (config.mockMode) {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        router: {
          ip: routerIp,
          reachable: true,
          mode: 'mock',
          protocol: 'netconf',
          port: config.netconfPort,
          message: 'Mock mode - router connection simulated',
        },
      };
    }

    // Real ping test
    const { exec } = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(exec);

    try {
      const { stdout, stderr } = await execPromise(
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
          protocol: 'netconf',
          port: config.netconfPort,
          gnmiPort: config.gnmiPort,
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
          protocol: 'netconf',
          port: config.netconfPort,
          message: 'Failed to ping router',
        },
      };
    }
  }, {
    detail: {
      description: 'Check router connectivity via ping test',
      tags: ['Health'],
      responses: {
        200: {
          description: 'Router health status',
          content: 'application/json',
        },
        503: {
          description: 'Router is unreachable',
        },
      },
    },
  })

  /**
   * GET /api/health/router/netconf
   * Test NETCONF port connectivity
   */
  .get('/router/netconf', async () => {
    const routerIp = config.netconfHost;
    const port = config.netconfPort;

    // In mock mode, return mock response
    if (config.mockMode) {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: {
          name: 'netconf',
          host: routerIp,
          port,
          reachable: true,
          mode: 'mock',
          message: 'Mock mode - NETCONF connection simulated',
        },
      };
    }

    // Test TCP connection to NETCONF port
    const { exec } = await import('child_process');
    const util = await import('util');
    const execPromise = util.promisify(exec);

    try {
      const { stdout } = await execPromise(
        `nc -zv -w 3 ${routerIp} ${port} 2>&1`,
        { timeout: 5000 }
      );

      const reachable = stdout.includes('succeeded') || stdout.includes('open');

      return {
        status: reachable ? 'ok' : 'unhealthy',
        timestamp: new Date().toISOString(),
        service: {
          name: 'netconf',
          host: routerIp,
          port,
          reachable,
          message: reachable ? 'NETCONF port is reachable' : 'NETCONF port is not reachable',
        },
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: {
          name: 'netconf',
          host: routerIp,
          port,
          reachable: false,
          message: 'NETCONF port connection failed',
        },
      };
    }
  }, {
    detail: {
      description: 'Test NETCONF port (830) connectivity to router',
      tags: ['Health'],
      responses: {
        200: {
          description: 'NETCONF port status',
        },
      },
    },
  });
