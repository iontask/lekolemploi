/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Clock,
  Layers,
  GraduationCap,
  School,
  BookOpen,
  Search,
  RotateCcw,
  Sparkles,
  Check,
  ChevronRight,
  Plus,
  Minus,
  SlidersHorizontal,
  Info,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { Classe, Teacher, Unite } from '../types';
import { RulesOptions } from '../rules/types';
import { getSubjectDailyLimit } from '../rules';

interface SubjectHourlyConstraintsManagerProps {
  teachers: Teacher[];
  classes: Classe[];
  unites: Unite[];
  options: RulesOptions;
  onChangeOptions: (newOptions: RulesOptions) => void;
  onUpdateUnitHours: (uniteId: string, newHours: number) => void;
  onUpdateLevelHours: (niveau: string, matiere: string, newHours: number) => void;
  onConfigureBlockRule?: (matiere: string, niveau: string, classeId?: string, hours?: number) => void;
}

export const SubjectHourlyConstraintsManager: React.FC<SubjectHourlyConstraintsManagerProps> = ({
  teachers,
  classes,
  unites,
  options,
  onChangeOptions,
  onUpdateUnitHours,
  onUpdateLevelHours,
  onConfigureBlockRule,
}) => {
  // Mode de portée : Global, Par Niveau, Par Classe
  const [scopeMode, setScopeMode] = useState<'niveau' | 'classe' | 'global'>('niveau');

  // Niveaux uniques
  const allLevels = useMemo(
    () => Array.from(new Set(classes.map((c) => c.niveau).filter(Boolean))).sort(),
    [classes]
  );

  // Niveau actif
  const [selectedLevel, setSelectedLevel] = useState<string>(allLevels[0] || '2BAC');

  // Classes filtrées selon le niveau pour le mode Classe
  const classesOfSelectedLevel = useMemo(
    () => classes.filter((c) => !selectedLevel || c.niveau === selectedLevel),
    [classes, selectedLevel]
  );

  // Classe active
  const [selectedClassId, setSelectedClassId] = useState<string>(
    classesOfSelectedLevel[0]?.id || classes[0]?.id || ''
  );

  // Synchroniser la classe sélectionnée si on change de niveau
  React.useEffect(() => {
    if (classesOfSelectedLevel.length > 0) {
      const currentExists = classesOfSelectedLevel.some((c) => c.id === selectedClassId);
      if (!currentExists) {
        setSelectedClassId(classesOfSelectedLevel[0].id);
      }
    }
  }, [selectedLevel, classesOfSelectedLevel, selectedClassId]);

  // Filtre de recherche texte
  const [searchFilter, setSearchFilter] = useState('');

  // Cartes rapides
  const teacherMap = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  // Matières uniques dans l'établissement
  const allAvailableSubjects = useMemo(
    () => Array.from(new Set(teachers.map((t) => t.matiere))).sort(),
    [teachers]
  );

  // --- STATISTIQUES & DONNÉES PAR NIVEAU ---
  interface LevelSubjectRow {
    matiere: string;
    teachers: { id: string; nom: string }[];
    classes: { id: string; nom: string }[];
    totalHours: number;
    hoursPerClassAverage: number;
    units: Unite[];
  }

  const levelSubjectsData = useMemo<LevelSubjectRow[]>(() => {
    const map = new Map<
      string,
      {
        teachers: Map<string, string>;
        classes: Map<string, string>;
        totalHours: number;
        units: Unite[];
      }
    >();

    for (const u of unites) {
      const t = teacherMap.get(u.teacherId);
      if (!t) continue;
      const matchingClasses = u.classeIds
        .map((cid) => classMap.get(cid))
        .filter((c): c is Classe => Boolean(c && c.niveau === selectedLevel));

      if (matchingClasses.length === 0) continue;

      if (!map.has(t.matiere)) {
        map.set(t.matiere, {
          teachers: new Map(),
          classes: new Map(),
          totalHours: 0,
          units: [],
        });
      }

      const entry = map.get(t.matiere)!;
      entry.teachers.set(t.id, t.nom);
      for (const mc of matchingClasses) {
        entry.classes.set(mc.id, mc.nom);
      }
      entry.totalHours += u.heures;
      entry.units.push(u);
    }

    const rows: LevelSubjectRow[] = [];
    for (const [matiere, entry] of map.entries()) {
      const clsList = Array.from(entry.classes.entries()).map(([id, nom]) => ({ id, nom }));
      rows.push({
        matiere,
        teachers: Array.from(entry.teachers.entries()).map(([id, nom]) => ({ id, nom })),
        classes: clsList,
        totalHours: entry.totalHours,
        hoursPerClassAverage:
          clsList.length > 0 ? Math.round(entry.totalHours / clsList.length) : entry.totalHours,
        units: entry.units,
      });
    }

    return rows.sort((a, b) => b.totalHours - a.totalHours || a.matiere.localeCompare(b.matiere));
  }, [unites, teacherMap, classMap, selectedLevel]);

  // --- STATISTIQUES & DONNÉES PAR CLASSE ---
  interface ClassSubjectRow {
    uniteId: string;
    matiere: string;
    teacherNom: string;
    teacherId: string;
    heures: number;
    estCommun?: boolean;
    classeNom: string;
    niveau: string;
  }

  const activeClass = useMemo(() => classMap.get(selectedClassId), [classMap, selectedClassId]);

  const classSubjectsData = useMemo<ClassSubjectRow[]>(() => {
    if (!selectedClassId) return [];
    const rows: ClassSubjectRow[] = [];

    for (const u of unites) {
      if (!u.classeIds.includes(selectedClassId)) continue;
      const t = teacherMap.get(u.teacherId);
      if (!t) continue;
      const c = classMap.get(selectedClassId);
      rows.push({
        uniteId: u.id,
        matiere: t.matiere,
        teacherNom: t.nom,
        teacherId: t.id,
        heures: u.heures,
        estCommun: u.estCommun || u.classeIds.length > 1,
        classeNom: c?.nom || selectedClassId,
        niveau: c?.niveau || '',
      });
    }

    return rows.sort((a, b) => b.heures - a.heures || a.matiere.localeCompare(b.matiere));
  }, [unites, selectedClassId, teacherMap, classMap]);

  // --- RÉSOLUTION DES LIMITES & DÉTECTION D'HÉRITAGE ---
  const resolveSubjectLimitState = (matiere: string, classeId?: string, niveau?: string) => {
    const classKey = classeId ? `${classeId}::${matiere}` : '';
    const levelKey = niveau ? `${niveau}::${matiere}` : '';

    const classVal =
      classeId && options.maxHeuresParJourParMatiereClasse
        ? options.maxHeuresParJourParMatiereClasse[classKey]
        : undefined;

    const levelVal =
      niveau && options.maxHeuresParJourParMatiereNiveau
        ? options.maxHeuresParJourParMatiereNiveau[levelKey]
        : undefined;

    const globalVal =
      options.maxHeuresParJourParMatiere
        ? options.maxHeuresParJourParMatiere[matiere]
        : undefined;

    const defaultVal = (options.maxHeuresParJourUnite as 1 | 2 | 3) ?? 2;

    if (classVal !== undefined) {
      return {
        limit: classVal,
        source: 'classe' as const,
        label: `Spécifique à la classe (${classVal}h)`,
      };
    }
    if (levelVal !== undefined) {
      return {
        limit: levelVal,
        source: 'niveau' as const,
        label: `Hérité du niveau ${niveau} (${levelVal}h)`,
      };
    }
    if (globalVal !== undefined) {
      return {
        limit: globalVal,
        source: 'global' as const,
        label: `Hérité du global (${globalVal}h)`,
      };
    }
    return {
      limit: defaultVal,
      source: 'default' as const,
      label: `Standard par défaut (${defaultVal}h)`,
    };
  };

  // --- ACTIONS DE MODIFICATION DES CONTRAINTES ---

  // 1. Définir la limite pour tout un niveau
  const handleSetLevelDailyLimit = (niveau: string, matiere: string, limit: 1 | 2 | 3) => {
    const current = options.maxHeuresParJourParMatiereNiveau || {};
    const key = `${niveau}::${matiere}`;
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereNiveau: {
        ...current,
        [key]: limit,
      },
    });
  };

  // Réinitialiser la limite du niveau vers le global
  const handleResetLevelDailyLimit = (niveau: string, matiere: string) => {
    const current = { ...(options.maxHeuresParJourParMatiereNiveau || {}) };
    delete current[`${niveau}::${matiere}`];
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereNiveau: current,
    });
  };

  // 2. Définir la limite pour une classe spécifique
  const handleSetClassDailyLimit = (classeId: string, matiere: string, limit: 1 | 2 | 3) => {
    const current = options.maxHeuresParJourParMatiereClasse || {};
    const key = `${classeId}::${matiere}`;
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereClasse: {
        ...current,
        [key]: limit,
      },
    });
  };

  // Réinitialiser la limite de la classe vers le niveau / global
  const handleResetClassDailyLimit = (classeId: string, matiere: string) => {
    const current = { ...(options.maxHeuresParJourParMatiereClasse || {}) };
    delete current[`${classeId}::${matiere}`];
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereClasse: current,
    });
  };

  // 3. Définir la limite globale
  const handleSetGlobalDailyLimit = (matiere: string, limit: 1 | 2 | 3) => {
    const current = options.maxHeuresParJourParMatiere || {};
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiere: {
        ...current,
        [matiere]: limit,
      },
    });
  };

  // 4. Propager la limite du niveau à toutes les classes de ce niveau
  const handlePropagateLevelToClasses = (niveau: string, matiere: string, limit: 1 | 2 | 3) => {
    const currentClassLimits = { ...(options.maxHeuresParJourParMatiereClasse || {}) };
    const levelClasses = classes.filter((c) => c.niveau === niveau);
    for (const c of levelClasses) {
      currentClassLimits[`${c.id}::${matiere}`] = limit;
    }
    const currentLevelLimits = { ...(options.maxHeuresParJourParMatiereNiveau || {}) };
    currentLevelLimits[`${niveau}::${matiere}`] = limit;
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereNiveau: currentLevelLimits,
      maxHeuresParJourParMatiereClasse: currentClassLimits,
    });
  };

  // 5. Actions en lot par niveau
  const handleBatchSetLevelAllSubjects = (limit: 1 | 2 | 3) => {
    const current = { ...(options.maxHeuresParJourParMatiereNiveau || {}) };
    for (const row of levelSubjectsData) {
      current[`${selectedLevel}::${row.matiere}`] = limit;
    }
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereNiveau: current,
    });
  };

  const handleBatchSetLevelSciences3h = () => {
    const current = { ...(options.maxHeuresParJourParMatiereNiveau || {}) };
    const scienceKeywords = ['math', 'physique', 'chimie', 'svt', 'pc', 'science'];
    for (const row of levelSubjectsData) {
      const lower = row.matiere.toLowerCase();
      if (scienceKeywords.some((k) => lower.includes(k))) {
        current[`${selectedLevel}::${row.matiere}`] = 3;
      }
    }
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereNiveau: current,
    });
  };

  const handleResetAllLevelOverrides = () => {
    const current = { ...(options.maxHeuresParJourParMatiereNiveau || {}) };
    for (const row of levelSubjectsData) {
      delete current[`${selectedLevel}::${row.matiere}`];
    }
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereNiveau: current,
    });
  };

  // 6. Actions en lot par classe
  const handleBatchSetClassAllSubjects = (limit: 1 | 2 | 3) => {
    const current = { ...(options.maxHeuresParJourParMatiereClasse || {}) };
    for (const row of classSubjectsData) {
      current[`${selectedClassId}::${row.matiere}`] = limit;
    }
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereClasse: current,
    });
  };

  const handleResetAllClassOverrides = () => {
    const current = { ...(options.maxHeuresParJourParMatiereClasse || {}) };
    for (const row of classSubjectsData) {
      delete current[`${selectedClassId}::${row.matiere}`];
    }
    onChangeOptions({
      ...options,
      maxHeuresParJourParMatiereClasse: current,
    });
  };

  // Filtrage des résultats selon la recherche
  const filteredLevelRows = useMemo(() => {
    if (!searchFilter.trim()) return levelSubjectsData;
    const q = searchFilter.toLowerCase().trim();
    return levelSubjectsData.filter(
      (r) =>
        r.matiere.toLowerCase().includes(q) ||
        r.teachers.some((t) => t.nom.toLowerCase().includes(q))
    );
  }, [levelSubjectsData, searchFilter]);

  const filteredClassRows = useMemo(() => {
    if (!searchFilter.trim()) return classSubjectsData;
    const q = searchFilter.toLowerCase().trim();
    return classSubjectsData.filter(
      (r) => r.matiere.toLowerCase().includes(q) || r.teacherNom.toLowerCase().includes(q)
    );
  }, [classSubjectsData, searchFilter]);

  return (
    <div className="space-y-4">
      {/* BARRE D'ONGLETS DE PORTÉE : GLOBAL / PAR NIVEAU / PAR CLASSE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setScopeMode('niveau')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              scopeMode === 'niveau'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Par Niveau ({allLevels.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setScopeMode('classe')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              scopeMode === 'classe'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <School className="w-3.5 h-3.5" />
            <span>Par Classe ({classes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setScopeMode('global')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
              scopeMode === 'global'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Global Établissement ({allAvailableSubjects.length} matières)</span>
          </button>
        </div>

        {/* Recherche rapide */}
        <div className="relative min-w-[200px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher matière ou prof..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg bg-white"
          />
          {searchFilter && (
            <button
              type="button"
              onClick={() => setSearchFilter('')}
              className="text-[10px] text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* MODE 1 : PAR NIVEAU                                            */}
      {/* ============================================================== */}
      {scopeMode === 'niveau' && (
        <div className="space-y-4">
          {/* Sélecteur de Niveau (Pills interactives) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-bold text-slate-700 shrink-0 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-indigo-600" />
              Niveau scolaire :
            </span>
            {allLevels.map((lvl) => {
              const classesCount = classes.filter((c) => c.niveau === lvl).length;
              const isSelected = selectedLevel === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(lvl)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shrink-0 border ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                  }`}
                >
                  <span>{lvl}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isSelected ? 'bg-slate-800 text-indigo-200' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {classesCount} classe{classesCount > 1 ? 's' : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* En-tête du Niveau & Actions en lot */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                  Niveau {selectedLevel}
                </span>
                <span className="text-[11px] text-indigo-700 font-medium">
                  · {classesOfSelectedLevel.length} classes concernées (
                  {classesOfSelectedLevel.map((c) => c.nom).join(', ')})
                </span>
              </div>
              <p className="text-[11px] text-indigo-800/80 mt-0.5">
                Modifiez le volume hebdomadaire ou la limite journalière (1h, 2h ou 3h). Les classes de ce niveau hériteront automatiquement de cette configuration.
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap self-start md:self-auto">
              <button
                type="button"
                onClick={() => handleBatchSetLevelAllSubjects(2)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 shadow-2xs transition-colors"
                title="Rétablir toutes les matières de ce niveau au standard 2h max"
              >
                Tout à 2h (Standard)
              </button>
              <button
                type="button"
                onClick={handleBatchSetLevelSciences3h}
                className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-100/80 hover:bg-purple-200/80 rounded-lg border border-purple-200 transition-colors"
                title="Autoriser 3h max par jour pour les sciences (Maths, PC, SVT) en niveau terminal/supérieur"
              >
                Sciences à 3h max
              </button>
              <button
                type="button"
                onClick={handleResetAllLevelOverrides}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                title="Réinitialiser toutes les surcharges de ce niveau vers les valeurs globales de l'établissement"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Rétablir global</span>
              </button>
            </div>
          </div>

          {/* TABLEAU DES MATIÈRES PAR NIVEAU */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Matière ({filteredLevelRows.length})</th>
                  <th className="py-2.5 px-3">Professeurs assignés</th>
                  <th className="py-2.5 px-3 text-center">Volume hebdo</th>
                  <th className="py-2.5 px-3 text-center w-28 text-amber-800">1h max</th>
                  <th className="py-2.5 px-3 text-center w-28 text-indigo-900 bg-indigo-50/40">
                    2h max (Std)
                  </th>
                  <th className="py-2.5 px-3 text-center w-28 text-purple-800">3h max</th>
                  <th className="py-2.5 px-3">Statut d'héritage</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLevelRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Aucune matière trouvée pour le niveau « {selectedLevel} ».
                    </td>
                  </tr>
                ) : (
                  filteredLevelRows.map((row) => {
                    const levelKey = `${selectedLevel}::${row.matiere}`;
                    const hasLevelOverride =
                      options.maxHeuresParJourParMatiereNiveau?.[levelKey] !== undefined;
                    const resolved = resolveSubjectLimitState(row.matiere, undefined, selectedLevel);
                    const currentLimit = resolved.limit;

                    return (
                      <tr
                        key={row.matiere}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          hasLevelOverride ? 'bg-indigo-50/20' : ''
                        }`}
                      >
                        {/* Matière */}
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>{row.matiere}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-normal block mt-0.5">
                            {row.classes.length} classe{row.classes.length > 1 ? 's' : ''} ({row.classes.map((c) => c.nom).join(', ')})
                          </span>
                        </td>

                        {/* Professeurs */}
                        <td className="py-3 px-3 text-slate-600 text-[11px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {row.teachers.map((t) => (
                              <span
                                key={t.id}
                                className="bg-slate-100 px-2 py-0.5 rounded text-[10px] font-medium text-slate-700"
                              >
                                {t.nom}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Volume hebdo modifiable pour le niveau */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateLevelHours(
                                  selectedLevel,
                                  row.matiere,
                                  Math.max(1, row.hoursPerClassAverage - 1)
                                )
                              }
                              className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 rounded transition-colors text-xs font-bold"
                              title="Réduire de 1h hebdomadaire pour toutes les classes de ce niveau"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono font-bold text-slate-900 text-xs px-1 min-w-[28px]">
                              {row.hoursPerClassAverage}h
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateLevelHours(
                                  selectedLevel,
                                  row.matiere,
                                  row.hoursPerClassAverage + 1
                                )
                              }
                              className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 rounded transition-colors text-xs font-bold"
                              title="Augmenter de 1h hebdomadaire pour toutes les classes de ce niveau"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="block text-[9px] text-slate-400 mt-0.5">
                            {row.totalHours}h totales niveau
                          </span>
                        </td>

                        {/* Option 1h */}
                        <td className="py-3 px-3 text-center">
                          <label
                            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              currentLimit === 1
                                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs font-bold'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:bg-amber-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`limit_lvl_${row.matiere}`}
                              checked={currentLimit === 1}
                              onChange={() => handleSetLevelDailyLimit(selectedLevel, row.matiere, 1)}
                              className="sr-only"
                            />
                            <span>1h max</span>
                          </label>
                        </td>

                        {/* Option 2h (Standard) */}
                        <td className="py-3 px-3 text-center bg-indigo-50/30">
                          <label
                            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              currentLimit === 2
                                ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs font-bold'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`limit_lvl_${row.matiere}`}
                              checked={currentLimit === 2}
                              onChange={() => handleSetLevelDailyLimit(selectedLevel, row.matiere, 2)}
                              className="sr-only"
                            />
                            <span>2h (Std)</span>
                          </label>
                        </td>

                        {/* Option 3h */}
                        <td className="py-3 px-3 text-center">
                          <label
                            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              currentLimit === 3
                                ? 'bg-purple-100 text-purple-900 border-purple-300 shadow-2xs font-bold'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`limit_lvl_${row.matiere}`}
                              checked={currentLimit === 3}
                              onChange={() => handleSetLevelDailyLimit(selectedLevel, row.matiere, 3)}
                              className="sr-only"
                            />
                            <span>3h max</span>
                          </label>
                        </td>

                        {/* Statut d'héritage */}
                        <td className="py-3 px-3">
                          {hasLevelOverride ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                                <Check className="w-3 h-3" />
                                Spécifique niveau {selectedLevel}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleResetLevelDailyLimit(selectedLevel, row.matiere)}
                                className="text-slate-400 hover:text-slate-700 p-0.5"
                                title="Réinitialiser vers le global de l'établissement"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-medium">
                              {resolved.label}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handlePropagateLevelToClasses(selectedLevel, row.matiere, currentLimit)
                              }
                              className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors border border-slate-200"
                              title="Copier explicitement cette limite pour chaque classe de ce niveau"
                            >
                              Propager aux classes
                            </button>

                            {onConfigureBlockRule && (
                              <button
                                type="button"
                                onClick={() =>
                                  onConfigureBlockRule(
                                    row.matiere,
                                    selectedLevel,
                                    undefined,
                                    row.hoursPerClassAverage
                                  )
                                }
                                className="px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-200"
                                title="Configurer le découpage des blocs de séances pour cette matière"
                              >
                                Blocs...
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODE 2 : PAR CLASSE                                            */}
      {/* ============================================================== */}
      {scopeMode === 'classe' && (
        <div className="space-y-4">
          {/* Sélecteurs combinés : Filtre Niveau + Sélecteur Classe */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 shrink-0 flex items-center gap-1.5">
                <School className="w-3.5 h-3.5 text-indigo-600" />
                Choisir une classe :
              </span>

              {/* Filtre niveau pour restreindre les classes */}
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-slate-300 rounded-lg bg-slate-50 font-semibold"
              >
                {allLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Niveau {lvl}
                  </option>
                ))}
              </select>

              {/* Sélecteur de classe */}
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="text-xs px-3 py-1.5 border border-indigo-300 rounded-lg bg-indigo-50/50 font-bold text-indigo-950 focus:ring-2 focus:ring-indigo-500"
              >
                {classesOfSelectedLevel.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} ({c.niveau})
                  </option>
                ))}
              </select>
            </div>

            {/* Actions en lot pour la classe sélectionnée */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => handleBatchSetClassAllSubjects(2)}
                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors"
                title="Définir 2h max pour toutes les matières de cette classe"
              >
                Cette classe à 2h
              </button>
              <button
                type="button"
                onClick={handleResetAllClassOverrides}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                title="Effacer toutes les surcharges spécifiques à cette classe (ré-hérite du niveau et du global)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Rétablir héritage niveau</span>
              </button>
            </div>
          </div>

          {/* En-tête de la classe active */}
          {activeClass && (
            <div className="flex items-center justify-between p-3.5 bg-blue-50/60 rounded-xl border border-blue-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-blue-950 text-sm">
                  Classe : {activeClass.nom}
                </span>
                <span className="bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-md text-[11px]">
                  Niveau {activeClass.niveau}
                </span>
                <span className="text-slate-600">
                  · {classSubjectsData.length} matières enseignées ·{' '}
                  <strong className="text-slate-900">
                    {classSubjectsData.reduce((acc, r) => acc + r.heures, 0)} h / semaine
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* TABLEAU DES MATIÈRES DE LA CLASSE */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Matière ({filteredClassRows.length})</th>
                  <th className="py-2.5 px-3">Professeur</th>
                  <th className="py-2.5 px-3 text-center">Volume hebdo</th>
                  <th className="py-2.5 px-3 text-center w-28 text-amber-800">1h max</th>
                  <th className="py-2.5 px-3 text-center w-28 text-indigo-900 bg-indigo-50/40">
                    2h max (Std)
                  </th>
                  <th className="py-2.5 px-3 text-center w-28 text-purple-800">3h max</th>
                  <th className="py-2.5 px-3">Statut d'héritage</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredClassRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Aucune matière pour cette classe.
                    </td>
                  </tr>
                ) : (
                  filteredClassRows.map((row) => {
                    const classKey = `${selectedClassId}::${row.matiere}`;
                    const hasClassOverride =
                      options.maxHeuresParJourParMatiereClasse?.[classKey] !== undefined;
                    const resolved = resolveSubjectLimitState(
                      row.matiere,
                      selectedClassId,
                      row.niveau
                    );
                    const currentLimit = resolved.limit;

                    return (
                      <tr
                        key={row.uniteId}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          hasClassOverride ? 'bg-blue-50/20' : ''
                        }`}
                      >
                        {/* Matière */}
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>{row.matiere}</span>
                            {row.estCommun && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                Cours commun
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Professeur */}
                        <td className="py-3 px-3 text-slate-700 font-medium">
                          {row.teacherNom}
                        </td>

                        {/* Volume hebdo spécifique à cette classe */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() =>
                                onUpdateUnitHours(row.uniteId, Math.max(1, row.heures - 1))
                              }
                              className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 rounded transition-colors text-xs font-bold"
                              title="Réduire de 1h hebdomadaire pour cette classe"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="font-mono font-bold text-slate-900 text-xs px-1 min-w-[28px]">
                              {row.heures}h
                            </span>
                            <button
                              type="button"
                              onClick={() => onUpdateUnitHours(row.uniteId, row.heures + 1)}
                              className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 rounded transition-colors text-xs font-bold"
                              title="Augmenter de 1h hebdomadaire pour cette classe"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        {/* Option 1h */}
                        <td className="py-3 px-3 text-center">
                          <label
                            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              currentLimit === 1
                                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs font-bold'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:bg-amber-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`limit_cls_${row.uniteId}`}
                              checked={currentLimit === 1}
                              onChange={() =>
                                handleSetClassDailyLimit(selectedClassId, row.matiere, 1)
                              }
                              className="sr-only"
                            />
                            <span>1h max</span>
                          </label>
                        </td>

                        {/* Option 2h (Standard) */}
                        <td className="py-3 px-3 text-center bg-indigo-50/30">
                          <label
                            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              currentLimit === 2
                                ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs font-bold'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`limit_cls_${row.uniteId}`}
                              checked={currentLimit === 2}
                              onChange={() =>
                                handleSetClassDailyLimit(selectedClassId, row.matiere, 2)
                              }
                              className="sr-only"
                            />
                            <span>2h (Std)</span>
                          </label>
                        </td>

                        {/* Option 3h */}
                        <td className="py-3 px-3 text-center">
                          <label
                            className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              currentLimit === 3
                                ? 'bg-purple-100 text-purple-900 border-purple-300 shadow-2xs font-bold'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`limit_cls_${row.uniteId}`}
                              checked={currentLimit === 3}
                              onChange={() =>
                                handleSetClassDailyLimit(selectedClassId, row.matiere, 3)
                              }
                              className="sr-only"
                            />
                            <span>3h max</span>
                          </label>
                        </td>

                        {/* Statut d'héritage */}
                        <td className="py-3 px-3">
                          {hasClassOverride ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                <Check className="w-3 h-3" />
                                Spécifique à cette classe
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleResetClassDailyLimit(selectedClassId, row.matiere)
                                }
                                className="text-slate-400 hover:text-slate-700 p-0.5"
                                title="Réinitialiser pour ré-hériter du niveau ou du global"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-medium">
                              {resolved.label}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          {onConfigureBlockRule && (
                            <button
                              type="button"
                              onClick={() =>
                                onConfigureBlockRule(
                                  row.matiere,
                                  row.niveau,
                                  selectedClassId,
                                  row.heures
                                )
                              }
                              className="px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-200"
                              title="Définir des blocs de séances sur mesure pour cette classe"
                            >
                              Blocs...
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODE 3 : GLOBAL ÉTABLISSEMENT                                 */}
      {/* ============================================================== */}
      {scopeMode === 'global' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                Plafonds par défaut de l'établissement (Global)
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Ces limites s'appliquent par défaut à toutes les classes et tous les niveaux, sauf en cas de surcharge spécifique.
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const newLimits: Record<string, 1 | 2 | 3> = {};
                  for (const s of allAvailableSubjects) newLimits[s] = 2;
                  onChangeOptions({ ...options, maxHeuresParJourParMatiere: newLimits });
                }}
                className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors shadow-2xs"
              >
                Toutes à 2h (Standard)
              </button>
              <button
                type="button"
                onClick={() => {
                  const newLimits: Record<string, 1 | 2 | 3> = {};
                  for (const s of allAvailableSubjects) newLimits[s] = 3;
                  onChangeOptions({ ...options, maxHeuresParJourParMatiere: newLimits });
                }}
                className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors"
              >
                Toutes à 3h
              </button>
              <button
                type="button"
                onClick={() => {
                  const newLimits: Record<string, 1 | 2 | 3> = {};
                  for (const s of allAvailableSubjects) newLimits[s] = 1;
                  onChangeOptions({ ...options, maxHeuresParJourParMatiere: newLimits });
                }}
                className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors"
              >
                Toutes à 1h
              </button>
            </div>
          </div>

          {/* TABLEAU GLOBAL */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs bg-white">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  <th className="py-2.5 px-4">Matière</th>
                  <th className="py-2.5 px-3 text-center w-36 text-amber-800">1h max</th>
                  <th className="py-2.5 px-3 text-center w-36 text-indigo-900 bg-indigo-50/40">
                    2h max (Standard)
                  </th>
                  <th className="py-2.5 px-3 text-center w-36 text-purple-800">3h max</th>
                  <th className="py-2.5 px-4 text-right">Règle active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {allAvailableSubjects
                  .filter((s) => !searchFilter || s.toLowerCase().includes(searchFilter.toLowerCase()))
                  .map((subj) => {
                    const currentVal =
                      options.maxHeuresParJourParMatiere?.[subj] ??
                      (options.maxHeuresParJourUnite as 1 | 2 | 3) ??
                      2;

                    return (
                      <tr key={subj} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>{subj}</span>
                          </div>
                        </td>

                        {/* 1h */}
                        <td className="py-2.5 px-3 text-center">
                          <label
                            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              currentVal === 1
                                ? 'bg-amber-100 text-amber-900 border-amber-300 shadow-2xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:bg-amber-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`limit_glob_${subj}`}
                              checked={currentVal === 1}
                              onChange={() => handleSetGlobalDailyLimit(subj, 1)}
                              className="sr-only"
                            />
                            <span>1 heure</span>
                          </label>
                        </td>

                        {/* 2h */}
                        <td className="py-2.5 px-3 text-center bg-indigo-50/30">
                          <label
                            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              currentVal === 2
                                ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`limit_glob_${subj}`}
                              checked={currentVal === 2}
                              onChange={() => handleSetGlobalDailyLimit(subj, 2)}
                              className="sr-only"
                            />
                            <span>2 heures</span>
                          </label>
                        </td>

                        {/* 3h */}
                        <td className="py-2.5 px-3 text-center">
                          <label
                            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg cursor-pointer border text-xs font-semibold transition-all ${
                              currentVal === 3
                                ? 'bg-purple-100 text-purple-900 border-purple-300 shadow-2xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`limit_glob_${subj}`}
                              checked={currentVal === 3}
                              onChange={() => handleSetGlobalDailyLimit(subj, 3)}
                              className="sr-only"
                            />
                            <span>3 heures</span>
                          </label>
                        </td>

                        <td className="py-2.5 px-4 text-right">
                          <span className="text-[11px] text-slate-500 font-medium">
                            {currentVal === 1 && '1h max par séance'}
                            {currentVal === 2 && '2h max par jour (Standard)'}
                            {currentVal === 3 && 'Séances autorisées jusqu\'à 3h'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
