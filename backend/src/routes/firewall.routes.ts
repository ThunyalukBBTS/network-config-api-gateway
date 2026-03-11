/**
 * Firewall routes
 * GET /api/firewall - Get firewall rules
 * POST /api/firewall - Configure firewall rule
 * DELETE /api/firewall/:ruleId - Delete firewall rule
 */

import { Elysia, t } from 'elysia';
import { authPlugin } from '../middleware/auth.js';
import { networkService } from '../services/network-service.js';
import { db } from '../db/index.js';
import type {
  FirewallRuleRequest,
  FirewallRuleResponse,
  JWTPayload,
} from '../types/index.js';

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

export const firewallRoutes = new Elysia({ prefix: '/api/firewall' })
  .use(authPlugin)

  /**
   * GET /api/firewall
   * Get all firewall rules
   */
  .get(
    '/',
    async ({ user }) => {
      const result = await networkService.getFirewallRules();

      // Create audit log
      await db.createAuditLog({
        userId: (user as JWTPayload | null)?.userId,
        action: 'get_firewall_rules',
        resourceType: 'firewall',
        responseStatus: 200,
      });

      return result;
    },
    {
      beforeHandle: requireAuth,
      detail: {
        description: 'Get all firewall rules from the router',
        tags: ['Firewall'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'List of firewall rules',
          },
          401: {
            description: 'Authentication required',
          },
        },
      },
    }
  )

  /**
   * POST /api/firewall
   * Configure a firewall rule
   */
  .post(
    '/',
    async ({ body, user, set }) => {
      const request = body as FirewallRuleRequest;
      const userData = user as JWTPayload | null;

      // Check if user has write permission
      if (userData?.role === 'readonly') {
        set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Read-only users cannot modify configurations',
        };
      }

      const result = await networkService.configureFirewallRule(request);

      // Create audit log
      await db.createAuditLog({
        userId: userData?.userId,
        action: 'configure_firewall_rule',
        resourceType: 'firewall',
        resourceId: result.ruleId.toString(),
        requestData: request,
        responseStatus: 200,
      });

      // Create config history
      await db.createConfigHistory({
        userId: userData?.userId,
        resourceType: 'firewall',
        resourceId: result.ruleId.toString(),
        newConfig: request,
        changeType: 'create',
      });

      return result as FirewallRuleResponse;
    },
    {
      beforeHandle: requireAuth,
      body: t.Object({
        action: t.Union([t.Literal('permit'), t.Literal('deny')]),
        source: t.String(),
        destination: t.String(),
        protocol: t.Optional(t.String()),
        port: t.Optional(t.Number()),
        portRange: t.Optional(
          t.Object({
            start: t.Number(),
            end: t.Number(),
          })
        ),
        description: t.Optional(t.String()),
      }),
      detail: {
        description: 'Configure a firewall rule on the router',
        tags: ['Firewall'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Firewall rule added successfully',
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
   * DELETE /api/firewall/:ruleId
   * Delete a firewall rule
   */
  .delete(
    '/:ruleId',
    async ({ params, user, set }) => {
      const { ruleId } = params;
      const userData = user as JWTPayload | null;

      // Check if user has delete permission
      if (userData?.role !== 'admin') {
        set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Only admin users can delete firewall rules',
        };
      }

      const result = await networkService.deleteFirewallRule(parseInt(ruleId, 10));

      // Create audit log
      await db.createAuditLog({
        userId: userData?.userId,
        action: 'delete_firewall_rule',
        resourceType: 'firewall',
        resourceId: ruleId,
        responseStatus: 200,
      });

      // Create config history
      await db.createConfigHistory({
        userId: userData?.userId,
        resourceType: 'firewall',
        resourceId: ruleId,
        changeType: 'delete',
      });

      return result;
    },
    {
      beforeHandle: requireAuth,
      params: t.Object({
        ruleId: t.String(),
      }),
      detail: {
        description: 'Delete a firewall rule by its ID',
        tags: ['Firewall'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Firewall rule deleted successfully',
          },
          401: {
            description: 'Authentication required',
          },
          403: {
            description: 'Insufficient permissions',
          },
          404: {
            description: 'Firewall rule not found',
          },
        },
      },
    }
  );
