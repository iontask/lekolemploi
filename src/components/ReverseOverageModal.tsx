/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  X,
  Sparkles,
  RotateCcw,
  BookOpen,
  Calendar,
  User,
  GraduationCap,
  Info,
  ShieldCheck,
  CheckSquare,
  Square,
} from 'lucide-react';
import { ImportDataset } from '../types';
import { Planning } from '../rules/types';
import { analyzeScheduleExceptions, ScheduleException } from '../utils/scheduleExceptions';
import { getSubjectAbbreviation, getSubjectMeta } from '../utils/subjectFormatters';

interface ReverseOverageModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: ImportDataset;
  planning: Planning;
  currentDisabledOverages?: string[];
  currentInterdireTous?: boolean;
  onRelaunchWithDisabledOverages: (
    disabledOverages: string[],
    interdireTous: boolean
  ) => void;
  onSavePreferences?: (
    disabledOverages: string[],
    interdireTous: boolean
  ) => void;
}

export const ReverseOverageModal: React.FC<ReverseOverageModalProps> = ({
  isOpen,
  onClose,
  dataset,
  planning,
  currentDisabledOverages = [],
  currentInterdireTous = false,
  onRelaunchWithDisabledOverages,
  onSavePreferences,
}) => {
  const exceptions = useMemo(
    () => analyzeScheduleExceptions(dataset, planning),
    [dataset, planning]
  );

  const overages: ScheduleException[] = exceptions.exces2hJour;

  // État local des dépassements désactivés (cochés = interdits au solveur)
  const [selectedDisabledIds, setSelectedDisabledIds] = useState<string[]>(() => {
    // Si déjà présent dans dataset.constraints ou props
    const initial = currentDisabledOverages || dataset.constraints?.disabledOverages || [];
    return initial;
  });

  const [interdireTous, setInterdireTous] = useState<boolean>(
    currentInterdireTous ?? dataset.constraints?.interdireTousDepassements ?? false
  );

  const [filterQuery, setFilterQuery] = useState('');

  // Synchronisation lors de l'ouverture
  React.useEffect(() => {
    if (isOpen) {
      setSelectedDisabledIds(
        currentDisabledOverages || dataset.constraints?.disabledOverages || []
      );
      setInterdireTous(
        currentInterdireTous ?? dataset.constraints?.interdireTousDepassements ?? false
      );
    }
  }, [isOpen, currentDisabledOverages, currentInterdireTous, dataset.constraints]);

  if (!isOpen) return null;

  const isOverageDisabled = (id: string) => {
    if (interdireTous) return true;
    return selectedDisabledIds.includes(id);
  };

  const handleToggleOverage = (id: string) => {
    if (interdireTous) return;
    setSelectedDisabledIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const allIds = overages.map((o) => o.id);
    setSelectedDisabledIds(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedDisabledIds([]);
    setInterdireTous(false);
  };

  const handleApplyAndRelaunch = () => {
    if (onSavePreferences) {
      onSavePreferences(selectedDisabledIds, interdireTous);
    }
    onRelaunchWithDisabledOverages(selectedDisabledIds, interdireTous);
    onClose();
  };

  const filteredOverages = overages.filter((o) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      o.entiteNom.toLowerCase().includes(q) ||
      (o.matiere && o.matiere.toLowerCase().includes(q)) ||
      o.jourNom.toLowerCase().includes(q) ||
      o.description.toLowerCase().includes(q)
    );
  });

  const disabledCount = interdireTous ? overages.length : selectedDisabledIds.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150">
        {/* En-tête avec gradient distinctif violet/indigo */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-5 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-400/30 shadow-inner">
              <SlidersHorizontal className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Option « Reverse Dépassement »
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-400 text-purple-950 uppercase">
                  Audit & Règle dure
                </span>
              </div>
              <p className="text-xs text-purple-200/90 mt-0.5">
                Neutralisez les dépassements de plus de 2h/jour observés dans l'output et forcez le solveur à respecter un quota strict.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-purple-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps défilable */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Bannière explicative */}
          <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3.5 flex items-start gap-3 text-xs text-purple-900">
            <Info className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-purple-950">
                Comment fonctionne le Reverse Dépassement ?
              </p>
              <p className="text-purple-800 leading-relaxed text-[11px]">
                Par défaut, le solveur considère la limite de 2h/jour par matière comme une contrainte souple (pénalisée à 100).
                En cochant un dépassement ci-dessous, vous le convertissez en <strong>contrainte dure absolue</strong> pour le solveur HiGHS MIP : il aura l'interdiction formelle de placer plus de 2h pour cette matière ce jour-là.
              </p>
            </div>
          </div>

          {/* Contrôle global et filtres */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={interdireTous}
                  onChange={(e) => setInterdireTous(e.target.checked)}
                  className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  Interdire TOUS les dépassements (Règle dure globale)
                </span>
              </label>

              {!interdireTous && overages.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-purple-800 bg-purple-100/80 hover:bg-purple-200/80 rounded-md transition-colors"
                  >
                    <CheckSquare className="w-3 h-3" />
                    <span>Tout cocher</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
                  >
                    <Square className="w-3 h-3" />
                    <span>Tout décocher</span>
                  </button>
                </div>
              )}
            </div>

            {/* Barre de recherche si plusieurs dépassements */}
            {overages.length > 3 && (
              <div>
                <input
                  type="text"
                  placeholder="Filtrer par matière, classe, enseignant ou jour..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            )}
          </div>

          {/* Liste des dépassements détectés */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Dépassements détectés dans l'output ({overages.length})
              </span>
              <span className="text-xs font-semibold text-purple-800">
                {disabledCount} dépassement(s) neutralisé(s)
              </span>
            </div>

            {overages.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-emerald-900">
                  Aucun dépassement de 2h/jour dans l'output actuel
                </h4>
                <p className="text-xs text-emerald-700 mt-1">
                  Toutes les matières sont parfaitement limitées à 2h par jour maximum sur l'emploi du temps généré !
                </p>
              </div>
            ) : filteredOverages.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                Aucun dépassement ne correspond au filtre de recherche.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredOverages.map((exc) => {
                  const isDisabled = isOverageDisabled(exc.id);
                  const meta = exc.matiere ? getSubjectMeta(exc.matiere) : null;
                  const abbr = exc.matiere ? getSubjectAbbreviation(exc.matiere) : 'ENS';

                  return (
                    <div
                      key={exc.id}
                      onClick={() => !interdireTous && handleToggleOverage(exc.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isDisabled
                          ? 'bg-purple-50/90 border-purple-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isDisabled}
                          disabled={interdireTous}
                          onChange={() => handleToggleOverage(exc.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Pastille matière */}
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                meta?.badgeClass || 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {abbr} · {exc.matiere || 'Matière'}
                            </span>

                            {/* Classe */}
                            <span className="flex items-center gap-1 text-xs font-semibold text-slate-900">
                              <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                              {exc.entiteNom}
                            </span>

                            {/* Jour */}
                            <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {exc.jourNom}
                            </span>
                          </div>

                          <p className="text-xs text-slate-600">
                            {exc.description}
                          </p>
                        </div>
                      </div>

                      {/* Statut & badge */}
                      <div className="shrink-0 flex items-center gap-2 self-end sm:self-auto">
                        {isDisabled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-200 text-purple-900 border border-purple-300">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                            <span>Interdiction stricte</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-100 text-amber-900 border border-amber-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Dépassement autorisé</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Pied de page d'action */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {disabledCount > 0 ? (
              <span className="text-purple-950 font-medium">
                🛡️ <strong>{disabledCount}</strong> dépassement(s) seront strictement interdits lors de la relance.
              </span>
            ) : (
              <span>Aucun dépassement sélectionné pour interdiction stricte.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors"
            >
              Fermer
            </button>

            {onSavePreferences && (
              <button
                type="button"
                onClick={() => {
                  onSavePreferences(selectedDisabledIds, interdireTous);
                  onClose();
                }}
                className="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold text-purple-800 bg-purple-100 hover:bg-purple-200 rounded-xl transition-colors"
              >
                Enregistrer
              </button>
            )}

            <button
              type="button"
              onClick={handleApplyAndRelaunch}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl shadow-xs transition-colors"
            >
              <Sparkles className="w-4 h-4 text-purple-300" />
              <span>
                {disabledCount > 0
                  ? `Relancer avec ${disabledCount} dépassement(s) désactivé(s)`
                  : 'Relancer le solveur'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
