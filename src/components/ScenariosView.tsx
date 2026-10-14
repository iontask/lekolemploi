/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  GitBranch,
  Copy,
  Play,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Trash2,
  Edit2,
  Users,
  Shield,
  Layers,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { ImportDataset, Teacher, Unite } from '../types';
import { Planning, RulesOptions } from '../rules/types';
import { score, verify } from '../rules';
import { ScheduleScenario } from '../types/scenarios';
import { SolverClient } from '../solver/solverClient';
import { DEFAULT_SOLVER_CONFIG, SolverConfig, SolverResult } from '../solver/types';

interface ScenariosViewProps {
  dataset: ImportDataset;
  currentPlanning: Planning;
  currentConstraints?: RulesOptions;
  onApplyScenarioPlanning: (scenario: ScheduleScenario) => void;
  onUpdateDatasetScenarios: (scenarios: ScheduleScenario[]) => void;
}

export const ScenariosView: React.FC<ScenariosViewProps> = ({
  dataset,
  currentPlanning,
  currentConstraints,
  onApplyScenarioPlanning,
  onUpdateDatasetScenarios,
}) => {
  const { teachers, classes, unites, semaine } = dataset;

  // Initialisation des scénarios existants
  const [scenarios, setScenarios] = useState<ScheduleScenario[]>(() => {
    if (dataset.scenarios && dataset.scenarios.length > 0) {
      return dataset.scenarios;
    }
    // Créer le scénario initial par défaut
    const baseScore = score(currentPlanning, dataset, currentConstraints);
    return [
      {
        id: 'scenario_base',
        name: 'Scénario de référence',
        description: 'Planning initial issu de la première résolution ou de l\'import.',
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        dataset: { ...dataset },
        planning: [...currentPlanning],
        constraints: { ...(currentConstraints || dataset.constraints || {}) },
        score: baseScore,
      },
    ];
  });

  const [activeScenarioId, setActiveScenarioId] = useState<string>(
    scenarios[0]?.id || 'scenario_base'
  );

  // Pour le comparateur côte à côte
  const [compareScenarioAId, setCompareScenarioAId] = useState<string>(
    scenarios[0]?.id || 'scenario_base'
  );
  const [compareScenarioBId, setCompareScenarioBId] = useState<string>(
    scenarios[1]?.id || scenarios[0]?.id || 'scenario_base'
  );

  // État de calcul pour un scénario
  const [solvingScenarioId, setSolvingScenarioId] = useState<string | null>(null);
  const [solverProgressMsg, setSolverProgressMsg] = useState<string>('');

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId) || scenarios[0];

  // Modification dans le scénario actif
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');

  // Cloner le planning actuel
  const handleCloneCurrent = () => {
    const newName = window.prompt(
      'Nom du nouveau scénario :',
      `Scénario ${String.fromCharCode(65 + scenarios.length)} (Copie)`
    );
    if (!newName) return;

    const cloned: ScheduleScenario = {
      id: `scenario_${Date.now()}`,
      name: newName,
      description: 'Clone du planning pour simulation d\'hypothèses (What-If).',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dataset: JSON.parse(JSON.stringify(dataset)),
      planning: [...(activeScenario?.planning || currentPlanning)],
      constraints: { ...(currentConstraints || dataset.constraints || {}) },
      score: activeScenario?.score ? { ...activeScenario.score } : undefined,
    };

    const nextList = [...scenarios, cloned];
    setScenarios(nextList);
    setActiveScenarioId(cloned.id);
    setCompareScenarioBId(cloned.id);
    onUpdateDatasetScenarios(nextList);
  };

  const handleDeleteScenario = (id: string) => {
    if (scenarios.length <= 1) {
      alert('Vous devez conserver au moins un scénario.');
      return;
    }
    if (window.confirm('Supprimer définitivement ce scénario ?')) {
      const nextList = scenarios.filter((s) => s.id !== id);
      setScenarios(nextList);
      setActiveScenarioId(nextList[0].id);
      onUpdateDatasetScenarios(nextList);
    }
  };

  // Modifier la charge d'un prof dans le scénario actif
  const handleUpdateTeacherHours = (uniteId: string, delta: number) => {
    if (!activeScenario) return;
    const updatedUnites = activeScenario.dataset.unites.map((u) => {
      if (u.id === uniteId) {
        return { ...u, heures: Math.max(1, u.heures + delta) };
      }
      return u;
    });

    const updatedDataset = {
      ...activeScenario.dataset,
      unites: updatedUnites,
    };

    const updatedScenario: ScheduleScenario = {
      ...activeScenario,
      dataset: updatedDataset,
    };

    const nextList = scenarios.map((s) => (s.id === activeScenario.id ? updatedScenario : s));
    setScenarios(nextList);
    onUpdateDatasetScenarios(nextList);
  };

  // Modifier les disponibilités d'un prof dans le scénario actif
  const handleToggleTeacherDispo = (teacherId: string, slotIndex: number) => {
    if (!activeScenario) return;
    const updatedTeachers = activeScenario.dataset.teachers.map((t) => {
      if (t.id === teacherId) {
        const nextDispo = [...t.dispo];
        nextDispo[slotIndex] = !nextDispo[slotIndex];
        return { ...t, dispo: nextDispo };
      }
      return t;
    });

    const updatedDataset = {
      ...activeScenario.dataset,
      teachers: updatedTeachers,
    };

    const updatedScenario: ScheduleScenario = {
      ...activeScenario,
      dataset: updatedDataset,
    };

    const nextList = scenarios.map((s) => (s.id === activeScenario.id ? updatedScenario : s));
    setScenarios(nextList);
    onUpdateDatasetScenarios(nextList);
  };

  // Relancer le solveur sur le scénario actif
  const handleRunSolverOnScenario = (scenarioToSolve: ScheduleScenario) => {
    setSolvingScenarioId(scenarioToSolve.id);
    setSolverProgressMsg('Initialisation du solveur...');

    const client = new SolverClient();
    const solverConfig: SolverConfig = {
      ...DEFAULT_SOLVER_CONFIG,
      timeLimitSeconds: 60,
    };

    client.start(
      scenarioToSolve.dataset,
      solverConfig,
      (progress) => {
        setSolverProgressMsg(`${progress.message} (${progress.percent}%)`);
      },
      (result: SolverResult) => {
        setSolvingScenarioId(null);
        setSolverProgressMsg('');
        const evaluatedScore = score(
          result.planning,
          scenarioToSolve.dataset,
          scenarioToSolve.constraints
        );

        const updatedScenario: ScheduleScenario = {
          ...scenarioToSolve,
          planning: result.planning,
          solverResult: result,
          score: evaluatedScore,
        };

        const nextList = scenarios.map((s) => (s.id === scenarioToSolve.id ? updatedScenario : s));
        setScenarios(nextList);
        onUpdateDatasetScenarios(nextList);
      },
      (error) => {
        setSolvingScenarioId(null);
        setSolverProgressMsg('');
        alert(`Erreur de génération pour le scénario : ${error}`);
      }
    );
  };

  // Objets pour la comparaison côte à côte
  const scenarioA = scenarios.find((s) => s.id === compareScenarioAId) || scenarios[0];
  const scenarioB = scenarios.find((s) => s.id === compareScenarioBId) || scenarios[1] || scenarios[0];

  const scoreA = scenarioA ? score(scenarioA.planning, scenarioA.dataset, scenarioA.constraints) : null;
  const scoreB = scenarioB ? score(scenarioB.planning, scenarioB.dataset, scenarioB.constraints) : null;

  const violationsA = scenarioA ? verify(scenarioA.planning, scenarioA.dataset, scenarioA.constraints) : [];
  const violationsB = scenarioB ? verify(scenarioB.planning, scenarioB.dataset, scenarioB.constraints) : [];

  const hardViolationsA = violationsA.filter((v) => v.severite === 'DURE').length;
  const hardViolationsB = violationsB.filter((v) => v.severite === 'DURE').length;

  const selectedTeacher = activeScenario?.dataset.teachers.find((t) => t.id === selectedTeacherId);
  const teacherUnites = activeScenario?.dataset.unites.filter((u) => u.teacherId === selectedTeacherId) || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-slate-900">
              Gestionnaire de scénarios & Comparateur What-If (Étape 6)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Clonez le planning, simulez des variations de charge ou de disponibilités d'un enseignant, relancez le solveur et comparez les scores côte à côte.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCloneCurrent}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-2xs"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-700" />
            <span>Cloner en nouveau scénario</span>
          </button>
        </div>
      </div>

      {/* Onglets des scénarios */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {scenarios.map((sc) => (
          <div
            key={sc.id}
            onClick={() => setActiveScenarioId(sc.id)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs cursor-pointer transition-all shrink-0 ${
              activeScenarioId === sc.id
                ? 'bg-white border-slate-900 font-bold text-slate-900 shadow-xs'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
            }`}
          >
            <span>{sc.name}</span>
            {sc.score && (
              <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                {sc.score.total} pts
              </span>
            )}
            {scenarios.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteScenario(sc.id);
                }}
                className="hover:text-rose-600 text-slate-400 p-0.5"
                title="Supprimer le scénario"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* SECTION 1 : MODIFICATION DU SCÉNARIO SÉLECTIONNÉ */}
      {activeScenario && (
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Modifier le scénario actif : <span className="text-indigo-600">{activeScenario.name}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ajustez les heures d'enseignement ou les disponibilités ci-dessous, puis relancez le solveur sur ce scénario.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={solvingScenarioId === activeScenario.id}
                onClick={() => handleRunSolverOnScenario(activeScenario)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {solvingScenarioId === activeScenario.id
                    ? solverProgressMsg || 'Résolution...'
                    : 'Relancer le solveur sur ce scénario'}
                </span>
              </button>
              <button
                onClick={() => onApplyScenarioPlanning(activeScenario)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors shadow-2xs"
                title="Appliquer ce planning comme planning principal de l'application"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>Appliquer au planning actif</span>
              </button>
            </div>
          </div>

          {/* Choix de l'enseignant à modifier */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-800 block">
                Sélectionnez un enseignant à ajuster :
              </label>
              <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {activeScenario.dataset.teachers.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTeacherId(t.id)}
                    className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                      selectedTeacherId === t.id
                        ? 'bg-indigo-50 text-indigo-950 font-bold border border-indigo-200'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="truncate">{t.nom}</span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {t.matiere}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ajustement de la charge horaire */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-800 block">
                Unités d'enseignement ({selectedTeacher?.nom}) :
              </label>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {teacherUnites.length > 0 ? (
                  teacherUnites.map((u) => {
                    const clsNames = u.classeIds
                      .map((cid) => classes.find((c) => c.id === cid)?.nom || cid)
                      .join(' + ');
                    return (
                      <div
                        key={u.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between"
                      >
                        <div>
                          <span className="font-semibold text-slate-900 block">{clsNames}</span>
                          <span className="text-[11px] text-slate-500">
                            Volume : <strong>{u.heures} h</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateTeacherHours(u.id, -1)}
                            className="w-6 h-6 rounded bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-xs"
                          >
                            -
                          </button>
                          <span className="font-mono font-bold w-5 text-center">{u.heures}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateTeacherHours(u.id, +1)}
                            className="w-6 h-6 rounded bg-white border border-slate-300 font-bold text-slate-700 hover:bg-slate-100 flex items-center justify-center text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400 italic">Aucune unité pour cet enseignant.</p>
                )}
              </div>
            </div>

            {/* Ajustement des disponibilités (grille cliquable) */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-800 block">
                Disponibilités ({selectedTeacher?.nom}) :
              </label>
              <p className="text-[11px] text-slate-500">
                Cliquez pour basculer : Vert = Libre, Rouge = Indisponible
              </p>
              {selectedTeacher && (
                <div className="grid grid-cols-5 gap-1 text-[10px]">
                  {semaine.jours.map((jour, jIdx) => {
                    const count = semaine.creneauxParJour[jIdx];
                    const baseSlot = semaine.creneauxParJour.slice(0, jIdx).reduce((a, b) => a + b, 0);
                    return (
                      <div key={jour} className="space-y-1">
                        <span className="font-bold text-slate-700 block text-center truncate">{jour}</span>
                        {Array.from({ length: count }, (_, cIdx) => {
                          const slot = baseSlot + cIdx;
                          const isDispo = selectedTeacher.dispo[slot] ?? false;
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => handleToggleTeacherDispo(selectedTeacher.id, slot)}
                              className={`w-full py-1 text-center rounded text-[9px] font-mono font-bold transition-colors ${
                                isDispo
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                              }`}
                            >
                              C{cIdx + 1}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2 : COMPARATEUR CÔTE À CÔTE */}
      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-5">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ArrowRightLeft className="w-4 h-4 text-slate-800" />
          <h2 className="text-sm font-bold text-slate-900">
            Comparateur côte à côte de deux scénarios
          </h2>
        </div>

        {/* Sélecteurs de comparaison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Scénario A (Gauche) :</span>
            <select
              value={compareScenarioAId}
              onChange={(e) => setCompareScenarioAId(e.target.value)}
              className="text-xs px-2.5 py-1 border border-slate-300 rounded-md bg-white font-medium"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Scénario B (Droite) :</span>
            <select
              value={compareScenarioBId}
              onChange={(e) => setCompareScenarioBId(e.target.value)}
              className="text-xs px-2.5 py-1 border border-slate-300 rounded-md bg-white font-medium"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tableau comparatif détaillé */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-slate-100 text-slate-800 border-b border-slate-200 font-semibold">
                <th className="py-2.5 px-4">Indicateur de performance</th>
                <th className="py-2.5 px-4">{scenarioA?.name || 'Scénario A'}</th>
                <th className="py-2.5 px-4">{scenarioB?.name || 'Scénario B'}</th>
                <th className="py-2.5 px-4 text-right">Écart (B vs A)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Score total */}
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-4 font-semibold text-slate-900">
                  Score global d'inconfort (le plus bas est le meilleur)
                </td>
                <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                  {scoreA ? `${scoreA.total} pts` : 'Non calculé'}
                </td>
                <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                  {scoreB ? `${scoreB.total} pts` : 'Non calculé'}
                </td>
                <td className="py-2.5 px-4 text-right font-mono font-bold">
                  {scoreA && scoreB ? (
                    <span
                      className={
                        scoreB.total < scoreA.total
                          ? 'text-emerald-700'
                          : scoreB.total > scoreA.total
                          ? 'text-rose-700'
                          : 'text-slate-500'
                      }
                    >
                      {scoreB.total - scoreA.total > 0 ? '+' : ''}
                      {Math.round((scoreB.total - scoreA.total) * 10) / 10} pts
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>

              {/* Violations dures */}
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-4 font-medium text-slate-800">
                  Violations des règles dures (bloquantes)
                </td>
                <td className="py-2.5 px-4 font-mono">
                  <span
                    className={
                      hardViolationsA === 0
                        ? 'text-emerald-700 font-bold'
                        : 'text-rose-700 font-bold'
                    }
                  >
                    {hardViolationsA} violation(s)
                  </span>
                </td>
                <td className="py-2.5 px-4 font-mono">
                  <span
                    className={
                      hardViolationsB === 0
                        ? 'text-emerald-700 font-bold'
                        : 'text-rose-700 font-bold'
                    }
                  >
                    {hardViolationsB} violation(s)
                  </span>
                </td>
                <td className="py-2.5 px-4 text-right font-mono">
                  {hardViolationsB - hardViolationsA === 0 ? 'Identique' : hardViolationsB - hardViolationsA}
                </td>
              </tr>

              {/* Pénalité excès par jour */}
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-4 text-slate-600">Pénalité dépassement &gt; 2h par jour</td>
                <td className="py-2.5 px-4 font-mono">{scoreA?.penalitesExcesJour ?? '-'} pts</td>
                <td className="py-2.5 px-4 font-mono">{scoreB?.penalitesExcesJour ?? '-'} pts</td>
                <td className="py-2.5 px-4 text-right font-mono">
                  {scoreA && scoreB ? `${scoreB.penalitesExcesJour - scoreA.penalitesExcesJour} pts` : '-'}
                </td>
              </tr>

              {/* Pénalité non consécutif */}
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-4 text-slate-600">Pénalité heures non consécutives</td>
                <td className="py-2.5 px-4 font-mono">{scoreA?.penalitesNonConsecutif ?? '-'} pts</td>
                <td className="py-2.5 px-4 font-mono">{scoreB?.penalitesNonConsecutif ?? '-'} pts</td>
                <td className="py-2.5 px-4 text-right font-mono">
                  {scoreA && scoreB ? `${scoreB.penalitesNonConsecutif - scoreA.penalitesNonConsecutif} pts` : '-'}
                </td>
              </tr>

              {/* Compacité horaire */}
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-4 text-slate-600">Coût compacité temporelle</td>
                <td className="py-2.5 px-4 font-mono">{scoreA?.coutCompacite ?? '-'} pts</td>
                <td className="py-2.5 px-4 font-mono">{scoreB?.coutCompacite ?? '-'} pts</td>
                <td className="py-2.5 px-4 text-right font-mono">
                  {scoreA && scoreB ? `${Math.round((scoreB.coutCompacite - scoreA.coutCompacite) * 10) / 10} pts` : '-'}
                </td>
              </tr>

              {/* Heures placées */}
              <tr className="hover:bg-slate-50">
                <td className="py-2.5 px-4 text-slate-600">Total des cours placés</td>
                <td className="py-2.5 px-4 font-mono font-medium">
                  {scenarioA?.planning.length || 0} créneau(x)
                </td>
                <td className="py-2.5 px-4 font-mono font-medium">
                  {scenarioB?.planning.length || 0} créneau(x)
                </td>
                <td className="py-2.5 px-4 text-right font-mono">
                  {(scenarioB?.planning.length || 0) - (scenarioA?.planning.length || 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
