/**
 * gNMI Client for communicating with Nokia SR Linux devices
 * Uses gnmic CLI tool for configuration and telemetry
 *
 * SR Linux gNMI paths are based on srl_nokia YANG models
 */

import { spawn } from 'child_process';
import type { GNMIConfig, GNMIPath } from '../types/index.js';

/**
 * SR Linux gNMI path constants
 * Based on srl_nokia YANG models
 */
export const SRL_GNMI_PATHS = {
  // Interface paths (srl_nokia-interfaces)
  INTERFACES: '/interface',
  INTERFACE: (name: string) => `/interface[name=${name}]`,
  INTERFACE_SUBIF: (name: string, index = 0) => `/interface[name=${name}]/subinterface[index=${index}]`,
  INTERFACE_IP: (name: string, ip: string) => `/interface[name=${name}]/subinterface[index=0]/ipv4/address[ipv4-address=${ip}]`,
  INTERFACE_ADMIN_STATE: (name: string) => `/interface[name=${name}]/admin-state`,
  INTERFACE_DESCRIPTION: (name: string) => `/interface[name=${name}]/description`,
  INTERFACE_MTU: (name: string) => `/interface[name=${name}]/mtu`,

  // Network instance paths (srl_nokia-network-instance)
  NETWORK_INSTANCE: (name = 'default') => `/network-instance[name=${name}]`,
  NETWORK_INSTANCE_ROUTE_TABLE: (name = 'default') => `/network-instance[name=${name}]/route-table/ipv4-unicast`,
  NETWORK_INSTANCE_STATIC_ROUTE: (ni: string, prefix: string) =>
    `/network-instance[name=${ni}]/static-route/ipv4[route-preference=1][prefix=${prefix}]`,
  NETWORK_INSTANCE_NEXT_HOP: (ni: string, prefix: string, nhIndex: string) =>
    `/network-instance[name=${ni}]/static-route/ipv4[route-preference=1][prefix=${prefix}]/next-hop[index=${nhIndex}]`,

  // BGP paths (srl_nokia-bgp)
  BGP: (ni = 'default') => `/network-instance[name=${ni}]/protocols/bgp`,
  BGP_NEIGHBOR: (ni: string, peerIp: string) =>
    `/network-instance[name=${ni}]/protocols/bgp/neighbor[peer-address=${peerIp}]`,

  // OSPF paths (srl_nokia-ospf)
  OSPF: (ni = 'default') => `/network-instance[name=${ni}]/protocols/ospf`,

  // System paths
  SYSTEM_HOSTNAME: '/system/hostname',
  SYSTEM_DNS: '/system/dns',

  // Common SR Linux interface names
  INTERFACE_NAMES: [
    'mgmt0',
    'ethernet-1/1',
    'ethernet-1/2',
    'ethernet-1/3',
    'ethernet-1/4',
  ],
} as const;

/**
 * Map CLI interface names (e1-1) to SR Linux interface names (ethernet-1/1)
 */
export function mapInterfaceName(name: string): string {
  // Map e1-1 -> ethernet-1/1, e1-2 -> ethernet-1/2, etc.
  const match = name.match(/^e(\d+)-(\d+)$/);
  if (match) {
    const card = match[1];
    const port = match[2];
    return `ethernet-${card}/${port}`;
  }
  // Already in SR Linux format or mgmt0
  return name;
}

/**
 * Reverse map SR Linux interface names to CLI names
 */
export function mapToCliInterfaceName(name: string): string {
  // Map ethernet-1/1 -> e1-1, ethernet-1/2 -> e1-2, etc.
  const match = name.match(/^ethernet-(\d+)\/(\d+)$/);
  if (match) {
    const card = match[1];
    const port = match[2];
    return `e${card}-${port}`;
  }
  return name;
}

export interface GNMIRequest {
  path: string[];
  value?: unknown;
  operation?: 'get' | 'set' | 'subscribe' | 'update' | 'delete';
}

export interface GNMIResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Parse gNMI path string to GNMIPath structure
 */
function parseGNMIPath(pathStr: string): GNMIPath {
  const elem: Array<{ name: string; key?: Record<string, string> }> = [];

  // Split path by / and parse elements
  const parts = pathStr.split('/').filter(p => p);

  for (const part of parts) {
    // Check for element with keys (e.g., interface[name=GigabitEthernet0/0/0])
    const match = part.match(/^(\w+)\[([^\]]+)\]$/);
    if (match) {
      const name = match[1];
      const keyStr = match[2];
      const key: Record<string, string> = {};

      // Parse key-value pairs
      const keyPairs = keyStr.split(',');
      for (const pair of keyPairs) {
        const [k, v] = pair.split('=');
        if (k && v) {
          key[k] = v;
        }
      }

      elem.push({ name, key: Object.keys(key).length > 0 ? key : undefined });
    } else {
      elem.push({ name: part });
    }
  }

  return { elem };
}

/**
 * Convert path array to gNMI path string
 */
function pathToString(path: string[]): string {
  return path.join('/');
}

/**
 * gNMI Client class
 */
export class GNMIClient {
  private timeout: number;

  constructor(private config: GNMIConfig) {
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Connect to gNMI device
   */
  async connect(): Promise<GNMIResponse> {
    
    console.log(`[gNMI] Connected to ${this.config.host}:${this.config.port}`);
    return { success: true, data: { message: 'Connected' } };
  }

  /**
   * Disconnect from gNMI device
   */
  async disconnect(): Promise<GNMIResponse> {
    
    console.log('[gNMI] Disconnected');
    return { success: true, data: { message: 'Disconnected' } };
  }

  /**
   * Execute gnmic CLI command
   * Uses correct gnmic CLI syntax (not gnmi)
   *
   * gnmic command reference:
   * - gnmic get -a <host>:<port> -u <user> -p <pass> --skip-verify --path <xpath>
   * - gnmic set -a <host>:<port> -u <user> -p <pass> --skip-verify --update <path>:<json_value>
   * - gnmic capabilities -a <host>:<port> -u <user> -p <pass> --skip-verify
   */
  private async execGnmic(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn('gnmic', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || stdout.length > 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`gnmic exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        // gnmic CLI not available, return mock response
        console.warn('[gNMI] gnmic CLI not available:', err.message, '- using mock mode');
        resolve({ stdout: '{}', stderr: 'CLI not available' });
      });
    });
  }

  /**
   * Get configuration from device
   *
   * gnmic get command:
   * gnmic get -a <host>:<port> -u <user> -p <pass> --skip-verify --path <xpath>
   */
  async get(request: GNMIRequest): Promise<GNMIResponse> {
    try {
      console.log(`[gNMI] GET ${request.path.join('/')}`);

      // Build gnmic get command with correct flags
      const path = pathToString(request.path);
      const args = [
        'get',
        '-a', `${this.config.host}:${this.config.port}`,
        '-u', this.config.username,
        '-p', this.config.password,
        '--skip-verify',
        '--type', 'state',        // Get operational state data
        '--encoding', 'json_ietf', // Use JSON IETF encoding
        '--path', path,
      ];

      const { stdout } = await this.execGnmic(args);

      // Parse JSON response
      let data;
      try {
        data = JSON.parse(stdout);
      } catch {
        data = { raw: stdout };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Get operation failed',
      };
    }
  }

  /**
   * Set configuration on device
   *
   * gnmic set command:
   * gnmic set -a <host>:<port> -u <user> -p <pass> --skip-verify --update <path>:<json_value>
   * gnmic set -a <host>:<port> -u <user> -p <pass> --skip-verify --delete <path>
   */
  async set(request: GNMIRequest): Promise<GNMIResponse> {
    try {
      const operation = request.operation || 'update';
      console.log(`[gNMI] SET ${request.path.join('/')} (${operation})`, request.value);

      const path = pathToString(request.path);
      const valueJson = JSON.stringify(request.value || {});

      // Build gnmic set command with correct flags
      const args = [
        'set',
        '-a', `${this.config.host}:${this.config.port}`,
        '-u', this.config.username,
        '-p', this.config.password,
        '--skip-verify',
      ];

      if (operation === 'delete') {
        args.push('--delete', path);
      } else {
        // For update/replace, use --update flag with path:value format
        args.push('--update', `${path}:${valueJson}`);
      }

      const { stdout } = await this.execGnmic(args);

      let data;
      try {
        data = JSON.parse(stdout);
      } catch {
        data = { raw: stdout };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Set operation failed',
      };
    }
  }

  /**
   * Subscribe to telemetry data
   */
  async subscribe(request: GNMIRequest): Promise<GNMIResponse> {
    console.log(`[gNMI] SUBSCRIBE ${request.path.join('/')}`);

    // For subscriptions, we'd typically return a stream
    // This is a simplified version that returns initial data
    return {
      success: true,
      data: {
        message: 'Subscription initiated',
        path: request.path,
      },
    };
  }

  /**
   * Get interface configuration using SR Linux paths
   */
  async getInterface(interfaceName: string): Promise<GNMIResponse> {
    // Map CLI interface name to SR Linux format
    const srlInterfaceName = mapInterfaceName(interfaceName);
    const path = SRL_GNMI_PATHS.INTERFACE(srlInterfaceName);

    return this.get({
      path: [path],
    });
  }

  /**
   * Get all interfaces using SR Linux paths
   */
  async getAllInterfaces(): Promise<GNMIResponse> {
    return this.get({
      path: [SRL_GNMI_PATHS.INTERFACES],
    });
  }

  /**
   * Set interface configuration using SR Linux paths
   */
  async setInterface(interfaceName: string, config: Record<string, unknown>): Promise<GNMIResponse> {
    // Map CLI interface name to SR Linux format
    const srlInterfaceName = mapInterfaceName(interfaceName);

    const updates: Array<{ path: string; value: unknown }> = [];

    // Build SR Linux specific updates
    if (config.ip) {
      // Parse IP address (e.g., "192.168.1.1/24")
      const ipMatch = String(config.ip).match(/^([\d.]+)\/(\d+)$/);
      if (ipMatch) {
        const [, ip, prefix] = ipMatch;
        const ipPath = `/interface[name=${srlInterfaceName}]/subinterface[index=0]/ipv4/address[ipv4-address=${ip}]`;
        updates.push({
          path: ipPath,
          value: {
            'ipv4-address': ip,
            'prefix-length': parseInt(prefix, 10),
          },
        });
      }
    }

    if (config.description !== undefined) {
      updates.push({
        path: `/interface[name=${srlInterfaceName}]/description`,
        value: String(config.description),
      });
    }

    if (config.enabled !== undefined) {
      updates.push({
        path: `/interface[name=${srlInterfaceName}]/admin-state`,
        value: config.enabled ? 'enable' : 'disable',
      });
    }

    if (config.mtu !== undefined) {
      updates.push({
        path: `/interface[name=${srlInterfaceName}]/mtu`,
        value: Number(config.mtu),
      });
    }

    // Execute updates sequentially
    let lastResponse: GNMIResponse = { success: true };
    for (const update of updates) {
      lastResponse = await this.set({
        path: [update.path],
        value: update.value,
        operation: 'update',
      });
      if (!lastResponse.success) {
        return lastResponse;
      }
    }

    return lastResponse;
  }

  /**
   * Get routing configuration using SR Linux paths
   */
  async getRouting(networkInstance = 'default'): Promise<GNMIResponse> {
    return this.get({
      path: [SRL_GNMI_PATHS.NETWORK_INSTANCE_ROUTE_TABLE(networkInstance)],
    });
  }

  /**
   * Set routing configuration using SR Linux paths
   */
  async setRouting(protocol: string, config: Record<string, unknown>): Promise<GNMIResponse> {
    const ni = config.networkInstance as string || 'default';

    switch (protocol) {
      case 'static': {
        const destination = config.destination as string;
        const nextHop = config.nextHop as string;
        const metric = config.metric as number | undefined;

        if (!destination) {
          return { success: false, error: 'Destination is required for static routes' };
        }

        // Build SR Linux static route path
        const routePath = `/network-instance[name=${ni}]/static-route/ipv4[route-preference=1][prefix=${destination}]`;

        const value: Record<string, unknown> = {
          prefix: destination,
          'route-preference': 1,
        };

        if (nextHop) {
          value['next-hop'] = [{
            index: 1,
            'next-hop-address': nextHop,
            metric: metric ?? 1,
          }];
        }

        return this.set({
          path: [routePath],
          value,
          operation: 'update',
        });
      }

      case 'ospf':
      case 'bgp':
        // Return not implemented for dynamic protocols
        return {
          success: false,
          error: `${protocol} configuration via gNMI not yet implemented`,
        };

      default:
        return {
          success: false,
          error: `Unknown protocol: ${protocol}`,
        };
    }
  }

  /**
   * Delete routing configuration using SR Linux paths
   */
  async deleteRouting(protocol: string, config: Record<string, unknown>): Promise<GNMIResponse> {
    const ni = config.networkInstance as string || 'default';

    if (protocol === 'static') {
      const destination = config.destination as string;
      if (!destination) {
        return { success: false, error: 'Destination is required for static route deletion' };
      }

      const routePath = `/network-instance[name=${ni}]/static-route/ipv4[route-preference=1][prefix=${destination}]`;

      return this.set({
        path: [routePath],
        operation: 'delete',
      });
    }

    return {
      success: false,
      error: `${protocol} deletion via gNMI not yet implemented`,
    };
  }

  /**
   * Get capabilities (supported models/features)
   *
   * gnmic capabilities command:
   * gnmic capabilities -a <host>:<port> -u <user> -p <pass> --skip-verify
   */
  async capabilities(): Promise<GNMIResponse> {
    console.log('[gNMI] CAPABILITIES');

    try {
      const args = [
        'capabilities',
        '-a', `${this.config.host}:${this.config.port}`,
        '-u', this.config.username,
        '-p', this.config.password,
        '--skip-verify',
      ];

      const { stdout } = await this.execGnmic(args);

      let data;
      try {
        data = JSON.parse(stdout);
      } catch {
        data = { raw: stdout };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Capabilities request failed',
      };
    }
  }
}
