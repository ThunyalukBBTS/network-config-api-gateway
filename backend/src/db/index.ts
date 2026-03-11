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
