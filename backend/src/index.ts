/**
 * Network API Gateway
 * Main application entry point
 *
 * REST API Gateway for network router management
 * Uses gNMI protocol for southbound communication
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { config } from './config/index.js';
import { getDb, closeDb } from './db/index.js';
import { authRoutes, healthRoutes, interfaceRoutes, routingRoutes, routerConfigRoutes } from './routes/index.js';

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
          REST API Gateway for network router management.

          ## Authentication
          This API uses JWT bearer token authentication. To obtain a token:
          1. POST /api/auth/login with your credentials
          2. Include the token in the Authorization header: \`Bearer <token>\`

          ## Features
          - **Interfaces**: View and configure network interfaces
          - **Routing**: Configure connected routing by binding interfaces to network-instance
          - **Health**: Check API and router connectivity

          ## Supported Protocol
          - **gNMI**: Modern gRPC-based network management protocol for Nokia SR Linux devices
        `,
      },
      tags: [
        { name: 'Authentication', description: 'Authentication endpoints' },
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Interfaces', description: 'Network interface management' },
        { name: 'Routing', description: 'Routing configuration' },
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
      protocol: 'gNMI',
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
    description: 'REST API Gateway for network router management',
    documentation: '/docs',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      interfaces: '/api/interfaces',
      routes: '/api/routes',
    },
    protocol: 'gNMI',
    routerConfiguration: {
      type: 'runtime',
      endpoint: '/api/config/router',
    },
  }))

  // Register routes
  .use(healthRoutes)
  .use(authRoutes)
  .use(interfaceRoutes)
  .use(routingRoutes)
  .use(routerConfigRoutes)

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
  return 'Production (gNMI)';
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
║  - Protocol: gNMI                                        ║
║  - Router: Runtime configured via POST /api/config/router║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

export default app;
