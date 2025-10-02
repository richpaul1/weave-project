/**
 * Weave UI utilities for debugging and observability
 */

export interface WeaveConfig {
  enabled: boolean;
  entity?: string;
  project?: string;
  baseUrl?: string;
  message?: string;
}

/**
 * Get Weave configuration from environment or API
 */
export async function getWeaveConfig(): Promise<WeaveConfig | null> {
  try {
    // Try to get config from backend API first
    const response = await fetch('/api/weave/config');
    if (response.ok) {
      const config = await response.json();
      return config;
    }
  } catch (error) {
    console.warn('Could not fetch Weave config from API:', error);
  }

  // Fallback to hardcoded values (from .env.local)
  return {
    enabled: true,
    entity: 'richpaul1-stealth',
    project: 'support-app',
    baseUrl: 'https://wandb.ai'
  };
}

/**
 * Construct Weave UI URL for a specific session
 */
export function buildWeaveUrl(config: WeaveConfig, sessionId?: string): string | null {
  if (!config.enabled || !config.entity || !config.project || !config.baseUrl) {
    return null;
  }

  const baseUrl = `${config.baseUrl}/${config.entity}/${config.project}/weave`;

  if (sessionId) {
    // Add session-specific filters or parameters if needed
    // For now, just open the main Weave UI
    return baseUrl;
  }

  return baseUrl;
}

/**
 * Open Weave UI in a new tab
 */
export async function openWeaveUI(sessionId?: string): Promise<void> {
  try {
    const config = await getWeaveConfig();
    if (!config) {
      console.error('Weave configuration not available');
      return;
    }

    if (!config.enabled) {
      console.warn('Weave tracking is disabled:', config.message);
      alert(config.message || 'Weave tracking is disabled');
      return;
    }

    const url = buildWeaveUrl(config, sessionId);
    if (!url) {
      console.error('Could not build Weave URL');
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    console.error('Failed to open Weave UI:', error);
  }
}
