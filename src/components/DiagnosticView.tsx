/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Users,
  GraduationCap,
  Layers,
  ShieldAlert,
  RotateCcw,
  Play,
  Info,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import { ImportDataset } from '../types';
import { RulesOptions } from '../rules/types';
import {
  buildInfeasibilityReport,
  runInstantDiagnostics,
} from '../utils/infeasibilityDiagnostic';

interface DiagnosticViewProps {
  dataset: ImportDataset;
  constraints?: RulesOptions;
  onOpenGenerator: (relaxedMode?: boolean) => void;
  onOpenConstraintsTab: () => void;
}

export const DiagnosticView: React.FC<DiagnosticViewProps> = ({
  dataset,
  constraints,
  onOpenGenerator,
  onOpenConstraintsTab,
}) => {
  const diagnostic = useMemo(() => {
    return runInstantDiagnostics(
      {
        teachers: dataset.teachers,
        classes: dataset.classes,
        unites: dataset.unites,
        semaine: dataset.semaine,
      },
      constraints || dataset.constraints
    );
  }, [dataset, constraints]);

  // Si des unités ne sont pas encore placées dans le planning actif
  const unplacedUnits = useMemo(() => {
    const planning = dataset.planning || [];
    const countMap = new Map<string, number>();
    for (const a of planning) {
      countMap.set(a.uniteId, (countMap.get(a.uniteId) || 0) + 1);
    }
    return dataset.unites.filter((u) => (countMap.get(u.id) || 0) < u.heures);
  }, [dataset]);

  const infeasibilityExplanations = useMemo(() => {
    if (unplacedUnits.length === 0) return [];
    return buildInfeasibilityReport(
      {
        teachers: dataset.teachers,
        classes: dataset.classes,
        unites: dataset.unites,
        semaine: dataset.semaine,
      },
      unplacedUnits,
      constraints || dataset.constraints
    );
  }, [dataset, unplacedUnits, constraints]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Synthèse du diagnostic */}
      <div
        className={`p-5 rounded-xl border shadow-2xs ${
          diagnostic.severity === 'CRITICAL'
            ? 'bg-rose-50 border-rose-200 text-rose-950'
            : diagnostic.severity === 'TIGHT'
            ? 'bg-amber-50 border-amber-200 text-amber-950'
            : 'bg-emerald-50 border-emerald-200 text-emerald-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {diagnostic.severity === 'CRITICAL' ? (
              <ShieldAlert className="w-6 h-6 text-rose-700 shrink-0 mt-0.5" />
            ) : diagnostic.severity === 'TIGHT' ? (
              <AlertTriangle className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
            )}
            <div>
              <span className="text-xs uppercase font-extrabold tracking-wider opacity-80 block">
                Contrôle pré-résolution instantané
              </span>
              <h1 className="text-base font-bold mt-0.5">{diagnostic.summaryLabel}</h1>
              <p className="text-xs opacity-90 mt-1 max-w-3xl">
                {diagnostic.canSolve
                  ? 'Toutes les vérifications arithmétiques préalables sont conformes. Le solveur HiGHS peut être lancé en toute confiance.'
                  : 'Des contraintes dures arithmétiques sont violées d\'office. Aucun solveur ne peut converger sans adapter les données ou relâcher les contraintes.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => onOpenGenerator(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Lancer le solveur standard</span>
            </button>
            <button
              onClick={() => onOpenGenerator(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-900 bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors shadow-2xs"
              title="Relance avec les règles souples relâchées (assouplissement blocs 2h)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Relance avec règles relâchées</span>
            </button>
          </div>
        </div>
      </div>

      {/* Cartes métriques de contrôle instantané */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Profs en surcharge */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Heures &gt; Dispos</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-black font-mono ${
                diagnostic.profsOverloaded.length > 0 ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              {diagnostic.profsOverloaded.length}
            </span>
            <span className="text-xs text-slate-500">prof(s) en déficit</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {diagnostic.profsOverloaded.length > 0
              ? 'Bloquant : charge supérieure aux créneaux libres.'
              : 'Aucun prof en surcharge horaire.'}
          </p>
        </div>

        {/* 2. Classes en surcharge */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Classes en surcharge</span>
            <GraduationCap className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-black font-mono ${
                diagnostic.classesOverloaded.length > 0 ? 'text-rose-600' : 'text-emerald-700'
              }`}
            >
              {diagnostic.classesOverloaded.length}
            </span>
            <span className="text-xs text-slate-500">classe(s)</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {diagnostic.classesOverloaded.length > 0
              ? 'Dépasse la capacité hebdomadaire utile.'
              : 'Volumes compatibles avec la semaine.'}
          </p>
        </div>

        {/* 3. Profs à marge 0 ou 1 h */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Marge critique (0 ou 1 h)</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-black font-mono ${
                diagnostic.profsTight.length > 0 ? 'text-amber-600' : 'text-slate-800'
              }`}
            >
              {diagnostic.profsTight.length}
            </span>
            <span className="text-xs text-slate-500">goulot(s) d'étranglement</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Disponibilité quasi-identique aux heures à placer.
          </p>
        </div>

        {/* 4. Dépassement du plafond horaire */}
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Plafond horaire (&gt; 24h)</span>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-black font-mono ${
                diagnostic.profsExceedCeiling.length > 0 ? 'text-indigo-600' : 'text-slate-800'
              }`}
            >
              {diagnostic.profsExceedCeiling.length}
            </span>
            <span className="text-xs text-slate-500">prof(s) au-dessus</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Heures supplémentaires au-delà du quota légal.
          </p>
        </div>
      </div>

      {/* RAPPORTS D'EXPLICATIONS LISIBLES (Style : « Aghdif : 7 h de PC en 2BACSPF pour 11 créneaux dispo... ») */}
      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-slate-700" />
            <h2 className="text-sm font-bold text-slate-900">
              Rapports explicatifs lisibles & Analyse des tensions
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Formulation en langage clair
          </span>
        </div>

        {diagnostic.detailedReports.length > 0 ? (
          <div className="space-y-2">
            {diagnostic.detailedReports.map((report, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 font-mono leading-relaxed"
              >
                {report}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
            ✓ Aucune tension critique n'a été détectée dans le jeu de données actuel.
          </div>
        )}

        {/* Si le solveur n'a pas réussi à placer toutes les heures, affichage du rapport d'infaisabilité spécifique */}
        {infeasibilityExplanations.length > 0 && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-rose-900 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 text-rose-700" />
              <span>
                Heures non placées dans le planning actif ({unplacedUnits.length} unité(s) incomplète(s)) :
              </span>
            </div>
            <div className="space-y-1.5">
              {infeasibilityExplanations.map((exp, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-white border border-rose-200 rounded-lg text-xs text-rose-950 font-medium"
                >
                  {exp}
                </div>
              ))}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => onOpenGenerator(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-800 hover:bg-rose-900 rounded-lg shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Relancer en mode assoupli pour caser ces heures</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. AVERTISSEMENTS NON BLOQUANTS : NIVEAU PARTIEL */}
      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Enseignements partiels d'un niveau (Avertissements non bloquants)
            </h2>
          </div>
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
            {diagnostic.partialLevelWarnings.length} détecté(s)
          </span>
        </div>

        <p className="text-xs text-slate-600">
          Un enseignant est signalé ici s'il n'intervient que dans une partie des classes d'un niveau donné (morcellement pédagogique), sans que cela n'empêche la génération.
        </p>

        {diagnostic.partialLevelWarnings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {diagnostic.partialLevelWarnings.map((w, idx) => (
              <div
                key={idx}
                className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{w.teacherNom}</span>
                  <span className="font-semibold px-2 py-0.5 bg-amber-100 text-amber-900 rounded text-[10px]">
                    Niveau {w.niveau} partiel ({w.classesEnseignees.length}/{w.totalClassesNiveau})
                  </span>
                </div>
                <p className="text-slate-700 text-[11px]">{w.message}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-amber-200/60">
                  <span>Matière : {w.matiere}</span>
                  <span>Charge dans ce niveau : {w.heuresEnseignees} h</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
            Tous les enseignants couvrent l'intégralité des classes de leurs niveaux respectifs.
          </div>
        )}
      </div>
    </div>
  );
};
