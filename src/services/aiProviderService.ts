/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AIProviderConfig,
  AIProviderId,
  AIProviderInfo,
  AIProviderSettings,
  AIProtocolFormat,
  CustomAIProvider,
  TestProviderResult,
} from '../types/aiProvider';

export const AI_PROVIDERS_REGISTRY: Record<AIProviderId, AIProviderInfo> = {
  google: {
    id: 'google',
    name: 'Google Gemini',
    shortName: 'Gemini',
    tagline: 'Modèles multimodaux haute vitesse avec raisonnement scolaire avancé',
    badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    supportsApiKey: true,
    defaultTemperature: 0.2,
    apiKeyPlaceholder: 'AIzaSy... (optionnel si clé serveur présente)',
    apiKeyHelp:
      'Si ce champ reste vide, la clé API serveur configurée dans l\'environnement est automatiquement utilisée.',
    docsUrl: 'https://ai.google.dev/',
    recommendedModels: [
      {
        id: 'gemini-3.8-flash',
        label: 'Gemini 3.8 Flash',
        desc: 'Recommandé — Excellent compromis vitesse, précision et raisonnement sur contraintes',
        isDefault: true,
      },
      {
        id: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        desc: 'Inférence ultra-rapide pour des réponses instantanées',
      },
      {
        id: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro',
        desc: 'Raisonnement approfondi pour des emplois du temps très complexes',
      },
    ],
  },
  openai: {
    id: 'openai',
    name: 'OpenAI GPT',
    shortName: 'OpenAI',
    tagline: 'Moteur de raisonnement généraliste avec mode structuré JSON',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    supportsApiKey: true,
    apiFormat: 'openai',
    defaultBaseUrl: 'https://api.openai.com/v1',
    isCustomUrlSupported: true,
    defaultTemperature: 0.2,
    apiKeyPlaceholder: 'sk-proj-...',
    apiKeyHelp: 'Nécessite une clé API OpenAI active pour appeler l\'API chat/completions.',
    docsUrl: 'https://platform.openai.com/api-keys',
    recommendedModels: [
      {
        id: 'gpt-4o-mini',
        label: 'GPT-4o mini',
        desc: 'Recommandé — Très rapide, économique et performant en JSON strict',
        isDefault: true,
      },
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        desc: 'Modèle phare pour les diagnostics combinatoires difficiles',
      },
      {
        id: 'o3-mini',
        label: 'o3-mini',
        desc: 'Modèle de raisonnement avec réflexion mathématique pas-à-pas',
      },
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    shortName: 'Claude',
    tagline: 'Grande capacité d\'analyse logique et fidélité absolue aux consignes',
    badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    supportsApiKey: true,
    apiFormat: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    isCustomUrlSupported: true,
    defaultTemperature: 0.2,
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyHelp: 'Nécessite une clé API Anthropic pour appeler l\'API messages.',
    docsUrl: 'https://console.anthropic.com/',
    recommendedModels: [
      {
        id: 'claude-3-5-sonnet-20241022',
        label: 'Claude 3.5 Sonnet',
        desc: 'Recommandé — Exceptionnel sur les contraintes et règles métier scolaires',
        isDefault: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        label: 'Claude 3.5 Haiku',
        desc: 'Vitesse de génération maximale pour tests rapides',
      },
    ],
  },
  commandcode: {
    id: 'commandcode',
    name: 'CommandCode AI (GLM-5 / Anthropic Messages)',
    shortName: 'CommandCode',
    tagline: 'Endpoint format Anthropic Messages pour modèles avancés dont glm-5.3-flash',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
    supportsApiKey: true,
    apiFormat: 'anthropic',
    defaultBaseUrl: 'https://commandcode.ai',
    isCustomUrlSupported: true,
    defaultTemperature: 0.2,
    apiKeyPlaceholder: 'Clé API CommandCode...',
    apiKeyHelp:
      'Requiert le protocole Anthropic Messages (endpoint https://commandcode.ai) pour le modèle glm-5.3-flash.',
    docsUrl: 'https://commandcode.ai',
    recommendedModels: [
      {
        id: 'glm-5.3-flash',
        label: 'GLM-5.3-Flash (Recommandé)',
        desc: 'Modèle multimodal ultra-rapide sur protocole Anthropic Messages',
        isDefault: true,
      },
      {
        id: 'glm-5.3-flashx',
        label: 'GLM-5.3-FlashX',
        desc: 'Variante 1M tokens de contexte pour grands emplois du temps',
      },
      {
        id: 'glm-4-plus',
        label: 'GLM-4-Plus',
        desc: 'Modèle de raisonnement généraliste GLM-4',
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        label: 'Claude 3.5 Sonnet',
        desc: 'Modèle Anthropic Claude 3.5 Sonnet via CommandCode',
      },
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud (LPU)',
    shortName: 'Groq',
    tagline: 'Inférence matérielle accélérée sur puces LPU à latence quasi-nulle',
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
    supportsApiKey: true,
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    isCustomUrlSupported: true,
    defaultTemperature: 0.2,
    apiKeyPlaceholder: 'gsk_...',
    apiKeyHelp: 'Utilisez votre clé API Groq gratuite ou payante.',
    docsUrl: 'https://console.groq.com/keys',
    recommendedModels: [
      {
        id: 'llama-3.3-70b-versatile',
        label: 'Llama 3.3 70B Versatile',
        desc: 'Recommandé — Hautes performances de raisonnement à plus de 250 tokens/sec',
        isDefault: true,
      },
      {
        id: 'llama-3.1-8b-instant',
        label: 'Llama 3.1 8B Instant',
        desc: 'Génération instantanée en moins de 300ms',
      },
      {
        id: 'mixtral-8x7b-32768',
        label: 'Mixtral 8x7B',
        desc: 'Architecture Mixture-of-Experts performante',
      },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek AI',
    shortName: 'DeepSeek',
    tagline: 'Excellente modélisation combinatoire et mathématique à coût ultra-faible',
    badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
    supportsApiKey: true,
    defaultBaseUrl: 'https://api.deepseek.com',
    isCustomUrlSupported: true,
    defaultTemperature: 0.2,
    apiKeyPlaceholder: 'sk-...',
    apiKeyHelp: 'Clé API DeepSeek disponible sur la plateforme DeepSeek Open Platform.',
    docsUrl: 'https://platform.deepseek.com/',
    recommendedModels: [
      {
        id: 'deepseek-chat',
        label: 'DeepSeek-V3 (Chat)',
        desc: 'Recommandé — Modèle 671B généraliste ultra performant en français et JSON',
        isDefault: true,
      },
      {
        id: 'deepseek-reasoner',
        label: 'DeepSeek-R1 (Reasoner)',
        desc: 'Raisonnement logique avec chaîne de pensée complète',
      },
    ],
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    shortName: 'Mistral',
    tagline: 'Modèles européens souverains, précis et rapides pour l\'analyse scolaire',
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
    supportsApiKey: true,
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    isCustomUrlSupported: true,
    defaultTemperature: 0.2,
    apiKeyPlaceholder: '...',
    apiKeyHelp: 'Clé API Mistral générée sur la console La Plateforme Mistral.',
    docsUrl: 'https://console.mistral.ai/',
    recommendedModels: [
      {
        id: 'mistral-small-latest',
        label: 'Mistral Small',
        desc: 'Recommandé — Très rapide, économique et précis',
        isDefault: true,
      },
      {
        id: 'mistral-large-latest',
        label: 'Mistral Large',
        desc: 'Modèle le plus puissant de Mistral pour les cas complexes',
      },
      {
        id: 'open-mistral-nemo',
        label: 'Mistral Nemo (12B)',
        desc: 'Format compact et agile',
      },
    ],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter (Multi-Moteurs)',
    shortName: 'OpenRouter',
    tagline: 'Une seule clé API pour tester Claude, GPT, Gemini, Llama, DeepSeek et Mistral',
    badgeColor: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    supportsApiKey: true,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    isCustomUrlSupported: true,
    defaultTemperature: 0.2,
    apiKeyPlaceholder: 'sk-or-v1-...',
    apiKeyHelp: 'Créez une clé sur openrouter.ai/keys pour basculer facilement entre tous les modèles.',
    docsUrl: 'https://openrouter.ai/keys',
    recommendedModels: [
      {
        id: 'openai/gpt-4o-mini',
        label: 'OpenAI GPT-4o mini (via OpenRouter)',
        desc: 'Accès ultra économique',
        isDefault: true,
      },
      {
        id: 'anthropic/claude-3.5-sonnet',
        label: 'Claude 3.5 Sonnet (via OpenRouter)',
        desc: 'Raisonnement logique supérieur',
      },
      {
        id: 'deepseek/deepseek-chat',
        label: 'DeepSeek-V3 (via OpenRouter)',
        desc: 'Performance maximale à coût réduit',
      },
      {
        id: 'google/gemini-2.5-flash',
        label: 'Gemini 2.5 Flash (via OpenRouter)',
        desc: 'Vitesse instantanée',
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        label: 'Llama 3.3 70B (via OpenRouter)',
        desc: 'Open Source de pointe',
      },
    ],
  },
  custom: {
    id: 'custom',
    name: 'Serveur compatible OpenAI / Local (Ollama, LM Studio)',
    shortName: 'Custom / Local',
    tagline: 'Connectez n\'importe quel endpoint compatible OpenAI (Ollama, vLLM, LM Studio)',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
    supportsApiKey: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
    isCustomUrlSupported: true,
    defaultTemperature: 0.2,
    apiKeyPlaceholder: 'Clé optionnelle (ex: ollama, bearer token...)',
    apiKeyHelp:
      'Indiquez l\'URL de votre instance (ex: http://localhost:11434/v1 pour Ollama, ou une route proxy d\'entreprise).',
    recommendedModels: [
      {
        id: 'llama3:latest',
        label: 'llama3:latest (Ollama)',
        desc: 'Modèle Llama 3 exécuté localement',
        isDefault: true,
      },
      {
        id: 'mistral:latest',
        label: 'mistral:latest (Ollama)',
        desc: 'Modèle Mistral 7B local',
      },
      {
        id: 'qwen2.5:latest',
        label: 'qwen2.5:latest',
        desc: 'Excellentes performances en mathématiques et JSON',
      },
    ],
  },
  heuristic: {
    id: 'heuristic',
    name: 'Heuristique Experte Intégrée',
    shortName: 'Heuristique locale',
    tagline: 'Diagnostic algorithmique sans appel réseau, 100% autonome et immédiat',
    badgeColor: 'bg-teal-50 text-teal-800 border-teal-200',
    supportsApiKey: false,
    defaultTemperature: 0,
    recommendedModels: [
      {
        id: 'built-in-expert-rules',
        label: 'Moteur de règles opérationnelles',
        desc: 'Analyse algorithmique des goulots, blocs et plafonds',
        isDefault: true,
      },
    ],
  },
};

const STORAGE_KEY = 'ai_timetables_provider_settings_v2';

export function getDefaultAIProviderSettings(): AIProviderSettings {
  const configs: Record<string, AIProviderConfig> = {
    google: {
      id: 'google',
      name: AI_PROVIDERS_REGISTRY.google.name,
      apiKey: '',
      model: 'gemini-3.8-flash',
      baseUrl: '',
      temperature: 0.2,
      apiFormat: 'openai',
    },
    openai: {
      id: 'openai',
      name: AI_PROVIDERS_REGISTRY.openai.name,
      apiKey: '',
      model: 'gpt-4o-mini',
      baseUrl: AI_PROVIDERS_REGISTRY.openai.defaultBaseUrl || '',
      temperature: 0.2,
      apiFormat: 'openai',
    },
    anthropic: {
      id: 'anthropic',
      name: AI_PROVIDERS_REGISTRY.anthropic.name,
      apiKey: '',
      model: 'claude-3-5-sonnet-20241022',
      baseUrl: AI_PROVIDERS_REGISTRY.anthropic.defaultBaseUrl || '',
      temperature: 0.2,
      apiFormat: 'anthropic',
    },
    commandcode: {
      id: 'commandcode',
      name: AI_PROVIDERS_REGISTRY.commandcode.name,
      apiKey: '',
      model: 'glm-5.3-flash',
      baseUrl: AI_PROVIDERS_REGISTRY.commandcode.defaultBaseUrl || 'https://commandcode.ai',
      temperature: 0.2,
      apiFormat: 'anthropic',
    },
    groq: {
      id: 'groq',
      name: AI_PROVIDERS_REGISTRY.groq.name,
      apiKey: '',
      model: 'llama-3.3-70b-versatile',
      baseUrl: AI_PROVIDERS_REGISTRY.groq.defaultBaseUrl || '',
      temperature: 0.2,
      apiFormat: 'openai',
    },
    deepseek: {
      id: 'deepseek',
      name: AI_PROVIDERS_REGISTRY.deepseek.name,
      apiKey: '',
      model: 'deepseek-chat',
      baseUrl: AI_PROVIDERS_REGISTRY.deepseek.defaultBaseUrl || '',
      temperature: 0.2,
      apiFormat: 'openai',
    },
    mistral: {
      id: 'mistral',
      name: AI_PROVIDERS_REGISTRY.mistral.name,
      apiKey: '',
      model: 'mistral-small-latest',
      baseUrl: AI_PROVIDERS_REGISTRY.mistral.defaultBaseUrl || '',
      temperature: 0.2,
      apiFormat: 'openai',
    },
    openrouter: {
      id: 'openrouter',
      name: AI_PROVIDERS_REGISTRY.openrouter.name,
      apiKey: '',
      model: 'openai/gpt-4o-mini',
      baseUrl: AI_PROVIDERS_REGISTRY.openrouter.defaultBaseUrl || '',
      temperature: 0.2,
      apiFormat: 'openai',
    },
    custom: {
      id: 'custom',
      name: AI_PROVIDERS_REGISTRY.custom.name,
      apiKey: '',
      model: 'llama3:latest',
      baseUrl: AI_PROVIDERS_REGISTRY.custom.defaultBaseUrl || '',
      temperature: 0.2,
      apiFormat: 'openai',
    },
    heuristic: {
      id: 'heuristic',
      name: AI_PROVIDERS_REGISTRY.heuristic.name,
      apiKey: '',
      model: 'built-in-expert-rules',
      baseUrl: '',
      temperature: 0,
      apiFormat: 'direct',
    },
  };

  return {
    activeProviderId: 'google',
    configs,
    customProviders: [],
  };
}

export function loadAIProviderSettings(): AIProviderSettings {
  if (typeof window === 'undefined') {
    return getDefaultAIProviderSettings();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Vérifier ancienne clé v1 si présente
      const rawV1 = localStorage.getItem('ai_timetables_provider_settings_v1');
      if (rawV1) {
        const parsedV1 = JSON.parse(rawV1);
        const defaults = getDefaultAIProviderSettings();
        const migrated: AIProviderSettings = {
          activeProviderId: parsedV1.activeProviderId || defaults.activeProviderId,
          configs: {
            ...defaults.configs,
            ...(parsedV1.configs || {}),
          },
          customProviders: [],
        };
        saveAIProviderSettings(migrated);
        return migrated;
      }
      return getDefaultAIProviderSettings();
    }
    const parsed = JSON.parse(raw);
    const defaults = getDefaultAIProviderSettings();
    return {
      activeProviderId: parsed.activeProviderId || defaults.activeProviderId,
      configs: {
        ...defaults.configs,
        ...(parsed.configs || {}),
      },
      customProviders: Array.isArray(parsed.customProviders) ? parsed.customProviders : [],
    };
  } catch (e) {
    console.warn('Impossible de charger les paramètres AI provider, réinitialisation aux valeurs par défaut:', e);
    return getDefaultAIProviderSettings();
  }
}

export function saveAIProviderSettings(settings: AIProviderSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('ai_provider_settings_changed', { detail: settings }));
  } catch (e) {
    console.error('Erreur sauvegarde paramètres AI provider:', e);
  }
}

export function getActiveAIProviderConfig(): AIProviderConfig {
  const settings = loadAIProviderSettings();
  const activeId = settings.activeProviderId;
  return settings.configs[activeId] || settings.configs.google;
}

export function setActiveAIProvider(providerId: string): void {
  const settings = loadAIProviderSettings();
  settings.activeProviderId = providerId;
  saveAIProviderSettings(settings);
}

export function updateAIProviderConfig(
  providerId: string,
  updates: Partial<AIProviderConfig>
): AIProviderSettings {
  const settings = loadAIProviderSettings();
  settings.configs[providerId] = {
    ...settings.configs[providerId],
    ...updates,
  };
  saveAIProviderSettings(settings);
  return settings;
}

/**
 * Mise à jour rapide de la clé API pour un provider
 */
export function updateApiKeyManually(providerId: string, apiKey: string): AIProviderSettings {
  return updateAIProviderConfig(providerId, { apiKey: apiKey.trim() });
}

/**
 * Ajout d'un fournisseur personnalisé manuel
 */
export function addCustomProvider(params: {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  apiFormat?: AIProtocolFormat;
}): CustomAIProvider {
  const settings = loadAIProviderSettings();
  const id = `custom_${Date.now()}`;

  // Détection intelligente du protocole si non spécifié explicitement
  let format: AIProtocolFormat = params.apiFormat || 'openai';
  if (!params.apiFormat) {
    const normModel = (params.model || '').toLowerCase();
    const normUrl = (params.baseUrl || '').toLowerCase();
    if (
      normModel.includes('glm-5') ||
      normModel.includes('claude') ||
      normUrl.includes('commandcode.ai') ||
      normUrl.endsWith('/messages')
    ) {
      format = 'anthropic';
    }
  }

  const newProvider: CustomAIProvider = {
    id,
    name: params.name.trim() || 'Moteur Personnalisé',
    apiKey: params.apiKey.trim(),
    baseUrl: (params.baseUrl.trim() || 'http://localhost:11434/v1').replace(/\/+$/, ''),
    model: params.model.trim() || 'llama3',
    temperature: params.temperature ?? 0.2,
    createdAt: new Date().toISOString(),
    apiFormat: format,
  };

  const newConfig: AIProviderConfig = {
    id,
    name: newProvider.name,
    apiKey: newProvider.apiKey,
    baseUrl: newProvider.baseUrl,
    model: newProvider.model,
    temperature: newProvider.temperature,
    apiFormat: newProvider.apiFormat,
  };

  settings.customProviders = [...(settings.customProviders || []), newProvider];
  settings.configs[id] = newConfig;
  saveAIProviderSettings(settings);
  return newProvider;
}

/**
 * Suppression d'un fournisseur personnalisé
 */
export function deleteCustomProvider(id: string): AIProviderSettings {
  const settings = loadAIProviderSettings();
  settings.customProviders = (settings.customProviders || []).filter((p) => p.id !== id);
  delete settings.configs[id];
  if (settings.activeProviderId === id) {
    settings.activeProviderId = 'google';
  }
  saveAIProviderSettings(settings);
  return settings;
}

/**
 * Teste la connexion et l'authentification avec un provider via le proxy backend
 */
export async function testAIProviderConnection(
  config: AIProviderConfig
): Promise<TestProviderResult> {
  if (config.id === 'heuristic') {
    return {
      success: true,
      message: 'Moteur algorithmique prêt (aucun appel réseau nécessaire).',
      latencyMs: 5,
      modelUsed: 'Règles expertes locales',
    };
  }

  const startTime = Date.now();
  try {
    const response = await fetch('/api/ai/test-provider', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: config.id,
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        temperature: config.temperature,
        apiFormat: config.apiFormat,
      }),
    });

    const elapsed = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        message: data.error || data.message || `Échec du test HTTP ${response.status}`,
        latencyMs: elapsed,
        errorDetails: data.details,
      };
    }

    return {
      success: true,
      message: data.message || `Connexion réussie avec ${config.model}`,
      latencyMs: data.latencyMs || elapsed,
      modelUsed: data.modelUsed || config.model,
      rawResponseSnippet: data.snippet,
    };
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    return {
      success: false,
      message: err.message || 'Impossible de joindre le serveur proxy /api/ai/test-provider',
      latencyMs: elapsed,
    };
  }
}
