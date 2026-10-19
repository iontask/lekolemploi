/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  CheckSquare,
  Square,
  Sparkles,
  ShieldCheck,
  Check,
  X,
  Clock,
  Layers,
  GraduationCap,
  Info,
  Calendar,
  AlertCircle,
  Save,
} from 'lucide-react';
import { Classe, Teacher, Unite } from '../types';
import { RulesOptions } from '../rules/types';
import { getSubjectAbbreviation, getSubjectMeta } from '../utils/subjectFormatters';

interface TeacherConstraintsManagerProps {
  teachers: Teacher[];
  unites: Unite[];
  classes: Classe[];
  options: RulesOptions;
  onChangeOptions: (newOptions: RulesOptions) => void;
  onSave?: () => void;
}

export const TeacherConstraintsManager: React.FC<TeacherConstraintsManagerProps> = ({
  teachers,
  unites,
  classes,
  options,
  onChangeOptions,
  onSave,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [justSaved, setJustSaved] = useState(false);

  const handleSaveClick = () => {
    if (onSave) {
      onSave();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    }
  };

  const eviter1hList = options.profsEviter1hDemiJournee || [];
  const antiTrousList = options.profsRegrouperHeuresAntiTrous || [];

  const eviter1hSet = useMemo(() => new Set(eviter1hList), [eviter1hList]);
  const antiTrousSet = useMemo(() => new Set(antiTrousList), [antiTrousList]);

  const classMap = useMemo(() => new Map<string, Classe>(classes.map((c) => [c.id, c])), [classes]);

  // Statistiques de charge par professeur
  const teacherStats = useMemo(() => {
    const stats = new Map<string, { totalHours: number; classes: string[] }>();
    for (const t of teachers) {
      stats.set(t.id, { totalHours: 0, classes: [] });
    }
    for (const u of unites) {
      const entry = stats.get(u.teacherId);
      if (entry) {
        entry.totalHours += u.heures;
        for (const cid of u.classeIds) {
          const cNom = classMap.get(cid)?.nom || cid;
          if (!entry.classes.includes(cNom)) {
            entry.classes.push(cNom);
          }
        }
      }
    }
    return stats;
  }, [teachers, unites, classMap]);

  // Toutes les disciplines présentes
  const allDisciplines = useMemo(() => {
    const set = new Set<string>();
    for (const t of teachers) {
      if (t.matiere) set.add(t.matiere);
    }
    return Array.from(set).sort();
  }, [teachers]);

  // Basculer la contrainte "Éviter 1h demi-journée" pour un enseignant
  const handleToggleEviter1h = (teacherId: string) => {
    const nextList = eviter1hSet.has(teacherId)
      ? eviter1hList.filter((id) => id !== teacherId)
      : [...eviter1hList, teacherId];

    onChangeOptions({
      ...options,
      profsEviter1hDemiJournee: nextList,
    });
  };

  // Basculer la contrainte "Regrouper les heures / Anti-trous" pour un enseignant
  const handleToggleAntiTrous = (teacherId: string) => {
    const nextList = antiTrousSet.has(teacherId)
      ? antiTrousList.filter((id) => id !== teacherId)
      : [...antiTrousList, teacherId];

    onChangeOptions({
      ...options,
      profsRegrouperHeuresAntiTrous: nextList,
    });
  };

  // Activer ou désactiver les 2 options d'un coup pour un enseignant
  const handleSetBothForTeacher = (teacherId: string, activate: boolean) => {
    let nextEviter = [...eviter1hList];
    let nextAntiTrous = [...antiTrousList];

    if (activate) {
      if (!nextEviter.includes(teacherId)) nextEviter.push(teacherId);
      if (!nextAntiTrous.includes(teacherId)) nextAntiTrous.push(teacherId);
    } else {
      nextEviter = nextEviter.filter((id) => id !== teacherId);
      nextAntiTrous = nextAntiTrous.filter((id) => id !== teacherId);
    }

    onChangeOptions({
      ...options,
      profsEviter1hDemiJournee: nextEviter,
      profsRegrouperHeuresAntiTrous: nextAntiTrous,
    });
  };

  // =========================================================================
  // ACTIONS GLOBALES (BULK ACTIONS)
  // =========================================================================

  // Tout cocher : Éviter 1h demi-journée
  const handleBulkCheckEviter1h = (check: boolean) => {
    const targetTeachers = filteredTeachers.map((t) => t.id);
    let nextList: string[];
    if (check) {
      const set = new Set([...eviter1hList, ...targetTeachers]);
      nextList = Array.from(set);
    } else {
      nextList = eviter1hList.filter((id) => !targetTeachers.includes(id));
    }

    onChangeOptions({
      ...options,
      profsEviter1hDemiJournee: nextList,
    });
  };

  // Tout cocher : Regrouper les heures / Anti-trous
  const handleBulkCheckAntiTrous = (check: boolean) => {
    const targetTeachers = filteredTeachers.map((t) => t.id);
    let nextList: string[];
    if (check) {
      const set = new Set([...antiTrousList, ...targetTeachers]);
      nextList = Array.from(set);
    } else {
      nextList = antiTrousList.filter((id) => !targetTeachers.includes(id));
    }

    onChangeOptions({
      ...options,
      profsRegrouperHeuresAntiTrous: nextList,
    });
  };

  // Activer les deux pour tous les enseignants
  const handleBulkActivateBoth = () => {
    const allIds = teachers.map((t) => t.id);
    onChangeOptions({
      ...options,
      profsEviter1hDemiJournee: [...allIds],
      profsRegrouperHeuresAntiTrous: [...allIds],
    });
  };

  // Tout désactiver
  const handleBulkDeactivateAll = () => {
    onChangeOptions({
      ...options,
      profsEviter1hDemiJournee: [],
      profsRegrouperHeuresAntiTrous: [],
    });
  };

  // Liste filtrée des enseignants
  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      // Filtre matière
      if (selectedSubjectFilter !== 'ALL' && t.matiere !== selectedSubjectFilter) {
        return false;
      }
      // Filtre statut
      const hasAny = eviter1hSet.has(t.id) || antiTrousSet.has(t.id);
      if (statusFilter === 'ACTIVE' && !hasAny) return false;
      if (statusFilter === 'INACTIVE' && hasAny) return false;

      // Filtre texte
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = t.nom.toLowerCase().includes(q);
        const matchMat = t.matiere.toLowerCase().includes(q);
        const matchNum = String(t.num || '').includes(q);
        if (!matchName && !matchMat && !matchNum) return false;
      }
      return true;
    });
  }, [teachers, selectedSubjectFilter, statusFilter, searchQuery, eviter1hSet, antiTrousSet]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-5">
      {/* En-tête */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-start sm:items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal-50 text-teal-700 shrink-0">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                3. Optimisation des créneaux par Enseignant : Regroupement & Demi-journées
              </h2>
              <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                Qualité de vie des professeurs
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Cochez ou décochez pour chaque enseignant l'obligation d'<strong>éviter une venue pour 1h seulement en demi-journée</strong> (minimum 2h si présent le matin ou l'après-midi) et le <strong>regroupement compact de ses cours sans trous</strong>.
            </p>
          </div>
        </div>

        {/* Badges compteurs en direct + Bouton Sauvegarder */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-semibold text-indigo-900">
            <Clock className="w-3.5 h-3.5 text-indigo-600" />
            <span>Anti-1h : <strong>{eviter1hList.length}</strong> / {teachers.length}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-lg text-xs font-semibold text-purple-900">
            <Layers className="w-3.5 h-3.5 text-purple-600" />
            <span>Anti-trous : <strong>{antiTrousList.length}</strong> / {teachers.length}</span>
          </div>
          {onSave && (
            <button
              type="button"
              onClick={handleSaveClick}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-2xs transition-all ${
                justSaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-teal-700 hover:bg-teal-800 text-white'
              }`}
              title="Sauvegarder immédiatement les contraintes enseignants"
            >
              {justSaved ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Enregistré !</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Sauvegarder</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Barre d'outils et actions en masse */}
      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Actions rapides :
            </span>

            <button
              type="button"
              onClick={handleBulkActivateBoth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-900 bg-teal-100/70 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors shadow-2xs"
              title="Active à la fois l'anti-1h et le regroupement sans trous pour tous les enseignants"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
              <span>Activer tout pour tous les profs</span>
            </button>

            <button
              type="button"
              onClick={() => handleBulkCheckEviter1h(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
              title="Coche la contrainte d'éviter 1h en demi-journée pour tous les profs affichés"
            >
              <span>Tout cocher : Éviter 1h</span>
            </button>

            <button
              type="button"
              onClick={() => handleBulkCheckAntiTrous(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
              title="Coche la contrainte de regroupement anti-trous pour tous les profs affichés"
            >
              <span>Tout cocher : Regrouper (anti-trous)</span>
            </button>

            <button
              type="button"
              onClick={handleBulkDeactivateAll}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
              title="Désactive toutes les contraintes de regroupement enseignant"
            >
              <X className="w-3.5 h-3.5" />
              <span>Tout décocher</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 font-medium">
            Affichage de <strong>{filteredTeachers.length}</strong> enseignant(s) sur {teachers.length}
          </div>
        </div>

        {/* Filtres de recherche */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-200/60">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher un professeur ou discipline..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            {/* Filtre matière */}
            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700"
            >
              <option value="ALL">Toutes les disciplines ({teachers.length})</option>
              {allDisciplines.map((mat) => {
                const count = teachers.filter((t) => t.matiere === mat).length;
                return (
                  <option key={mat} value={mat}>
                    {mat} ({count})
                  </option>
                );
              })}
            </select>

            {/* Filtre statut */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  statusFilter === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tous
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Actifs
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('INACTIVE')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  statusFilter === 'INACTIVE'
                    ? 'bg-slate-200 text-slate-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inactifs
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tableau des enseignants */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="py-2.5 px-3.5 font-bold uppercase tracking-wider w-64">
                  Enseignant & Discipline
                </th>
                <th className="py-2.5 px-3 font-bold uppercase tracking-wider w-36 text-center">
                  Charge & Classes
                </th>
                <th className="py-2.5 px-3.5 font-bold uppercase tracking-wider">
                  Éviter 1h en demi-journée (Min. 2h si présent)
                </th>
                <th className="py-2.5 px-3.5 font-bold uppercase tracking-wider">
                  Regrouper les heures (Éviter les trous)
                </th>
                <th className="py-2.5 px-3 font-bold uppercase tracking-wider w-24 text-center">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTeachers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                    Aucun enseignant ne correspond aux critères de filtre.
                  </td>
                </tr>
              ) : (
                filteredTeachers.map((teacher) => {
                  const meta = getSubjectMeta(teacher.matiere);
                  const abbr = getSubjectAbbreviation(teacher.matiere);
                  const isEviter1h = eviter1hSet.has(teacher.id);
                  const isAntiTrous = antiTrousSet.has(teacher.id);
                  const stats = teacherStats.get(teacher.id);

                  return (
                    <tr
                      key={teacher.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isEviter1h || isAntiTrous ? 'bg-teal-50/20' : ''
                      }`}
                    >
                      {/* 1. Enseignant */}
                      <td className="py-2.5 px-3.5 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-[10px] shrink-0 ${
                              meta?.badgeClass || 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {abbr.slice(0, 3)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-slate-900 leading-tight">
                                {teacher.nom} {teacher.prenom || ''}
                              </span>
                              {teacher.num && (
                                <span className="text-[10px] font-mono text-slate-400">
                                  #{teacher.num}
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 block leading-tight">
                              {teacher.matiere}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Volume horaire & Classes */}
                      <td className="py-2.5 px-3 align-middle text-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-900 font-mono font-bold text-[11px] border border-slate-200">
                          {stats?.totalHours || 0} h / sem
                        </span>
                        <div
                          className="text-[10px] text-slate-500 truncate max-w-[130px] mx-auto mt-0.5"
                          title={stats?.classes.join(', ')}
                        >
                          {stats?.classes.length || 0} classe(s)
                        </div>
                      </td>

                      {/* 3. Checkbox Éviter 1h demi-journée */}
                      <td className="py-2.5 px-3.5 align-middle">
                        <button
                          type="button"
                          onClick={() => handleToggleEviter1h(teacher.id)}
                          className={`w-full inline-flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${
                            isEviter1h
                              ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-semibold shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isEviter1h ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 shrink-0" />
                            )}
                            <div className="text-left leading-tight">
                              <span className="font-bold block text-xs">
                                {isEviter1h ? 'Éviter venue pour 1h (Actif)' : 'Éviter venue pour 1h'}
                              </span>
                              <span className="text-[10px] font-normal text-slate-500 block">
                                Min. 2h si présent en demi-journée
                              </span>
                            </div>
                          </div>
                          {isEviter1h && (
                            <span className="text-[9px] font-bold bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded shrink-0">
                              Min 2h
                            </span>
                          )}
                        </button>
                      </td>

                      {/* 4. Checkbox Regrouper les heures (Anti-trous) */}
                      <td className="py-2.5 px-3.5 align-middle">
                        <button
                          type="button"
                          onClick={() => handleToggleAntiTrous(teacher.id)}
                          className={`w-full inline-flex items-center justify-between p-2 rounded-lg border text-xs transition-all ${
                            isAntiTrous
                              ? 'bg-purple-50/80 border-purple-300 text-purple-950 font-semibold shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isAntiTrous ? (
                              <CheckSquare className="w-4 h-4 text-purple-600 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 shrink-0" />
                            )}
                            <div className="text-left leading-tight">
                              <span className="font-bold block text-xs">
                                {isAntiTrous ? 'Regrouper les heures (Actif)' : 'Regrouper les heures'}
                              </span>
                              <span className="text-[10px] font-normal text-slate-500 block">
                                Supprimer les créneaux creux / trous
                              </span>
                            </div>
                          </div>
                          {isAntiTrous && (
                            <span className="text-[9px] font-bold bg-purple-200 text-purple-900 px-1.5 py-0.5 rounded shrink-0">
                              Zéro trou
                            </span>
                          )}
                        </button>
                      </td>

                      {/* 5. Actions rapides par prof */}
                      <td className="py-2.5 px-3 align-middle text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isEviter1h && isAntiTrous ? (
                            <button
                              type="button"
                              onClick={() => handleSetBothForTeacher(teacher.id, false)}
                              className="text-[10px] text-slate-500 hover:text-rose-600 font-semibold px-1.5 py-1 rounded hover:bg-rose-50 transition-colors"
                              title="Désactiver les deux contraintes pour ce prof"
                            >
                              Désactiver
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetBothForTeacher(teacher.id, true)}
                              className="text-[10px] text-teal-700 hover:text-teal-900 font-bold px-1.5 py-1 rounded bg-teal-50 hover:bg-teal-100 transition-colors"
                              title="Activer les deux contraintes pour ce prof"
                            >
                              Les 2
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

        {/* Pied récapitulatif */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              Les professeurs cochés sont pris en compte comme contraintes prioritaires par le solveur mathématique et le moteur de règles.
            </span>
          </div>
          <div className="font-medium text-slate-700 shrink-0">
            Total : <strong>{teachers.length}</strong> enseignant(s) au projet
          </div>
        </div>
      </div>
    </div>
  );
};
