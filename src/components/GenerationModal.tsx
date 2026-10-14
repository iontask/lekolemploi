/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Sliders,
  Sparkles,
  StopCircle,
  FileCheck,
} from 'lucide-react';
import { ImportDataset } from '../types';
import { Planning } from '../rules/types';
import { SolverClient } from '../solver/solverClient';
import {
  runInstantDiagnostics,
  buildInfeasibilityReport,
} from '../utils/infeasibilityDiagnostic';
import {
  DEFAULT_SOLVER_CONFIG,
  SolverConfig,
  SolverProgress,
  SolverResult,
} from '../solver/types';

interface GenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: ImportDataset;
  onApplyPlanning: (planning: Planning, result: SolverResult) => void;
  lockedAssignments?: import('../rules/types').Affectation[];
  initialKeepLocked?: boolean;
  initialRelaxedMode?: boolean;
}

export const GenerationModal: React.FC<GenerationModalProps> = ({
  isOpen,
  onClose,
  dataset,
  onApplyPlanning,
  lockedAssignments = [],
  initialKeepLocked = true,
  initialRelaxedMode = false,
}) => {
  const [config, setConfig] = useState<SolverConfig>(() => ({
    ...DEFAULT_SOLVER_CONFIG,
    ...(dataset.constraints || {}),
    relaxedMode: initialRelaxedMode,
  }));
  const [solverClient] = useState<SolverClient>(() => new SolverClient());
  const [isSolving, setIsSolving] = useState(false);
  const [keepLocked, setKeepLocked] = useState(initialKeepLocked);
  const [progress, setProgress] = useState<SolverProgress | null>(null);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const diagnostic = React.useMemo(() => {
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

  const handleStartRelaxed = () => {
    const relaxedConfig: SolverConfig = { ...config, relaxedMode: true };
    setConfig(relaxedConfig);
    setIsSolving(true);
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
      (prog) => setProgress(prog),
      (res) => {
        setIsSolving(false);
        setResult(res);
      },
      (err) => {
        setIsSolving(false);
        setError(err);
      },
      activeLocks
    );
  };

  if (!isOpen) return null;

  const handleStart = () => {
    setIsSolving(true);
    setProgress({
      phase: 'A',
      percent: 5,
      message: 'Initialisation du solveur dans le Web Worker...',
      elapsedMs: 0,
    });
    setResult(null);
    setError(null);

    const activeLocks = keepLocked ? lockedAssignments : [];

    solverClient.start(
      dataset,
      config,
      (prog) => setProgress(prog),
      (res) => {
        setIsSolving(false);
        setResult(res);
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
      onApplyPlanning(result.planning, result);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Génération d'emploi du temps en deux phases
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Phase A : Heuristique « Difficiles d'abord » · Phase B : Optimisation HiGHS WebAssembly
            </p>
          </div>
          <button
            onClick={() => {
              if (isSolving) handleCancel();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 flex-1">
          {/* État de progression si en cours de calcul */}
          {isSolving && progress && (
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  {progress.phase === 'A'
                    ? 'Phase A en cours (Heuristique rapide)'
                    : 'Phase B en cours (MIP HiGHS WebAssembly)'}
                </span>
                <span className="font-mono text-slate-600 tabular-nums">
                  {Math.round(progress.elapsedMs / 100) / 10} s écoulées
                </span>
              </div>

              {/* Barre de progression */}
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-slate-900 h-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="truncate pr-2">{progress.message}</span>
                <span className="font-mono font-bold shrink-0">{progress.percent}%</span>
              </div>

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

          {/* Erreur si présente avec rapport lisible et option de relance relâchée */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3 text-rose-800 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-rose-900">Résolution impossible avec les règles actuelles</p>
                  <p className="mt-0.5 text-rose-700">{error}</p>
                </div>
              </div>

              {diagnostic.detailedReports.length > 0 && (
                <div className="p-3 bg-white/80 rounded-lg border border-rose-200/60 space-y-1 font-mono text-[11px] text-rose-950">
                  <span className="font-bold font-sans block text-xs text-rose-900">
                    Rapport explicatif lisible (diagnostic d'infaisabilité) :
                  </span>
                  {diagnostic.detailedReports.map((r, idx) => (
                    <div key={idx}>{r}</div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleStartRelaxed}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 text-white rounded-lg font-semibold hover:bg-rose-800 transition-colors shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Relancer avec les règles souples relâchées</span>
                </button>
              </div>
            </div>
          )}

          {/* Résultat obtenu */}
          {result && (
            <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-bold text-slate-900">
                      Génération terminée avec succès
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-800 block mt-1">
                    Statut : {result.qualityLabel}
                  </span>
                </div>

                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-800">
                  Score : {result.score.total} pts
                </span>
              </div>

              {/* Benchmark */}
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

              {/* Détail du score souple */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span>Compacité horaire (coût temps) :</span>
                  <span className="font-mono tabular-nums font-medium">{result.score.coutCompacite} pts</span>
                </div>
                <div className="flex justify-between">
                  <span>Pénalité dépassement &gt; 2h/jour (100 pts) :</span>
                  <span className="font-mono tabular-nums font-medium">{result.score.penalitesExcesJour} pts</span>
                </div>
                <div className="flex justify-between">
                  <span>Pénalité heures non consécutives (15 pts) :</span>
                  <span className="font-mono tabular-nums font-medium">{result.score.penalitesNonConsecutif} pts</span>
                </div>
              </div>
            </div>
          )}

          {/* Formulaire de configuration */}
          {!isSolving && (
            <div className="space-y-4">
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
                Paramètres de génération
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
                      Phase B avec HiGHS WebAssembly
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Résolution par programmation linéaire mixte en nombres entiers (MIP).
                    </p>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enablePhaseB"
                      checked={config.enablePhaseB}
                      onChange={(e) => setConfig({ ...config, enablePhaseB: e.target.checked })}
                      className="rounded text-slate-900 focus:ring-slate-900"
                    />
                    <label htmlFor="enablePhaseB" className="text-xs text-slate-700 cursor-pointer">
                      Activer l'optimisation Phase B
                    </label>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="relaxedMode"
                      checked={config.relaxedMode || false}
                      onChange={(e) => setConfig({ ...config, relaxedMode: e.target.checked })}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <label htmlFor="relaxedMode" className="text-xs text-amber-900 font-semibold cursor-pointer">
                      Mode règles souples relâchées (assouplissement si forte tension)
                    </label>
                  </div>
                </div>
              </div>

              {/* Rappel du protocole de sécurité */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <p>
                  <strong>Garantie de conformité :</strong> Tout emploi du temps généré passe
                  automatiquement par la fonction <code>verify()</code>. Si une quelconque règle dure
                  est violée, le résultat est immédiatement rejeté.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions en bas */}
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
              <button
                type="button"
                onClick={handleApply}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Appliquer cet emploi du temps</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
