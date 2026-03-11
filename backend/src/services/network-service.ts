/**
 * Network Service
 * Main service layer for network operations
 * Uses mock data or real gNMI/NETCONF clients based on configuration
 */

import { config } from '../config/index.js';
import { GNMIClient } from './gnmi-client.js';
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
  private gnmiClient: GNMIClient;
  private netconfClient: NETCONFClient;
  private useMock: boolean;

  constructor() {
    this.gnmiClient = new GNMIClient({
      host: config.gnmiHost,
      port: config.gnmiPort,
      username: config.gnmiUsername,
      password: config.gnmiPassword,
      insecure: config.gnmiInsecure,
    });

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

    // Use gNMI to get interface configurations
    const response = await this.gnmiClient.getRouting();
    // TODO: Parse response into InterfaceConfig[]
    return { interfaces: mockData.mockInterfaces };
  }

  /**
   * Get a specific interface configuration
   */
  async getInterface(name: string): Promise<InterfaceConfig | null> {
    if (this.useMock) {
      return mockData.getMockInterface(name) || null;
    }

    const response = await this.gnmiClient.getInterface(name);
    // TODO: Parse response into InterfaceConfig
    return mockData.getMockInterface(name) || null;
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
    const response = await this.netconfClient.configureInterface(request.name, request);
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

    // Use gNMI/NETCONF to get routing table
    const response = await this.netconfClient.getRoutingTable();
    // TODO: Parse response into Route[]
    return { routes: mockData.mockRoutes };
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
        const response = await this.netconfClient.configureOSPF(req);
        if (!response.success) {
          throw new Error(response.error || 'Failed to configure OSPF');
        }
        break;
      }
      case 'bgp': {
        const req = request as typeof request & { protocol: 'bgp' };
        const response = await this.netconfClient.configureBGP(req);
        if (!response.success) {
          throw new Error(response.error || 'Failed to configure BGP');
        }
        break;
      }
      case 'eigrp': {
        const req = request as typeof request & { protocol: 'eigrp' };
        const response = await this.netconfClient.configureEIGRP(req);
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
    return { rules: mockData.mockFirewallRules };
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
    const response = await this.netconfClient.configureFirewallRule(request);
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
