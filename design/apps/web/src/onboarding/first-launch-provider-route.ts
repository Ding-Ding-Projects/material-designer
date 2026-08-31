import type { AgentInfo, AppConfig } from '../types';
import { isVisibleLocalCliAgent } from '../utils/visibleAgents';

export type FirstLaunchProviderRoute = 'local' | 'byok';

type ProviderRouteConfig = Pick<
  AppConfig,
  'agentId' | 'apiKey' | 'baseUrl' | 'mode' | 'model' | 'onboardingCompleted'
>;

export function hasConfiguredByokRoute(
  config: Pick<AppConfig, 'apiKey' | 'baseUrl' | 'model'>,
): boolean {
  return Boolean(
    config.apiKey.trim()
    && config.baseUrl.trim()
    && config.model.trim(),
  );
}

function availableLocalAgents(agents: readonly AgentInfo[]): AgentInfo[] {
  return agents.filter(
    (agent) => agent.available && isVisibleLocalCliAgent(agent),
  );
}

/**
 * Resolve the first visible execution route without consulting cloud identity.
 * A selected runnable local CLI wins, then an explicitly active BYOK setup,
 * then any runnable local CLI, then a dormant but complete BYOK setup. The
 * final local fallback intentionally reaches the in-app install and Rescan
 * guidance instead of redirecting to authentication.
 */
export function firstLaunchProviderRoute(
  config: ProviderRouteConfig,
  agents: readonly AgentInfo[],
): FirstLaunchProviderRoute {
  const localAgents = availableLocalAgents(agents);
  const selectedLocalAgentAvailable = Boolean(
    config.agentId
    && localAgents.some((agent) => agent.id === config.agentId),
  );
  const byokConfigured = hasConfiguredByokRoute(config);

  if (selectedLocalAgentAvailable) return 'local';
  if (config.mode === 'api' && byokConfigured) return 'byok';
  if (localAgents.length > 0) return 'local';
  if (byokConfigured) return 'byok';
  return 'local';
}

/**
 * Migrate the retired hosted execution selection to a supported visible route.
 * Returning the same object is the no-op signal used by the persistence owner.
 */
export function retireCloudExecutionRoute(
  config: AppConfig,
  agents: readonly AgentInfo[],
): AppConfig {
  if (config.mode !== 'daemon' || config.agentId !== 'amr') return config;

  const localAgent = availableLocalAgents(agents)[0];
  if (localAgent) {
    return { ...config, agentId: localAgent.id };
  }
  if (hasConfiguredByokRoute(config)) {
    return { ...config, mode: 'api', agentId: null };
  }
  return {
    ...config,
    agentId: null,
    onboardingCompleted: false,
  };
}
