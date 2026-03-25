/**
 * Interface routes
 * GET /api/interfaces - Get all interface configurations
 * POST /api/interfaces - Configure an interface
 */

import { Elysia, t } from 'elysia';
import { authenticateRequest } from '../utils/auth.js';
import { networkService } from '../services/network-service.js';
import { db } from '../db/index.js';
import type {
  GetInterfacesResponse,
  ConfigureInterfaceRequest,
  ConfigureInterfaceResponse,
} from '../types/index.js';

export const interfaceRoutes = new Elysia({ prefix: "/api/interfaces" })

    /**
     * GET /api/interfaces
     * Get all interface configurations
     */
    .get(
        "/",
        async (context: any) => {
            const user = await authenticateRequest(context.request.headers.get("Authorization"));

            if (!user) {
                context.set.status = 401;
                return {
                    error: "Authentication required",
                    message: "Please provide a valid bearer token",
                };
            }

            try {
                const result = await networkService.getInterfaces();

                // Create audit log
                await db.createAuditLog({
                    userId: user.userId,
                    action: "get_interfaces",
                    resourceType: "interface",
                    responseStatus: 200,
                });

                return result as GetInterfacesResponse;
            } catch (error: any) {
                context.set.status = 400;
                return {
                    message: error.message || 'Failed to get interfaces',
                };
            }
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
                    400: {
                        description: "Bad request - router may not be configured",
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
            const user = await authenticateRequest(context.request.headers.get("Authorization"));

            if (!user) {
                context.set.status = 401;
                return {
                    error: "Authentication required",
                    message: "Please provide a valid bearer token",
                };
            }

            try {
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
            } catch (error: any) {
                context.set.status = 400;
                return {
                    message: error.message || 'Failed to get interface',
                };
            }
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
                    400: {
                        description: "Bad request - router may not be configured",
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
            const user = await authenticateRequest(context.request.headers.get("Authorization"));

            if (!user) {
                context.set.status = 401;
                return {
                    error: "Authentication required",
                    message: "Please provide a valid bearer token",
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

            try {
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
            } catch (error: any) {
                context.set.status = 400;
                return {
                    message: error.message || 'Failed to configure interface',
                };
            }
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
                        description: "Invalid request or router not configured",
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
