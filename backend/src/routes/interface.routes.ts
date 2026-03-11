/**
 * Interface routes
 * GET /api/interfaces - Get all interface configurations
 * POST /api/interfaces - Configure an interface
 */

import { Elysia, t } from 'elysia';
import { authPlugin } from '../middleware/auth.js';
import { networkService } from '../services/network-service.js';
import { db } from '../db/index.js';
import type {
  GetInterfacesResponse,
  ConfigureInterfaceRequest,
  ConfigureInterfaceResponse,
  JWTPayload,
} from '../types/index.js';

export const interfaceRoutes = new Elysia({ prefix: '/api/interfaces' })
  .use(authPlugin)

  /**
   * GET /api/interfaces
   * Get all interface configurations
   */
  .get(
    '/',
    async ({ user }) => {
      const result = await networkService.getInterfaces();

      // Create audit log
      await db.createAuditLog({
        userId: (user as JWTPayload | null)?.userId,
        action: 'get_interfaces',
        resourceType: 'interface',
        responseStatus: 200,
      });

      return result as GetInterfacesResponse;
    },
    {
      beforeHandle: ({ user, set }) => {
        if (!user) {
          set.status = 401;
          return {
            error: 'Authentication required',
            message: 'Please provide a valid bearer token',
          };
        }
      },
      detail: {
        description: 'Get all interface configurations from the router',
        tags: ['Interfaces'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'List of interfaces',
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
   * GET /api/interfaces/:name
   * Get specific interface configuration
   */
  .get(
    '/:name',
    async ({ params, user, set }) => {
      const { name } = params;
      const iface = await networkService.getInterface(name);

      if (!iface) {
        set.status = 404;
        return {
          error: 'Interface not found',
          message: `Interface ${name} does not exist`,
        };
      }

      // Create audit log
      await db.createAuditLog({
        userId: (user as JWTPayload | null)?.userId,
        action: 'get_interface',
        resourceType: 'interface',
        resourceId: name,
        responseStatus: 200,
      });

      return { interface: iface };
    },
    {
      beforeHandle: ({ user, set }) => {
        if (!user) {
          set.status = 401;
          return {
            error: 'Authentication required',
            message: 'Please provide a valid bearer token',
          };
        }
      },
      params: t.Object({
        name: t.String(),
      }),
      detail: {
        description: 'Get configuration for a specific interface',
        tags: ['Interfaces'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Interface configuration',
          },
          404: {
            description: 'Interface not found',
          },
        },
      },
    }
  )

  /**
   * POST /api/interfaces
   * Configure an interface
   */
  .post(
    '/',
    async ({ body, user, set }) => {
      const request = body as ConfigureInterfaceRequest;
      const userData = user as JWTPayload | null;

      // Check if user has write permission
      if (userData?.role === 'readonly') {
        set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Read-only users cannot modify configurations',
        };
      }

      const result = await networkService.configureInterface(request);

      // Create audit log
      await db.createAuditLog({
        userId: userData?.userId,
        action: 'configure_interface',
        resourceType: 'interface',
        resourceId: request.name,
        requestData: request,
        responseStatus: 200,
      });

      // Create config history
      await db.createConfigHistory({
        userId: userData?.userId,
        resourceType: 'interface',
        resourceName: request.name,
        newConfig: request,
        changeType: 'update',
      });

      return result as ConfigureInterfaceResponse;
    },
    {
      beforeHandle: ({ user, set }) => {
        if (!user) {
          set.status = 401;
          return {
            error: 'Authentication required',
            message: 'Please provide a valid bearer token',
          };
        }
      },
      body: t.Object({
        name: t.String(),
        ip: t.Optional(t.String()),
        description: t.Optional(t.String()),
        enabled: t.Optional(t.Boolean()),
        mtu: t.Optional(t.Number()),
      }),
      detail: {
        description: 'Configure an interface (IP address, description, state, etc.)',
        tags: ['Interfaces'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Interface configured successfully',
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
  );
