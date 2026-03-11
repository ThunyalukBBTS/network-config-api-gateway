/**
 * Firewall routes
 * GET /api/firewall - Get firewall rules
 * POST /api/firewall - Configure firewall rule
 * DELETE /api/firewall/:ruleId - Delete firewall rule
 */

import { Elysia, t } from 'elysia';
import { jwtVerify } from 'jose';
import { config } from '../config/index.js';
import { sha256 } from '../utils/crypto.js';
import { networkService } from '../services/network-service.js';
import { db } from '../db/index.js';
import type {
  FirewallRuleRequest,
  FirewallRuleResponse,
} from '../types/index.js';

// Helper function to verify JWT and get user
async function verifyTokenAndGetUser(token: string) {
  try {
    const { payload } = await jwtVerify(
      token,
      Buffer.from(config.jwtSecret)
    );
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      role: payload.role as 'admin',
    };
  } catch {
    return null;
  }
}

// Check if session is valid
async function isSessionValid(token: string): Promise<boolean> {
  const tokenHash = sha256(token);
  const session = await db.findSession(tokenHash);
  return session && session.length > 0;
}

export const firewallRoutes = new Elysia({ prefix: '/api/firewall' })

  /**
   * GET /api/firewall
   * Get all firewall rules
   */
  .get(
    '/',
    async (context: any) => {
      const authHeader = context.request.headers.get('Authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      const token = authHeader.substring(7);
      const user = await verifyTokenAndGetUser(token);

      if (!user || !(await isSessionValid(token))) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Invalid or expired token',
        };
      }

      const result = await networkService.getFirewallRules();

      // Create audit log
      await db.createAuditLog({
        userId: user.userId,
        action: 'get_firewall_rules',
        resourceType: 'firewall',
        responseStatus: 200,
      });

      return result;
    },
    {
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
          403: {
            description: 'Insufficient permissions',
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
    async (context: any) => {
      const authHeader = context.request.headers.get('Authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      const token = authHeader.substring(7);
      const user = await verifyTokenAndGetUser(token);

      if (!user || !(await isSessionValid(token))) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Invalid or expired token',
        };
      }

      const request = context.body as FirewallRuleRequest;

      // Check if user has write permission
      if (user?.role === 'readonly') {
        context.set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Read-only users cannot modify configurations',
        };
      }

      const result = await networkService.configureFirewallRule(request);

      // Create audit log
      await db.createAuditLog({
        userId: user.userId,
        action: 'configure_firewall_rule',
        resourceType: 'firewall',
        resourceId: result.ruleId.toString(),
        requestData: request as unknown as Record<string, unknown>,
        responseStatus: 200,
      });

      // Create config history
      await db.createConfigHistory({
        userId: user.userId,
        resourceType: 'firewall',
        resourceName: `Rule ${result.ruleId}`,
        newConfig: request as unknown as Record<string, unknown>,
        changeType: 'create',
      });

      return result as FirewallRuleResponse;
    },
    {
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
    async (context: any) => {
      const authHeader = context.request.headers.get('Authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      const token = authHeader.substring(7);
      const user = await verifyTokenAndGetUser(token);

      if (!user || !(await isSessionValid(token))) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Invalid or expired token',
        };
      }

      const { ruleId } = context.params;

      // Check if user has delete permission
      if (user?.role !== 'admin') {
        context.set.status = 403;
        return {
          error: 'Forbidden',
          message: 'Only admin users can delete firewall rules',
        };
      }

      const result = await networkService.deleteFirewallRule(parseInt(ruleId, 10));

      // Create audit log
      await db.createAuditLog({
        userId: user.userId,
        action: 'delete_firewall_rule',
        resourceType: 'firewall',
        resourceId: ruleId,
        responseStatus: 200,
      });

      // Create config history
      await db.createConfigHistory({
        userId: user.userId,
        resourceType: 'firewall',
        resourceName: `Rule ${ruleId}`,
        changeType: 'delete',
      });

      return result;
    },
    {
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
