/**
 * NETCONF Client for communicating with Cisco IOS XE devices
 * Uses NETCONF protocol over SSH using system ssh command
 * Enhanced with session management similar to ncclient
 */

import { spawn } from 'child_process';
import type { NETCONFConfig, NETCONFSessionInfo } from '../types/index.js';

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
 * Parse XML to JavaScript object (improved parser for NETCONF responses)
 */
function parseSimpleXML(xml: string): any {
  const result: any = {};

  // Remove XML declaration and comments
  let cleanXml = xml
    .replace(/<\?xml[^?]*\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  // Parse root element
  const rootMatch = cleanXml.match(/<(\w+(?::\w+)?)(?:\s[^>]*)?>([\s\S]*)<\/\1>/);
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

  const tagName = rootMatch[1];
  const content = rootMatch[2];  // content is in index 2

  // Parse child elements recursively
  const parsedContent = parseChildren(content);

  result[tagName] = Object.keys(parsedContent).length > 0 ? parsedContent : content;
  return result;
}

/**
 * Parse child elements from XML content
 */
function parseChildren(content: string): any {
  const parsed: any = {};
  let remaining = content;

  while (remaining.length > 0) {
    // Skip whitespace
    remaining = remaining.trim();
    if (remaining.length === 0) break;

    // Find opening tag - include namespace handling (e.g., hello xmlns="...")
    const openMatch = remaining.match(/^<(\w+(?::\w+)?)(?:\s[^>]*)?>/);
    if (!openMatch) {
      // If no tag found but there's content, it's text content - skip
      remaining = remaining.slice(1).trim();
      continue;
    }

    const childName = openMatch[1];
    const fullOpenTag = openMatch[0];
    const closeTag = `</${childName}>`;

    // Check for self-closing tag (ends with />)
    const isSelfClosing = fullOpenTag.trim().endsWith('/>');
    if (isSelfClosing) {
      remaining = remaining.slice(fullOpenTag.length).trim();
      // Self-closing element becomes empty object
      if (!parsed[childName]) {
        parsed[childName] = {};
      } else if (!Array.isArray(parsed[childName])) {
        parsed[childName] = [parsed[childName], {}];
      } else {
        parsed[childName].push({});
      }
      continue;
    }

    const closeIndex = remaining.indexOf(closeTag, fullOpenTag.length);

    if (closeIndex === -1) {
      // No closing tag found - skip this tag
      remaining = remaining.slice(fullOpenTag.length).trim();
      continue;
    }

    const childContent = remaining.slice(fullOpenTag.length, closeIndex).trim();
    remaining = remaining.slice(closeIndex + closeTag.length).trim();

    // Check if childContent contains any tags (nested elements)
    const hasNestedTags = /<\w+/.test(childContent);

    if (!hasNestedTags && childContent.length > 0) {
      // Primitive value (text content only)
      const value = childContent;
      if (parsed[childName] !== undefined) {
        if (!Array.isArray(parsed[childName])) {
          parsed[childName] = [parsed[childName]];
        }
        parsed[childName].push(value);
      } else {
        parsed[childName] = value;
      }
    } else if (hasNestedTags) {
      // Has nested elements - parse recursively
      const childValue = parseSimpleXML(`<${childName}>${childContent}</${childName}>`);
      if (childValue && childValue[childName] !== undefined) {
        const value = childValue[childName];
        if (parsed[childName] !== undefined) {
          if (!Array.isArray(parsed[childName])) {
            parsed[childName] = [parsed[childName]];
          }
          parsed[childName].push(value);
        } else {
          parsed[childName] = value;
        }
      } else {
        // Parsing failed but there were nested tags - store as empty object
        if (parsed[childName] === undefined) {
          parsed[childName] = {};
        }
      }
    } else {
      // Empty element
      if (parsed[childName] === undefined) {
        parsed[childName] = {};
      }
    }
  }

  return parsed;
}

/**
 * NETCONF Client class
 */
export class NETCONFClient {
  private messageId = 1;
  private sessionInfo: NETCONFSessionInfo = {
    sessionId: undefined,
    serverCapabilities: [],
    initialized: false,
  };
  private autoConnect: boolean;
  private sshProcess: any = null;
  private sshStdin: any = null;
  private sshStdout: any = null;

  constructor(private config: NETCONFConfig) {
    this.autoConnect = config.autoConnect ?? true;
  }

  /**
   * Get current session information
   */
  getSessionInfo(): NETCONFSessionInfo {
    return { ...this.sessionInfo };
  }

  /**
   * Check if session is initialized
   */
  isSessionInitialized(): boolean {
    return this.sessionInfo.initialized;
  }

  /**
   * Get server capabilities
   */
  getServerCapabilities(): string[] {
    return [...this.sessionInfo.serverCapabilities];
  }

  /**
   * Check if server supports a specific capability
   */
  hasCapability(capability: string): boolean {
    return this.sessionInfo.serverCapabilities.some(cap =>
      cap.includes(capability) || capability.includes(cap)
    );
  }

  /**
   * Connect and initialize NETCONF session
   * Sends hello message and receives server capabilities
   */
  async connect(): Promise<NETCONFResponse> {
    if (this.sessionInfo.initialized) {
      return {
        success: true,
        data: { message: 'Session already initialized', sessionId: this.sessionInfo.sessionId },
      };
    }

    try {
      // Start SSH subprocess for NETCONF session (persistent)
      const helloMessage = this.buildHelloMessage();

      console.log('[NETCONF] Connecting to', this.config.host, 'port', this.config.port);

      // Start persistent SSH connection
      this.sshProcess = this.startSSHProcess();
      await this.waitForSSHReady();

      // Send hello message
      const fullMessage = `${helloMessage}\n]]>]]>\n`;
      await this.sendToSSH(fullMessage);

      // Receive hello response
      const stdout = await this.receiveFromSSH();

      console.log('[NETCONF] Received hello response, length:', stdout.length);

      // Parse server's hello response
      const parsed = this.parseHelloResponse(stdout);

      if (parsed) {
        this.sessionInfo.sessionId = parsed.sessionId;
        this.sessionInfo.serverCapabilities = parsed.capabilities;
        this.sessionInfo.initialized = true;

        console.log(`[NETCONF] Session established. ID: ${this.sessionInfo.sessionId}`);
        console.log(`[NETCONF] Server capabilities: ${this.sessionInfo.serverCapabilities.length} found`);

        return {
          success: true,
          data: {
            sessionId: this.sessionInfo.sessionId,
            capabilities: this.sessionInfo.serverCapabilities,
          },
        };
      }

      return {
        success: false,
        error: 'Failed to parse server hello response',
      };
    } catch (error: any) {
      console.error('[NETCONF] Connection error:', error);
      this.closeConnection();
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  }

  /**
   * Start SSH process for persistent connection
   */
  private startSSHProcess() {
    const sshCmd = this.buildSSHCommand();
    const timeout = this.config.timeout || 30000;

    console.log('[NETCONF] Starting SSH process');

    const proc = spawn('sh', ['-c', sshCmd], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
    });

    // Log stderr for debugging
    proc.stderr?.on('data', (data: Buffer) => {
      console.error('[NETCONF] SSH stderr:', data.toString());
    });

    proc.on('close', (code: number) => {
      console.log('[NETCONF] SSH process closed with code:', code);
      this.sessionInfo.initialized = false;
      this.sshProcess = null;
    });

    proc.on('error', (err: Error) => {
      console.error('[NETCONF] SSH process error:', err);
    });

    this.sshStdin = proc.stdin;
    this.sshStdout = proc.stdout;

    return proc;
  }

  /**
   * Wait for SSH stdout to be ready
   */
  private async waitForSSHReady(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.sshStdout) {
        resolve();
        return;
      }

      // Wait for any initial output
      const timeout = setTimeout(() => {
        console.log('[NETCONF] SSH ready timeout - continuing');
        resolve();
      }, 1000);

      this.sshStdout.once('data', () => {
        clearTimeout(timeout);
        console.log('[NETCONF] SSH stdout ready');
        resolve();
      });
    });
  }

  /**
   * Send data to SSH process
   */
  private async sendToSSH(data: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.sshStdin) {
        reject(new Error('SSH stdin not available'));
        return;
      }

      this.sshStdin.write(data, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log('[NETCONF] Sent data to SSH');
          resolve();
        }
      });
    });
  }

  /**
   * Receive data from SSH process
   */
  private async receiveFromSSH(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.sshStdout) {
        resolve('');
        return;
      }

      let stdout = '';
      let resolved = false;
      const timeout = this.config.timeout || 5000;

      const resolveOnce = () => {
        if (!resolved) {
          resolved = true;
          console.log('[NETCONF] Received data from SSH, length:', stdout.length);
          resolve(stdout);
        }
      };

      const onData = (data: Buffer) => {
        stdout += data.toString();
        // Wait a bit after receiving data for more to arrive
        setTimeout(resolveOnce, 200);
      };

      this.sshStdout.once('data', onData);

      // Fallback timeout
      setTimeout(() => {
        this.sshStdout?.removeListener('data', onData);
        resolveOnce();
      }, timeout);
    });
  }

  /**
   * Close the SSH connection
   */
  private closeConnection(): void {
    if (this.sshProcess) {
      try {
        this.sshProcess.kill();
      } catch {
        // Ignore
      }
      this.sshProcess = null;
      this.sshStdin = null;
      this.sshStdout = null;
    }
  }

  /**
   * Close NETCONF session gracefully
   */
  async close(): Promise<NETCONFResponse> {
    if (!this.sessionInfo.initialized) {
      return { success: true, data: { message: 'No active session to close' } };
    }

    try {
      const closeRpc = this.buildCloseSessionRPC();
      await this.sendToSSH(`${closeRpc}\n]]>]]>\n`);
      await this.receiveFromSSH(); // Wait for response

      // Close SSH connection
      this.closeConnection();

      // Reset session state
      this.sessionInfo = {
        sessionId: undefined,
        serverCapabilities: [],
        initialized: false,
      };

      console.log('[NETCONF] Session closed');
      return { success: true, data: { message: 'Session closed successfully' } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to close session',
      };
    }
  }

  /**
   * Build NETCONF hello message
   */
  private buildHelloMessage(): string {
    const capabilities = [
      'urn:ietf:params:netconf:base:1.0',
      'urn:ietf:params:netconf:base:1.1',
      'urn:ietf:params:netconf:capability:writable-running:1.0',
      'urn:ietf:params:netconf:capability:candidate:1.0',
      'urn:ietf:params:netconf:capability:confirmed-commit:1.0',
      'urn:ietf:params:netconf:capability:rollback-on-error:1.0',
      'urn:ietf:params:netconf:capability:startup:1.0',
      'urn:ietf:params:netconf:capability:url:1.0',
      'urn:ietf:params:netconf:capability:validate:1.0',
      'urn:ietf:params:netconf:capability:xpath:1.0',
    ];

    return `<?xml version="1.0" encoding="UTF-8"?>
<hello xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">
  <capabilities>
${capabilities.map(cap => `    <capability>${cap}</capability>`).join('\n')}
  </capabilities>
</hello>`;
  }

  /**
   * Parse server's hello response
   */
  private parseHelloResponse(response: string): { sessionId?: string; capabilities: string[] } | null {
    try {
      // Clean response - remove delimiters
      let clean = response
        .replace(/]]>]]>\n?/g, '')
        .replace(/^#\d+\n/g, '')
        .trim();

      console.log('[NETCONF] ===== RAW HELLO XML =====');
      console.log(clean);
      console.log('[NETCONF] ===== END RAW XML =====');

      // Parse XML
      const parsed = parseSimpleXML(clean);
      console.log('[NETCONF] Full parsed result:');
      console.log(JSON.stringify(parsed, null, 2));

      const hello = parsed?.['hello'];
      console.log('[NETCONF] Hello element type:', typeof hello);
      console.log('[NETCONF] Hello element keys:', hello ? Object.keys(hello) : 'N/A');

      if (!hello) {
        console.error('[NETCONF] No hello element in response');
        return null;
      }

      // Check if hello is an object or a string (parser issue)
      if (typeof hello === 'string') {
        console.error('[NETCONF] Hello parsed as string instead of object:', hello.substring(0, 100));
        return null;
      }

      // Extract session ID - try both with and without hyphen
      const sessionId = hello['session-id'] || hello['sessionId'] || hello['session_id'];
      console.log('[NETCONF] Session ID extraction attempt:', {
        'session-id': hello['session-id'],
        'sessionId': hello['sessionId'],
        'session_id': hello['session_id'],
        'final': sessionId,
      });

      // Extract capabilities
      const caps: string[] = [];
      const capabilities = hello['capabilities']?.['capability'];
      console.log('[NETCONF] Capabilities object:', JSON.stringify(capabilities, null, 2).substring(0, 500));

      if (capabilities) {
        const capArray = Array.isArray(capabilities) ? capabilities : [capabilities];
        console.log('[NETCONF] Capabilities array length:', capArray.length);
        for (const cap of capArray) {
          if (typeof cap === 'string') {
            caps.push(cap);
          }
        }
      }

      console.log('[NETCONF] Found capabilities:', caps.length);
      return { sessionId, capabilities: caps };
    } catch (error) {
      console.error('[NETCONF] Error parsing hello response:', error);
      return null;
    }
  }

  /**
   * Build close-session RPC
   */
  private buildCloseSessionRPC(): string {
    const xmlns = 'urn:ietf:params:xml:ns:netconf:base:1.0';
    return `<?xml version="1.0" encoding="UTF-8"?>
<rpc xmlns="${xmlns}" message-id="${this.messageId++}">
  <close-session/>
</rpc>`;
  }

  /**
   * Ensure session is initialized before sending RPCs
   */
  private async ensureSession(): Promise<void> {
    if (this.autoConnect && !this.sessionInfo.initialized) {
      await this.connect();
    }
  }

  /**
   * Get all data (get without filter) - useful for full data retrieval
   */
  async getAll(): Promise<NETCONFResponse> {
    await this.ensureSession();

    return this.execute({
      target: 'running',
      operation: 'get',
      filter: undefined,
    });
  }

  /**
   * Build SSH command with options for legacy Cisco RSA keys
   * Modern SSH clients disable ssh-rsa by default, Cisco routers use it
   */
  private buildSSHCommand(): string {
    // SSH options needed for older Cisco IOS XE with RSA keys
    const sshOptions = [
      '-p', String(this.config.port),
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=10',
      // Explicitly enable older RSA key types that Cisco uses
      '-o', 'HostKeyAlgorithms=ssh-rsa',
      '-o', 'PubkeyAcceptedKeyTypes=+ssh-rsa',
      // Enable older key exchange algorithms
      '-o', 'KexAlgorithms=+diffie-hellman-group1-sha1,diffie-hellman-group14-sha1',
      // Use weaker ciphers if needed
      '-o', 'Ciphers=+aes128-cbc,aes192-cbc,aes256-cbc',
    ];

    return `sshpass -p '${this.config.password}' ssh ${sshOptions.join(' ')} ${this.config.username}@${this.config.host} netconf`;
  }

  /**
   * Send NETCONF RPC and get response using persistent connection
   */
  private async sendRPC(rpcXml: string): Promise<NETCONFResponse> {
    try {
      // Ensure SSH process is running
      if (!this.sshProcess || !this.sshStdin || !this.sshStdout) {
        return {
          success: false,
          error: 'SSH connection not established. Call connect() first.',
        };
      }

      const message = `${rpcXml}\n]]>]]>\n`;
      await this.sendToSSH(message);
      const stdout = await this.receiveFromSSH();

      // Remove NETCONF message delimiters
      let responseXml = stdout
        .replace(/]]>]]>\n?/g, '')
        .replace(/^#\d+\n/g, '')
        .replace(/\n##$/g, '')
        .trim();

      console.log('[NETCONF] ===== RAW RPC RESPONSE =====');
      console.log(responseXml);
      console.log('[NETCONF] ===== END RAW RESPONSE =====');

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
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || String(error),
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
    // Auto-connect if session not initialized
    await this.ensureSession();

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
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || String(error),
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
    return `<interface xmlns="http://cisco.com/ns/yang/Cisco-IOS-XE-native"><name>${name}</name>${config.ip ? `<ipv4><address><primary><address>${config.ip}</address></primary></address></ipv4>` : ''}${config.description ? `<description>${config.description}</description>` : ''}${config.enabled !== undefined ? `<shutdown>${!config.enabled}</shutdown>` : ''}${config.mtu ? `<mtu>${config.mtu}</mtu>` : ''}</interface>`;
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
