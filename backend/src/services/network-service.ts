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
  ConfigureRouteResponse,
  ConfigureInterfaceResponse,
  DeleteRouteResponse,
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
   * Get connected routes only
   */
  async getRoutes(): Promise<{ routes: Route[] }> {
    if (this.useMock) {
      // Filter mock routes for connected only
      return {
        routes: mockData.mockRoutes.filter(r => r.protocol === 'connected')
      };
    }

    const response = await this.getGNMIClient().getRouting();
    if (response.success && response.data) {
      const allRoutes = this.parseGnmiRouteData(response.data);
      // Filter for connected routes only
      return {
        routes: allRoutes.filter(route => route.protocol === 'connected')
      };
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
      console.log('[NetworkService] parseGnmiRouteData called, data type:', Array.isArray(data) ? 'array' : typeof data);

      // Handle gNMI get response format with updates array
      if (Array.isArray(data) && data.length > 0 && data[0]?.updates) {
        console.log('[NetworkService] Handling gNMI get response with updates');

        for (const item of data) {
          if (!item?.updates) continue;

          for (const update of item.updates) {
            const values = update.values;
            if (!values) continue;

            // The route data is under the long path key
            // Try multiple possible key formats
            let routeTableData = null;
            for (const key of Object.keys(values)) {
              if (key.includes('ipv4-unicast') && values[key]?.route) {
                routeTableData = values[key];
                break;
              }
            }

            if (!routeTableData) {
              console.warn('[NetworkService] Could not find route table data in values, keys:', Object.keys(values));
              continue;
            }

            const routeArray = routeTableData.route;
            if (!Array.isArray(routeArray)) {
              continue;
            }

            console.log('[NetworkService] Found', routeArray.length, 'routes');

            for (const routeDataEntry of routeArray) {
              const route = this.parseSingleGnmiRoute(routeDataEntry);
              if (route) {
                routes.push(route);
              }
            }
          }
        }
        return routes;
      }

      // Fallback: Try to handle other response structures
      console.warn('[NetworkService] Unknown gNMI response structure for routes');
    } catch (error) {
      console.error('[NetworkService] Error parsing gNMI route data:', error);
    }

    return routes;
  }

  /**
   * Parse a single gNMI route entry
   */
  private parseSingleGnmiRoute(routeDataEntry: any): Route | null {
    if (!routeDataEntry) return null;

    // Get destination prefix
    const destination = routeDataEntry['ipv4-prefix'] ||
                       routeDataEntry.prefix ||
                       routeDataEntry.destination ||
                       routeDataEntry['dest-prefix'] ||
                       '0.0.0.0/0';

    // Next hop - not directly available in connected routes, empty string
    const nextHop = '';

    // Get outgoing interface from next-hop-group if available
    let interfaceName = '';
    if (routeDataEntry['next-hop-group']) {
      // For connected routes, interface info might be in next-hop-group
      // We'll leave it empty for now as connected routes don't show it directly
    }

    // Determine protocol from SR Linux route-type attribute
    let protocol = 'unknown';
    const routeType = routeDataEntry['route-type'] || '';

    if (routeType.includes('local') || routeType === 'srl_nokia-common:local') {
      protocol = 'connected';
    } else if (routeType.includes('static')) {
      protocol = 'static';
    } else if (routeType.includes('bgp')) {
      protocol = 'bgp';
    } else if (routeType.includes('ospf')) {
      protocol = 'ospf';
    }

    return {
      destination,
      nextHop,
      interface: interfaceName,
      protocol,
      metric: routeDataEntry.metric || 0,
      adminDistance: 0,
    };
  }

  /**
   * Configure connected routing (bind interfaces to network-instance)
   */
  async configureRoute(request: ConfigureRouteRequest): Promise<ConfigureRouteResponse> {
    const { interfaces } = request;

    if (this.useMock) {
      // In mock mode, just return success
      return {
        message: `Connected routing configured successfully`,
        interfaces,
      };
    }

    const client = this.getGNMIClient();

    // First, unbind all existing interfaces
    await client.unbindAllInterfacesFromNetworkInstance('default');

    // Then bind the new interfaces
    const errors: string[] = [];
    for (const iface of interfaces) {
      const result = await client.bindInterfaceToNetworkInstance(iface, 'default');
      if (!result.success) {
        errors.push(`Failed to bind ${iface}: ${result.error}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Some interfaces failed to bind: ${errors.join(', ')}`);
    }

    return {
      message: `Connected routing configured successfully via gNMI`,
      interfaces,
    };
  }

  /**
   * Clear all routing (unbind all interfaces from network-instance)
   */
  async clearAllRoutes(): Promise<DeleteRouteResponse> {
    if (this.useMock) {
      return { message: 'All routes cleared successfully' };
    }

    const response = await this.getGNMIClient().unbindAllInterfacesFromNetworkInstance('default');

    if (!response.success) {
      throw new Error(response.error || 'Failed to clear routes');
    }

    return { message: 'All routes cleared successfully via gNMI' };
  }
}

// Singleton instance
export const networkService = new NetworkService();
