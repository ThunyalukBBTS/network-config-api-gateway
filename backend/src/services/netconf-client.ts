/**
 * NETCONF Client for communicating with Cisco IOS XE devices
 * Uses NETCONF protocol over SSH using system ssh command
 */

import { spawn } from 'child_process';
import type { NETCONFConfig } from '../types/index.js';

export interface NETCONFRPCRequest {
  target: 'candidate' | 'running';
  config?: string;
  filter?: string;
  operation?: 'get' | 'get-config' | 'edit-config' | 'delete-config';
}

export interface NETCONFResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  rawXml?: string;
}

/**
 * Parse XML to JavaScript object (simple parser for NETCONF responses)
 */
function parseSimpleXML(xml: string): any {
  const result: any = {};

  // Remove XML declaration and comments
  let cleanXml = xml
    .replace(/<\?xml[^?]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  // Parse root element
  const rootMatch = cleanXml.match(/<(\w+(?::\w+)?)([\s\S]*)>([\s\S]*)<\/\1>/);
  if (!rootMatch) {
    // Try self-closing tag
    const selfCloseMatch = cleanXml.match(/<(\w+(?::\w+)?)([^>]*)\/>/);
    if (selfCloseMatch) {
      const tagName = selfCloseMatch[1];
      result[tagName] = {};
      return result;
    }
    return null;
  }

  const [, tagName, , content] = rootMatch;
  const parsedContent: any = {};

  // Parse child elements
  let remainingContent = content.trim();
  while (remainingContent) {
    // Check for opening tag
    const openTagMatch = remainingContent.match(/^<(\w+(?::\w+)?)([^>]*)>/);
    if (!openTagMatch) break;

    const childName = openTagMatch[1];
    const closeTag = `</${childName}>`;
    const closeIndex = remainingContent.indexOf(closeTag, openTagMatch[0].length);

    if (closeIndex === -1) {
      // Self-closing tag
      if (remainingContent[openTagMatch[0].length] === '/') {
        remainingContent = remainingContent.slice(openTagMatch[0].length + 1).trim();
        continue;
      }
      break;
    }

    const childContent = remainingContent.slice(openTagMatch[0].length, closeIndex).trim();
    remainingContent = remainingContent.slice(closeIndex + closeTag.length).trim();

    // Check if child has nested elements or just text
    if (childContent.includes('<')) {
      // Recursively parse nested elements
      const nested = parseSimpleXML(childContent);
      if (nested) {
        if (parsedContent[childName]) {
          // Convert to array if multiple elements with same name
          if (!Array.isArray(parsedContent[childName])) {
            parsedContent[childName] = [parsedContent[childName]];
          }
          parsedContent[childName].push(nested[childName] || nested);
        } else {
          parsedContent[childName] = nested[childName] || nested;
        }
      }
    } else {
      // Text content
      if (parsedContent[childName]) {
        if (!Array.isArray(parsedContent[childName])) {
          parsedContent[childName] = [parsedContent[childName]];
        }
        parsedContent[childName].push(childContent);
      } else {
        parsedContent[childName] = childContent;
      }
    }
  }

  result[tagName] = Object.keys(parsedContent).length > 0 ? parsedContent : content;
  return result;
}

/**
 * NETCONF Client class
 */
export class NETCONFClient {
  private messageId = 1;

  constructor(private config: NETCONFConfig) {}

  /**
   * Execute NETCONF command via SSH using sshpass for password auth
   */
  private async execNetconf(command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      // Use sshpass to provide password non-interactively
      const sshCmd = `sshpass -p '${this.config.password}' ssh -p ${this.config.port} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedKeyTypes=+ssh-rsa -o KexAlgorithms=+diffie-hellman-group-exchange-sha1,diffie-hellman-group1-sha1 ${this.config.username}@${this.config.host} netconf`;

      const proc = spawn('sh', ['-c', sshCmd], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
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
          reject(new Error(`SSH exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`SSH connection error: ${err.message}`));
      });

      // Send command to stdin
      if (command) {
        proc.stdin?.write(command);
        proc.stdin?.end();
      } else {
        // For interactive session, keep alive briefly
        setTimeout(() => {
          proc.kill();
        }, 100);
      }
    });
  }

  /**
   * Send NETCONF RPC and get response
   */
  private async sendRPC(rpcXml: string): Promise<NETCONFResponse> {
    try {
      const message = `${rpcXml}\n]]>]]>\n`;
      const { stdout } = await this.execNetconf(message);

      // Remove NETCONF message delimiters
      let responseXml = stdout
        .replace(/]]>]]>\n?/g, '')
        .replace(/^#\d+\n/g, '')
        .replace(/\n##$/g, '')
        .trim();

      // Parse XML response
      const parsed = parseSimpleXML(responseXml);

      // Check for RPC errors
      if (parsed?.['rpc-reply']?.['rpc-error']) {
        const rpcError = parsed['rpc-reply']['rpc-error'];
        return {
          success: false,
          error: rpcError['error-message'] || 'Unknown NETCONF error',
          rawXml: responseXml,
        };
      }

      return {
        success: true,
        data: parsed?.['rpc-reply'],
        rawXml: responseXml,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build get-config RPC
   */
  private buildGetConfigRPC(source: string, filter?: string): string {
    const xmlns = 'urn:ietf:params:xml:ns:netconf:base:1.0';
    const filterXml = filter ? `<filter>${filter}</filter>` : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<rpc xmlns="${xmlns}" message-id="${this.messageId++}">
  <get-config>
    <source>
      <${source}/>
    </source>
    ${filterXml}
  </get-config>
</rpc>`;
  }

  /**
   * Build get RPC
   */
  private buildGetRPC(filter?: string): string {
    const xmlns = 'urn:ietf:params:xml:ns:netconf:base:1.0';
    const filterXml = filter ? `<filter>${filter}</filter>` : '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<rpc xmlns="${xmlns}" message-id="${this.messageId++}">
  <get>
    ${filterXml}
  </get>
</rpc>`;
  }

  /**
   * Build edit-config RPC
   */
  private buildEditConfigRPC(target: string, config: string): string {
    const xmlns = 'urn:ietf:params:xml:ns:netconf:base:1.0';

    return `<?xml version="1.0" encoding="UTF-8"?>
<rpc xmlns="${xmlns}" message-id="${this.messageId++}">
  <edit-config>
    <target>
      <${target}/>
    </target>
    <config>${config}</config>
  </edit-config>
</rpc>`;
  }

  /**
   * Execute NETCONF RPC request
   */
  async execute(request: NETCONFRPCRequest): Promise<NETCONFResponse> {
    try {
      let rpcXml = '';

      switch (request.operation) {
        case 'get-config':
          rpcXml = this.buildGetConfigRPC(request.target, request.filter);
          break;
        case 'get':
          rpcXml = this.buildGetRPC(request.filter);
          break;
        case 'edit-config':
          rpcXml = this.buildEditConfigRPC(request.target, request.config || '');
          break;
        default:
          return { success: false, error: `Unsupported operation: ${request.operation}` };
      }

      console.log(`[NETCONF] ${request.operation} on ${request.target}`);
      return await this.sendRPC(rpcXml);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get running configuration
   */
  async getRunningConfig(filter?: string): Promise<NETCONFResponse> {
    return this.execute({
      target: 'running',
      operation: 'get-config',
      filter,
    });
  }

  /**
   * Get interface configuration
   */
  async getInterface(interfaceName: string): Promise<NETCONFResponse> {
    const filter = `<interfaces xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-interfaces-oper"><interface><name>${interfaceName}</name></interface></interfaces>`;
    return this.execute({
      target: 'running',
      operation: 'get',
      filter,
    });
  }

  /**
   * Get all interfaces
   */
  async getAllInterfaces(): Promise<NETCONFResponse> {
    const filter = `<interfaces xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-interfaces-oper"><interface/></interfaces>`;
    return this.execute({
      target: 'running',
      operation: 'get',
      filter,
    });
  }

  /**
   * Configure interface
   */
  async configureInterface(interfaceName: string, config: Record<string, unknown>): Promise<NETCONFResponse> {
    const configXml = this.buildInterfaceConfigXml(interfaceName, config);
    return this.execute({
      target: 'candidate',
      operation: 'edit-config',
      config: configXml,
    });
  }

  /**
   * Get routing table
   */
  async getRoutingTable(): Promise<NETCONFResponse> {
    const filter = `<routing-state xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-ip-routing-oper"><route-vrf/></routing-state>`;
    return this.execute({
      target: 'running',
      operation: 'get',
      filter,
    });
  }

  /**
   * Configure static route
   */
  async configureStaticRoute(destination: string, nextHop?: string, interfaceName?: string): Promise<NETCONFResponse> {
    const configXml = `<ip-route xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-ip"><ip-route-interface-forwarding-list><ip-forwarding-list><destination>${destination}</destination>${nextHop ? `<next-hop>${nextHop}</next-hop>` : ''}${interfaceName ? `<fwd-out-interface>${interfaceName}</fwd-out-interface>` : ''}</ip-forwarding-list></ip-route-interface-forwarding-list></ip-route>`;
    return this.execute({
      target: 'candidate',
      operation: 'edit-config',
      config: configXml,
    });
  }

  /**
   * Configure OSPF
   */
  async configureOSPF(config: Record<string, unknown>): Promise<NETCONFResponse> {
    const configXml = this.buildOSPFConfigXml(config);
    return this.execute({
      target: 'candidate',
      operation: 'edit-config',
      config: configXml,
    });
  }

  /**
   * Configure BGP
   */
  async configureBGP(config: Record<string, unknown>): Promise<NETCONFResponse> {
    const configXml = this.buildBGPConfigXml(config);
    return this.execute({
      target: 'candidate',
      operation: 'edit-config',
      config: configXml,
    });
  }

  /**
   * Configure EIGRP
   */
  async configureEIGRP(config: Record<string, unknown>): Promise<NETCONFResponse> {
    const configXml = this.buildEIGRPConfigXml(config);
    return this.execute({
      target: 'candidate',
      operation: 'edit-config',
      config: configXml,
    });
  }

  /**
   * Configure firewall rule
   */
  async configureFirewallRule(rule: Record<string, unknown>): Promise<NETCONFResponse> {
    const configXml = this.buildFirewallRuleXml(rule);
    return this.execute({
      target: 'candidate',
      operation: 'edit-config',
      config: configXml,
    });
  }

  /**
   * Build interface configuration XML
   */
  private buildInterfaceConfigXml(name: string, config: Record<string, unknown>): string {
    return `<interface xmlns="http://cisco.com/ns/yang/Cisco-IXENE-native"><name>${name}</name>${config.ip ? `<ipv4><address><primary><address>${config.ip}</address></primary></address></ipv4>` : ''}${config.description ? `<description>${config.description}</description>` : ''}${config.enabled !== undefined ? `<shutdown>${!config.enabled}</shutdown>` : ''}${config.mtu ? `<mtu>${config.mtu}</mtu>` : ''}</interface>`;
  }

  /**
   * Build OSPF configuration XML
   */
  private buildOSPFConfigXml(config: Record<string, unknown>): string {
    const networks = config.networks as Array<{ network: string; area: number }> || [];
    return `<router-ospf xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-ospf"><ospf><process-id><id>${config.processId}</id><router-id>${config.routerId}</router-id>${networks.map((n) => `<network><ip>${n.network}</ip><area>${n.area}</area></network>`).join('')}${config.defaultInformationOriginate ? '<default-information><originate>always</originate></default-information>' : ''}</process-id></ospf></router-ospf>`;
  }

  /**
   * Build BGP configuration XML
   */
  private buildBGPConfigXml(config: Record<string, unknown>): string {
    const neighbors = config.neighbors as Array<Record<string, unknown>> || [];
    const networks = config.networks as string[] || [];
    return `<router-bgp xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-bgp"><bgp><as-no>${config.asNumber}</as-no><bgp><router-id>${config.routerId}</router-id><neighbors>${neighbors.map((n) => `<neighbor><id>${n.ip}</id><remote-as>${n.remoteAs}</remote-as>${n.description ? `<description>${n.description}</description>` : ''}${n.password ? `<password><encryption>0</encryption><password>${n.password}</password></password>` : ''}</neighbor>`).join('')}</neighbors><address-family><with-vrf>ipv4-unicast</with-vrf><ipv4-unicast><networks>${networks.map((n) => `<network><prefix>${n}</prefix></network>`).join('')}</networks></ipv4-unicast></address-family></bgp></bgp></router-bgp>`;
  }

  /**
   * Build EIGRP configuration XML
   */
  private buildEIGRPConfigXml(config: Record<string, unknown>): string {
    const networks = config.networks as string[] || [];
    return `<router-eigrp xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-eigrp"><eigrp><as-number>${config.asNumber}</as-number><router-id>${config.routerId}</router-id><networks>${networks.map((n) => `<network><address>${n}</address></network>`).join('')}</networks></eigrp></router-eigrp>`;
  }

  /**
   * Build firewall rule XML
   */
  private buildFirewallRuleXml(rule: Record<string, unknown>): string {
    return `<ip xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-native"><access-list><extended><named-acl><name>WEB-ACL</name><access-list-rule><rule>${rule.action}</rule><source><address>${rule.source}</address></source><destination><address>${rule.destination}</address></destination>${rule.protocol ? `<protocol>${rule.protocol}</protocol>` : ''}${rule.port ? `<port>${rule.port}</port>` : ''}</access-list-rule></named-acl></extended></access-list></ip>`;
  }
}
