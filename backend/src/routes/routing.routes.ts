/**
 * Routing routes
 * GET /api/routes - Get connected routes
 * POST /api/routes - Configure connected routing (bind interfaces)
 * DELETE /api/routes - Clear all routing
 */

import { Elysia, t } from 'elysia';
import { authenticateRequest } from '../utils/auth.js';
import { networkService } from '../services/network-service.js';
import { db } from '../db/index.js';
import type {
  GetRoutesResponse,
  ConfigureRouteRequest,
  ConfigureRouteResponse,
  DeleteRouteResponse,
} from '../types/index.js';

const ConnectedRouteSchema = t.Object({
  interfaces: t.Array(t.String()),
});

export const routingRoutes = new Elysia({ prefix: '/api/routes' })

  /**
   * GET /api/routes
   * Get connected routes
   */
  .get(
    '/',
    async (context: any) => {
      const user = await authenticateRequest(context.request.headers.get('Authorization'));

      if (!user) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      try {
        const result = await networkService.getRoutes();

        // Create audit log
        await db.createAuditLog({
          userId: user.userId,
          action: 'get_routes',
          resourceType: 'route',
          responseStatus: 200,
        });

        return result as GetRoutesResponse;
      } catch (error: any) {
        context.set.status = 400;
        return {
          message: error.message || 'Failed to get routes',
        };
      }
    },
    {
      detail: {
        description: 'Get the connected routes from the router',
        tags: ['Routing'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Connected routes',
          },
          400: {
            description: 'Bad request - router may not be configured',
          },
          401: {
            description: 'Authentication required',
          },
          403: {
            description: 'Insufficient permissions',
          },
        },
      },
    }
  )

  /**
   * POST /api/routes
   * Configure connected routing (bind interfaces to network-instance)
   */
  .post(
    '/',
    async (context: any) => {
      const user = await authenticateRequest(context.request.headers.get('Authorization'));

      if (!user) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      const request = context.body as ConfigureRouteRequest;

      // Check if user has write permission
      if (user?.role === 'readonly') {
        context.set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Read-only users cannot modify configurations',
        };
      }

      try {
        const result = await networkService.configureRoute(request);

        // Create audit log
        await db.createAuditLog({
          userId: user.userId,
          action: 'configure_route',
          resourceType: 'route',
          requestData: request as unknown as Record<string, unknown>,
          responseStatus: 200,
        });

        // Create config history
        await db.createConfigHistory({
          userId: user.userId,
          resourceType: 'route',
          resourceName: 'connected',
          newConfig: request as unknown as Record<string, unknown>,
          changeType: 'create',
        });

        return result as ConfigureRouteResponse;
      } catch (error: any) {
        context.set.status = 400;
        return {
          message: error.message || 'Failed to configure route',
        };
      }
    },
    {
      body: ConnectedRouteSchema,
      detail: {
        description: 'Configure connected routing by binding interfaces to network-instance. Replaces all existing bindings.',
        tags: ['Routing'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Route configuration applied successfully',
          },
          400: {
            description: 'Invalid request or router not configured',
          },
          401: {
            description: 'Authentication required',
          },
          403: {
            description: 'Insufficient permissions',
          },
        },
      },
    }
  )

  /**
   * DELETE /api/routes
   * Clear all routing (unbind all interfaces)
   */
  .delete(
    '/',
    async (context: any) => {
      const user = await authenticateRequest(context.request.headers.get('Authorization'));

      if (!user) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      // Check if user has delete permission
      if (user?.role !== 'admin') {
        context.set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Only admin users can clear routes',
        };
      }

      try {
        const result = await networkService.clearAllRoutes();

        // Create audit log
        await db.createAuditLog({
          userId: user.userId,
          action: 'clear_routes',
          resourceType: 'route',
          responseStatus: 200,
        });

        // Create config history
        await db.createConfigHistory({
          userId: user.userId,
          resourceType: 'route',
          resourceName: 'connected',
          changeType: 'delete',
        });

        return result as DeleteRouteResponse;
      } catch (error: any) {
        context.set.status = 400;
        return {
          message: error.message || 'Failed to clear routes',
        };
      }
    },
    {
      detail: {
        description: 'Clear all connected routing by unbinding all interfaces from network-instance',
        tags: ['Routing'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'All routes cleared successfully',
          },
          400: {
            description: 'Invalid request or router not configured',
          },
          401: {
            description: 'Authentication required',
          },
          403: {
            description: 'Insufficient permissions',
          },
        },
      },
    }
  );
