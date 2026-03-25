/**
 * Interface routes
 * GET /api/interfaces - Get all interface configurations
 * POST /api/interfaces - Configure an interface
 */

import { Elysia, t } from 'elysia';
import { jwtVerify } from 'jose';
import { config } from '../config/index.js';
import { sha256 } from '../utils/crypto.js';
import { networkService } from '../services/network-service.js';
import { db } from '../db/index.js';
import type {
  GetInterfacesResponse,
  ConfigureInterfaceRequest,
  ConfigureInterfaceResponse,
  JWTPayload,
} from '../types/index.js';

// Helper function to verify JWT and get user
async function verifyTokenAndGetUser(token: string): Promise<JWTPayload | null> {
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

export const interfaceRoutes = new Elysia({ prefix: "/api/interfaces" })

    /**
     * GET /api/interfaces
     * Get all interface configurations
     */
    .get(
        "/",
        async (context: any) => {
            const authHeader = context.request.headers.get("Authorization");

            if (!authHeader?.startsWith("Bearer ")) {
                context.set.status = 401;
                return {
                    error: "Authentication required",
                    message: "Please provide a valid bearer token",
                };
            }

            const token = authHeader.substring(7);
            const user = await verifyTokenAndGetUser(token);

            if (!user || !(await isSessionValid(token))) {
                context.set.status = 401;
                return {
                    error: "Authentication required",
                    message: "Invalid or expired token",
                };
            }

            const result = await networkService.getInterfaces();

            // Create audit log
            await db.createAuditLog({
                userId: user.userId,
                action: "get_interfaces",
                resourceType: "interface",
                responseStatus: 200,
            });

            return result as GetInterfacesResponse;
        },
        {
            detail: {
                description: "Get all interface configurations from the router",
                tags: ["Interfaces"],
                security: [{ BearerAuth: [] }],
                responses: {
                    200: {
                        description: "List of interfaces",
                    },
                    401: {
                        description: "Authentication required",
                    },
                    403: {
                        description: "Insufficient permissions",
                    },
                },
            },
        },
    )

    /**
     * GET /api/interfaces/:name
     * Get specific interface configuration
     */
    .get(
        "/:name",
        async (context: any) => {
            const authHeader = context.request.headers.get("Authorization");

            if (!authHeader?.startsWith("Bearer ")) {
                context.set.status = 401;
                return {
                    error: "Authentication required",
                    message: "Please provide a valid bearer token",
                };
            }

            const token = authHeader.substring(7);
            const user = await verifyTokenAndGetUser(token);

            if (!user || !(await isSessionValid(token))) {
                context.set.status = 401;
                return {
                    error: "Authentication required",
                    message: "Invalid or expired token",
                };
            }

            const { name } = context.params;
            const iface = await networkService.getInterface(name);

            if (!iface) {
                context.set.status = 404;
                return {
                    error: "Interface not found",
                    message: `Interface ${name} does not exist`,
                };
            }

            // Create audit log
            await db.createAuditLog({
                userId: user.userId,
                action: "get_interface",
                resourceType: "interface",
                resourceId: name,
                responseStatus: 200,
            });

            return { interface: iface };
        },
        {
            params: t.Object({
                name: t.String(),
            }),
            detail: {
                description: "Get configuration for a specific interface",
                tags: ["Interfaces"],
                security: [{ BearerAuth: [] }],
                responses: {
                    200: {
                        description: "Interface configuration",
                    },
                    404: {
                        description: "Interface not found",
                    },
                },
            },
        },
    )

    /**
     * POST /api/interfaces/:name
     * Configure a specific interface
     */
    .post(
        "/:name",
        async (context: any) => {
            const authHeader = context.request.headers.get("Authorization");

            if (!authHeader?.startsWith("Bearer ")) {
                context.set.status = 401;
                return {
                    error: "Authentication required",
                    message: "Please provide a valid bearer token",
                };
            }

            const token = authHeader.substring(7);
            const user = await verifyTokenAndGetUser(token);

            if (!user || !(await isSessionValid(token))) {
                context.set.status = 401;
                return {
                    error: "Authentication required",
                    message: "Invalid or expired token",
                };
            }

            const { name } = context.params;
            const body = context.body as Partial<
                Omit<ConfigureInterfaceRequest, "name">
            >;

            // Check if user has write permission
            if (user?.role === "readonly") {
                context.set.status = 403;
                return {
                    error: "Forbidden",
                    message: "Read-only users cannot modify configurations",
                };
            }

            const request: ConfigureInterfaceRequest = {
                name,
                ...body,
            };

            const result = await networkService.configureInterface(request);

            // Create audit log
            await db.createAuditLog({
                userId: user.userId,
                action: "configure_interface",
                resourceType: "interface",
                resourceId: request.name,
                requestData: request as unknown as Record<string, unknown>,
                responseStatus: 200,
            });

            // Create config history
            await db.createConfigHistory({
                userId: user.userId,
                resourceType: "interface",
                resourceName: name,
                newConfig: body as unknown as Record<string, unknown>,
                changeType: "update",
            });

            return result as ConfigureInterfaceResponse;
        },
        {
            params: t.Object({
                name: t.String(),
            }),
            body: t.Object({
                ip: t.Optional(t.String()),
                description: t.Optional(t.String()),
                admin_state: t.Optional(t.Union([t.Literal("enable"), t.Literal("disable")])),
                mtu: t.Optional(t.Number()),
            }),
            detail: {
                description:
                    "Configure an interface (IP address, description, admin state, etc.)",
                tags: ["Interfaces"],
                security: [{ BearerAuth: [] }],
                responses: {
                    200: {
                        description: "Interface configured successfully",
                    },
                    400: {
                        description: "Invalid request",
                    },
                    401: {
                        description: "Authentication required",
                    },
                    403: {
                        description: "Insufficient permissions",
                    },
                },
            },
        },
    );
