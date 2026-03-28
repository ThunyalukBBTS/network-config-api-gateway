/**
 * Audit routes
 * GET /api/audit-logs - Get audit logs
 * GET /api/config-history - Get configuration history
 */

import { Elysia, t } from 'elysia';
import { authenticateRequest } from '../utils/auth.js';
import { db } from '../db/index.js';

export const auditRoutes = new Elysia({ prefix: '/api' })

  /**
   * GET /api/audit-logs
   * Get audit logs
   */
  .get(
    '/audit-logs',
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
        const query = context.query as {
          action?: string;
          resource_type?: string;
          limit?: string;
          offset?: string;
        };

        const filters: any = {};
        if (query.action) filters.action = query.action;
        if (query.resource_type) filters.resourceType = query.resource_type;
        if (query.limit) filters.limit = parseInt(query.limit);
        if (query.offset) filters.offset = parseInt(query.offset);

        const logs = await db.getAuditLogs(filters);

        return {
          logs,
          total: logs.length,
          limit: filters.limit || 100,
          offset: filters.offset || 0,
        };
      } catch (error: any) {
        context.set.status = 400;
        return {
          message: error.message || 'Failed to get audit logs',
        };
      }
    },
    {
      query: t.Object({
        action: t.Optional(t.String()),
        resource_type: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
      detail: {
        description: 'Get audit logs with optional filters',
        tags: ['Audit'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Audit logs retrieved successfully',
          },
          401: {
            description: 'Authentication required',
          },
        },
      },
    }
  )

  /**
   * GET /api/config-history
   * Get configuration history
   */
  .get(
    '/config-history',
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
        const query = context.query as {
          resource_type?: string;
          resource_name?: string;
          change_type?: string;
          limit?: string;
          offset?: string;
        };

        const filters: any = {};
        if (query.resource_type) filters.resourceType = query.resource_type;
        if (query.resource_name) filters.resourceName = query.resource_name;
        if (query.change_type) filters.changeType = query.change_type;
        if (query.limit) filters.limit = parseInt(query.limit);
        if (query.offset) filters.offset = parseInt(query.offset);

        const history = await db.getConfigHistory(filters);

        return {
          history,
          total: history.length,
          limit: filters.limit || 100,
          offset: filters.offset || 0,
        };
      } catch (error: any) {
        context.set.status = 400;
        return {
          message: error.message || 'Failed to get config history',
        };
      }
    },
    {
      query: t.Object({
        resource_type: t.Optional(t.String()),
        resource_name: t.Optional(t.String()),
        change_type: t.Optional(t.Union([t.Literal('create'), t.Literal('update'), t.Literal('delete')])),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
      detail: {
        description: 'Get configuration history with optional filters',
        tags: ['Audit'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Configuration history retrieved successfully',
          },
          401: {
            description: 'Authentication required',
          },
        },
      },
    }
  );
