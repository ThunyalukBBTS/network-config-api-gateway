/**
 * Routing routes
 * GET /api/routes - Get routing table
 * POST /api/routes - Configure routing (Static, OSPF, BGP, EIGRP)
 * DELETE /api/routes - Remove routes
 */

import { Elysia, t } from 'elysia';
import { authenticateRequest } from '../utils/auth.js';
import { networkService } from '../services/network-service.js';
import { db } from '../db/index.js';
import { verifyTokenAndGetUser, isSessionValid  } from '../utils/verify.js';
import type {
  GetRoutesResponse,
  ConfigureRouteRequest,
  ConfigureRouteResponse,
  DeleteRouteRequest,
  DeleteRouteResponse,
} from '../types/index.js';

// Union type for all routing protocol configurations
const StaticRouteSchema = t.Object({
  protocol: t.Literal('static'),
  destination: t.String(),
  nextHop: t.Optional(t.String()),
  interface: t.Optional(t.String()),
  metric: t.Optional(t.Number()),
});

const OSPFRouteSchema = t.Object({
  protocol: t.Literal('ospf'),
  processId: t.Number(),
  routerId: t.String(),
  networks: t.Array(
    t.Object({
      network: t.String(),
      area: t.Number(),
    })
  ),
  defaultInformationOriginate: t.Optional(t.Boolean()),
});

const BGPRouteSchema = t.Object({
  protocol: t.Literal('bgp'),
  asNumber: t.Number(),
  routerId: t.String(),
  neighbors: t.Array(
    t.Object({
      ip: t.String(),
      remoteAs: t.Number(),
      description: t.Optional(t.String()),
      password: t.Optional(t.String()),
    })
  ),
  networks: t.Array(t.String()),
});

const EIGRPRouteSchema = t.Object({
  protocol: t.Literal('eigrp'),
  asNumber: t.Number(),
  routerId: t.String(),
  networks: t.Array(t.String()),
});

const RouteRequestSchema = t.Union([
  StaticRouteSchema,
  OSPFRouteSchema,
  BGPRouteSchema,
  EIGRPRouteSchema,
]);

export const routingRoutes = new Elysia({ prefix: '/api/routes' })

  /**
   * GET /api/routes
   * Get routing table
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
        description: 'Get the routing table from the router',
        tags: ['Routing'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Routing table',
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
   * GET /api/routes/:protocol
   * Get routes by protocol
   */
  .get(
    '/:protocol',
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
        const { protocol } = context.params;
        const allRoutes = await networkService.getRoutes();

        const filteredRoutes = allRoutes.routes.filter(
          (route) => route.protocol === protocol
        );

        // Create audit log
        await db.createAuditLog({
          userId: user.userId,
          action: 'get_routes',
          resourceType: 'route',
          resourceId: protocol,
          responseStatus: 200,
        });

        return {
          protocol,
          routes: filteredRoutes,
        };
      } catch (error: any) {
        context.set.status = 400;
        return {
          message: error.message || 'Failed to get routes',
        };
      }
    },
    {
      params: t.Object({
        protocol: t.Union([
          t.Literal('static'),
          t.Literal('ospf'),
          t.Literal('bgp'),
          t.Literal('eigrp'),
          t.Literal('connected'),
        ]),
      }),
      detail: {
        description: 'Get routes filtered by protocol',
        tags: ['Routing'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Routes for the specified protocol',
          },
          400: {
            description: 'Bad request - router may not be configured',
          },
        },
      },
    }
  )

  /**
   * POST /api/routes
   * Configure routing (Static, OSPF, BGP, EIGRP)
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
          resourceId: request.protocol,
          requestData: request as unknown as Record<string, unknown>,
          responseStatus: 200,
        });

        // Create config history
        await db.createConfigHistory({
          userId: user.userId,
          resourceType: 'route',
          resourceName: request.protocol,
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
      body: RouteRequestSchema,
      detail: {
        description: 'Configure routing on the router. Supports static routes, OSPF, BGP, and EIGRP protocols.',
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
   * Delete a route
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

      const request = context.body as DeleteRouteRequest;

      // Check if user has delete permission
      if (user?.role !== 'admin') {
        context.set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Only admin users can delete routes',
        };
      }

      try {
        const result = await networkService.deleteRoute(request);

        // Create audit log
        await db.createAuditLog({
          userId: user.userId,
          action: 'delete_route',
          resourceType: 'route',
          resourceId: request.destination,
          requestData: request as unknown as Record<string, unknown>,
          responseStatus: 200,
        });

        // Create config history
        await db.createConfigHistory({
          userId: user.userId,
          resourceType: 'route',
          resourceName: request.destination || request.protocol,
          changeType: 'delete',
        });

        return result as DeleteRouteResponse;
      } catch (error: any) {
        context.set.status = 400;
        return {
          message: error.message || 'Failed to delete route',
        };
      }
    },
    {
      body: t.Object({
        protocol: t.Union([
          t.Literal('static'),
          t.Literal('ospf'),
          t.Literal('bgp'),
          t.Literal('eigrp'),
        ]),
        destination: t.Optional(t.String()),
        processId: t.Optional(t.Number()),
        asNumber: t.Optional(t.Number()),
      }),
      detail: {
        description: 'Delete a route from the routing table. Currently supports static routes.',
        tags: ['Routing'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Route deleted successfully',
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
