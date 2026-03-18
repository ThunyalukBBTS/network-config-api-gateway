/**
 * Mock data for development and testing
 * Used when MOCK_MODE is enabled
 */

import type { InterfaceConfig, Route, FirewallRule } from '../types/index.js';

/**
 * Mock Cisco NETCONF capabilities
 * Based on Cisco IOS XE 16.9.3 capabilities for ISR4321
 */
export const mockCiscoCapabilities = [
  'urn:ietf:params:xml:ns:netconf:base:1.0',
  'urn:ietf:params:xml:ns:netconf:base:1.1',
  'urn:ietf:params:netconf:capability:writable-running:1.0',
  'urn:ietf:params:netconf:capability:candidate:1.0',
  'urn:ietf:params:netconf:capability:confirmed-commit:1.0',
  'urn:ietf:params:netconf:capability:rollback-on-error:1.0',
  'urn:ietf:params:netconf:capability:startup:1.0',
  'urn:ietf:params:netconf:capability:validate:1.0',
  'urn:ietf:params:netconf:capability:xpath:1.0',
  'http://cisco.com/ns/yang/Cisco-IOS-XE-native',
  'http://cisco.com/ns/yang/Cisco-IOS-XE-interfaces-oper',
  'http://cisco.com/ns/yang/Cisco-IOS-XE-ip',
  'http://cisco.com/ns/yang/Cisco-IOS-XE-ospf',
  'http://cisco.com/ns/yang/Cisco-IOS-XE-bgp',
  'http://cisco.com/ns/yang/Cisco-IOS-XE-eigrp',
  'http://cisco.com/ns/yang/Cisco-IOS-XE-acl',
  'http://cisco.com/ns/yang/Cisco-IOS-XE-ip-routing-oper',
];

/**
 * Mock interface configurations
 * Based on Cisco ISR4321 with IOS XE 16.9.3
 */
export const mockInterfaces: InterfaceConfig[] = [
  {
    name: 'GigabitEthernet0',
    ip: '192.168.1.1/24',
    status: 'up',
    description: 'Management Interface',
    enabled: true,
    mtu: 1500,
  },
  {
    name: 'GigabitEthernet0/0/0',
    ip: '200.100.10.1/24',
    status: 'up',
    description: 'WAN Interface - ISP Connection',
    enabled: true,
    mtu: 1500,
  },
  {
    name: 'GigabitEthernet0/0/1',
    ip: 'unassigned',
    status: 'down',
    description: 'Reserved WAN',
    enabled: false,
    mtu: 1500,
  },
  {
    name: 'Serial0/1/0',
    ip: 'unassigned',
    status: 'down',
    description: 'WAN Serial Interface',
    enabled: false,
    mtu: 1500,
  },
  {
    name: 'Serial0/1/1',
    ip: 'unassigned',
    status: 'admin-down',
    description: 'Reserved Serial',
    enabled: false,
    mtu: 1500,
  },
  {
    name: 'GigabitEthernet0/2/0',
    ip: '192.168.100.1/24',
    status: 'up',
    description: 'LAN Interface - Internal Network',
    enabled: true,
    mtu: 1500,
  },
  {
    name: 'GigabitEthernet0/2/1',
    ip: '192.168.200.1/24',
    status: 'up',
    description: 'LAN Interface - Guest Network',
    enabled: true,
    mtu: 1500,
  },
  {
    name: 'GigabitEthernet0/2/2',
    ip: 'unassigned',
    status: 'down',
    description: 'Reserved LAN',
    enabled: false,
    mtu: 1500,
  },
  {
    name: 'GigabitEthernet0/2/3',
    ip: 'unassigned',
    status: 'admin-down',
    description: 'Reserved LAN',
    enabled: false,
    mtu: 1500,
  },
  {
    name: 'Vlan1',
    ip: '192.168.1.1/24',
    status: 'up',
    description: 'Default VLAN',
    enabled: true,
    mtu: 1500,
  },
];

/**
 * Mock routing table
 */
export const mockRoutes: Route[] = [
  {
    destination: '0.0.0.0/0',
    nextHop: '200.100.10.254',
    interface: 'GigabitEthernet0/0/0',
    protocol: 'static',
    metric: 0,
    adminDistance: 1,
  },
  {
    destination: '192.168.1.0/24',
    nextHop: '',
    interface: 'GigabitEthernet0',
    protocol: 'connected',
    metric: 0,
    adminDistance: 0,
  },
  {
    destination: '192.168.100.0/24',
    nextHop: '',
    interface: 'GigabitEthernet0/2/0',
    protocol: 'connected',
    metric: 0,
    adminDistance: 0,
  },
  {
    destination: '192.168.200.0/24',
    nextHop: '',
    interface: 'GigabitEthernet0/2/1',
    protocol: 'connected',
    metric: 0,
    adminDistance: 0,
  },
  {
    destination: '200.100.10.0/24',
    nextHop: '',
    interface: 'GigabitEthernet0/0/0',
    protocol: 'connected',
    metric: 0,
    adminDistance: 0,
  },
  {
    destination: '172.16.0.0/16',
    nextHop: '192.168.100.2',
    interface: 'GigabitEthernet0/2/0',
    protocol: 'ospf',
    metric: 10,
    adminDistance: 110,
  },
  {
    destination: '10.10.0.0/16',
    nextHop: '200.100.10.2',
    interface: 'GigabitEthernet0/0/0',
    protocol: 'bgp',
    metric: 0,
    adminDistance: 20,
  },
  {
    destination: '172.20.0.0/16',
    nextHop: '192.168.100.100',
    interface: 'GigabitEthernet0/2/0',
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
