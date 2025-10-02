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

  // No fallback - if API fails, Weave is not available
  return {
    enabled: false,
    message: 'Could not connect to backend for Weave configuration'
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
    // Build session-specific traces URL with filters
    return buildSessionTracesUrl(config, sessionId);
  }

  return baseUrl;
}

/**
 * Build Weave traces URL filtered by session ID
 */
function buildSessionTracesUrl(config: WeaveConfig, sessionId: string): string {
  const baseUrl = `${config.baseUrl}/${config.entity}/${config.project}/weave/traces`;

  // Create filter object for session ID
  const filters = {
    items: [
      {
        id: 0,
        field: "started_at",
        operator: "(date): after",
        value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
      },
      {
        id: 1,
        field: "inputs.session_id",
        operator: "(string): contains",
        value: sessionId
      }
    ],
    logicOperator: "and"
  };

  // URL encode the filters
  const encodedFilters = encodeURIComponent(JSON.stringify(filters));

  // Build the complete URL with filters
  return `${baseUrl}?view=traces_default&filters=${encodedFilters}`;
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
