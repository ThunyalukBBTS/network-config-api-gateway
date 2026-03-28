/**
 * Database connection and utilities
 */

import postgres from 'postgres';
import { config } from '../config/index.js';

let sql: postgres.Sql<postgres.Record<never, never>> | null = null;

/**
 * Get database connection singleton
 */
export function getDb(): postgres.Sql<postgres.Record<never, never>> {
  if (!sql) {
    sql = postgres(config.databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

/**
 * Close database connection
 */
export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

/**
 * Database query helpers
 */
export const db = {
  /**
   * Find user by username
   */
  async findUserByUsername(username: string) {
    const sql = getDb();
    return await sql<UserDB[]>`
      SELECT id, username, password_hash, email, role, is_active, created_at, updated_at, last_login
      FROM users
      WHERE username = ${username} AND is_active = true
    `;
  },

  /**
   * Find user by ID
   */
  async findUserById(id: string) {
    const sql = getDb();
    return await sql<UserDB[]>`
      SELECT id, username, email, role, is_active, created_at, updated_at, last_login
      FROM users
      WHERE id = ${id}::uuid AND is_active = true
    `;
  },

  /**
   * Create a new user
   */
  async createUser(data: {
    username: string;
    passwordHash: string;
    email?: string;
    role: string;
  }) {
    const sql = getDb();
    return await sql`
      INSERT INTO users (username, password_hash, email, role)
      VALUES (${data.username}, ${data.passwordHash}, ${data.email || null}, ${data.role})
      RETURNING id, username, email, role, created_at
    `;
  },

  /**
   * Update user last login
   */
  async updateLastLogin(userId: string) {
    const sql = getDb();
    return await sql`
      UPDATE users
      SET last_login = CURRENT_TIMESTAMP
      WHERE id = ${userId}::uuid
    `;
  },

  /**
   * Save session for JWT token
   */
  async createSession(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    const sql = getDb();
    return await sql`
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES (${data.userId}::uuid, ${data.tokenHash}, ${data.expiresAt})
      RETURNING id
    `;
  },

  /**
   * Validate session by token hash
   */
  async findSession(tokenHash: string) {
    const sql = getDb();
    return await sql`
      SELECT s.*, u.username, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash}
        AND s.is_revoked = false
        AND s.expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `;
  },

  /**
   * Revoke session
   */
  async revokeSession(tokenHash: string) {
    const sql = getDb();
    return await sql`
      UPDATE sessions
      SET is_revoked = true, revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = ${tokenHash}
    `;
  },

  /**
   * Create audit log entry
   */
  async createAuditLog(data: {
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    requestData?: Record<string, unknown>;
    responseStatus: number;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const sql = getDb();
    return await sql`
      INSERT INTO audit_logs (
        user_id, action, resource_type, resource_id,
        request_data, response_status, ip_address, user_agent
      )
      VALUES (
        ${data.userId ? data.userId : null}::uuid,
        ${data.action},
        ${data.resourceType || null},
        ${data.resourceId || null},
        ${data.requestData ? JSON.stringify(data.requestData) : null}::jsonb,
        ${data.responseStatus},
        ${data.ipAddress || null},
        ${data.userAgent || null}
      )
      RETURNING id
    `;
  },

  /**
   * Save configuration history
   */
  async createConfigHistory(data: {
    userId?: string;
    resourceType: string;
    resourceName?: string;
    oldConfig?: Record<string, unknown>;
    newConfig?: Record<string, unknown>;
    changeType: string;
  }) {
    const sql = getDb();
    return await sql`
      INSERT INTO config_history (
        user_id, resource_type, resource_name,
        old_config, new_config, change_type
      )
      VALUES (
        ${data.userId ? data.userId : null}::uuid,
        ${data.resourceType},
        ${data.resourceName || null},
        ${data.oldConfig ? JSON.stringify(data.oldConfig) : null}::jsonb,
        ${data.newConfig ? JSON.stringify(data.newConfig) : null}::jsonb,
        ${data.changeType}
      )
      RETURNING id
    `;
  },

  /**
   * Get all audit logs with optional filters
   */
  async getAuditLogs(filters?: {
    userId?: string;
    action?: string;
    resourceType?: string;
    limit?: number;
    offset?: number;
  }) {
    const sql = getDb();

    type AuditLogResult = {
      id: number;
      action: string;
      resource_type: string | null;
      resource_id: string | null;
      request_data: unknown;
      response_status: number;
      ip_address: string | null;
      user_agent: string | null;
      created_at: Date;
      user_id: string | null;
      user_username: string | null;
      user_email: string | null;
      user_role: string | null;
    };

    return await sql<AuditLogResult[]>`
      SELECT
        al.id,
        al.action,
        al.resource_type,
        al.resource_id,
        al.request_data,
        al.response_status,
        al.ip_address,
        al.user_agent,
        al.created_at,
        u.id as user_id,
        u.username as user_username,
        u.email as user_email,
        u.role as user_role
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE ${
        filters?.userId
          ? sql`al.user_id = ${filters.userId}::uuid`
          : sql`TRUE`
      }
      AND ${
        filters?.action
          ? sql`al.action = ${filters.action}`
          : sql`TRUE`
      }
      AND ${
        filters?.resourceType
          ? sql`al.resource_type = ${filters.resourceType}`
          : sql`TRUE`
      }
      ORDER BY al.created_at DESC
      LIMIT ${filters?.limit || 100}
      OFFSET ${filters?.offset || 0}
    `;
  },

  /**
   * Get all config history with optional filters
   */
  async getConfigHistory(filters?: {
    userId?: string;
    resourceType?: string;
    resourceName?: string;
    changeType?: string;
    limit?: number;
    offset?: number;
  }) {
    const sql = getDb();

    type ConfigHistoryResult = {
      id: number;
      resource_type: string;
      resource_name: string | null;
      old_config: unknown;
      new_config: unknown;
      change_type: string;
      created_at: Date;
      user_id: string | null;
      user_username: string | null;
      user_email: string | null;
      user_role: string | null;
    };

    return await sql<ConfigHistoryResult[]>`
      SELECT
        ch.id,
        ch.resource_type,
        ch.resource_name,
        ch.old_config,
        ch.new_config,
        ch.change_type,
        ch.created_at,
        u.id as user_id,
        u.username as user_username,
        u.email as user_email,
        u.role as user_role
      FROM config_history ch
      LEFT JOIN users u ON u.id = ch.user_id
      WHERE ${
        filters?.userId
          ? sql`ch.user_id = ${filters.userId}::uuid`
          : sql`TRUE`
      }
      AND ${
        filters?.resourceType
          ? sql`ch.resource_type = ${filters.resourceType}`
          : sql`TRUE`
      }
      AND ${
        filters?.resourceName
          ? sql`ch.resource_name = ${filters.resourceName}`
          : sql`TRUE`
      }
      AND ${
        filters?.changeType
          ? sql`ch.change_type = ${filters.changeType}`
          : sql`TRUE`
      }
      ORDER BY ch.created_at DESC
      LIMIT ${filters?.limit || 100}
      OFFSET ${filters?.offset || 0}
    `;
  },
};

export interface UserDB {
  id: string;
  username: string;
  password_hash?: string;
  email?: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
}
