/**
 * Routes aggregator
 */

import { authRoutes } from './auth.routes.js';
import { healthRoutes } from './health.routes.js';
import { interfaceRoutes } from './interface.routes.js';
import { routingRoutes } from './routing.routes.js';
import { routerConfigRoutes } from './config.routes.js';
import { auditRoutes } from './audit.routes.js';

export {
    authRoutes,
    healthRoutes,
    interfaceRoutes,
    routingRoutes,
    routerConfigRoutes,
    auditRoutes,
};
