/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Key,
  Globe,
  Sliders,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  Activity,
  ShieldCheck,
  Cpu,
  Layers,
  ArrowRight,
  RefreshCw,
  Zap,
  Plus,
  Trash2,
  ClipboardPaste,
  Check,
} from 'lucide-react';
import {
  AIProviderConfig,
  AIProviderId,
  AIProviderInfo,
  AIProviderSettings,
  CustomAIProvider,
  TestProviderResult,
} from '../types/aiProvider';
import {
  AI_PROVIDERS_REGISTRY,
  addCustomProvider,
  deleteCustomProvider,
  loadAIProviderSettings,
  saveAIProviderSettings,
  testAIProviderConnection,
  updateApiKeyManually,
} from '../services/aiProviderService';

interface AIProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProviderChanged?: (activeConfig: AIProviderConfig) => void;
  initialTab?: 'keys' | 'detailed' | 'custom';
}

export const AIProviderModal: React.FC<AIProviderModalProps> = ({
  isOpen,
  onClose,
  onProviderChanged,
  initialTab = 'keys',
}) => {
  const [activeTab, setActiveTab] = useState<'keys' | 'detailed' | 'custom'>(initialTab);
  const [settings, setSettings] = useState<AIProviderSettings>(loadAIProviderSettings);
  const [selectedProviderId, setSelectedProviderId] = useState<string>('google');
  const [showApiKeyMap, setShowApiKeyMap] = useState<Record<string, boolean>>({});
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [isTestingMap, setIsTestingMap] = useState<Record<string, boolean>>({});
  const [testResultMap, setTestResultMap] = useState<Record<string, TestProviderResult>>({});
  const [savedKeyId, setSavedKeyId] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Formulaire d'ajout d'un provider / clé personnalisé
  const [customName, setCustomName] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customBaseUrl, setCustomBaseUrl] = useState('https://commandcode.ai');
  const [customModel, setCustomModel] = useState('glm-5.3-flash');
  const [customApiFormat, setCustomApiFormat] = useState<'openai' | 'anthropic' | 'direct'>('anthropic');
  const [customError, setCustomError] = useState<string | null>(null);

  const applyCustomPreset = (preset: 'commandcode' | 'ollama' | 'openai') => {
    if (preset === 'commandcode') {
      setCustomName('CommandCode AI');
      setCustomBaseUrl('https://commandcode.ai');
      setCustomModel('glm-5.3-flash');
      setCustomApiFormat('anthropic');
      setCustomError(null);
    } else if (preset === 'ollama') {
      setCustomName('Ollama Local');
      setCustomBaseUrl('http://localhost:11434/v1');
      setCustomModel('llama3:latest');
      setCustomApiFormat('openai');
      setCustomError(null);
    } else if (preset === 'openai') {
      setCustomName('OpenAI Compatible');
      setCustomBaseUrl('https://api.openai.com/v1');
      setCustomModel('gpt-4o-mini');
      setCustomApiFormat('openai');
      setCustomError(null);
    }
  };

  // Recharger les paramètres à l'ouverture du modal
  useEffect(() => {
    if (isOpen) {
      const current = loadAIProviderSettings();
      setSettings(current);
      setSelectedProviderId(current.activeProviderId);
      setTestResultMap({});
      setSaveSuccessMsg(false);
      setActiveTab(initialTab);

      const activeConfig = current.configs[current.activeProviderId];
      const providerInfo = AI_PROVIDERS_REGISTRY[current.activeProviderId as AIProviderId];
      const isKnownModel = providerInfo?.recommendedModels.some(
        (m) => m.id === activeConfig?.model
      );
      setIsCustomModel(!isKnownModel);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const currentProviderInfo: AIProviderInfo | undefined =
    AI_PROVIDERS_REGISTRY[selectedProviderId as AIProviderId];
  const currentConfig: AIProviderConfig = settings.configs[selectedProviderId] || {
    id: selectedProviderId,
    name: selectedProviderId,
    apiKey: '',
    model: '',
    baseUrl: '',
    temperature: 0.2,
  };
  const isActive = settings.activeProviderId === selectedProviderId;

  const toggleShowApiKey = (id: string) => {
    setShowApiKeyMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUpdateKey = (id: string, newKey: string) => {
    setSettings((prev) => ({
      ...prev,
      configs: {
        ...prev.configs,
        [id]: {
          ...prev.configs[id],
          apiKey: newKey,
        },
      },
    }));
  };

  const handleSaveSingleKey = (id: string) => {
    const key = settings.configs[id]?.apiKey || '';
    const updated = updateApiKeyManually(id, key);
    setSettings(updated);
    setSavedKeyId(id);
    setTimeout(() => setSavedKeyId(null), 2500);
    if (settings.activeProviderId === id && onProviderChanged) {
      onProviderChanged(updated.configs[id]);
    }
  };

  const handlePasteClipboard = async (id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          handleUpdateKey(id, text.trim());
        }
      }
    } catch {
      // Ignorer si refus d'autorisation
    }
  };

  const handleSelectProvider = (id: string) => {
    setSelectedProviderId(id);
    const config = settings.configs[id];
    const info = AI_PROVIDERS_REGISTRY[id as AIProviderId];
    const isKnown = info?.recommendedModels.some((m) => m.id === config?.model);
    setIsCustomModel(!isKnown);
  };

  const handleUpdateCurrentConfig = (updates: Partial<AIProviderConfig>) => {
    setSettings((prev) => ({
      ...prev,
      configs: {
        ...prev.configs,
        [selectedProviderId]: {
          ...prev.configs[selectedProviderId],
          ...updates,
        },
      },
    }));
  };

  const handleSetActive = (id: string) => {
    const updated: AIProviderSettings = {
      ...settings,
      activeProviderId: id,
    };
    setSettings(updated);
    saveAIProviderSettings(updated);
    if (onProviderChanged) {
      onProviderChanged(updated.configs[id]);
    }
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3000);
  };

  const handleSaveAll = () => {
    saveAIProviderSettings(settings);
    if (onProviderChanged) {
      onProviderChanged(settings.configs[settings.activeProviderId]);
    }
    setSaveSuccessMsg(true);
    setTimeout(() => setSaveSuccessMsg(false), 3000);
  };

  const handleTestConnectionForProvider = async (config: AIProviderConfig) => {
    const id = config.id;
    setIsTestingMap((prev) => ({ ...prev, [id]: true }));
    try {
      const res = await testAIProviderConnection(config);
      setTestResultMap((prev) => ({ ...prev, [id]: res }));
    } catch (err: any) {
      setTestResultMap((prev) => ({
        ...prev,
        [id]: {
          success: false,
          message: err.message || 'Erreur inconnue lors du test',
        },
      }));
    } finally {
      setIsTestingMap((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleAddCustomProviderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) {
      setCustomError('Veuillez saisir un nom pour ce fournisseur.');
      return;
    }
    try {
      const newProv = addCustomProvider({
        name: customName,
        apiKey: customApiKey,
        baseUrl: customBaseUrl,
        model: customModel,
        apiFormat: customApiFormat,
      });
      const updated = loadAIProviderSettings();
      setSettings(updated);
      setCustomName('');
      setCustomApiKey('');
      setCustomError(null);
      setActiveTab('keys');
      setSavedKeyId(newProv.id);
      setTimeout(() => setSavedKeyId(null), 2500);
    } catch (err: any) {
      setCustomError(err.message || "Erreur lors de l'ajout du fournisseur.");
    }
  };

  const handleDeleteCustomProvider = (id: string) => {
    const updated = deleteCustomProvider(id);
    setSettings(updated);
  };

  // Liste de tous les providers natifs
  const nativeProviderIds = Object.keys(AI_PROVIDERS_REGISTRY) as AIProviderId[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* En-tête du Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Key className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Gestionnaire des Clés d'API & Moteurs IA
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Multi-Providers
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Ajoutez manuellement vos clés d'API (Gemini, OpenAI, Claude, Groq, DeepSeek, Mistral, OpenRouter, Ollama) pour tester différents moteurs.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre d'onglets de navigation du modal */}
        <div className="flex items-center justify-between px-6 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('keys')}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
                activeTab === 'keys'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Saisie manuelle des clés API</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">
                {nativeProviderIds.length + (settings.customProviders?.length || 0)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
                activeTab === 'custom'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ajouter une clé / endpoint personnalisé</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('detailed')}
              className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
                activeTab === 'detailed'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Configuration avancée & Modèles</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>Moteur actif :</span>
            <strong className="text-slate-800">
              {settings.configs[settings.activeProviderId]?.name || settings.activeProviderId}
            </strong>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ONGLET 1 : SAISIE MANUELLE DES CLÉS API (VUE LISTE & TEST RAPIDE) */}
        {/* ========================================================================= */}
        {activeTab === 'keys' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-slate-50/40">
            {/* Bannière explicative */}
            <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-indigo-950">
              <div className="flex items-start sm:items-center gap-2.5">
                <Key className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  Saisissez ou collez manuellement vos clés d'API ci-dessous. Vous pouvez tester la validité de chaque clé instantanément et basculer de moteur en un clic.
                </span>
              </div>
              <button
                type="button"
                onClick={handleSaveAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Tout enregistrer</span>
              </button>
            </div>

            {saveSuccessMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-900 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Toutes les clés ont été enregistrées avec succès dans votre navigateur !</span>
              </div>
            )}

            {/* Liste des providers avec saisie de clé manuelle */}
            <div className="space-y-3">
              {nativeProviderIds.map((pid) => {
                const info = AI_PROVIDERS_REGISTRY[pid];
                const config = settings.configs[pid] || {
                  id: pid,
                  name: info.name,
                  apiKey: '',
                  model: info.recommendedModels[0]?.id || '',
                  baseUrl: info.defaultBaseUrl || '',
                  temperature: 0.2,
                };
                const isCurrentActive = settings.activeProviderId === pid;
                const isTesting = isTestingMap[pid] || false;
                const testResult = testResultMap[pid];
                const isSaved = savedKeyId === pid;
                const hasKey = Boolean(config.apiKey && config.apiKey.trim());

                if (!info.supportsApiKey) {
                  return (
                    <div
                      key={pid}
                      className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">{info.name}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
                            Sans clé requise
                          </span>
                          {isCurrentActive && (
                            <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Actif
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">{info.tagline}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTestConnectionForProvider(config)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
                        >
                          Tester
                        </button>
                        {!isCurrentActive ? (
                          <button
                            type="button"
                            onClick={() => handleSetActive(pid)}
                            className="px-3 py-1 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                          >
                            Activer
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                            Moteur actif
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={pid}
                    className={`p-4 rounded-xl border transition-all ${
                      isCurrentActive
                        ? 'bg-white border-indigo-300 shadow-xs ring-1 ring-indigo-200'
                        : 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900">{info.name}</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          ({config.model || info.recommendedModels[0]?.id})
                        </span>
                        {isCurrentActive ? (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Moteur actif
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Inactif</span>
                        )}
                        {hasKey ? (
                          <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            Clé configurée (••••{config.apiKey.slice(-4)})
                          </span>
                        ) : pid === 'google' ? (
                          <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                            Clé serveur par défaut active
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            Non renseignée
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {info.docsUrl && (
                          <a
                            href={info.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                          >
                            <span>Obtenir une clé</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Ligne de saisie de la clé */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
                      <div className="lg:col-span-8 relative">
                        <input
                          type={showApiKeyMap[pid] ? 'text' : 'password'}
                          value={config.apiKey || ''}
                          onChange={(e) => handleUpdateKey(pid, e.target.value)}
                          placeholder={info.apiKeyPlaceholder || 'Entrez votre clé API...'}
                          className="w-full text-xs font-mono pl-3 pr-24 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handlePasteClipboard(pid)}
                            className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 px-1.5 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 flex items-center gap-0.5"
                            title="Coller depuis le presse-papier"
                          >
                            <ClipboardPaste className="w-3 h-3" />
                            <span>Coller</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleShowApiKey(pid)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded"
                            title={showApiKeyMap[pid] ? 'Masquer' : 'Afficher'}
                          >
                            {showApiKeyMap[pid] ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Boutons d'action rapides */}
                      <div className="lg:col-span-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleSaveSingleKey(pid)}
                          className={`flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                            isSaved
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                          }`}
                        >
                          {isSaved ? <Check className="w-3.5 h-3.5" /> : null}
                          <span>{isSaved ? 'Enregistrée !' : 'Enregistrer'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isTesting}
                          onClick={() => handleTestConnectionForProvider(config)}
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors"
                          title="Tester la clé et le modèle"
                        >
                          <Activity className={`w-3.5 h-3.5 text-indigo-600 ${isTesting ? 'animate-spin' : ''}`} />
                          <span>{isTesting ? 'Test...' : 'Tester'}</span>
                        </button>

                        {!isCurrentActive ? (
                          <button
                            type="button"
                            onClick={() => handleSetActive(pid)}
                            className="inline-flex items-center justify-center px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors"
                            title="Activer ce moteur"
                          >
                            Activer
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Résultat du test */}
                    {testResult && (
                      <div
                        className={`mt-2.5 p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 animate-in fade-in ${
                          testResult.success
                            ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                            : 'bg-rose-50 text-rose-950 border-rose-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          {testResult.success ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                          )}
                          <span className="truncate">{testResult.message}</span>
                        </div>
                        {testResult.latencyMs && (
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/90 border border-slate-200 shrink-0">
                            {testResult.latencyMs} ms
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Fournisseurs personnalisés ajoutés manuellement par l'utilisateur */}
              {settings.customProviders && settings.customProviders.length > 0 && (
                <div className="pt-2 space-y-3">
                  <div className="px-1 text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Vos Fournisseurs Personnalisés ({settings.customProviders.length})</span>
                  </div>

                  {settings.customProviders.map((cp) => {
                    const isCurrentActive = settings.activeProviderId === cp.id;
                    const config = settings.configs[cp.id] || {
                      id: cp.id,
                      name: cp.name,
                      apiKey: cp.apiKey,
                      baseUrl: cp.baseUrl,
                      model: cp.model,
                      temperature: cp.temperature,
                    };
                    const isTesting = isTestingMap[cp.id] || false;
                    const testResult = testResultMap[cp.id];
                    const isSaved = savedKeyId === cp.id;

                    return (
                      <div
                        key={cp.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isCurrentActive
                            ? 'bg-white border-indigo-300 shadow-xs ring-1 ring-indigo-200'
                            : 'bg-white border-slate-200 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-900">{cp.name}</span>
                            <span className="text-[11px] font-mono text-slate-500">({cp.model})</span>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                              {cp.baseUrl}
                            </span>
                            {cp.apiFormat === 'anthropic' ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200">
                                Anthropic Messages
                              </span>
                            ) : cp.apiFormat === 'direct' ? (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                URL Directe
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                                OpenAI /chat
                              </span>
                            )}
                            {isCurrentActive && (
                              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Actif
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteCustomProvider(cp.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                            title="Supprimer ce fournisseur"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
                          <div className="lg:col-span-8 relative">
                            <input
                              type={showApiKeyMap[cp.id] ? 'text' : 'password'}
                              value={config.apiKey || ''}
                              onChange={(e) => handleUpdateKey(cp.id, e.target.value)}
                              placeholder="Clé API..."
                              className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>

                          <div className="lg:col-span-4 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveSingleKey(cp.id)}
                              className={`flex-1 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                                isSaved
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                              }`}
                            >
                              {isSaved ? 'Enregistrée !' : 'Enregistrer'}
                            </button>

                            <button
                              type="button"
                              disabled={isTesting}
                              onClick={() => handleTestConnectionForProvider(config)}
                              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors"
                            >
                              {isTesting ? 'Test...' : 'Tester'}
                            </button>

                            {!isCurrentActive ? (
                              <button
                                type="button"
                                onClick={() => handleSetActive(cp.id)}
                                className="px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors"
                              >
                                Activer
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {testResult && (
                          <div
                            className={`mt-2 p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 animate-in fade-in ${
                              testResult.success
                                ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                                : 'bg-rose-50 text-rose-950 border-rose-200'
                            }`}
                          >
                            <span>{testResult.message}</span>
                            {testResult.latencyMs && (
                              <span className="font-mono text-[10px] font-bold">
                                {testResult.latencyMs} ms
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 2 : AJOUTER MANUELLEMENT UN FOURNISSEUR / ENDPOINT */}
        {/* ========================================================================= */}
        {activeTab === 'custom' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-white">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Ajouter un nouveau moteur ou endpoint d'IA personnalisé</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Connectez un serveur CommandCode AI (format Anthropic Messages), un serveur local (Ollama, LM Studio), ou un proxy d'entreprise.
              </p>
            </div>

            {/* Préréglages rapides en un clic */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Préréglages rapides recommandés :
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyCustomPreset('commandcode')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border flex items-center gap-1.5 ${
                    customApiFormat === 'anthropic' && customBaseUrl.includes('commandcode')
                      ? 'bg-violet-100 text-violet-900 border-violet-300 ring-1 ring-violet-300'
                      : 'bg-white text-slate-700 hover:bg-violet-50 hover:text-violet-900 border-slate-300'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-violet-600" />
                  <span>CommandCode AI (glm-5.3-flash · Format Anthropic)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applyCustomPreset('ollama')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors"
                >
                  Ollama Local (http://localhost:11434/v1)
                </button>

                <button
                  type="button"
                  onClick={() => applyCustomPreset('openai')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors"
                >
                  OpenAI / vLLM (/chat/completions)
                </button>
              </div>
            </div>

            {customError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-950">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{customError}</span>
              </div>
            )}

            <form onSubmit={handleAddCustomProviderSubmit} className="space-y-4 max-w-2xl">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Nom du fournisseur / Libellé
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Ex: CommandCode AI, Mon Ollama Local, Azure OpenAI..."
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              {/* Sélection du format & protocole d'API */}
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  Format & Protocole d'API (Endpoint)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between gap-1.5 ${
                      customApiFormat === 'anthropic'
                        ? 'bg-violet-50/80 border-violet-400 ring-1 ring-violet-300 text-violet-950'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="customApiFormat"
                        checked={customApiFormat === 'anthropic'}
                        onChange={() => setCustomApiFormat('anthropic')}
                        className="text-violet-600 focus:ring-violet-500"
                      />
                      <span className="font-bold">Anthropic Messages</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Requis pour <strong>CommandCode AI (glm-5.3-flash)</strong>. Appelle l'endpoint Messages sans suffixe <code>/chat/completions</code>.
                    </span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between gap-1.5 ${
                      customApiFormat === 'openai'
                        ? 'bg-emerald-50/80 border-emerald-400 ring-1 ring-emerald-300 text-emerald-950'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="customApiFormat"
                        checked={customApiFormat === 'openai'}
                        onChange={() => setCustomApiFormat('openai')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-bold">OpenAI Completions</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Format standard <code>/chat/completions</code> (Ollama, LM Studio, vLLM, DeepSeek, etc.).
                    </span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between gap-1.5 ${
                      customApiFormat === 'direct'
                        ? 'bg-slate-100 border-slate-400 ring-1 ring-slate-300 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="customApiFormat"
                        checked={customApiFormat === 'direct'}
                        onChange={() => setCustomApiFormat('direct')}
                        className="text-slate-600 focus:ring-slate-500"
                      />
                      <span className="font-bold">URL Directe</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Appelle l'URL exacte saisie telle quelle sans y ajouter de suffixe automatique.
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Clé API (Optionnelle selon le serveur)
                </label>
                <input
                  type="password"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="sk-... ou token Bearer"
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  URL de base (Endpoint)
                </label>
                <input
                  type="text"
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="https://commandcode.ai ou http://localhost:11434/v1"
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-slate-700">Endpoint effectif interrogé :</span>
                    <code className="text-indigo-700 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                      {customApiFormat === 'anthropic'
                        ? customBaseUrl.trim().endsWith('/messages')
                          ? customBaseUrl.trim()
                          : `${customBaseUrl.trim().replace(/\/+$/, '')}/messages`
                        : customApiFormat === 'openai'
                        ? customBaseUrl.trim().endsWith('/chat/completions')
                          ? customBaseUrl.trim()
                          : `${customBaseUrl.trim().replace(/\/+$/, '')}/chat/completions`
                        : customBaseUrl.trim()}
                    </code>
                  </div>
                  {customApiFormat === 'anthropic' && (
                    <p className="text-[10px] text-violet-700 font-medium">
                      ✓ Format Anthropic Messages : En-têtes <code>x-api-key</code>, <code>Authorization: Bearer</code> et <code>anthropic-version</code> inclus. Aucun suffixe <code>/chat/completions</code> ajouté.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">
                  Nom exact du modèle
                </label>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="Ex: glm-5.3-flash, claude-3-5-sonnet, llama3..."
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                {customModel.toLowerCase().includes('glm-5') && customApiFormat !== 'anthropic' && (
                  <p className="text-[11px] text-amber-700 font-medium mt-1">
                    ⚠️ Note : Le modèle « {customModel} » requiert le format Anthropic Messages pour fonctionner sur CommandCode AI (une erreur 400 est retournée sur /chat/completions).
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter et enregistrer ce moteur</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 3 : CONFIGURATION DÉTAILLÉE PAR MOTEUR (MODÈLES & TEMPÉRATURE) */}
        {/* ========================================================================= */}
        {activeTab === 'detailed' && (
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[460px]">
            {/* Colonne Gauche : Liste des fournisseurs */}
            <div className="md:col-span-4 border-r border-slate-200 bg-slate-50/50 p-3 overflow-y-auto space-y-1.5">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Sélectionner un moteur
              </div>

              {nativeProviderIds.map((pid) => {
                const info = AI_PROVIDERS_REGISTRY[pid];
                const isSelected = selectedProviderId === pid;
                const isCurrentActive = settings.activeProviderId === pid;

                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => handleSelectProvider(pid)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-2.5 ${
                      isSelected
                        ? 'bg-white border-indigo-400 shadow-xs ring-1 ring-indigo-200'
                        : 'bg-white/60 border-slate-200/80 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {info.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 truncate block mt-0.5">
                        {settings.configs[pid]?.model || info.recommendedModels[0]?.id}
                      </span>
                    </div>

                    {isCurrentActive && (
                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                        Actif
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Colonne Droite : Formulaire détaillé du provider sélectionné */}
            <div className="md:col-span-8 p-5 sm:p-6 overflow-y-auto space-y-5 bg-white">
              {currentProviderInfo ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900">
                          {currentProviderInfo.name}
                        </h3>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Moteur actif
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">{currentProviderInfo.tagline}</p>
                    </div>

                    {!isActive ? (
                      <button
                        type="button"
                        onClick={() => handleSetActive(selectedProviderId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors shrink-0"
                      >
                        <Zap className="w-3.5 h-3.5 text-amber-300" />
                        <span>Définir comme moteur actif</span>
                      </button>
                    ) : null}
                  </div>

                  {/* Formulaire détaillé */}
                  <div className="space-y-4">
                    {/* Clé API */}
                    {currentProviderInfo.supportsApiKey && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-800 block">
                          Clé API ({currentProviderInfo.shortName})
                        </label>
                        <input
                          type="password"
                          value={currentConfig.apiKey || ''}
                          onChange={(e) => handleUpdateCurrentConfig({ apiKey: e.target.value })}
                          placeholder={currentProviderInfo.apiKeyPlaceholder}
                          className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    )}

                    {/* Sélection du modèle */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Modèle d'IA</span>
                        </label>
                        {currentProviderInfo.recommendedModels.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setIsCustomModel(!isCustomModel)}
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            {isCustomModel ? 'Modèles recommandés' : 'Autre nom de modèle'}
                          </button>
                        )}
                      </div>

                      {!isCustomModel && currentProviderInfo.recommendedModels.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2">
                          {currentProviderInfo.recommendedModels.map((m) => {
                            const isChosen = currentConfig.model === m.id;
                            return (
                              <label
                                key={m.id}
                                className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-start justify-between gap-2 transition-all ${
                                  isChosen
                                    ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-200'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-start gap-2">
                                  <input
                                    type="radio"
                                    name={`model_${selectedProviderId}`}
                                    checked={isChosen}
                                    onChange={() => handleUpdateCurrentConfig({ model: m.id })}
                                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-slate-900">{m.label}</span>
                                      {m.isDefault && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800">
                                          Défaut
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-slate-500 block mt-0.5">
                                      {m.desc}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                  {m.id}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={currentConfig.model || ''}
                          onChange={(e) => handleUpdateCurrentConfig({ model: e.target.value })}
                          placeholder="Nom exact du modèle..."
                          className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      )}
                    </div>

                    {/* Base URL & Format */}
                    {currentProviderInfo.isCustomUrlSupported && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-indigo-600" />
                            <span>URL Endpoint (Base URL)</span>
                          </label>
                          <input
                            type="text"
                            value={currentConfig.baseUrl || ''}
                            onChange={(e) => handleUpdateCurrentConfig({ baseUrl: e.target.value })}
                            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        {/* Format & Protocole d'API */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Format & Protocole d'API</span>
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateCurrentConfig({ apiFormat: 'anthropic' })}
                              className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                                (currentConfig.apiFormat || currentProviderInfo.apiFormat) === 'anthropic'
                                  ? 'bg-violet-50 border-violet-400 text-violet-950 ring-1 ring-violet-300'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <div className="font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-violet-600" />
                                <span>Anthropic Messages</span>
                              </div>
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                Format <code>/messages</code> (CommandCode, glm-5.3-flash, Claude)
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleUpdateCurrentConfig({ apiFormat: 'openai' })}
                              className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                                (currentConfig.apiFormat || currentProviderInfo.apiFormat) === 'openai'
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 ring-1 ring-emerald-300'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <div className="font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                                <span>OpenAI Completions</span>
                              </div>
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                Format <code>/chat/completions</code> standard
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleUpdateCurrentConfig({ apiFormat: 'direct' })}
                              className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                                (currentConfig.apiFormat || currentProviderInfo.apiFormat) === 'direct'
                                  ? 'bg-slate-100 border-slate-400 text-slate-950 ring-1 ring-slate-300'
                                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                              }`}
                            >
                              <div className="font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-slate-500" />
                                <span>URL Directe</span>
                              </div>
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                Appel direct sans suffixe ajouté
                              </span>
                            </button>
                          </div>

                          <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-700">Endpoint effectif interrogé :</span>
                            <code className="text-indigo-700 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                              {((currentConfig.apiFormat || currentProviderInfo.apiFormat) === 'anthropic')
                                ? (currentConfig.baseUrl || '').trim().endsWith('/messages')
                                  ? currentConfig.baseUrl
                                  : `${(currentConfig.baseUrl || '').trim().replace(/\/+$/, '')}/messages`
                                : ((currentConfig.apiFormat || currentProviderInfo.apiFormat) === 'direct')
                                ? currentConfig.baseUrl
                                : (currentConfig.baseUrl || '').trim().endsWith('/chat/completions')
                                ? currentConfig.baseUrl
                                : `${(currentConfig.baseUrl || '').trim().replace(/\/+$/, '')}/chat/completions`}
                            </code>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Température */}
                    {selectedProviderId !== 'heuristic' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-bold text-slate-800 flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Température : {currentConfig.temperature ?? 0.2}</span>
                          </label>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={currentConfig.temperature ?? 0.2}
                          onChange={(e) =>
                            handleUpdateCurrentConfig({ temperature: parseFloat(e.target.value) })
                          }
                          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                      </div>
                    )}

                    <div className="pt-2 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={handleSaveAll}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Enregistrer les paramètres</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* Pied de modal avec rappel de sécurité */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Vos clés d'API sont stockées localement dans votre navigateur et transitent par le proxy interne du serveur sans être exposées publiquement.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors shrink-0"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
