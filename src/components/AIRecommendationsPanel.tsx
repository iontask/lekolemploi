/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Ban,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Zap,
  Info,
  Cpu,
  Settings,
  Key,
} from 'lucide-react';
import { ImportDataset } from '../types';
import { Planning, RulesOptions } from '../rules/types';
import {
  AIRecommendation,
  AIRecommendationResult,
  extractUnplacedUnitsDetails,
  getAIConstraintRecommendations,
  UnplacedUnitDetail,
} from '../services/aiRecommendations';
import { AIProviderConfig, AIProviderId } from '../types/aiProvider';
import {
  AI_PROVIDERS_REGISTRY,
  loadAIProviderSettings,
  setActiveAIProvider,
} from '../services/aiProviderService';

interface AIRecommendationsPanelProps {
  dataset: ImportDataset;
  planning: Planning;
  currentConstraints: RulesOptions;
  onApplyPatchAndRelaunch: (patch: Partial<RulesOptions>) => void;
  diagnosticReports?: string[];
  isSolving?: boolean;
  onOpenAIProviderModal?: () => void;
}

export const AIRecommendationsPanel: React.FC<AIRecommendationsPanelProps> = ({
  dataset,
  planning,
  currentConstraints,
  onApplyPatchAndRelaunch,
  diagnosticReports = [],
  isSolving = false,
  onOpenAIProviderModal,
}) => {
  const analysis = React.useMemo(
    () => extractUnplacedUnitsDetails(dataset, planning),
    [dataset, planning]
  );

  const [providerSettings, setProviderSettings] = useState(loadAIProviderSettings);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [aiResult, setAiResult] = useState<AIRecommendationResult | null>(null);
  const [selectedRecIds, setSelectedRecIds] = useState<string[]>([]);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  // Écoute des mises à jour des providers IA
  useEffect(() => {
    const handleSettingsChanged = (e: any) => {
      if (e.detail) {
        setProviderSettings(e.detail);
      }
    };
    window.addEventListener('ai_provider_settings_changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('ai_provider_settings_changed', handleSettingsChanged);
    };
  }, []);

  const activeProviderConfig: AIProviderConfig =
    providerSettings.configs[providerSettings.activeProviderId] ||
    providerSettings.configs.google;

  // Charger automatiquement les recommandations IA si des unités ne sont pas placées
  useEffect(() => {
    if (analysis.unplacedDetails.length > 0) {
      loadRecommendations();
    } else {
      setAiResult(null);
    }
  }, [analysis.unplacedDetails.length, currentConstraints]);

  const loadRecommendations = async (overrideConfig?: AIProviderConfig) => {
    setIsLoadingAI(true);
    const targetConfig = overrideConfig || activeProviderConfig;
    try {
      const result = await getAIConstraintRecommendations({
        dataset,
        planning,
        currentConstraints,
        diagnosticReports,
        providerConfig: targetConfig,
      });
      setAiResult(result);
      // Sélectionner par défaut toutes les recommandations proposées pour un succès à 100%
      setSelectedRecIds(result.recommendations.map((r) => r.id));
    } catch (e) {
      console.error('Erreur chargement recommandations IA:', e);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const handleSwitchProvider = (newId: AIProviderId) => {
    setActiveAIProvider(newId);
    const updated = loadAIProviderSettings();
    setProviderSettings(updated);
    loadRecommendations(updated.configs[newId]);
  };

  const toggleSelectRec = (id: string) => {
    if (selectedRecIds.includes(id)) {
      setSelectedRecIds(selectedRecIds.filter((item) => item !== id));
    } else {
      setSelectedRecIds([...selectedRecIds, id]);
    }
  };

  const handleApplySingleRec = (rec: AIRecommendation) => {
    onApplyPatchAndRelaunch(rec.patch);
  };

  const handleApplySelectedRecs = () => {
    if (!aiResult || selectedRecIds.length === 0) return;
    const selected = aiResult.recommendations.filter((r) => selectedRecIds.includes(r.id));
    // Fusionner tous les patchs sélectionnés
    const mergedPatch: Partial<RulesOptions> = {};
    for (const rec of selected) {
      Object.assign(mergedPatch, rec.patch);
      if (rec.patch.maxHeuresParJourParMatiere) {
        mergedPatch.maxHeuresParJourParMatiere = {
          ...(mergedPatch.maxHeuresParJourParMatiere || currentConstraints.maxHeuresParJourParMatiere || {}),
          ...rec.patch.maxHeuresParJourParMatiere,
        };
      }
    }
    onApplyPatchAndRelaunch(mergedPatch);
  };

  // Si tout est à 100%, afficher un bandeau de félicitations
  if (analysis.unplacedDetails.length === 0) {
    return (
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-emerald-950 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <span className="text-xs font-bold block">Taux d'insertion : 100 % (Optimal)</span>
            <span className="text-[11px] text-emerald-800">
              Toutes les {analysis.totalRequiredHours} heures de toutes les matières ont été affectées avec succès sans aucune heure manquante.
            </span>
          </div>
        </div>
        <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-300">
          100% OK
        </span>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-slate-50 border border-indigo-200/90 rounded-2xl p-5 shadow-xs space-y-4">
      {/* En-tête : Taux d'insertion & alerte */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-100 pb-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-2xs shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">
                Phase de recommandation IA pour 100 % d'affectation
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                <AlertTriangle className="w-3 h-3 text-amber-700" />
                {analysis.missingHours} h non affectée(s)
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              L'IA Gemini analyse les conflits d'horaires et propose des assouplissements ciblés de contraintes pour atteindre 100 % d'insertion.
            </p>
          </div>
        </div>

        {/* Jauge visuelle de taux d'insertion */}
        <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-xl border border-indigo-100 shadow-2xs shrink-0">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
              Taux d'insertion
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-base font-extrabold font-mono ${analysis.insertionRate >= 90 ? 'text-amber-600' : 'text-rose-600'}`}>
                {analysis.insertionRate}%
              </span>
              <span className="text-[11px] text-slate-500">
                ({analysis.placedHours}h / {analysis.totalRequiredHours}h)
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={isLoadingAI || isSolving}
            onClick={() => loadRecommendations()}
            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
            title="Recalculer les recommandations IA"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAI ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Barre de sélection rapide du Fournisseur d'IA & Moteur actif */}
      <div className="bg-white/80 p-3 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-indigo-600" />
            Moteur IA :
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={providerSettings.activeProviderId}
              onChange={(e) => handleSwitchProvider(e.target.value as AIProviderId)}
              className="text-xs font-semibold px-2.5 py-1 bg-white border border-indigo-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
            >
              {(Object.keys(AI_PROVIDERS_REGISTRY) as AIProviderId[]).map((pid) => {
                const info = AI_PROVIDERS_REGISTRY[pid];
                const cfg = providerSettings.configs[pid];
                return (
                  <option key={pid} value={pid}>
                    {info.name} ({cfg?.model || info.recommendedModels[0]?.id})
                  </option>
                );
              })}
              {providerSettings.customProviders?.map((cp) => (
                <option key={cp.id} value={cp.id}>
                  {cp.name} ({cp.model})
                </option>
              ))}
            </select>

            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {activeProviderConfig.model}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenAIProviderModal && (
            <button
              type="button"
              onClick={onOpenAIProviderModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors"
              title="Ajouter manuellement vos clés d'API (Gemini, OpenAI, Claude, Groq, DeepSeek, Mistral, Ollama...)"
            >
              <Key className="w-3.5 h-3.5 text-indigo-600" />
              <span>Clés d'API & Moteurs</span>
            </button>
          )}

          <button
            type="button"
            disabled={isLoadingAI || isSolving}
            onClick={() => loadRecommendations()}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors"
            title="Relancer l'analyse avec le moteur actuel"
          >
            <RefreshCw className={`w-3 h-3 ${isLoadingAI ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Tester / Réanalyser</span>
          </button>
        </div>
      </div>

      {/* Résumé des matières non affectées */}
      <div className="bg-white/90 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-indigo-600" />
            Matières incomplètes ({analysis.unplacedDetails.length} unité(s)) :
          </span>
          <button
            type="button"
            onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
            className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <span>{isDetailsExpanded ? 'Masquer le détail' : 'Voir le détail des contraintes'}</span>
            {isDetailsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {analysis.unplacedDetails.map((u) => (
            <div
              key={u.uniteId}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-xs"
            >
              <span className="font-bold text-rose-950">{u.matiere}</span>
              <span className="text-rose-700 text-[11px] font-medium">{u.classesNoms}</span>
              <span className="font-mono font-bold text-rose-900 bg-white px-1.5 py-0.5 rounded border border-rose-200 text-[10px]">
                {u.heuresPlacees}/{u.heuresRequises}h (-{u.heuresManquantes}h)
              </span>
            </div>
          ))}
        </div>

        {isDetailsExpanded && (
          <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-600">
            {analysis.unplacedDetails.map((u) => (
              <div key={u.uniteId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2 bg-slate-50 rounded-lg">
                <div>
                  <strong className="text-slate-900 font-semibold">{u.matiere}</strong> ({u.classesNoms}) — Enseignant : {u.profNom}
                </div>
                <div className="text-slate-500 font-mono text-[10px]">
                  Dispo prof : {u.dispoSlotsCount} créneaux sur {u.dispoDaysCount} jours ({u.joursDispoDetails})
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommandations IA */}
      {isLoadingAI ? (
        <div className="py-8 text-center bg-white/70 rounded-xl border border-indigo-100 space-y-2">
          <Sparkles className="w-6 h-6 text-indigo-600 mx-auto animate-pulse" />
          <p className="text-xs font-semibold text-slate-700">
            Analyse des contraintes et génération des recommandations IA en cours...
          </p>
          <p className="text-[11px] text-slate-500">
            Recherche de la combinaison optimale de relâchement pour atteindre 100 % d'insertion.
          </p>
        </div>
      ) : aiResult ? (
        <div className="space-y-3">
          {/* Synthèse globale IA */}
          <div className="p-3.5 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs text-indigo-950 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-indigo-900">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Diagnostic et stratégie de résolution IA :</span>
            </div>
            <p className="text-slate-700 leading-relaxed">{aiResult.summary}</p>
          </div>

          {/* Métadonnées du moteur d'analyse IA utilisé */}
          {aiResult.engineMetadata && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white/80 rounded-lg border border-indigo-100 text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                <span>
                  Généré par <strong>{aiResult.engineMetadata.providerName}</strong> ({aiResult.engineMetadata.model})
                </span>
                {aiResult.engineMetadata.isFallback && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                    Bascule heuristique
                  </span>
                )}
              </div>
              <span className="font-mono text-slate-400 text-[10px]">
                {aiResult.engineMetadata.latencyMs} ms
              </span>
            </div>
          )}

          {/* Liste des recommandations concrètes */}
          <div className="space-y-2.5">
            {aiResult.recommendations.map((rec) => {
              const isSelected = selectedRecIds.includes(rec.id);

              return (
                <div
                  key={rec.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-white border-indigo-300 shadow-2xs ring-1 ring-indigo-200'
                      : 'bg-white/70 border-slate-200 opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRec(rec.id)}
                        className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer shrink-0"
                      />
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                              rec.category === 'BLOCKS'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : rec.category === 'DAILY_LIMIT'
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : rec.category === 'FORBIDDEN_SLOTS'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : rec.category === 'RELAXED_MODE'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {rec.category === 'BLOCKS'
                              ? 'Blocs & Découpage'
                              : rec.category === 'DAILY_LIMIT'
                              ? 'Plafond journalier'
                              : rec.category === 'FORBIDDEN_SLOTS'
                              ? 'Plages interdites'
                              : rec.category === 'RELAXED_MODE'
                              ? 'Mode relâché'
                              : 'Pause méridienne'}
                          </span>

                          <span className="text-xs font-bold text-slate-900">
                            {rec.title}
                          </span>

                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            +{rec.impactHours}h potentielles
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                          {rec.reasoning}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isSolving}
                      onClick={() => handleApplySingleRec(rec)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors shrink-0 self-end sm:self-auto"
                      title="Appliquer uniquement cette recommandation et relancer"
                    >
                      <Zap className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Appliquer seule</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bouton d'action massive pour atteindre 100% */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-indigo-200 shadow-2xs">
            <div className="text-xs text-slate-700">
              <strong className="text-slate-900">{selectedRecIds.length}</strong> recommandation(s) sélectionnée(s) sur {aiResult.recommendations.length}
            </div>

            <button
              type="button"
              disabled={selectedRecIds.length === 0 || isSolving}
              onClick={handleApplySelectedRecs}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>Appliquer les recommandations sélectionnées & Relancer pour 100%</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
