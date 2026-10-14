/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Users,
  GraduationCap,
  Clock,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  Download,
  Info,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { ImportDataset, Teacher, Classe, Unite, TeacherStats } from '../types';
import { generateAndDownloadExcel } from '../services/excelGenerator';
import { RulesInspector } from './RulesInspector';
import { TimetableGrid } from './TimetableGrid';
import { ConstraintsPanel } from './ConstraintsPanel';
import { DiagnosticView } from './DiagnosticView';
import { ScenariosView } from './ScenariosView';
import { checkPartialLevelTeaching } from '../utils/infeasibilityDiagnostic';

interface ControlDashboardProps {
  dataset: ImportDataset;
  activeTab:
    | 'dashboard'
    | 'timetable'
    | 'constraints'
    | 'diagnostic'
    | 'scenarios'
    | 'teachers'
    | 'classes'
    | 'units'
    | 'rules'
    | 'raw';
  onSelectTab: (
    tab:
      | 'dashboard'
      | 'timetable'
      | 'constraints'
      | 'diagnostic'
      | 'scenarios'
      | 'teachers'
      | 'classes'
      | 'units'
      | 'rules'
      | 'raw'
  ) => void;
  onOpenMapping: () => void;
  onOpenGenerator: (relaxedMode?: boolean) => void;
  onOpenGeneratorWithLocks?: (lockedAssignments: import('../rules/types').Affectation[]) => void;
  onUpdatePlanning?: (newPlanning: import('../rules/types').Planning) => void;
  onSaveConstraints?: (constraints: import('../rules/types').RulesOptions) => void;
  onUpdateScenarios?: (scenarios: import('../types/scenarios').ScheduleScenario[]) => void;
  onApplyScenario?: (scenario: import('../types/scenarios').ScheduleScenario) => void;
}

export const ControlDashboard: React.FC<ControlDashboardProps> = ({
  dataset,
  activeTab,
  onSelectTab,
  onOpenMapping,
  onOpenGenerator,
  onOpenGeneratorWithLocks,
  onUpdatePlanning,
  onSaveConstraints,
  onUpdateScenarios,
  onApplyScenario,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [marginFilter, setMarginFilter] = useState<'all' | 'overload' | 'tight' | 'ok'>('all');
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);

  const { report, teachers, classes, unites, semaine, fileName, importedAt } = dataset;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const partialWarnings = React.useMemo(
    () => checkPartialLevelTeaching(teachers, classes, unites),
    [teachers, classes, unites]
  );
  const partialWarningMap = React.useMemo(
    () => new Map(partialWarnings.map((w) => [w.teacherId, w])),
    [partialWarnings]
  );

  // Liste des matières uniques
  const subjects = Array.from(new Set(teachers.map((t) => t.matiere))).sort();

  // Filtrage des enseignants
  const filteredTeacherStats = report.profsEnSurcharge
    .concat(
      teachers
        .filter((t) => !report.profsEnSurcharge.some((p) => p.teacher.id === t.id))
        .map((t) => {
          const profUnites = unites.filter((u) => u.teacherId === t.id);
          const totalHeures = profUnites.reduce((sum, u) => sum + u.heures, 0);
          const creneauxDispo = t.dispo.filter(Boolean).length;
          const marge = creneauxDispo - totalHeures;
          return {
            teacher: t,
            totalHeures,
            creneauxDispo,
            marge,
            unitesCount: profUnites.length,
            hasOverload: marge < 0,
            isTight: marge >= 0 && marge <= 1,
          };
        })
    )
    .filter((stat) => {
      // Recherche texte
      const q = searchQuery.toLowerCase();
      const matchText =
        stat.teacher.nom.toLowerCase().includes(q) ||
        stat.teacher.matiere.toLowerCase().includes(q) ||
        String(stat.teacher.num ?? '').includes(q);

      if (!matchText) return false;

      // Filtre matière
      if (selectedSubject !== 'all' && stat.teacher.matiere !== selectedSubject) {
        return false;
      }

      // Filtre marge
      if (marginFilter === 'overload' && !stat.hasOverload) return false;
      if (marginFilter === 'tight' && !stat.isTight) return false;
      if (marginFilter === 'ok' && (stat.hasOverload || stat.isTight)) return false;

      return true;
    });

  // Export JSON du modèle de données
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dataset, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `Modele_Donnees_${dataset.fileName.replace(/\.xlsx$/, '')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Comparaisons avec les totaux attendus
  const is28Profs = report.totalProfs === 28;
  const is12Classes = report.totalClasses === 12;
  const is360Hours = report.totalHeures === 360;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* En-tête de synthèse & fichier */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Contrôle des données importées
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <span className="font-medium text-slate-700">{fileName}</span>
            <span aria-hidden="true">·</span>
            <span>Importé le {new Date(importedAt).toLocaleTimeString('fr-FR')}</span>
            <span aria-hidden="true">·</span>
            <span>IndexedDB synchronisé</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportJSON}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter le modèle JSON</span>
          </button>
        </div>
      </div>

      {/* Cartes KPI Totaux avec validation des 360h / 28 profs / 12 classes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 : Enseignants */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Enseignants</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {report.totalProfs}
              </span>
              <span className="text-xs text-slate-500">/ 28 attendus</span>
            </div>
            <div className="mt-1 text-xs">
              {is28Profs ? (
                <span className="text-emerald-700 font-medium">Exactement 28 enseignants</span>
              ) : (
                <span className="text-amber-700 font-medium">Diffère des 28 attendus</span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 2 : Classes */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Classes d'élèves</span>
            <GraduationCap className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {report.totalClasses}
              </span>
              <span className="text-xs text-slate-500">/ 12 attendues</span>
            </div>
            <div className="mt-1 text-xs">
              {is12Classes ? (
                <span className="text-emerald-700 font-medium">Col. AK à AV (12 classes)</span>
              ) : (
                <span className="text-amber-700 font-medium">Diffère des 12 attendues</span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 3 : Heures d'enseignement */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Heures d'enseignement</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {report.totalHeures}
              </span>
              <span className="text-xs text-slate-500">h / 360 h attendues</span>
            </div>
            <div className="mt-1 text-xs">
              {is360Hours ? (
                <span className="text-emerald-700 font-medium">Conforme : 360 h totales</span>
              ) : (
                <span className="text-slate-600">Volume total calculé</span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 4 : Unités & Cours communs */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Unités d'enseignement</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 font-mono tabular-nums">
                {report.totalUnites}
              </span>
              <span className="text-xs text-slate-500">unités</span>
            </div>
            <div className="mt-1 text-xs text-slate-600">
              <strong className="text-teal-700 font-medium">
                {report.totalUnitesCommunes} cours communs
              </strong>{' '}
              (cellules fusionnées)
            </div>
          </div>
        </div>
      </div>

      {/* Avertissements et alertes */}
      {report.avertissements.length > 0 && (
        <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-amber-900 text-xs font-semibold uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Diagnostics et points de vigilance ({report.avertissements.length})</span>
          </div>
          <ul className="space-y-1.5 pl-6 list-disc text-xs text-amber-900 leading-relaxed">
            {report.avertissements.map((av, idx) => (
              <li key={idx}>{av}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Bannière de génération automatique Étape 3 */}
      <div className="p-5 bg-slate-900 text-white rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
              Étape 3 · Solveur 2 phases
            </span>
            <span className="font-bold text-sm">Génération automatique de l'emploi du temps</span>
          </div>
          <p className="text-xs text-slate-300">
            Heuristique « Difficiles d'abord » en Web Worker + Optimisation MIP HiGHS WebAssembly.
          </p>
        </div>
        <button
          onClick={() => onOpenGenerator()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold transition-colors shadow-xs whitespace-nowrap self-start sm:self-auto"
        >
          <span>{dataset.planning ? 'Régénérer l\'emploi du temps' : 'Générer l\'emploi du temps'}</span>
        </button>
      </div>

      {/* Barre de navigation d'onglets de données */}
      <div className="border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
        {dataset.planning && (
          <button
            onClick={() => onSelectTab('timetable')}
            className={`px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
              activeTab === 'timetable'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Grille Emploi du temps
          </button>
        )}
        <button
          onClick={() => onSelectTab('teachers')}
          className={`px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'teachers' || (activeTab === 'dashboard' && !dataset.planning)
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Enseignants ({teachers.length})
        </button>
        <button
          onClick={() => onSelectTab('classes')}
          className={`px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'classes'
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Classes ({classes.length})
        </button>
        <button
          onClick={() => onSelectTab('units')}
          className={`px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'units'
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Unités ({unites.length})
        </button>
        <button
          onClick={() => onSelectTab('rules')}
          className={`px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'rules'
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Règles & Moteur (Étape 2)
        </button>
        <button
          onClick={() => onSelectTab('raw')}
          className={`px-4 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
            activeTab === 'raw'
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          Modèle TypeScript & JSON
        </button>
      </div>

      {/* CONTENU ONGLET : EMPLOI DU TEMPS */}
      {activeTab === 'timetable' && dataset.planning && (
        <TimetableGrid
          dataset={dataset}
          planning={dataset.planning}
          resultInfo={dataset.solverResult}
          onOpenGenerator={() => onOpenGenerator()}
          onOpenGeneratorWithLocks={onOpenGeneratorWithLocks}
          onUpdatePlanning={onUpdatePlanning}
        />
      )}

      {/* CONTENU ONGLET 1 : ENSEIGNANTS */}
      {((activeTab === 'teachers') || (activeTab === 'dashboard' && !dataset.planning)) && (
        <div className="space-y-4">
          {/* Filtres et recherche */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom, matière, n°..."
                className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">Toutes les matières ({subjects.length})</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Filtre marge */}
              <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setMarginFilter('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    marginFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tous ({teachers.length})
                </button>
                <button
                  onClick={() => setMarginFilter('overload')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    marginFilter === 'overload'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Surcharge ({report.profsEnSurcharge.length})
                </button>
                <button
                  onClick={() => setMarginFilter('tight')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    marginFilter === 'tight'
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tension ({report.profsTension.length})
                </button>
              </div>
            </div>
          </div>

          {/* Tableau Enseignants */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">N°</th>
                    <th className="py-3 px-4">Enseignant</th>
                    <th className="py-3 px-4">Matière</th>
                    <th className="py-3 px-4 text-right">Heures</th>
                    <th className="py-3 px-4 text-right">Dispos</th>
                    <th className="py-3 px-4 text-right">Marge</th>
                    <th className="py-3 px-4">Grille des 32 créneaux</th>
                    <th className="py-3 px-4 text-center w-16">Détail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                  {filteredTeacherStats.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        Aucun enseignant ne correspond aux critères de recherche.
                      </td>
                    </tr>
                  ) : (
                    filteredTeacherStats.map((stat) => {
                      const isExpanded = expandedTeacherId === stat.teacher.id;
                      const profUnites = unites.filter((u) => u.teacherId === stat.teacher.id);

                      return (
                        <React.Fragment key={stat.teacher.id}>
                          <tr
                            onClick={() =>
                              setExpandedTeacherId(isExpanded ? null : stat.teacher.id)
                            }
                            className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                              stat.hasOverload
                                ? 'bg-rose-50/30'
                                : stat.isTight
                                ? 'bg-amber-50/20'
                                : ''
                            }`}
                          >
                            <td className="py-3 px-4 text-center font-mono text-slate-500">
                              {stat.teacher.num}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-900 block">
                                {stat.teacher.nom}
                              </span>
                              {partialWarningMap.has(stat.teacher.id) && (
                                <span
                                  className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-bold"
                                  title={partialWarningMap.get(stat.teacher.id)?.message}
                                >
                                  Niveau partiel ({partialWarningMap.get(stat.teacher.id)?.niveau})
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-slate-600">{stat.teacher.matiere}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                              {stat.totalHeures} h
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                              {stat.creneauxDispo} / {totalSlots}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {stat.hasOverload ? (
                                <span className="font-bold text-rose-700">
                                  {stat.marge} h (déficit)
                                </span>
                              ) : stat.isTight ? (
                                <span className="font-semibold text-amber-700">
                                  +{stat.marge} h (tendu)
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-medium">
                                  +{stat.marge} h
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {/* Visualisation compacte de la grille 32 créneaux */}
                              <div className="flex items-center gap-1.5" title="Grille des 32 créneaux (Lun-Jeu: 7, Ven: 4)">
                                {semaine.jours.map((jour, jIdx) => {
                                  const count = semaine.creneauxParJour[jIdx];
                                  const startIdx = semaine.creneauxParJour
                                    .slice(0, jIdx)
                                    .reduce((a, b) => a + b, 0);

                                  return (
                                    <div key={jIdx} className="flex gap-0.5">
                                      {Array.from({ length: count }).map((_, cIdx) => {
                                        const slotIdx = startIdx + cIdx;
                                        const isAvailable = stat.teacher.dispo[slotIdx];

                                        return (
                                          <span
                                            key={cIdx}
                                            className={`w-1.5 h-3.5 rounded-[1px] ${
                                              isAvailable ? 'bg-amber-400' : 'bg-slate-200'
                                            }`}
                                            title={`${jour} créneau ${cIdx + 1} : ${
                                              isAvailable ? 'Disponible' : 'Indisponible'
                                            }`}
                                          />
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center text-slate-400">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 mx-auto" />
                              ) : (
                                <ChevronRight className="w-4 h-4 mx-auto" />
                              )}
                            </td>
                          </tr>

                          {/* Vue dépliée des unités d'enseignement de ce professeur */}
                          {isExpanded && (
                            <tr className="bg-slate-50/90">
                              <td colSpan={8} className="p-4 border-y border-slate-200">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-900">
                                      Affectations et charges de {stat.teacher.nom}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      {profUnites.length} unités · {stat.totalHeures} heures totales
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {profUnites.map((u) => {
                                      const assignedClasses = classes.filter((c) =>
                                        u.classeIds.includes(c.id)
                                      );

                                      return (
                                        <div
                                          key={u.id}
                                          className={`p-2.5 rounded-lg border text-xs ${
                                            u.estCommun
                                              ? 'bg-teal-50 border-teal-200 text-teal-900'
                                              : 'bg-white border-slate-200 text-slate-800'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between">
                                            <span className="font-semibold">
                                              {assignedClasses.map((c) => c.nom).join(' + ')}
                                            </span>
                                            <span className="font-mono font-bold">
                                              {u.heures} h / sem
                                            </span>
                                          </div>
                                          {u.estCommun && (
                                            <span className="text-[10px] text-teal-700 block mt-1">
                                              Cours commun fusionné (compté 1 seule fois pour le prof)
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENU ONGLET 2 : CLASSES */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Classe</th>
                    <th className="py-3 px-4">Niveau</th>
                    <th className="py-3 px-4 text-right">Volume horaire</th>
                    <th className="py-3 px-4 text-right">Cours communs</th>
                    <th className="py-3 px-4">Taux d'occupation ({totalSlots} créneaux)</th>
                    <th className="py-3 px-4">Intervenants & Matières</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                  {classes.map((cls) => {
                    const clsUnites = unites.filter((u) => u.classeIds.includes(cls.id));
                    const totalHeures = clsUnites.reduce((sum, u) => sum + u.heures, 0);
                    const heuresCommunes = clsUnites
                      .filter((u) => u.estCommun)
                      .reduce((sum, u) => sum + u.heures, 0);
                    const isOver = totalHeures > totalSlots;
                    const percent = Math.min(100, Math.round((totalHeures / totalSlots) * 100));

                    const involvedTeachers = clsUnites.map((u) => {
                      const t = teachers.find((tch) => tch.id === u.teacherId);
                      return {
                        teacher: t,
                        unite: u,
                      };
                    });

                    return (
                      <tr key={cls.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                          {cls.nom}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{cls.niveau}</td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">
                          <span className={isOver ? 'text-rose-700 font-bold' : 'text-slate-900'}>
                            {totalHeures} h
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                          {heuresCommunes > 0 ? (
                            <span className="text-teal-700 font-medium">
                              {heuresCommunes} h
                            </span>
                          ) : (
                            '0 h'
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 max-w-xs">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${
                                  isOver
                                    ? 'bg-rose-500'
                                    : percent >= 90
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                              {totalHeures}/{totalSlots}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <div className="flex flex-wrap gap-1 text-[11px]">
                            {involvedTeachers.map(({ teacher, unite }, i) => (
                              <span
                                key={i}
                                className={`px-1.5 py-0.5 rounded border ${
                                  unite.estCommun
                                    ? 'bg-teal-50 border-teal-200 text-teal-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                                }`}
                                title={`${teacher?.nom} (${teacher?.matiere}) : ${unite.heures}h`}
                              >
                                {teacher?.nom} ({teacher?.matiere} {unite.heures}h)
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENU ONGLET 3 : UNITÉS D'ENSEIGNEMENT */}
      {activeTab === 'units' && (
        <div className="space-y-4">
          <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-xl flex items-start gap-3 text-xs text-teal-900">
            <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold block">
                Gestion des cours communs (cellules fusionnées)
              </span>
              <p className="leading-relaxed">
                Une unité d'enseignement partagée entre plusieurs classes (ex. 1BACSEF + 1BACSEG)
                indique que les élèves sont regroupés simultanément avec le même professeur sur le
                même créneau horaire. Les heures sont imputées à la charge de chaque classe
                participante, mais ne sont comptées <strong>qu'une seule fois</strong> pour
                l'enseignant.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">ID Unité</th>
                    <th className="py-3 px-4">Enseignant</th>
                    <th className="py-3 px-4">Matière</th>
                    <th className="py-3 px-4">Classes concernées</th>
                    <th className="py-3 px-4 text-right">Heures / sem</th>
                    <th className="py-3 px-4">Type d'unité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                  {unites.map((u) => {
                    const prof = teachers.find((t) => t.id === u.teacherId);
                    const involvedClasses = classes.filter((c) => u.classeIds.includes(c.id));

                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          u.estCommun ? 'bg-teal-50/30' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">{u.id}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {prof ? prof.nom : u.teacherId}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{prof?.matiere}</td>
                        <td className="py-3 px-4 font-mono font-medium">
                          {involvedClasses.map((c) => c.nom).join(' + ')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                          {u.heures} h
                        </td>
                        <td className="py-3 px-4">
                          {u.estCommun ? (
                            <span className="text-teal-700 font-medium">
                              Cours commun fusionné ({involvedClasses.length} classes)
                            </span>
                          ) : (
                            <span className="text-slate-500">Cours simple</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENU ONGLET 4 : RÈGLES & MOTEUR */}
      {activeTab === 'rules' && (
        <RulesInspector dataset={dataset} />
      )}

      {/* CONTENU ONGLET 5 : MODÈLE TYPESCRIPT & DONNÉES BRUTES */}
      {activeTab === 'raw' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-900 text-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">
                Structure TypeScript enregistrée dans IndexedDB
              </span>
              <button
                onClick={handleExportJSON}
                className="text-slate-300 hover:text-white underline text-xs"
              >
                Télécharger le fichier .json
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Modèle conforme : <code>Teacher</code>, <code>Classe</code>, <code>Unite</code>,{' '}
              <code>Semaine</code>.
            </p>
          </div>

          <div className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto font-mono text-xs max-h-[500px]">
            <pre>
              {JSON.stringify(
                {
                  meta: {
                    fileName,
                    importedAt,
                    totalProfs: teachers.length,
                    totalClasses: classes.length,
                    totalHeures: report.totalHeures,
                  },
                  semaine,
                  sampleTeacher: teachers[0],
                  sampleClasse: classes[0],
                  sampleUnite: unites.find((u) => u.estCommun) || unites[0],
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      )}

      {/* CONTENU ONGLET 6 : PANNEAU DE CONTRAINTES ÉDITABLE (Étape 6.1) */}
      {activeTab === 'constraints' && (
        <ConstraintsPanel
          dataset={dataset}
          currentConstraints={dataset.constraints}
          onSaveConstraints={(newC) => onSaveConstraints?.(newC)}
        />
      )}

      {/* CONTENU ONGLET 7 : DIAGNOSTIC D'INFAISABILITÉ (Étape 6.2) */}
      {activeTab === 'diagnostic' && (
        <DiagnosticView
          dataset={dataset}
          constraints={dataset.constraints}
          onOpenGenerator={(relaxed) => onOpenGenerator(relaxed)}
          onOpenConstraintsTab={() => onSelectTab('constraints')}
        />
      )}

      {/* CONTENU ONGLET 8 : SCÉNARIOS & COMPARATEUR WHAT-IF (Étape 6.3) */}
      {activeTab === 'scenarios' && (
        <ScenariosView
          dataset={dataset}
          currentPlanning={dataset.planning || []}
          currentConstraints={dataset.constraints}
          onApplyScenarioPlanning={(sc) => onApplyScenario?.(sc)}
          onUpdateDatasetScenarios={(scs) => onUpdateScenarios?.(scs)}
        />
      )}
    </div>
  );
};
