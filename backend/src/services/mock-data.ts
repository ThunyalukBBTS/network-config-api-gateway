/**
 * Mock data for development and testing
 * Used when MOCK_MODE is enabled
 */

import type { InterfaceConfig, Route, FirewallRule } from '../types/index.js';

/**
 * Mock interface configurations
 * For development/testing purposes
 */
export const mockInterfaces: InterfaceConfig[] = [
  {
    name: 'mgmt0',
    ip: '192.168.1.1/24',
    admin_state: 'enable',
    oper_state: 'up',
    description: 'Management Interface',
    mtu: 1500,
  },
  {
    name: 'ethernet-1/1',
    ip: '172.16.0.1/16',
    admin_state: 'enable',
    oper_state: 'up',
    description: 'WAN Interface - ISP Connection',
    mtu: 9232,
  },
  {
    name: 'ethernet-1/2',
    ip: 'unassigned',
    admin_state: 'disable',
    oper_state: 'down',
    description: 'Reserved WAN',
    mtu: 9232,
  },
  {
    name: 'ethernet-1/3',
    ip: 'unassigned',
    admin_state: 'disable',
    oper_state: 'down',
    description: 'Reserved Interface',
    mtu: 9232,
  },
  {
    name: 'ethernet-1/4',
    ip: 'unassigned',
    admin_state: 'disable',
    oper_state: 'down',
    description: 'Reserved Interface',
    mtu: 9232,
  },
];

/**
 * Mock routing table
 */
export const mockRoutes: Route[] = [
  {
    destination: '0.0.0.0/0',
    nextHop: '172.16.0.254',
    interface: 'ethernet-1/1',
    protocol: 'static',
    metric: 0,
    adminDistance: 1,
  },
  {
    destination: '192.168.1.0/24',
    nextHop: '',
    interface: 'mgmt0',
    protocol: 'connected',
    metric: 0,
    adminDistance: 0,
  },
  {
    destination: '172.16.0.0/16',
    nextHop: '',
    interface: 'ethernet-1/1',
    protocol: 'connected',
    metric: 0,
    adminDistance: 0,
  },
  {
    destination: '10.10.0.0/16',
    nextHop: '172.16.0.2',
    interface: 'ethernet-1/1',
    protocol: 'bgp',
    metric: 0,
    adminDistance: 20,
  },
  {
    destination: '172.20.0.0/16',
    nextHop: '172.16.0.100',
    interface: 'ethernet-1/1',
    protocol: 'ospf',
    metric: 10,
    adminDistance: 110,
  },
];

/**
 * Mock OSPF configuration
 */
export const mockOSPFConfig = {
  processId: 1,
  routerId: '1.1.1.1',
  networks: [
    { network: '10.0.0.0/24', area: 0 },
    { network: '172.16.0.0/24', area: 0 },
    { network: '172.20.0.0/24', area: 1 },
  ],
  defaultInformationOriginate: true,
  areas: [
    {
      areaId: 0,
      networks: ['10.0.0.0/24', '172.16.0.0/24'],
    },
    {
      areaId: 1,
      networks: ['172.20.0.0/24'],
    },
  ],
};

/**
 * Mock BGP configuration
 */
export const mockBGPConfig = {
  asNumber: 65001,
  routerId: '1.1.1.1',
  neighbors: [
    {
      ip: '172.16.0.2',
      remoteAs: 65002,
      description: 'ISP-1',
      password: 'secret123',
      timers: {
        keepalive: 60,
        hold: 180,
      },
    },
    {
      ip: '172.16.0.3',
      remoteAs: 65003,
      description: 'ISP-2',
    },
  ],
  networks: ['10.0.0.0/24', '172.16.0.0/24'],
};

/**
 * Mock EIGRP configuration
 */
export const mockEIGRPConfig = {
  asNumber: 100,
  routerId: '1.1.1.1',
  networks: ['10.0.0.0', '172.16.0.0', '172.20.0.0'],
};

/**
 * Mock firewall rules
 */
export const mockFirewallRules: FirewallRule[] = [
  {
    ruleId: 10,
    action: 'permit',
    source: '10.0.0.0/24',
    destination: 'any',
    protocol: 'tcp',
    port: 22,
    hitCount: 145,
  },
  {
    ruleId: 20,
    action: 'permit',
    source: '10.0.0.0/24',
    destination: 'any',
    protocol: 'tcp',
    port: 443,
    hitCount: 892,
  },
  {
    ruleId: 30,
    action: 'permit',
    source: '10.0.0.0/24',
    destination: 'any',
    protocol: 'tcp',
    port: 80,
    hitCount: 2341,
  },
  {
    ruleId: 40,
    action: 'deny',
    source: 'any',
    destination: 'any',
    protocol: 'tcp',
    port: 23,
    hitCount: 12,
  },
  {
    ruleId: 50,
    action: 'permit',
    source: '192.168.1.0/24',
    destination: '10.0.0.0/24',
    protocol: 'icmp',
    hitCount: 67,
  },
  {
    ruleId: 100,
    action: 'deny',
    source: 'any',
    destination: 'any',
    protocol: 'ip',
    hitCount: 3456,
  },
];

/**
 * Get mock interface by name
 */
export function getMockInterface(name: string): InterfaceConfig | undefined {
  return mockInterfaces.find((iface) => iface.name === name);
}

/**
 * Update mock interface
 */
export function updateMockInterface(name: string, updates: Partial<InterfaceConfig>): InterfaceConfig | null {
  const index = mockInterfaces.findIndex((iface) => iface.name === name);
  if (index === -1) return null;

  mockInterfaces[index] = { ...mockInterfaces[index], ...updates };
  return mockInterfaces[index];
}

/**
 * Get mock routes by protocol
 */
export function getMockRoutesByProtocol(protocol: string): Route[] {
  return mockRoutes.filter((route) => route.protocol === protocol);
}

/**
 * Get mock route by destination
 */
export function getMockRouteByDestination(destination: string): Route | undefined {
  return mockRoutes.find((route) => route.destination === destination);
}

/**
 * Add mock static route
 */
export function addMockStaticRoute(route: Omit<Route, 'protocol'>): Route {
  const newRoute: Route = { ...route, protocol: 'static' };
  mockRoutes.push(newRoute);
  return newRoute;
}

/**
 * Delete mock route
 */
export function deleteMockRoute(destination: string, protocol: string): boolean {
  const index = mockRoutes.findIndex(
    (route) => route.destination === destination && route.protocol === protocol
  );
  if (index === -1) return false;

  mockRoutes.splice(index, 1);
  return true;
}

/**
 * Get next available firewall rule ID
 */
export function getNextFirewallRuleId(): number {
  const maxId = Math.max(...mockFirewallRules.map((rule) => rule.ruleId));
  return maxId + 10;
}

/**
 * Add mock firewall rule
 */
export function addMockFirewallRule(rule: Omit<FirewallRule, 'ruleId' | 'hitCount'>): FirewallRule {
  const newRule: FirewallRule = {
    ...rule,
    ruleId: getNextFirewallRuleId(),
    hitCount: 0,
  };
  // Insert before the final deny all rule
  const lastIndex = mockFirewallRules.length - 1;
  mockFirewallRules.splice(lastIndex, 0, newRule);
  return newRule;
}

/**
 * Delete mock firewall rule
 */
export function deleteMockFirewallRule(ruleId: number): boolean {
  const index = mockFirewallRules.findIndex((rule) => rule.ruleId === ruleId);
  if (index === -1) return false;

  mockFirewallRules.splice(index, 1);
  return true;
}
