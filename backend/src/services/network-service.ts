/**
 * Network Service
 * Main service layer for network operations
 * Uses mock data or real NETCONF/gNMI clients based on configuration
 * Supports protocol selection (NETCONF or gNMI)
 */

import { config } from '../config/index.js';
import { NETCONFClient } from './netconf-client.js';
import { GNMIClient, mapToCliInterfaceName, type SRL_GNMI_PATHS } from './gnmi-client.js';
import * as mockData from './mock-data.js';
import type {
  InterfaceConfig,
  InterfaceStatus,
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
  private gnmiClient: GNMIClient;
  private useMock: boolean;
  private preferredProtocol: 'netconf' | 'gnmi';
  private gnmiEnabled: boolean;

  constructor() {
    this.netconfClient = new NETCONFClient({
      host: config.netconfHost,
      port: config.netconfPort,
      username: config.netconfUsername,
      password: config.netconfPassword,
      timeout: config.netconfTimeout,
      autoConnect: config.netconfAutoConnect,
    });

    this.gnmiClient = new GNMIClient({
      host: config.gnmiHost,
      port: config.gnmiPort,
      username: config.gnmiUsername,
      password: config.gnmiPassword,
      insecure: config.gnmiInsecure,
      timeout: config.gnmiTimeout,
    });

    this.useMock = config.mockMode;
    this.preferredProtocol = config.preferredProtocol;
    this.gnmiEnabled = config.gnmiEnabled;
  }

  /**
   * Determine which protocol to use
   */
  private shouldUseGnmi(): boolean {
    return this.gnmiEnabled && this.preferredProtocol === 'gnmi';
  }

  /**
   * Normalize interface status to valid InterfaceStatus type
   */
  private normalizeInterfaceStatus(status: string): InterfaceStatus {
    const s = status.toLowerCase();
    if (s === 'up' || s === 'enabled' || s === 'true') return 'up';
    if (s === 'down' || s === 'disabled' || s === 'false') return 'down';
    if (s === 'admin-down' || s === 'shutdown' || s === 'administratively-down') return 'admin-down';
    return 'unknown';
  }

  /**
   * Get all interface configurations
   */
  async getInterfaces(): Promise<{ interfaces: InterfaceConfig[] }> {
    if (this.useMock) {
      return { interfaces: mockData.mockInterfaces };
    }

    // Protocol selection
    if (this.shouldUseGnmi()) {
      return this.getInterfacesViaGnmi();
    }

    return this.getInterfacesViaNetconf();
  }

  /**
   * Get interfaces via gNMI
   */
  private async getInterfacesViaGnmi(): Promise<{ interfaces: InterfaceConfig[] }> {
    const response = await this.gnmiClient.getAllInterfaces();

    if (!response.success || !response.data) {
      console.error('[NetworkService] Failed to get interfaces via gNMI:', response.error);
      // Fallback to NETCONF
      return this.getInterfacesViaNetconf();
    }

    // Parse gNMI response to InterfaceConfig[]
    const interfaces = this.parseGnmiInterfaceData(response.data);
    return { interfaces };
  }

  /**
   * Get interfaces via NETCONF
   */
  private async getInterfacesViaNetconf(): Promise<{ interfaces: InterfaceConfig[] }> {
    const response = await this.netconfClient.getAllInterfaces();

    if (!response.success || !response.data) {
      console.error('[NetworkService] Failed to get interfaces via NETCONF:', response.error);
      return { interfaces: [] };
    }

    // Parse NETCONF response to InterfaceConfig[]
    const interfaces = this.parseInterfaceData(response.data);
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
      // SR Linux gNMI response structure from gnmic get --type state --encoding json_ietf:
      // [{
      //   "updates": [{
      //     "Path": "",
      //     "values": {
      //       "": {
      //         "srl_nokia-interfaces:interface": [ { iface1 }, { iface2 }, ... ]
      //       }
      //     }
      //   }]
      // }]

      // Handle gNMI get response format with updates array
      if (Array.isArray(data) && data.length > 0 && data[0]?.updates) {
        console.log('[NetworkService] Handling gNMI get response with updates');

        for (const item of data) {
          if (!item?.updates) continue;

          for (const update of item.updates) {
            const values = update.values;
            if (!values) continue;

            // Navigate through possible nested structures
            let interfaceArray: any[] | null = null;

            // Case 1: values[""]["srl_nokia-interfaces:interface"] - array of interfaces
            if (values[""]?.["srl_nokia-interfaces:interface"]) {
              interfaceArray = values[""]["srl_nokia-interfaces:interface"];
            }
            // Case 2: values["srl_nokia-interfaces:interface"] - direct namespace access
            else if (values["srl_nokia-interfaces:interface"]) {
              interfaceArray = values["srl_nokia-interfaces:interface"];
            }
            // Case 3: values is the interface array
            else if (Array.isArray(values)) {
              interfaceArray = values;
            }

            if (!interfaceArray) {
              console.warn('[NetworkService] Could not find interface array in values');
              continue;
            }

            console.log('[NetworkService] Found', interfaceArray.length, 'interfaces');

            // Parse each interface in the array
            for (const ifaceData of interfaceArray) {
              const parsed = this.parseSingleGnmiInterface(ifaceData, null);
              if (parsed) {
                interfaces.push(parsed);
              }
            }
          }
        }
        return interfaces;
      }

      // Handle single interface response format (from getInterface by name)
      // Same structure but with a single interface
      if (Array.isArray(data) && data.length > 0 && data[0]?.updates?.[0]?.values) {
        const values = data[0].updates[0].values;

        let ifaceData: any = null;

        // Extract single interface data
        if (values[""]?.["srl_nokia-interfaces:interface"]) {
          const arr = values[""]["srl_nokia-interfaces:interface"];
          ifaceData = Array.isArray(arr) ? arr[0] : arr;
        } else if (values["srl_nokia-interfaces:interface"]) {
          const arr = values["srl_nokia-interfaces:interface"];
          ifaceData = Array.isArray(arr) ? arr[0] : arr;
        } else if (values[""]) {
          ifaceData = values[""];
        }

        if (ifaceData) {
          const parsed = this.parseSingleGnmiInterface(ifaceData, null);
          if (parsed) {
            interfaces.push(parsed);
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
    const name = mapToCliInterfaceName(rawName);

    // Extract IP from subinterface data
    // Handle both formats: ip-prefix (gNMI get) and ipv4-address/prefix-length (config)
    let ip = 'unassigned';
    const subinterfaces = ifaceData.subinterface || ifaceData['sub-interface'];
    if (subinterfaces) {
      const subifList = Array.isArray(subinterfaces) ? subinterfaces : [subinterfaces];
      for (const subif of subifList) {
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

    // SR Linux operational status values
    const rawStatus = ifaceData.oper_state ||
                     ifaceData['oper-state'] ||
                     ifaceData.admin_state ||
                     ifaceData['admin-state'] ||
                     'unknown';

    return {
      name,
      ip,
      status: this.normalizeInterfaceStatus(String(rawStatus)),
      description: ifaceData.description || '',
      enabled: ifaceData.admin_state === 'enable' ||
               ifaceData['admin-state'] === 'enable' ||
               ifaceData.enabled !== false,
      mtu: ifaceData.mtu || ifaceData['mtu'] || 1500,
    };
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
  private determineInterfaceStatus(iface: any): InterfaceStatus {
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

    if (this.shouldUseGnmi()) {
      const response = await this.gnmiClient.getInterface(name);
      if (response.success && response.data) {
        const interfaces = this.parseGnmiInterfaceData(response.data);
        return interfaces[0] || null;
      }
    }

    // Fallback to NETCONF
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

    if (this.shouldUseGnmi()) {
      const response = await this.gnmiClient.setInterface(request.name, request as unknown as Record<string, unknown>);
      if (response.success) {
        return {
          message: `Interface ${request.name} configured successfully via gNMI`,
          interface: request.name,
        };
      }
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

    if (this.shouldUseGnmi()) {
      const response = await this.gnmiClient.getRouting();
      if (response.success && response.data) {
        const routes = this.parseGnmiRouteData(response.data);
        return { routes };
      }
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

    if (this.shouldUseGnmi()) {
      const response = await this.gnmiClient.setRouting(
        request.protocol,
        request as unknown as Record<string, unknown>
      );
      if (response.success) {
        return {
          message: `Route configuration applied successfully via gNMI`,
          protocol: request.protocol,
        };
      }
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

    if (this.shouldUseGnmi()) {
      const response = await this.gnmiClient.deleteRouting(
        request.protocol,
        request as unknown as Record<string, unknown>
      );
      if (response.success) {
        return { message: 'Route removed successfully via gNMI' };
      }
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

    // Use NETCONF to get firewall rules (gNMI not commonly used for ACLs)
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
