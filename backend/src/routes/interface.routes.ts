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
    async (context: any) => {
      const result = await networkService.getInterfaces();

      // Create audit log
      await db.createAuditLog({
        userId: context.user?.userId,
        action: 'get_interfaces',
        resourceType: 'interface',
        responseStatus: 200,
      });

      return result as GetInterfacesResponse;
    },
    {
      beforeHandle: (context: any) => {
        if (!context.user) {
          context.set.status = 401;
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
    async (context: any) => {
      const { name } = context.params;
      const iface = await networkService.getInterface(name);

      if (!iface) {
        context.set.status = 404;
        return {
          error: 'Interface not found',
          message: `Interface ${name} does not exist`,
        };
      }

      // Create audit log
      await db.createAuditLog({
        userId: context.user?.userId,
        action: 'get_interface',
        resourceType: 'interface',
        resourceId: name,
        responseStatus: 200,
      });

      return { interface: iface };
    },
    {
      beforeHandle: (context: any) => {
        if (!context.user) {
          context.set.status = 401;
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
    async (context: any) => {
      const request = context.body as ConfigureInterfaceRequest;

      // Check if user has write permission
      if (context.user?.role === 'readonly') {
        context.set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Read-only users cannot modify configurations',
        };
      }

      const result = await networkService.configureInterface(request);

      // Create audit log
      await db.createAuditLog({
        userId: context.user?.userId,
        action: 'configure_interface',
        resourceType: 'interface',
        resourceId: request.name,
        requestData: request as unknown as Record<string, unknown>,
        responseStatus: 200,
      });

      // Create config history
      await db.createConfigHistory({
        userId: context.user?.userId,
        resourceType: 'interface',
        resourceName: request.name,
        newConfig: request as unknown as Record<string, unknown>,
        changeType: 'update',
      });

      return result as ConfigureInterfaceResponse;
    },
    {
      beforeHandle: (context: any) => {
        if (!context.user) {
          context.set.status = 401;
          return {
            error: 'Authentication required',
            message: 'Please provide a valid bearer token',
          };
        }
      },
      body: t.Object({
        name: t.Enum({
          GigabitEthernet0: 'GigabitEthernet0',
          'GigabitEthernet0/0/0': 'GigabitEthernet0/0/0',
          'GigabitEthernet0/0/1': 'GigabitEthernet0/0/1',
          'Serial0/1/0': 'Serial0/1/0',
          'Serial0/1/1': 'Serial0/1/1',
          'GigabitEthernet0/2/0': 'GigabitEthernet0/2/0',
          'GigabitEthernet0/2/1': 'GigabitEthernet0/2/1',
          'GigabitEthernet0/2/2': 'GigabitEthernet0/2/2',
          'GigabitEthernet0/2/3': 'GigabitEthernet0/2/3',
          Vlan1: 'Vlan1',
        } as const),
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
