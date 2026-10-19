/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Play,
  StopCircle,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ScrollText,
  Copy,
  Check,
  Search,
  Filter,
  ArrowRight,
  Zap,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Info,
} from 'lucide-react';
import { ImportDataset } from '../types';
import { Planning } from '../rules/types';
import {
  DEFAULT_SOLVER_CONFIG,
  GenerationBottleneck,
  GenerationLogEntry,
  LogSeverity,
  SolverConfig,
  SolverProgress,
  SolverResult,
} from '../solver/types';
import { SolverClient } from '../solver/solverClient';
import { runInstantDiagnostics } from '../utils/infeasibilityDiagnostic';
import { AIRecommendationsPanel } from './AIRecommendationsPanel';
import { analyzeScheduleExceptions } from '../utils/scheduleExceptions';
import { getSubjectAbbreviation, getSubjectMeta } from '../utils/subjectFormatters';

interface GenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: ImportDataset;
  onApplyPlanning: (planning: Planning, result: SolverResult, appliedConfig?: SolverConfig) => void;
  lockedAssignments?: import('../rules/types').Affectation[];
  initialKeepLocked?: boolean;
  initialRelaxedMode?: boolean;
  initialDisabledOverages?: string[];
  initialInterdireTousDepassements?: boolean;
  onOpenAIProviderModal?: () => void;
}

export const GenerationModal: React.FC<GenerationModalProps> = ({
  isOpen,
  onClose,
  dataset,
  onApplyPlanning,
  lockedAssignments = [],
  initialKeepLocked = true,
  initialRelaxedMode = false,
  initialDisabledOverages,
  initialInterdireTousDepassements,
  onOpenAIProviderModal,
}) => {
  const [config, setConfig] = useState<SolverConfig>(() => ({
    ...DEFAULT_SOLVER_CONFIG,
    ...(dataset.constraints || {}),
    relaxedMode: initialRelaxedMode,
    disabledOverages: initialDisabledOverages ?? dataset.constraints?.disabledOverages ?? [],
    interdireTousDepassements: initialInterdireTousDepassements ?? dataset.constraints?.interdireTousDepassements ?? false,
  }));
  const [solverClient] = useState<SolverClient>(() => new SolverClient());
  const [isSolving, setIsSolving] = useState(false);
  const [keepLocked, setKeepLocked] = useState(initialKeepLocked);
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Vue onglets : 'recommendations' | 'logs'
  const [activeTab, setActiveTab] = useState<'recommendations' | 'logs'>('recommendations');

  // Logs en direct et filtres
  const [liveLogs, setLiveLogs] = useState<GenerationLogEntry[]>([]);
  const [logFilterSeverity, setLogFilterSeverity] = useState<string>('ALL');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [showOveragesList, setShowOveragesList] = useState(false);

  const detectedOverages = useMemo(() => {
    if (!dataset.planning || dataset.planning.length === 0) return [];
    return analyzeScheduleExceptions(dataset, dataset.planning).exces2hJour;
  }, [dataset]);

  // Basculer automatiquement sur l'onglet Journal si l'utilisateur le souhaite ou si des goulots sont présents
  useEffect(() => {
    if (result && result.bottlenecks && result.bottlenecks.length > 0 && result.planning.length < totalRequiredHours) {
      // Si des matières ne sont pas affectées, laisser les onglets accessibles
    }
  }, [result]);

  useEffect(() => {
    if (isOpen) {
      setConfig((prev) => ({
        ...prev,
        relaxedMode: initialRelaxedMode,
        disabledOverages:
          initialDisabledOverages ?? dataset.constraints?.disabledOverages ?? prev.disabledOverages ?? [],
        interdireTousDepassements:
          initialInterdireTousDepassements ?? dataset.constraints?.interdireTousDepassements ?? prev.interdireTousDepassements ?? false,
      }));
    }
  }, [isOpen, initialRelaxedMode, initialDisabledOverages, initialInterdireTousDepassements, dataset.constraints]);

  const diagnostic = useMemo(() => {
    return runInstantDiagnostics(
      {
        teachers: dataset.teachers,
        classes: dataset.classes,
        unites: dataset.unites,
        semaine: dataset.semaine,
      },
      config
    );
  }, [dataset, config]);

  const totalRequiredHours = useMemo(
    () => dataset.unites.reduce((sum, u) => sum + u.heures, 0),
    [dataset]
  );
  const resultPlacedHours = result?.planning?.length || 0;
  const resultMissingHours = Math.max(0, totalRequiredHours - resultPlacedHours);
  const resultInsertionRate = totalRequiredHours > 0
    ? Math.round((resultPlacedHours / totalRequiredHours) * 100)
    : 100;

  // Récupérer tous les logs consolidés (résultat final ou logs en direct)
  const currentLogs = useMemo(() => {
    if (result?.logs && result.logs.length > 0) {
      return result.logs;
    }
    return liveLogs;
  }, [result, liveLogs]);

  // Bottlenecks consolidés
  const bottlenecks: GenerationBottleneck[] = useMemo(() => {
    if (result?.bottlenecks && result.bottlenecks.length > 0) {
      return result.bottlenecks;
    }
    return [];
  }, [result]);

  // Filtrage des logs
  const filteredLogs = useMemo(() => {
    return currentLogs.filter((log) => {
      if (logFilterSeverity !== 'ALL' && log.severity !== logFilterSeverity) {
        return false;
      }
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        const msg = (log.message || '').toLowerCase();
        const det = (log.details || '').toLowerCase();
        return msg.includes(q) || det.includes(q);
      }
      return true;
    });
  }, [currentLogs, logFilterSeverity, logSearchQuery]);

  const handleStart = () => {
    setIsSolving(true);
    setLiveLogs([]);
    setProgress({
      phase: 'A',
      percent: 5,
      message: 'Initialisation du solveur...',
      elapsedMs: 0,
    });
    setResult(null);
    setError(null);

    const activeLocks = keepLocked ? lockedAssignments : [];

    solverClient.start(
      dataset,
      config,
      (prog) => {
        setProgress(prog);
        if (prog.recentLogs && prog.recentLogs.length > 0) {
          setLiveLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const newEntries = (prog.recentLogs || []).filter((l) => !existingIds.has(l.id));
            return [...prev, ...newEntries];
          });
        }
      },
      (res) => {
        setIsSolving(false);
        setResult(res);
        if (res.logs && res.logs.length > 0) {
          setLiveLogs(res.logs);
        }
      },
      (err) => {
        setIsSolving(false);
        setError(err);
      },
      activeLocks
    );
  };

  const handleStartRelaxed = () => {
    const relaxedConfig: SolverConfig = { ...config, relaxedMode: true };
    setConfig(relaxedConfig);
    setIsSolving(true);
    setLiveLogs([]);
    setProgress({
      phase: 'A',
      percent: 5,
      message: 'Lancement avec règles souples relâchées...',
      elapsedMs: 0,
    });
    setResult(null);
    setError(null);

    const activeLocks = keepLocked ? lockedAssignments : [];
    solverClient.start(
      dataset,
      relaxedConfig,
      (prog) => {
        setProgress(prog);
        if (prog.recentLogs && prog.recentLogs.length > 0) {
          setLiveLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const newEntries = (prog.recentLogs || []).filter((l) => !existingIds.has(l.id));
            return [...prev, ...newEntries];
          });
        }
      },
      (res) => {
        setIsSolving(false);
        setResult(res);
        if (res.logs && res.logs.length > 0) {
          setLiveLogs(res.logs);
        }
      },
      (err) => {
        setIsSolving(false);
        setError(err);
      },
      activeLocks
    );
  };

  const handleApplyPatchAndRelaunch = (patch: Partial<SolverConfig>) => {
    const updatedConfig: SolverConfig = {
      ...config,
      ...patch,
      maxHeuresParJourParMatiere: {
        ...(config.maxHeuresParJourParMatiere || {}),
        ...(patch.maxHeuresParJourParMatiere || {}),
      },
    };
    setConfig(updatedConfig);
    setIsSolving(true);
    setLiveLogs([]);
    setProgress({
      phase: 'A',
      percent: 5,
      message: 'Relance avec les assouplissements appliqués...',
      elapsedMs: 0,
    });
    setResult(null);
    setError(null);

    const activeLocks = keepLocked ? lockedAssignments : [];
    solverClient.start(
      dataset,
      updatedConfig,
      (prog) => {
        setProgress(prog);
        if (prog.recentLogs && prog.recentLogs.length > 0) {
          setLiveLogs((prev) => {
            const existingIds = new Set(prev.map((l) => l.id));
            const newEntries = (prog.recentLogs || []).filter((l) => !existingIds.has(l.id));
            return [...prev, ...newEntries];
          });
        }
      },
      (res) => {
        setIsSolving(false);
        setResult(res);
        if (res.logs && res.logs.length > 0) {
          setLiveLogs(res.logs);
        }
      },
      (err) => {
        setIsSolving(false);
        setError(err);
      },
      activeLocks
    );
  };

  const handleCancel = () => {
    solverClient.cancel();
    setIsSolving(false);
    setProgress(null);
  };

  const handleApply = () => {
    if (result && result.planning.length > 0) {
      onApplyPlanning(result.planning, result, config);
      onClose();
    }
  };

  const handleCopyLogs = () => {
    if (currentLogs.length === 0) return;
    const text = currentLogs
      .map((l) => `[${l.phase}] [${l.severity}] ${l.message}${l.details ? ` - ${l.details}` : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* En-tête de la modale */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-slate-900">
                Génération d'emploi du temps & Journal de diagnostic
              </h2>
              {config.relaxedMode && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  Mode relâché actif
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Phase A : Heuristique constructive adaptative · Phase B : Optimisation HiGHS WebAssembly (MIP)
            </p>
          </div>
          <button
            onClick={() => {
              if (isSolving) handleCancel();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barre d'onglets (Recommandations IA vs Journal & Goulots) */}
        {(result || isSolving || liveLogs.length > 0) && (
          <div className="flex items-center justify-between px-6 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('recommendations')}
                className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
                  activeTab === 'recommendations'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Recommandations IA & Résumé</span>
                {resultMissingHours > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono font-bold">
                    -{resultMissingHours}h
                  </span>
                )}
                {result && resultMissingHours === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold">
                    100% OK
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-2 py-3 px-3 text-xs font-bold border-b-2 transition-colors ${
                  activeTab === 'logs'
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <ScrollText className="w-4 h-4 text-slate-600" />
                <span>Journal d'exécution & Goulots</span>
                {bottlenecks.length > 0 ? (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-mono font-bold">
                    {bottlenecks.length} goulot(s)
                  </span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                    {currentLogs.length}
                  </span>
                )}
              </button>
            </div>

            {activeTab === 'logs' && currentLogs.length > 0 && (
              <button
                type="button"
                onClick={handleCopyLogs}
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-md hover:bg-slate-100 border border-slate-200 transition-colors"
                title="Copier tout le journal de génération"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-medium">Copié !</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    <span>Copier les logs</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Corps défilable */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {/* Progression si en cours de calcul */}
          {isSolving && progress && (
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                  {progress.phase === 'A'
                    ? 'Phase A en cours (Heuristique constructive)'
                    : 'Phase B en cours (MIP HiGHS WebAssembly)'}
                </span>
                <span className="font-mono text-slate-600 tabular-nums">
                  {Math.round(progress.elapsedMs / 100) / 10} s écoulées
                </span>
              </div>

              {/* Barre de progression */}
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="truncate pr-2 font-medium">{progress.message}</span>
                <span className="font-mono font-bold shrink-0">{progress.percent}%</span>
              </div>

              {/* Aperçu des derniers logs en direct */}
              {liveLogs.length > 0 && (
                <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] space-y-1 max-h-24 overflow-y-auto border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-sans mb-1 flex items-center gap-1.5">
                    <ScrollText className="w-3 h-3 text-indigo-400" />
                    <span>Flux en direct :</span>
                  </div>
                  {liveLogs.slice(-3).map((l) => (
                    <div key={l.id} className="truncate">
                      <span className="text-slate-500">[{l.phase}]</span>{' '}
                      <span
                        className={
                          l.severity === 'WARNING'
                            ? 'text-amber-400'
                            : l.severity === 'BOTTLENECK'
                            ? 'text-rose-400'
                            : l.severity === 'SUCCESS'
                            ? 'text-emerald-400'
                            : 'text-slate-300'
                        }
                      >
                        {l.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                >
                  <StopCircle className="w-4 h-4" />
                  <span>Annuler la génération</span>
                </button>
              </div>
            </div>
          )}

          {/* Erreur si survenue */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                <span>Erreur survenue lors de la résolution</span>
              </div>
              <p className="text-xs text-rose-700 font-mono bg-white p-2.5 rounded border border-rose-200">
                {error}
              </p>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleStartRelaxed}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 text-white rounded-lg text-xs font-semibold hover:bg-rose-800 transition-colors shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Relancer en mode règles relâchées</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* ONGLET 1 : RECOMMANDATIONS IA & RÉSUMÉ */}
          {/* ========================================================= */}
          {activeTab === 'recommendations' && (
            <div className="space-y-5">
              {/* Résultat obtenu */}
              {result && (
                <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      {resultMissingHours > 0 ? (
                        <>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600" />
                            <span className="text-sm font-bold text-amber-950">
                              Génération terminée : {resultPlacedHours}/{totalRequiredHours}h placées ({resultInsertionRate}%)
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300 font-mono">
                              Taux d'insertion : {resultInsertionRate}% ({resultPlacedHours}h / {totalRequiredHours}h)
                            </span>
                            <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 font-mono">
                              -{resultMissingHours}h manquante(s)
                            </span>
                          </div>
                          <p className="text-xs text-amber-900 mt-1.5 font-medium">
                            👉 Utilisez les recommandations IA ci-dessous ou consultez le journal d'exécution pour planifier les solutions.
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-bold text-slate-900">
                              Génération réussie à 100 % d'affectation !
                            </span>
                          </div>
                          <span className="text-xs font-semibold text-emerald-800 block mt-1">
                            Statut : {result.qualityLabel} · Toutes les {totalRequiredHours} heures ont été placées sans aucun conflit.
                          </span>
                        </>
                      )}
                    </div>

                    <span
                      className={`text-xs font-mono font-bold px-2.5 py-1 rounded-md ${
                        resultMissingHours > 0
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      Score : {result.score.total} pts
                    </span>
                  </div>

                  {/* Benchmark & durées */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">Phase A (Heuristique)</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {result.phaseADurationMs} ms
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">Phase B (HiGHS MIP)</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {result.phaseBDurationMs ? `${result.phaseBDurationMs} ms` : 'Désactivée'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">Temps total</span>
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        {(result.totalDurationMs / 1000).toFixed(2)} s
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[11px] text-slate-500 block">Règles dures</span>
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        0 violation
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Panneau de recommandations IA */}
              {(result || error) && (
                <AIRecommendationsPanel
                  dataset={dataset}
                  planning={result?.planning || []}
                  currentConstraints={config}
                  onApplyPatchAndRelaunch={handleApplyPatchAndRelaunch}
                  diagnosticReports={diagnostic.detailedReports}
                  isSolving={isSolving}
                  onOpenAIProviderModal={onOpenAIProviderModal}
                />
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* ONGLET 2 : JOURNAL D'EXÉCUTION & GOULOTS D'ÉTRANGLEMENT */}
          {/* ========================================================= */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              {/* Section A : Synthèse des goulots d'étranglement */}
              {bottlenecks.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Goulots d'étranglement identifiés ({bottlenecks.length})</span>
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Cliquez pour appliquer l'action recommandée directement
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    {bottlenecks.map((bn) => (
                      <div
                        key={bn.id}
                        className="p-3.5 bg-white border border-rose-200 rounded-xl shadow-2xs space-y-2 hover:border-rose-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-900">
                                {bn.matiere}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                                -{bn.missingHours}h non affectée(s)
                              </span>
                              <span className="text-[11px] text-slate-600">
                                {bn.teacherNom} · Classes : {bn.classesNoms.join(', ')}
                              </span>
                            </div>
                            <p className="text-xs text-rose-900 font-medium">
                              Cause : {bn.primaryCause}
                            </p>
                            <p className="text-[11px] text-slate-600">
                              {bn.diagnosticExplanation}
                            </p>
                          </div>

                          {bn.patch && (
                            <button
                              type="button"
                              onClick={() => handleApplyPatchAndRelaunch(bn.patch!)}
                              disabled={isSolving}
                              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>Résoudre & Relancer</span>
                            </button>
                          )}
                        </div>

                        <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <span>Action recommandée : <strong className="text-slate-800">{bn.suggestedSolution}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section B : Console / Journal détaillé des logs */}
              <div className="bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-4 space-y-3 font-mono text-xs shadow-md">
                {/* Barre d'outils du journal */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-800 font-sans">
                  {/* Filtres de sévérité */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-[11px]">
                    {[
                      { key: 'ALL', label: `Tous (${currentLogs.length})` },
                      {
                        key: 'BOTTLENECK',
                        label: `Goulots (${currentLogs.filter((l) => l.severity === 'BOTTLENECK').length})`,
                        color: 'text-rose-400 hover:bg-rose-950/40',
                      },
                      {
                        key: 'WARNING',
                        label: `Avertissements (${currentLogs.filter((l) => l.severity === 'WARNING').length})`,
                        color: 'text-amber-400 hover:bg-amber-950/40',
                      },
                      {
                        key: 'SUCCESS',
                        label: `Succès (${currentLogs.filter((l) => l.severity === 'SUCCESS').length})`,
                        color: 'text-emerald-400 hover:bg-emerald-950/40',
                      },
                      {
                        key: 'INFO',
                        label: `Infos (${currentLogs.filter((l) => l.severity === 'INFO').length})`,
                        color: 'text-sky-400 hover:bg-sky-950/40',
                      },
                    ].map((btn) => (
                      <button
                        key={btn.key}
                        type="button"
                        onClick={() => setLogFilterSeverity(btn.key)}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors shrink-0 ${
                          logFilterSeverity === btn.key
                            ? 'bg-slate-700 text-white shadow-2xs'
                            : 'text-slate-400 hover:text-slate-200'
                        } ${btn.color || ''}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* Recherche de log */}
                  <div className="relative shrink-0">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filtrer les messages..."
                      value={logSearchQuery}
                      onChange={(e) => setLogSearchQuery(e.target.value)}
                      className="text-[11px] bg-slate-800 border border-slate-700 rounded-md pl-8 pr-2.5 py-1 text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 w-full sm:w-48 font-sans"
                    />
                  </div>
                </div>

                {/* Flux d'affichage des logs */}
                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                  {filteredLogs.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 font-sans text-xs">
                      Aucun log ne correspond aux critères sélectionnés.
                    </div>
                  ) : (
                    filteredLogs.map((log) => {
                      const isBn = log.severity === 'BOTTLENECK';
                      const isWarn = log.severity === 'WARNING';
                      const isSucc = log.severity === 'SUCCESS';

                      return (
                        <div
                          key={log.id}
                          className={`p-2 rounded border text-[11px] space-y-1 transition-colors ${
                            isBn
                              ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                              : isWarn
                              ? 'bg-amber-950/30 border-amber-800/70 text-amber-200'
                              : isSucc
                              ? 'bg-emerald-950/30 border-emerald-800/70 text-emerald-200'
                              : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  isBn
                                    ? 'bg-rose-700 text-white'
                                    : isWarn
                                    ? 'bg-amber-600 text-slate-900'
                                    : isSucc
                                    ? 'bg-emerald-700 text-white'
                                    : 'bg-slate-700 text-slate-300'
                                }`}
                              >
                                {log.severity}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                [{log.phase}]
                              </span>
                              <span className="font-sans font-medium">{log.message}</span>
                            </div>
                            <span className="text-[10px] text-slate-500 tabular-nums shrink-0 font-mono">
                              {Math.round(log.timestamp)} ms
                            </span>
                          </div>

                          {log.details && (
                            <p className="text-[11px] text-slate-400 font-sans pl-1 border-l border-slate-700">
                              {log.details}
                            </p>
                          )}

                          {log.actionLabel && log.actionPatch && (
                            <div className="pt-1 flex items-center justify-between font-sans">
                              <span className="text-[10px] text-indigo-300">
                                💡 Solution : {log.actionLabel}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleApplyPatchAndRelaunch(log.actionPatch!)}
                                disabled={isSolving}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-semibold transition-colors"
                              >
                                <Zap className="w-3 h-3" />
                                <span>Appliquer</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Formulaire de configuration des paramètres */}
          {!isSolving && (
            <div className="space-y-4 pt-2 border-t border-slate-200">
              {lockedAssignments.length > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-900">
                    <span className="font-bold">🔒 {lockedAssignments.length} cours verrouillé(s)</span>
                    <span className="text-amber-700">· Fixés dans le modèle (x[u, s] = 1)</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800">
                    <input
                      type="checkbox"
                      checked={keepLocked}
                      onChange={(e) => setKeepLocked(e.target.checked)}
                      className="rounded text-slate-900 focus:ring-slate-900"
                    />
                    <span>Garder verrouillés</span>
                  </label>
                </div>
              )}

              <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider block">
                Paramètres du solveur
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
                  <label className="block text-xs font-medium text-slate-800 mb-1">
                    Limite de temps HiGHS Phase B (secondes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="600"
                    value={config.timeLimitSeconds}
                    onChange={(e) =>
                      setConfig({ ...config, timeLimitSeconds: parseInt(e.target.value) || 120 })
                    }
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md font-mono bg-white"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Défaut : 120 secondes. Si dépassé, la solution Phase A est conservée.
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-col justify-between">
                  <div>
                    <label className="block text-xs font-medium text-slate-800 mb-1">
                      Options avancées
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Règles de relaxation et optimisation MIP.
                    </p>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="enablePhaseB"
                        checked={config.enablePhaseB}
                        onChange={(e) => setConfig({ ...config, enablePhaseB: e.target.checked })}
                        className="rounded text-slate-900 focus:ring-slate-900"
                      />
                      <label htmlFor="enablePhaseB" className="text-xs text-slate-700 cursor-pointer">
                        Activer l'optimisation Phase B (HiGHS)
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="relaxedMode"
                        checked={config.relaxedMode || false}
                        onChange={(e) => setConfig({ ...config, relaxedMode: e.target.checked })}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <label htmlFor="relaxedMode" className="text-xs text-amber-900 font-semibold cursor-pointer">
                        Mode règles souples relâchées (pour 100 % d'affectation)
                      </label>
                    </div>
                  </div>
                </div>

                {/* Section Reverse Dépassement */}
                <div className="col-span-1 sm:col-span-2 p-3.5 bg-gradient-to-r from-purple-50/90 to-indigo-50/80 border border-purple-200 rounded-xl space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-purple-600 text-white shrink-0">
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-purple-950">
                            Option Reverse Dépassement
                          </span>
                          {config.disabledOverages && config.disabledOverages.length > 0 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-200 text-purple-900 font-bold">
                              {config.disabledOverages.length} dépassement(s) neutralisé(s)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-purple-800">
                          Force le solveur à respecter strictement le plafond de 2h/jour pour les matières/jours sélectionnés.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-xs font-semibold text-purple-950 cursor-pointer bg-white px-2.5 py-1.5 rounded-lg border border-purple-300 shadow-2xs">
                        <input
                          type="checkbox"
                          checked={config.interdireTousDepassements || false}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              interdireTousDepassements: e.target.checked,
                            })
                          }
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span>Interdire TOUS les dépassements (Règle stricte)</span>
                      </label>
                    </div>
                  </div>

                  {/* Boutons d'action et toggle liste des dépassements détectés */}
                  {detectedOverages.length > 0 && (
                    <div className="pt-2 border-t border-purple-200/70 space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setShowOveragesList(!showOveragesList)}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-900 hover:text-purple-950"
                        >
                          {showOveragesList ? (
                            <ChevronUp className="w-3.5 h-3.5 text-purple-700" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-purple-700" />
                          )}
                          <span>
                            Dépassements détectés dans l'output ({detectedOverages.length})
                          </span>
                          <span className="text-[11px] font-normal text-purple-700">
                            — cliquez pour {showOveragesList ? 'replier' : 'cocher / décocher individuellement'}
                          </span>
                        </button>

                        {!config.interdireTousDepassements && (
                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() =>
                                setConfig({
                                  ...config,
                                  disabledOverages: detectedOverages.map((o) => o.id),
                                })
                              }
                              className="text-purple-700 hover:text-purple-900 underline"
                            >
                              Tout neutraliser
                            </button>
                            <span className="text-purple-300">·</span>
                            <button
                              type="button"
                              onClick={() =>
                                setConfig({
                                  ...config,
                                  disabledOverages: [],
                                })
                              }
                              className="text-slate-500 hover:text-slate-700 underline"
                            >
                              Tout autoriser
                            </button>
                          </div>
                        )}
                      </div>

                      {showOveragesList && (
                        <div className="max-h-48 overflow-y-auto space-y-1.5 bg-white/80 p-2 rounded-lg border border-purple-200/60 divide-y divide-purple-100/60 text-xs">
                          {detectedOverages.map((exc) => {
                            const isChecked =
                              config.interdireTousDepassements ||
                              (config.disabledOverages && config.disabledOverages.includes(exc.id));

                            const toggleExc = () => {
                              if (config.interdireTousDepassements) return;
                              const current = config.disabledOverages || [];
                              const next = current.includes(exc.id)
                                ? current.filter((id) => id !== exc.id)
                                : [...current, exc.id];
                              setConfig({ ...config, disabledOverages: next });
                            };

                            const meta = exc.matiere ? getSubjectMeta(exc.matiere) : null;
                            const abbr = exc.matiere ? getSubjectAbbreviation(exc.matiere) : 'ENS';

                            return (
                              <label
                                key={exc.id}
                                className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${
                                  isChecked ? 'bg-purple-100/60 text-purple-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(isChecked)}
                                    disabled={config.interdireTousDepassements}
                                    onChange={toggleExc}
                                    className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                                  />
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      meta?.badgeClass || 'bg-slate-100 text-slate-800'
                                    }`}
                                  >
                                    {abbr}
                                  </span>
                                  <span className="font-semibold">{exc.entiteNom}</span>
                                  <span className="text-slate-500">· {exc.jourNom}</span>
                                </div>
                                <span className="text-[11px] text-slate-500">
                                  {isChecked ? '🛡️ Interdit' : '⚠️ Toléré'}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {config.disabledOverages && config.disabledOverages.length > 0 && !config.interdireTousDepassements && !detectedOverages.length && (
                    <div className="pt-1.5 border-t border-purple-200/60 flex items-center justify-between text-[11px] text-purple-900">
                      <span>
                        🛡️ <strong>{config.disabledOverages.length}</strong> dépassement(s) converti(s) en contrainte(s) dure(s) pour cette génération.
                      </span>
                      <button
                        type="button"
                        onClick={() => setConfig({ ...config, disabledOverages: [] })}
                        className="text-purple-700 hover:text-purple-900 underline text-[11px]"
                      >
                        Réinitialiser (tout autoriser)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pied de page et boutons d'action */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={() => {
              if (isSolving) handleCancel();
              onClose();
            }}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
          >
            Fermer
          </button>

          <div className="flex items-center gap-2">
            {!result ? (
              <button
                type="button"
                disabled={isSolving}
                onClick={handleStart}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Lancer la génération</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSolving}
                  onClick={handleStart}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Relancer</span>
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Appliquer cet emploi du temps</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
