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
  status: InterfaceStatus;
  description?: string;
  enabled: boolean;
  mtu?: number;
}

export type InterfaceStatus = 'up' | 'down' | 'admin-down' | 'unknown';

export interface GetInterfacesResponse {
  interfaces: InterfaceConfig[];
}

export interface ConfigureInterfaceRequest {
  name: string;
  ip?: string;
  description?: string;
  enabled?: boolean;
  mtu?: number;
}

export interface ConfigureInterfaceResponse {
  message: string;
  interface: string;
}

// ============================================================================
// Routing Types
// ============================================================================

export type RoutingProtocol = 'static' | 'ospf' | 'bgp' | 'eigrp' | 'connected';

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

export interface StaticRouteRequest {
  protocol: 'static';
  destination: string;
  nextHop?: string;
  interface?: string;
  metric?: number;
}

export interface OSPFConfigRequest {
  protocol: 'ospf';
  processId: number;
  routerId: string;
  networks: OSPFNetwork[];
  defaultInformationOriginate?: boolean;
  areas?: OSPFArea[];
}

export interface OSPFNetwork {
  network: string;
  area: number;
}

export interface OSPFArea {
  areaId: number;
  networks: string[];
}

export interface BGPConfigRequest {
  protocol: 'bgp';
  asNumber: number;
  routerId: string;
  neighbors: BGPNeighbor[];
  networks: string[];
  redistribute?: string[];
}

export interface BGPNeighbor {
  ip: string;
  remoteAs: number;
  description?: string;
  password?: string;
  timers?: {
    keepalive?: number;
    hold?: number;
  };
}

export interface EIGRPConfigRequest {
  protocol: 'eigrp';
  asNumber: number;
  routerId: string;
  networks: string[];
}

export type ConfigureRouteRequest =
  | StaticRouteRequest
  | OSPFConfigRequest
  | BGPConfigRequest
  | EIGRPConfigRequest;

export interface ConfigureRouteResponse {
  message: string;
  protocol: RoutingProtocol;
}

export interface DeleteRouteRequest {
  protocol: RoutingProtocol;
  destination?: string;
  processId?: number;
  asNumber?: number;
}

export interface DeleteRouteResponse {
  message: string;
}

// ============================================================================
// Firewall Types
// ============================================================================

export type FirewallAction = 'permit' | 'deny';

export interface FirewallRuleRequest {
  action: FirewallAction;
  source: string;
  destination: string;
  protocol?: string;
  port?: number;
  portRange?: {
    start: number;
    end: number;
  };
  description?: string;
}

export interface FirewallRuleResponse {
  message: string;
  ruleId: number;
}

export interface FirewallRule {
  ruleId: number;
  action: FirewallAction;
  source: string;
  destination: string;
  protocol?: string;
  port?: number;
  hitCount?: number;
}

// ============================================================================
// gNMI/NETCONF Types
// ============================================================================

export interface GNMIConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  insecure: boolean;
}

export interface NETCONFConfig {
  host: string;
  port: number;
  username: string;
  password: string;
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
