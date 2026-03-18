/**
 * Network API Gateway
 * Main application entry point
 *
 * REST API Gateway for Cisco ISR4321 router management
 * Supports gNMI/NETCONF protocols for southbound communication
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { config } from './config/index.js';
import { getDb, closeDb } from './db/index.js';
import { authRoutes, healthRoutes, interfaceRoutes, routingRoutes, firewallRoutes } from './routes/index.js';

// Create Elysia app
const app = new Elysia({
  name: 'network-api-gateway',
  seed: config.jwtSecret,
})
  .use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }))
  .use(swagger({
    path: '/docs',
    documentation: {
      info: {
        title: 'Network API Gateway',
        version: '1.0.0',
        description: `
          REST API Gateway for Cisco ISR4321 router management.

          ## Authentication
          This API uses JWT bearer token authentication. To obtain a token:
          1. POST /api/auth/login with your credentials
          2. Include the token in the Authorization header: \`Bearer <token>\`

          ## Features
          - **Interfaces**: View and configure network interfaces
          - **Routing**: Configure static routes, OSPF, BGP, and EIGRP
          - **Firewall**: Manage firewall rules
          - **Health**: Check API and router connectivity

          ## Supported Protocols
          - **NETCONF**: Traditional network configuration protocol (RFC 6241)
          - **gNMI**: Modern gRPC-based network management protocol

          ## Supported Routing Protocols
          - Static Routes
          - OSPF (Open Shortest Path First)
          - BGP (Border Gateway Protocol)
          - EIGRP (Enhanced Interior Gateway Routing Protocol)
        `,
      },
      tags: [
        { name: 'Authentication', description: 'Authentication endpoints' },
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Interfaces', description: 'Network interface management' },
        { name: 'Routing', description: 'Routing configuration' },
        { name: 'Firewall', description: 'Firewall rule management' },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT bearer token obtained from /api/auth/login',
          },
        },
      },
    },
  }))

  // Health check endpoint (legacy)
  .get('/health', async () => {
    // Check database connection
    let dbStatus = 'disconnected';
    try {
      const sql = getDb();
      await sql`SELECT 1`;
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'network-api-gateway',
      version: '1.0.0',
      database: dbStatus,
      mockMode: config.mockMode,
      preferredProtocol: config.preferredProtocol,
      gnmiEnabled: config.gnmiEnabled,
    };
  }, {
    detail: {
      description: 'Health check endpoint (legacy)',
      tags: ['System'],
      responses: {
        200: {
          description: 'Service is healthy',
        },
      },
    },
  })

  // API Info endpoint
  .get('/', () => ({
    name: 'Network API Gateway',
    version: '1.0.0',
    description: 'REST API Gateway for Cisco ISR4321 router management',
    documentation: '/docs',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      interfaces: '/api/interfaces',
      routes: '/api/routes',
      firewall: '/api/firewall',
    },
    protocols: {
      preferredProtocol: config.preferredProtocol,
      gnmiEnabled: config.gnmiEnabled,
    },
  }))

  // Register routes
  .use(healthRoutes)
  .use(authRoutes)
  .use(interfaceRoutes)
  .use(routingRoutes)
  .use(firewallRoutes)

  // Global error handler
  .onError(({ error, set, code }) => {
    console.error('API Error:', error);

    // Handle validation errors
    if (code === 'VALIDATION') {
      set.status = 400;
      return {
        error: 'Validation Error',
        message: error.message,
        statusCode: 400,
      };
    }

    // Handle API errors
    if (error instanceof Error) {
      set.status = 500;
      return {
        error: 'Internal Server Error',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred',
        statusCode: 500,
      };
    }

    set.status = 500;
    return {
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode: 500,
    };
  })

  // Graceful shutdown
  .onStop(async () => {
    console.log('Shutting down gracefully...');
    await closeDb();
  });

// Format mode display
function getModeDisplay(): string {
  if (config.mockMode) return 'MOCK (development)';
  const proto = config.preferredProtocol.toUpperCase();
  const gnmiStatus = config.gnmiEnabled ? 'enabled' : 'disabled';
  return `Production (${proto}, gNMI ${gnmiStatus})`;
}

// Start server
app.listen(config.port, () => {
    console.log(`🚀 Elysia server running on port ${config.port}`);
});

const modeDisplay = getModeDisplay();

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║          Network API Gateway v1.0.0                      ║
║                                                           ║
║  Server running on: http://${config.host}:${config.port}          ║
║  API Documentation: http://${config.host}:${config.port}/docs    ║
║  Health Check: http://${config.host}:${config.port}/health       ║
║  Router Health: http://${config.host}:${config.port}/api/health/router  ║
║                                                           ║
║  Mode: ${modeDisplay.padEnd(50)}║
║                                                           ║
║  Configuration:                                          ║
║  - Preferred Protocol: ${config.preferredProtocol.toUpperCase().padEnd(20)}              ║
║  - gNMI: ${config.gnmiEnabled ? 'Enabled' : 'Disabled'} (port: ${config.gnmiPort})                 ║
║  - NETCONF: Enabled (port: ${config.netconfPort})              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

export default app;
