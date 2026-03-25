/**
 * Authentication utilities
 * Helper functions for JWT verification and session validation
 */

import { jwtVerify } from 'jose';
import { config } from '../config/index.js';
import { sha256 } from './crypto.js';
import { db } from '../db/index.js';
import type { JWTPayload } from '../types/index.js';

/**
 * Verify JWT token and get user payload
 */
export async function verifyTokenAndGetUser(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      Buffer.from(config.jwtSecret)
    );
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      role: payload.role as 'admin' | 'operator' | 'readonly',
    };
  } catch {
    return null;
  }
}

/**
 * Check if session is valid in database
 */
export async function isSessionValid(token: string): Promise<boolean> {
  const tokenHash = sha256(token);
  const session = await db.findSession(tokenHash);
  return session && session.length > 0;
}

/**
 * Authenticate request and return user
 * Returns null if authentication fails
 */
export async function authenticateRequest(authHeader: string | null): Promise<JWTPayload | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const user = await verifyTokenAndGetUser(token);

  if (!user || !(await isSessionValid(token))) {
    return null;
  }

  return user;
}
