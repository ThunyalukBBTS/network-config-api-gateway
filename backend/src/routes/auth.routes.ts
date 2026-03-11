/**
 * Authentication routes
 * POST /api/auth/login - Login and get JWT token
 * POST /api/auth/logout - Logout and invalidate token
 * GET /api/auth/me - Get current user info
 */

import { Elysia, t } from 'elysia';
import { authPlugin, extractToken } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { comparePassword, sha256 } from '../utils/crypto.js';
import { config } from '../config/index.js';
import type { LoginRequest, LoginResponse, LogoutResponse, JWTPayload } from '../types/index.js';

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .use(authPlugin)

  /**
   * POST /api/auth/login
   * Authenticate user and return JWT token
   */
  .post(
    '/login',
    async (context: any) => {
      const { username, password } = context.body as LoginRequest;

      // Find user
      const users = await db.findUserByUsername(username);
      const user = users[0];

      if (!user) {
        context.set.status = 401;
        return {
          error: 'Authentication failed',
          message: 'Invalid username or password',
        };
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.password_hash || '');

      if (!isValidPassword) {
        context.set.status = 401;
        return {
          error: 'Authentication failed',
          message: 'Invalid username or password',
        };
      }

      // Create JWT token
      const payload: JWTPayload = {
        userId: user.id,
        username: user.username,
        role: user.role as 'admin',
      };

      const token = await context.jwt.sign(payload);

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + config.jwtExpiresIn);

      // Store session
      const tokenHash = sha256(token);
      await db.createSession({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      // Update last login
      await db.updateLastLogin(user.id);

      // Create audit log
      await db.createAuditLog({
        userId: user.id,
        action: 'login',
        responseStatus: 200,
      });

      const response: LoginResponse = {
        token,
        expiresIn: config.jwtExpiresIn,
        user: {
          id: user.id,
          username: user.username,
          role: user.role as 'admin',
        },
      };

      return response;
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
      }),
      detail: {
        description: 'Authenticate with username and password to receive a JWT bearer token',
        tags: ['Authentication'],
        responses: {
          200: {
            description: 'Login successful',
          },
          401: {
            description: 'Authentication failed',
          },
        },
      },
    }
  )

  /**
   * POST /api/auth/logout
   * Invalidate JWT token
   */
  .post(
    '/logout',
    async (context: any) => {
      const user = context.user as JWTPayload | null;

      if (!user) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      // Extract and invalidate token
      const token = extractToken(context.request);
      if (token) {
        const tokenHash = sha256(token);
        await db.revokeSession(tokenHash);
      }

      // Create audit log
      await db.createAuditLog({
        userId: user.userId,
        action: 'logout',
        responseStatus: 200,
      });

      const response: LogoutResponse = {
        message: 'Logged out successfully',
      };

      return response;
    },
    {
      detail: {
        description: 'Logout and invalidate the current JWT token',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Logout successful',
          },
          401: {
            description: 'Authentication required',
          },
        },
      },
    }
  )

  /**
   * GET /api/auth/me
   * Get current user info
   */
  .get(
    '/me',
    async (context: any) => {
      const user = context.user as JWTPayload | null;

      if (!user) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      return {
        user: {
          id: user.userId,
          username: user.username,
          role: user.role,
        },
      };
    },
    {
      detail: {
        description: 'Get current authenticated user information',
        tags: ['Authentication'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'User information',
          },
          401: {
            description: 'Authentication required',
          },
        },
      },
    }
  );
