/**
 * Routing routes
 * GET /api/routes - Get routing table
 * POST /api/routes - Configure routing (Static, OSPF, BGP, EIGRP)
 * DELETE /api/routes - Remove routes
 */

import { Elysia, t } from 'elysia';
import { authPlugin } from '../middleware/auth.js';
import { networkService } from '../services/network-service.js';
import { db } from '../db/index.js';
import type {
  GetRoutesResponse,
  ConfigureRouteRequest,
  ConfigureRouteResponse,
  DeleteRouteRequest,
  DeleteRouteResponse,
  JWTPayload,
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

// Authentication guard function
const requireAuth = ({ user, set }: { user: JWTPayload | null; set: { status: number } }) => {
  if (!user) {
    set.status = 401;
    return {
      error: 'Authentication required',
      message: 'Please provide a valid bearer token',
    };
  }
};

export const routingRoutes = new Elysia({ prefix: '/api/routes' })
  .use(authPlugin)

  /**
   * GET /api/routes
   * Get routing table
   */
  .get(
    '/',
    async ({ user }) => {
      const result = await networkService.getRoutes();

      // Create audit log
      await db.createAuditLog({
        userId: (user as JWTPayload | null)?.userId,
        action: 'get_routes',
        resourceType: 'route',
        responseStatus: 200,
      });

      return result as GetRoutesResponse;
    },
    {
      beforeHandle: requireAuth,
      detail: {
        description: 'Get the routing table from the router',
        tags: ['Routing'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Routing table',
          },
          401: {
            description: 'Authentication required',
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
    async ({ params, user }) => {
      const { protocol } = params;
      const allRoutes = await networkService.getRoutes();

      const filteredRoutes = allRoutes.routes.filter(
        (route) => route.protocol === protocol
      );

      // Create audit log
      await db.createAuditLog({
        userId: (user as JWTPayload | null)?.userId,
        action: 'get_routes',
        resourceType: 'route',
        resourceId: protocol,
        responseStatus: 200,
      });

      return {
        protocol,
        routes: filteredRoutes,
      };
    },
    {
      beforeHandle: requireAuth,
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
    async ({ body, user, set }) => {
      const request = body as ConfigureRouteRequest;
      const userData = user as JWTPayload | null;

      // Check if user has write permission
      if (userData?.role === 'readonly') {
        set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Read-only users cannot modify configurations',
        };
      }

      const result = await networkService.configureRoute(request);

      // Create audit log
      await db.createAuditLog({
        userId: userData?.userId,
        action: 'configure_route',
        resourceType: 'route',
        resourceId: request.protocol,
        requestData: request,
        responseStatus: 200,
      });

      // Create config history
      await db.createConfigHistory({
        userId: userData?.userId,
        resourceType: 'route',
        resourceId: request.protocol,
        newConfig: request,
        changeType: 'create',
      });

      return result as ConfigureRouteResponse;
    },
    {
      beforeHandle: requireAuth,
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
            description: 'Invalid request',
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
    async ({ body, user, set }) => {
      const request = body as DeleteRouteRequest;
      const userData = user as JWTPayload | null;

      // Check if user has delete permission
      if (userData?.role !== 'admin') {
        set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Only admin users can delete routes',
        };
      }

      const result = await networkService.deleteRoute(request);

      // Create audit log
      await db.createAuditLog({
        userId: userData?.userId,
        action: 'delete_route',
        resourceType: 'route',
        resourceId: request.destination,
        requestData: request,
        responseStatus: 200,
      });

      // Create config history
      await db.createConfigHistory({
        userId: userData?.userId,
        resourceType: 'route',
        resourceId: request.destination,
        changeType: 'delete',
      });

      return result as DeleteRouteResponse;
    },
    {
      beforeHandle: requireAuth,
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
