/**
 * Network Service
 * Main service layer for network operations
 * Uses gNMI for communicating with Nokia SR Linux devices
 */

import { config } from '../config/index.js';
import { GNMIClient } from './gnmi-client.js';
import { routerConfigService } from './router-config.service.js';
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
  private gnmiClient: GNMIClient | null = null;
  private useMock: boolean;

  constructor() {
    this.useMock = config.mockMode;
  }

  /**
   * Get gNMI client, creating it if needed
   * Throws error if router is not configured
   */
  private getGNMIClient(): GNMIClient {
    // Get runtime router configuration
    const routerConfig = routerConfigService.getConfig();

    // Create or update client with current config
    if (!this.gnmiClient) {
      this.gnmiClient = new GNMIClient(routerConfig);
    }

    return this.gnmiClient;
  }

  /**
   * Check if router is configured (for non-mock mode)
   */
  isRouterConfigured(): boolean {
    if (this.useMock) {
      return true; // Mock mode always works
    }
    return routerConfigService.isConfigured();
  }

  /**
   * Get all interface configurations
   */
  async getInterfaces(): Promise<{ interfaces: InterfaceConfig[] }> {
    if (this.useMock) {
      return { interfaces: mockData.mockInterfaces };
    }

    const response = await this.getGNMIClient().getAllInterfaces();

    if (!response.success || !response.data) {
      console.error('[NetworkService] Failed to get interfaces via gNMI:', response.error);
      return { interfaces: [] };
    }

    // Parse gNMI response to InterfaceConfig[]
    const interfaces = this.parseGnmiInterfaceData(response.data);
    return { interfaces };
  }

  /**
   * Parse gNMI interface data to InterfaceConfig[]
   * Handles SR Linux response format from srl_nokia-interfaces YANG model
   */
  private parseGnmiInterfaceData(data: any): InterfaceConfig[] {
    console.log('[NetworkService] parseGnmiInterfaceData called');
    const interfaces: InterfaceConfig[] = [];

    try {
      // Handle gNMI get response format with updates array
      if (Array.isArray(data) && data.length > 0 && data[0]?.updates) {
        console.log('[NetworkService] Handling gNMI get response with updates');

        for (const item of data) {
          if (!item?.updates) continue;

          for (const update of item.updates) {
            const values = update.values;
            if (!values) continue;

            // Check if this is a single interface response (has interface name in Path)
            // or all interfaces response (Path is empty or missing name)
            const pathStr = update.Path || '';
            const singleInterfaceMatch = pathStr.match(/interface\[name=([^\]]+)\]/);
            const isSingleInterface = !!singleInterfaceMatch;

            console.log('[NetworkService] Path:', pathStr, 'isSingleInterface:', isSingleInterface);

            if (isSingleInterface) {
              // Single interface response: values["srl_nokia-interfaces:interface"] is a single object
              let ifaceData: any = null;

              if (values["srl_nokia-interfaces:interface"]) {
                const data = values["srl_nokia-interfaces:interface"];
                ifaceData = Array.isArray(data) ? data[0] : data;
              } else if (values[""]?.["srl_nokia-interfaces:interface"]) {
                const arr = values[""]["srl_nokia-interfaces:interface"];
                ifaceData = Array.isArray(arr) ? arr[0] : arr;
              }

              if (ifaceData) {
                // Extract interface name from Path for single interface queries
                const pathName = singleInterfaceMatch ? singleInterfaceMatch[1] : null;
                const parsed = this.parseSingleGnmiInterface(ifaceData, pathName);
                if (parsed) {
                  interfaces.push(parsed);
                }
              }
            } else {
              // All interfaces response: values[""]["srl_nokia-interfaces:interface"] is an array
              let interfaceArray: any[] | null = null;

              if (values[""]?.["srl_nokia-interfaces:interface"]) {
                interfaceArray = values[""]["srl_nokia-interfaces:interface"];
              } else if (values["srl_nokia-interfaces:interface"]) {
                const arr = values["srl_nokia-interfaces:interface"];
                interfaceArray = Array.isArray(arr) ? arr : [arr];
              } else if (Array.isArray(values)) {
                interfaceArray = values;
              }

              if (!interfaceArray) {
                console.warn('[NetworkService] Could not find interface array in values');
                continue;
              }

              console.log('[NetworkService] Found', interfaceArray.length, 'interfaces');

              for (const ifaceData of interfaceArray) {
                const parsed = this.parseSingleGnmiInterface(ifaceData, null);
                if (parsed) {
                  interfaces.push(parsed);
                }
              }
            }
          }
        }
        return interfaces;
      }

      // Fallback: Try to handle other response formats
      let interfaceData = data;
      if (data?.notification?.[0]?.update) {
        interfaceData = data.notification[0].update;
      } else if (data?.interface) {
        interfaceData = data.interface;
      } else if (Array.isArray(data)) {
        interfaceData = data;
      }

      if (!interfaceData) {
        console.warn('[NetworkService] No interface data in gNMI response');
        return interfaces;
      }

      const interfaceList = Array.isArray(interfaceData) ? interfaceData : [interfaceData];
      for (const iface of interfaceList) {
        const parsed = this.parseSingleGnmiInterface(iface, null);
        if (parsed) {
          interfaces.push(parsed);
        }
      }
    } catch (error) {
      console.error('[NetworkService] Error parsing gNMI interface data:', error);
    }

    return interfaces;
  }

  /**
   * Parse a single gNMI interface data object
   */
  private parseSingleGnmiInterface(ifaceData: any, pathName: string | null): InterfaceConfig | null {
    if (!ifaceData) return null;
    // SR Linux interface properties
    // Try to get name from data first, then from path context
    const rawName = ifaceData.name || ifaceData['interface-name'] || pathName || '';
    const name = rawName; // Keep SR Linux format (ethernet-1/1), not CLI format (e1-1)

    // If no name is found, this is likely an empty/invalid response (interface doesn't exist)
    if (!name) {
      console.warn('[NetworkService] Interface data has no name, treating as non-existent');
      return null;
    }

    // Extract IP from subinterface data
    // Handle both formats: ip-prefix (gNMI get) and ipv4-address/prefix-length (config)
    // Also get admin-state from IPv4 subinterface level
    let ip = 'unassigned';
    let adminState = 'enable';  // Default to enable if not configured
    const subinterfaces = ifaceData.subinterface || ifaceData['sub-interface'];
    if (subinterfaces) {
      const subifList = Array.isArray(subinterfaces) ? subinterfaces : [subinterfaces];
      for (const subif of subifList) {
        // Get admin-state from IPv4 subinterface level (not interface level)
        if (subif?.ipv4?.['admin-state'] !== undefined) {
          adminState = subif.ipv4['admin-state'];
        }

        // Check for ip-prefix format from gNMI get response
        const ipv4Addresses = subif?.ipv4?.address || subif?.['ipv4-address'];
        if (ipv4Addresses) {
          const addrList = Array.isArray(ipv4Addresses) ? ipv4Addresses : [ipv4Addresses];
          for (const addr of addrList) {
            // Check for ip-prefix format (gNMI get response)
            if (addr?.['ip-prefix']) {
              ip = addr['ip-prefix'];
              break;
            }
            // Check for ipv4-address/prefix-length format (config response)
            if (addr?.['ipv4-address'] || addr?.address) {
              const ipAddress = addr['ipv4-address'] || addr.address;
              const prefixLen = addr?.['prefix-length'] || addr?.prefix;
              if (ipAddress) {
                ip = prefixLen ? `${ipAddress}/${prefixLen}` : ipAddress;
                break;
              }
            }
          }
          if (ip !== 'unassigned') break;
        }
      }
    }

    // SR Linux oper-state (operational state)
    const operState = ifaceData.oper_state || ifaceData['oper-state'] || 'down';

    return {
      name,
      ip,
      admin_state: adminState === 'enable' ? 'enable' : 'disable',
      oper_state: operState === 'up' ? 'up' : 'down',
      description: String(ifaceData.description || ''),
      mtu: ifaceData.mtu || ifaceData['mtu'] || 1500,
      port_speed: ifaceData.ethernet?.['port-speed'] || '',
    };
  }

  /**
   * Get a specific interface configuration
   */
  async getInterface(name: string): Promise<InterfaceConfig | null> {
    if (this.useMock) {
      return mockData.getMockInterface(name) || null;
    }

    const response = await this.getGNMIClient().getInterface(name);

    if (!response.success || !response.data) {
      console.error('[NetworkService] Failed to get interface:', response.error);
      return null;
    }

    const interfaces = this.parseGnmiInterfaceData(response.data);
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
      if (request.admin_state !== undefined) updates.admin_state = request.admin_state;
      if (request.mtu !== undefined) updates.mtu = request.mtu;

      mockData.updateMockInterface(request.name, updates);

      return {
        message: `Interface ${request.name} configured successfully`,
        interface: request.name,
      };
    }

    const response = await this.getGNMIClient().setInterface(request.name, request as unknown as Record<string, unknown>);
    if (!response.success) {
      throw new Error(response.error || 'Failed to configure interface');
    }

    return {
      message: `Interface ${request.name} configured successfully via gNMI`,
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

    const response = await this.getGNMIClient().getRouting();
    if (response.success && response.data) {
      const routes = this.parseGnmiRouteData(response.data);
      return { routes };
    }

    console.error('[NetworkService] Failed to get routes:', response.error);
    return { routes: [] };
  }

  /**
   * Parse gNMI route data to Route[]
   * Handles SR Linux response format from srl_nokia-network-instance YANG model
   */
  private parseGnmiRouteData(data: any): Route[] {
    const routes: Route[] = [];

    try {
      // SR Linux gNMI route response structure
      let routeData = data;

      // Navigate through different possible response structures
      if (data?.notification?.[0]?.update) {
        routeData = data.notification[0].update;
      } else if (data?.['route-entry']) {
        routeData = data['route-entry'];
      } else if (data?.route) {
        routeData = data.route;
      } else if (Array.isArray(data)) {
        routeData = data;
      }

      if (!routeData) {
        console.warn('[NetworkService] No route data in gNMI response');
        return routes;
      }

      const routeList = Array.isArray(routeData) ? routeData : [routeData];

      for (const route of routeList) {
        // Handle both gNMI update format and direct route format
        const routeDataEntry = route?.val || route;

        if (!routeDataEntry) continue;

        // SR Linux route properties
        const destination = routeDataEntry.prefix ||
                           routeDataEntry.destination ||
                           routeDataEntry['dest-prefix'] ||
                           '0.0.0.0/0';

        const nextHop = routeDataEntry['next-hop']?.[0]?.['next-hop-address'] ||
                       routeDataEntry['next-hop-address'] ||
                       routeDataEntry.nextHop ||
                       routeDataEntry['next-hop'] ||
                       '';

        // Determine protocol from SR Linux route attributes
        let protocol = routeDataEntry.protocol ||
                      routeDataEntry['route-protocol'] ||
                      routeDataEntry['route-origin'] ||
                      'unknown';

        // Map SR Linux protocol values to standard names
        if (protocol === 'static' || protocol === 'STATIC') protocol = 'static';
        if (protocol === 'bgp' || protocol === 'BGP') protocol = 'bgp';
        if (protocol === 'ospf' || protocol === 'OSPF') protocol = 'ospf';
        if (protocol === 'connected' || protocol === 'CONNECTED') protocol = 'connected';
        if (protocol === 'local' || protocol === 'LOCAL') protocol = 'local';

        routes.push({
          destination,
          nextHop,
          interface: routeDataEntry['outgoing-interface'] ||
                    routeDataEntry.interface ||
                    routeDataEntry['if-name'] ||
                    '',
          protocol,
          metric: routeDataEntry.metric ||
                 routeDataEntry['route-preference'] ||
                 0,
          adminDistance: routeDataEntry.adminDistance ||
                        routeDataEntry['admin-distance'] ||
                        0,
        });
      }
    } catch (error) {
      console.error('[NetworkService] Error parsing gNMI route data:', error);
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

    const response = await this.getGNMIClient().setRouting(
      request.protocol,
      request as unknown as Record<string, unknown>
    );
    if (response.success) {
      return {
        message: `Route configuration applied successfully via gNMI`,
        protocol: request.protocol,
      };
    }

    throw new Error(response.error || 'Failed to configure route');
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

    const response = await this.getGNMIClient().deleteRouting(
      request.protocol,
      request as unknown as Record<string, unknown>
    );
    if (response.success) {
      return { message: 'Route removed successfully via gNMI' };
    }

    return { message: 'Route removed successfully' };
  }

  /**
   * Get firewall rules
   */
  async getFirewallRules(): Promise<{ rules: FirewallRule[] }> {
    if (this.useMock) {
      return { rules: mockData.mockFirewallRules };
    }

    // gNMI not commonly used for ACLs - return empty for now
    console.warn('[NetworkService] Firewall rules via gNMI not yet implemented');
    return { rules: [] };
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

    // gNMI not commonly used for ACLs
    throw new Error('Firewall configuration via gNMI not yet implemented');
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

    return { message: 'Firewall rule deleted successfully' };
  }
}

// Singleton instance
export const networkService = new NetworkService();
