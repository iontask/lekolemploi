/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type AIProviderId =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'commandcode'
  | 'groq'
  | 'deepseek'
  | 'mistral'
  | 'openrouter'
  | 'custom'
  | 'heuristic';

export type AIProtocolFormat = 'openai' | 'anthropic' | 'direct';

export interface AIProviderModelOption {
  id: string;
  label: string;
  desc: string;
  isDefault?: boolean;
}

export interface AIProviderInfo {
  id: AIProviderId;
  name: string;
  shortName: string;
  tagline: string;
  badgeColor: string;
  recommendedModels: AIProviderModelOption[];
  defaultBaseUrl?: string;
  isCustomUrlSupported?: boolean;
  apiKeyPlaceholder?: string;
  apiKeyHelp?: string;
  docsUrl?: string;
  supportsApiKey: boolean;
  defaultTemperature: number;
  apiFormat?: AIProtocolFormat;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
  apiFormat?: AIProtocolFormat;
}

export interface CustomAIProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  createdAt: string;
  apiFormat?: AIProtocolFormat;
}

export interface AIProviderSettings {
  activeProviderId: string;
  configs: Record<string, AIProviderConfig>;
  customProviders?: CustomAIProvider[];
}

export interface TestProviderResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  modelUsed?: string;
  rawResponseSnippet?: string;
  errorDetails?: string;
}

export interface AIAnalysisEngineMetadata {
  providerId: string;
  providerName: string;
  model: string;
  latencyMs: number;
  isFallback: boolean;
  fallbackReason?: string;
}
