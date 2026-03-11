/**
 * Mock data for development and testing
 * Used when MOCK_MODE is enabled
 */

import type { InterfaceConfig, Route, FirewallRule } from '../types/index.js';

/**
 * Mock interface configurations
 */
export const mockInterfaces: InterfaceConfig[] = [
  {
    name: 'GigabitEthernet1',
    ip: '192.168.1.1/24',
    status: 'up',
    description: 'WAN Interface - Primary ISP',
    enabled: true,
    mtu: 1500,
  },
  {
    name: 'GigabitEthernet2',
    ip: '10.0.0.1/24',
    status: 'up',
    description: 'LAN Interface - Internal Network',
    enabled: true,
    mtu: 1500,
  },
  {
    name: 'GigabitEthernet3',
    ip: '172.16.0.1/24',
    status: 'down',
    description: 'DMZ Interface',
    enabled: false,
    mtu: 1500,
  },
  {
    name: 'GigabitEthernet4',
    ip: '10.10.10.1/24',
    status: 'admin-down',
    description: 'Backup WAN Interface',
    enabled: false,
    mtu: 1500,
  },
  {
    name: 'Loopback0',
    ip: '1.1.1.1/32',
    status: 'up',
    description: 'Router ID Loopback',
    enabled: true,
    mtu: 65536,
  },
];

/**
 * Mock routing table
 */
export const mockRoutes: Route[] = [
  {
    destination: '0.0.0.0/0',
    nextHop: '192.168.1.254',
    interface: 'GigabitEthernet1',
    protocol: 'static',
    metric: 0,
    adminDistance: 1,
  },
  {
    destination: '10.0.0.0/24',
    nextHop: '',
    interface: 'GigabitEthernet2',
    protocol: 'connected',
    metric: 0,
    adminDistance: 0,
  },
  {
    destination: '192.168.1.0/24',
    nextHop: '',
    interface: 'GigabitEthernet1',
    protocol: 'connected',
    metric: 0,
    adminDistance: 0,
  },
  {
    destination: '172.16.0.0/16',
    nextHop: '10.0.0.2',
    interface: 'GigabitEthernet2',
    protocol: 'ospf',
    metric: 10,
    adminDistance: 110,
  },
  {
    destination: '10.10.0.0/16',
    nextHop: '192.168.1.2',
    interface: 'GigabitEthernet1',
    protocol: 'bgp',
    metric: 0,
    adminDistance: 20,
  },
  {
    destination: '192.168.100.0/24',
    nextHop: '10.0.0.100',
    interface: 'GigabitEthernet2',
    protocol: 'eigrp',
    metric: 156160,
    adminDistance: 90,
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
    { network: '192.168.1.0/24', area: 0 },
    { network: '172.16.0.0/24', area: 1 },
  ],
  defaultInformationOriginate: true,
  areas: [
    {
      areaId: 0,
      networks: ['10.0.0.0/24', '192.168.1.0/24'],
    },
    {
      areaId: 1,
      networks: ['172.16.0.0/24'],
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
      ip: '192.168.1.2',
      remoteAs: 65002,
      description: 'ISP-1',
      password: 'secret123',
      timers: {
        keepalive: 60,
        hold: 180,
      },
    },
    {
      ip: '192.168.1.3',
      remoteAs: 65003,
      description: 'ISP-2',
    },
  ],
  networks: ['10.0.0.0/24', '192.168.1.0/24'],
};

/**
 * Mock EIGRP configuration
 */
export const mockEIGRPConfig = {
  asNumber: 100,
  routerId: '1.1.1.1',
  networks: ['10.0.0.0', '192.168.1.0', '172.16.0.0'],
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
