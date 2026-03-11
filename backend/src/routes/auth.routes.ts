/**
 * Authentication routes
 * POST /api/auth/login - Login and get JWT token
 * POST /api/auth/logout - Invalidate JWT token
 * GET /api/auth/me - Get current user info
 */

import { Elysia, t } from 'elysia';
import { SignJWT, jwtVerify } from 'jose';
import { db } from '../db/index.js';
import { comparePassword, sha256 } from '../utils/crypto.js';
import { config } from '../config/index.js';
import type { LoginRequest, LoginResponse, LogoutResponse, JWTPayload } from '../types/index.js';

export const authRoutes = new Elysia({ prefix: '/api/auth' })

  /**
   * POST /api/auth/login
   * Login and get JWT token
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
      const token = await new SignJWT({
        userId: user.id,
        username: user.username,
        role: user.role,
      })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(Buffer.from(config.jwtSecret));

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
      const authHeader = context.request.headers.get('Authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      const token = authHeader.substring(7);

      // Verify JWT
      let payload: JWTPayload | null = null;
      try {
        const { payload: verifiedPayload } = await jwtVerify(
          token,
          Buffer.from(config.jwtSecret)
        );
        payload = {
          userId: verifiedPayload.userId as string,
          username: verifiedPayload.username as string,
          role: verifiedPayload.role as 'admin',
        };
      } catch (err) {
        console.log('[LOGOUT] JWT verify error:', err);
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Invalid token signature or expired token',
        };
      }

      // Check session
      const tokenHash = sha256(token);
      const session = await db.findSession(tokenHash);

      if (!session || session.length === 0) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Session not found or expired',
        };
      }

      // Invalidate token
      await db.revokeSession(tokenHash);

      // Create audit log
      await db.createAuditLog({
        userId: payload.userId,
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
      const authHeader = context.request.headers.get('Authorization');

      if (!authHeader?.startsWith('Bearer ')) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Please provide a valid bearer token',
        };
      }

      const token = authHeader.substring(7);

      // Verify JWT
      let payload: JWTPayload | null = null;
      try {
        const { payload: verifiedPayload } = await jwtVerify(
          token,
          Buffer.from(config.jwtSecret)
        );
        payload = {
          userId: verifiedPayload.userId as string,
          username: verifiedPayload.username as string,
          role: verifiedPayload.role as 'admin',
        };
      } catch {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Invalid token',
        };
      }

      if (!payload) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Invalid token',
        };
      }

      // Check session
      const tokenHash = sha256(token);
      const session = await db.findSession(tokenHash);

      if (!session || session.length === 0) {
        context.set.status = 401;
        return {
          error: 'Authentication required',
          message: 'Session not found or expired',
        };
      }

      return {
        user: {
          id: payload.userId,
          username: payload.username,
          role: payload.role,
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
