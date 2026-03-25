/**
 * Router Configuration routes
 * POST /api/config/router - Set router configuration (ip, port, user, pass)
 * GET /api/config/router - Get current router configuration
 * DELETE /api/config/router - Clear router configuration
 */

import { Elysia, t } from 'elysia';
import { authenticateRequest } from '../utils/auth.js';
import { routerConfigService } from '../services/router-config.service.js';
import type {
  RouterConfigRequest,
  RouterConfigResponse,
} from '../types/index.js';

const DEFAULT_PORT = 57400;

export const routerConfigRoutes = new Elysia({ prefix: '/api/config' })

  /**
   * POST /api/config/router
   * Set router configuration
   */
  .post(
    '/router',
    async (context: any) => {
      const user = await authenticateRequest(context.request.headers.get('Authorization'));

      if (!user) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      const body = context.body as RouterConfigRequest;

      // Validate input
      if (!body.ip || !body.user || !body.pass) {
        return {
          error: 'Invalid request',
          message: 'ip, user, and pass are required',
        };
      }

      // Validate IP format (basic check)
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipRegex.test(body.ip)) {
        return {
          error: 'Invalid IP address',
          message: 'IP must be in format xxx.xxx.xxx.xxx',
        };
      }

      // Use provided port or default
      const port = body.port ?? DEFAULT_PORT;

      // Store router configuration
      routerConfigService.setConfig({ ...body, port });

      const response: RouterConfigResponse = {
        message: 'Router configured successfully',
        router: {
          ip: body.ip,
          port,
          user: body.user,
          configured: true,
        },
      };

      return response;
    },
    {
      body: t.Object({
        ip: t.String(),
        port: t.Optional(t.Number()),
        user: t.String(),
        pass: t.String(),
      }),
      detail: {
        description: 'Configure router connection settings (ip, port, user, pass)',
        tags: ['Config'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Router configured successfully',
          },
          400: {
            description: 'Invalid request',
          },
          401: {
            description: 'Authentication required',
          },
        },
      },
    },
  )

  /**
   * GET /api/config/router
   * Get current router configuration
   */
  .get(
    '/router',
    async (context: any) => {
      const user = await authenticateRequest(context.request.headers.get('Authorization'));

      if (!user) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      const routerInfo = routerConfigService.getRouterInfo();

      return {
        message: routerInfo.configured
          ? 'Router is configured'
          : 'Router not configured',
        router: routerInfo,
      };
    },
    {
      detail: {
        description: 'Get current router configuration status',
        tags: ['Config'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Router configuration status',
          },
          401: {
            description: 'Authentication required',
          },
        },
      },
    }
  )

  /**
   * DELETE /api/config/router
   * Clear router configuration
   */
  .delete(
    '/router',
    async (context: any) => {
      const user = await authenticateRequest(context.request.headers.get('Authorization'));

      if (!user) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      routerConfigService.clearConfig();

      return {
        message: 'Router configuration cleared',
        router: {
          ip: '',
          port: DEFAULT_PORT,
          user: '',
          configured: false,
        },
      };
    },
    {
      detail: {
        description: 'Clear router configuration',
        tags: ['Config'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Router configuration cleared',
          },
          401: {
            description: 'Authentication required',
          },
        },
      },
    }
  );
