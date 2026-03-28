/**
 * Type definitions for Network API Gateway
 */

// ============================================================================
// Authentication Types
// ============================================================================

export interface User {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
}

export type UserRole = 'admin' | 'operator' | 'readonly';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresIn: number;
  user: {
    id: string;
    username: string;
    role: UserRole;
  };
}

export interface LogoutResponse {
  message: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// ============================================================================
// Interface Types
// ============================================================================

export interface InterfaceConfig {
  name: string;
  ip: string;
  admin_state: 'enable' | 'disable';
  oper_state: 'up' | 'down';
  description?: string;
  mtu?: number;
  port_speed?: string;
}

export interface GetInterfacesResponse {
  interfaces: InterfaceConfig[];
}

export interface ConfigureInterfaceRequest {
  name: string;
  ip?: string;
  description?: string;
  admin_state?: 'enable' | 'disable';
  mtu?: number;
}

export interface ConfigureInterfaceResponse {
  message: string;
  interface: string;
}

// ============================================================================
// Routing Types
// ============================================================================

export type RoutingProtocol = 'connected';

export interface Route {
  destination: string;
  nextHop: string;
  interface: string;
  protocol: RoutingProtocol;
  metric?: number;
  adminDistance?: number;
}

export interface GetRoutesResponse {
  routes: Route[];
}

export interface ConnectedRouteRequest {
  interfaces: string[];
}

export type ConfigureRouteRequest = ConnectedRouteRequest;

export interface ConfigureRouteResponse {
  message: string;
  interfaces: string[];
}

export interface DeleteRouteResponse {
  message: string;
}

// ============================================================================
// gNMI Types
// ============================================================================

export interface GNMIConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  insecure: boolean;
  timeout?: number;
}

export interface RouterConfigRequest {
  ip: string;
  port?: number;
  user: string;
  pass: string;
}

export interface RouterConfigResponse {
  message: string;
  router: {
    ip: string;
    port: number;
    user: string;
    configured: boolean;
  };
}

export interface GNMISetRequest {
  path: string[];
  value?: unknown;
  operation?: 'update' | 'delete' | 'replace';
}

export interface GNMIGetRequest {
  path: string[];
  encoding?: 'json' | 'bytes' | 'proto' | 'ascii';
  type?: 'all' | 'config' | 'state' | 'operational';
}

export interface GNMISubscription {
  path: string;
  mode?: 'sample' | 'on_change' | 'target_defined';
  sampleInterval?: number;
  suppressRedundant?: boolean;
  heartbeatInterval?: number;
}

export interface GNMIPath {
  elem: Array<{
    name: string;
    key?: Record<string, string>;
  }>;
  origin?: string;
  target?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class APIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export interface ErrorResponse {
  error: {
    message: string;
    code?: string;
    statusCode: number;
  };
}
