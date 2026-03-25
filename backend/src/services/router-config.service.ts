/**
 * Router Configuration Service
 * Stores runtime router configuration (ip, user, pass)
 */

import type { GNMIConfig, RouterConfigRequest } from '../types/index.js';

class RouterConfigService {
  private config: GNMIConfig | null = null;
  private readonly DEFAULT_PORT = 57400;
  private readonly DEFAULT_TIMEOUT = 30000;

  /**
   * Check if router is configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Get router configuration
   * Throws error if not configured
   */
  getConfig(): GNMIConfig {
    if (!this.config) {
      throw new Error(
        'Router not configured. Please call POST /api/config/router first.'
      );
    }
    return this.config;
  }

  /**
   * Set router configuration from API request
   */
  setConfig(request: RouterConfigRequest): void {
    this.config = {
      host: request.ip,
      port: request.port ?? this.DEFAULT_PORT,
      username: request.user,
      password: request.pass,
      insecure: true, // Hardcoded as requested
      timeout: this.DEFAULT_TIMEOUT,
    };
    console.log(`[RouterConfig] Router configured: ${request.user}@${request.ip}:${this.config.port}`);
  }

  /**
   * Clear router configuration
   */
  clearConfig(): void {
    this.config = null;
    console.log('[RouterConfig] Router configuration cleared');
  }

  /**
   * Get router info (safe to return to client)
   */
  getRouterInfo(): { ip: string; port: number; user: string; configured: boolean } {
    if (!this.config) {
      return {
        ip: '',
        port: this.DEFAULT_PORT,
        user: '',
        configured: false,
      };
    }

    return {
      ip: this.config.host,
      port: this.config.port,
      user: this.config.username,
      configured: true,
    };
  }
}

// Singleton instance
export const routerConfigService = new RouterConfigService();
