/**
 * Authentication middleware
 * JWT validation and authorization
 */

import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { config } from '../config/index.js';
import { db } from '../db/index.js';
import { sha256 } from '../utils/crypto.js';
import type { UserRole, JWTPayload } from '../types/index.js';

/**
 * JWT authentication plugin
 * Derives user information from JWT token in Authorization header
 */
export const authPlugin = new Elysia({ name: 'auth' })
  .use(
    jwt({
      name: 'jwt',
      secret: config.jwtSecret,
      exp: config.jwtExpiresIn,
    })
  )
  .derive(async ({ jwt, request }) => {
    // Extract token from Authorization header
    const authHeader = request.headers.get('Authorization');
    let user: JWTPayload | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        // Verify JWT
        const payload = await jwt.verify(token);

        if (payload) {
          // Check if session is valid
          const tokenHash = sha256(token);
          const session = await db.findSession(tokenHash);

          if (session && session.length > 0) {
            user = {
              userId: (payload as any).userId || (payload as any).sub,
              username: (payload as any).username,
              role: (payload as any).role,
            } as JWTPayload;
          }
        }
      } catch {
        // Invalid token - user remains null
      }
    }

    return {
      user,
      isAuthenticated: !!user,
    };
  });

/**
 * Require authentication guard
 * Returns error response if user is not authenticated
 */
export const requireAuth = (allowedRoles?: UserRole[]) => {
  return {
    beforeHandle: ({ user, set }: { user: JWTPayload | null; set: { status: number } }) => {
      if (!user) {
        set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(user.role)) {
          set.status = 403;
          return {
            error: 'Forbidden',
            message: `Requires one of roles: ${allowedRoles.join(', ')}`,
          };
        }
      }
    },
  };
};

/**
 * Get the raw token from request
 */
export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}
