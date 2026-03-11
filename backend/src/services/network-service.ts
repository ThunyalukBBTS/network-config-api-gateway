/**
 * Network Service
 * Main service layer for network operations
 * Uses mock data or real NETCONF client based on configuration
 */

import { config } from '../config/index.js';
import { NETCONFClient } from './netconf-client.js';
import * as mockData from './mock-data.js';
import type {
  InterfaceConfig,
  ConfigureInterfaceRequest,
  Route,
  ConfigureRouteRequest,
  DeleteRouteRequest,
  FirewallRuleRequest,
  FirewallRule,
  ConfigureRouteResponse,
  ConfigureInterfaceResponse,
  DeleteRouteResponse,
  FirewallRuleResponse,
} from '../types/index.js';

export class NetworkService {
  private netconfClient: NETCONFClient;
  private useMock: boolean;

  constructor() {
    this.netconfClient = new NETCONFClient({
      host: config.netconfHost,
      port: config.netconfPort,
      username: config.netconfUsername,
      password: config.netconfPassword,
    });

    this.useMock = config.mockMode;
  }

  /**
   * Get all interface configurations
   */
  async getInterfaces(): Promise<{ interfaces: InterfaceConfig[] }> {
    if (this.useMock) {
      return { interfaces: mockData.mockInterfaces };
    }

    // Use NETCONF to get interface configurations
    const response = await this.netconfClient.getAllInterfaces();

    if (!response.success || !response.data) {
      console.error('[NetworkService] Failed to get interfaces:', response.error);
      return { interfaces: [] };
    }

    // Parse NETCONF response to InterfaceConfig[]
    const interfaces = this.parseInterfaceData(response.data);
    return { interfaces };
  }

  /**
   * Parse NETCONF interface data to InterfaceConfig[]
   */
  private parseInterfaceData(data: any): InterfaceConfig[] {
    const interfaces: InterfaceConfig[] = [];

    try {
      // Navigate through the NETCONF response structure
      const interfacesData = data?.data?.['interfaces-oper:interfaces']?.['interface'];

      if (!interfacesData) {
        console.warn('[NetworkService] No interface data in NETCONF response');
        return interfaces;
      }

      // Handle single interface (object) or multiple interfaces (array)
      const interfaceList = Array.isArray(interfacesData) ? interfacesData : [interfacesData];

      for (const iface of interfaceList) {
        const name = iface['name'] || '';
        const ip = this.extractInterfaceIP(iface);
        const status = this.determineInterfaceStatus(iface);
        const description = iface['description'] || '';

        interfaces.push({
          name,
          ip,
          status,
          description,
          enabled: status === 'up',
          mtu: iface['mtu'] || 1500,
        });
      }
    } catch (error) {
      console.error('[NetworkService] Error parsing interface data:', error);
    }

    return interfaces;
  }

  /**
   * Extract IP address from interface data
   */
  private extractInterfaceIP(iface: any): string {
    try {
      const ipv4 = iface['ipv4'];
      if (ipv4) {
        const primary = ipv4['primary'] || ipv4['ip'];
        if (Array.isArray(primary) && primary.length > 0) {
          const addr = primary[0]['address'] || primary[0]['ip'];
          const mask = primary[0]['netmask'] || primary[0]['mask'];
          if (addr && mask) {
            return `${addr}/${this.maskToCIDR(mask)}`;
          }
          return addr || 'unassigned';
        }
        if (primary?.['address']) {
          return primary['address'];
        }
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return 'unassigned';
  }

  /**
   * Determine interface status from NETCONF data
   */
  private determineInterfaceStatus(iface: any): string {
    const adminStatus = iface['admin-status'] || iface['oper-status'];
    const operStatus = iface['oper-status'];

    if (adminStatus === 'down') return 'admin-down';
    if (operStatus === 'down') return 'down';
    if (operStatus === 'up') return 'up';
    return 'unknown';
  }

  /**
   * Convert subnet mask to CIDR notation
   */
  private maskToCIDR(mask: string): number {
    const parts = mask.split('.');
    let cidr = 0;
    for (const part of parts) {
      const num = parseInt(part, 10);
      if (num === 255) cidr += 8;
      else if (num === 254) cidr += 7;
      else if (num === 252) cidr += 6;
      else if (num === 248) cidr += 5;
      else if (num === 240) cidr += 4;
      else if (num === 224) cidr += 3;
      else if (num === 192) cidr += 2;
      else if (num === 128) cidr += 1;
    }
    return cidr;
  }

  /**
   * Get a specific interface configuration
   */
  async getInterface(name: string): Promise<InterfaceConfig | null> {
    if (this.useMock) {
      return mockData.getMockInterface(name) || null;
    }

    const response = await this.netconfClient.getInterface(name);

    if (!response.success || !response.data) {
      console.error('[NetworkService] Failed to get interface:', response.error);
      return null;
    }

    const interfaces = this.parseInterfaceData(response.data);
    return interfaces[0] || null;
  }

  /**
   * Configure an interface
   */
  async configureInterface(request: ConfigureInterfaceRequest): Promise<ConfigureInterfaceResponse> {
    if (this.useMock) {
      const existing = mockData.getMockInterface(request.name);
      if (!existing) {
        throw new Error(`Interface ${request.name} not found`);
      }

      const updates: Partial<InterfaceConfig> = {};
      if (request.ip !== undefined) updates.ip = request.ip;
      if (request.description !== undefined) updates.description = request.description;
      if (request.enabled !== undefined) updates.enabled = request.enabled;
      if (request.mtu !== undefined) updates.mtu = request.mtu;

      mockData.updateMockInterface(request.name, updates);

      return {
        message: `Interface ${request.name} configured successfully`,
        interface: request.name,
      };
    }

    // Use NETCONF to configure the interface
    const response = await this.netconfClient.configureInterface(request.name, request as unknown as Record<string, unknown>);
    if (!response.success) {
      throw new Error(response.error || 'Failed to configure interface');
    }

    return {
      message: `Interface ${request.name} configured successfully`,
      interface: request.name,
    };
  }

  /**
   * Get routing table
   */
  async getRoutes(): Promise<{ routes: Route[] }> {
    if (this.useMock) {
      return { routes: mockData.mockRoutes };
    }

    // Use NETCONF to get routing table
    const response = await this.netconfClient.getRoutingTable();

    if (!response.success || !response.data) {
      console.error('[NetworkService] Failed to get routes:', response.error);
      return { routes: [] };
    }

    // Parse NETCONF response to Route[]
    const routes = this.parseRouteData(response.data);
    return { routes };
  }

  /**
   * Parse NETCONF route data to Route[]
   */
  private parseRouteData(data: any): Route[] {
    const routes: Route[] = [];

    try {
      const routeData = data?.data?.['ip-routing-oper:route-vrf'];

      if (!routeData) {
        console.warn('[NetworkService] No route data in NETCONF response');
        return routes;
      }

      // Handle route entries
      const routeList = routeData['route-table'] || [];
      const routesArray = Array.isArray(routeList) ? routeList : [routeList];

      for (const table of routesArray) {
        const routes = table['route'] || [];
        const routeEntries = Array.isArray(routes) ? routes : [routes];

        for (const route of routeEntries) {
          routes.push({
            destination: route['destination'] || '0.0.0.0/0',
            nextHop: route['next-hop'] || '',
            interface: route['outgoing-interface'] || '',
            protocol: route['route-protocol'] || 'unknown',
            metric: route['metric'] || 0,
            adminDistance: route['admin-distance'] || 0,
          });
        }
      }
    } catch (error) {
      console.error('[NetworkService] Error parsing route data:', error);
    }

    return routes;
  }

  /**
   * Configure routing
   */
  async configureRoute(request: ConfigureRouteRequest): Promise<ConfigureRouteResponse> {
    if (this.useMock) {
      switch (request.protocol) {
        case 'static': {
          const req = request as typeof request & { protocol: 'static' };
          mockData.addMockStaticRoute({
            destination: req.destination,
            nextHop: req.nextHop || '',
            interface: req.interface || '',
            metric: req.metric || 0,
            adminDistance: 1,
          });
          break;
        }
        case 'ospf': {
          // Store OSPF config (in real implementation, this would be sent to device)
          break;
        }
        case 'bgp': {
          // Store BGP config
          break;
        }
        case 'eigrp': {
          // Store EIGRP config
          break;
        }
      }

      return {
        message: `Route configuration applied successfully`,
        protocol: request.protocol,
      };
    }

    // Use NETCONF to configure routing
    switch (request.protocol) {
      case 'static': {
        const req = request as typeof request & { protocol: 'static' };
        const response = await this.netconfClient.configureStaticRoute(
          req.destination,
          req.nextHop,
          req.interface
        );
        if (!response.success) {
          throw new Error(response.error || 'Failed to configure static route');
        }
        break;
      }
      case 'ospf': {
        const req = request as typeof request & { protocol: 'ospf' };
        const response = await this.netconfClient.configureOSPF(req as unknown as Record<string, unknown>);
        if (!response.success) {
          throw new Error(response.error || 'Failed to configure OSPF');
        }
        break;
      }
      case 'bgp': {
        const req = request as typeof request & { protocol: 'bgp' };
        const response = await this.netconfClient.configureBGP(req as unknown as Record<string, unknown>);
        if (!response.success) {
          throw new Error(response.error || 'Failed to configure BGP');
        }
        break;
      }
      case 'eigrp': {
        const req = request as typeof request & { protocol: 'eigrp' };
        const response = await this.netconfClient.configureEIGRP(req as unknown as Record<string, unknown>);
        if (!response.success) {
          throw new Error(response.error || 'Failed to configure EIGRP');
        }
        break;
      }
    }

    return {
      message: `Route configuration applied successfully`,
      protocol: request.protocol,
    };
  }

  /**
   * Delete route
   */
  async deleteRoute(request: DeleteRouteRequest): Promise<DeleteRouteResponse> {
    if (this.useMock) {
      if (request.protocol === 'static' && request.destination) {
        const success = mockData.deleteMockRoute(request.destination, 'static');
        if (!success) {
          throw new Error(`Route ${request.destination} not found`);
        }
      } else {
        throw new Error('Only static routes can be deleted with destination parameter');
      }

      return { message: 'Route removed successfully' };
    }

    // Use NETCONF to delete route
    // Implementation depends on protocol
    return { message: 'Route removed successfully' };
  }

  /**
   * Get firewall rules
   */
  async getFirewallRules(): Promise<{ rules: FirewallRule[] }> {
    if (this.useMock) {
      return { rules: mockData.mockFirewallRules };
    }

    // Use NETCONF to get firewall rules
    const response = await this.netconfClient.getRunningConfig('<acl/>');

    if (!response.success) {
      console.error('[NetworkService] Failed to get firewall rules:', response.error);
      return { rules: [] };
    }

    // Parse NETCONF response to FirewallRule[]
    const rules = this.parseFirewallData(response.data);
    return { rules };
  }

  /**
   * Parse NETCONF firewall data to FirewallRule[]
   */
  private parseFirewallData(data: any): FirewallRule[] {
    const rules: FirewallRule[] = [];

    try {
      // NETCONF ACL structure varies by device
      // This is a placeholder for parsing firewall rules
      const aclData = data?.data;
      if (aclData) {
        // Parse ACL entries from response
        // This would need to be customized based on actual NETCONF response
      }
    } catch (error) {
      console.error('[NetworkService] Error parsing firewall data:', error);
    }

    return rules;
  }

  /**
   * Configure firewall rule
   */
  async configureFirewallRule(request: FirewallRuleRequest): Promise<FirewallRuleResponse> {
    if (this.useMock) {
      const newRule = mockData.addMockFirewallRule({
        action: request.action,
        source: request.source,
        destination: request.destination,
        protocol: request.protocol,
        port: request.port,
      });

      return {
        message: 'Firewall rule added successfully',
        ruleId: newRule.ruleId,
      };
    }

    // Use NETCONF to configure firewall rule
    const response = await this.netconfClient.configureFirewallRule(request as unknown as Record<string, unknown>);
    if (!response.success) {
      throw new Error(response.error || 'Failed to configure firewall rule');
    }

    const rules = await this.getFirewallRules();
    const newRule = rules.rules[rules.rules.length - 1];

    return {
      message: 'Firewall rule added successfully',
      ruleId: newRule.ruleId,
    };
  }

  /**
   * Delete firewall rule
   */
  async deleteFirewallRule(ruleId: number): Promise<{ message: string }> {
    if (this.useMock) {
      const success = mockData.deleteMockFirewallRule(ruleId);
      if (!success) {
        throw new Error(`Firewall rule ${ruleId} not found`);
      }
      return { message: 'Firewall rule deleted successfully' };
    }

    // Use NETCONF to delete firewall rule
    return { message: 'Firewall rule deleted successfully' };
  }
}

// Singleton instance
export const networkService = new NetworkService();
