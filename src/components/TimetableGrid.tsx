/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ImportDataset } from '../types';
import { Affectation, Planning } from '../rules/types';
import { score, verify } from '../rules';
import { SolverResult } from '../solver/types';
import { analyzeScheduleExceptions } from '../utils/scheduleExceptions';
import { exportTimetableMultiSheetsExcel } from '../services/timetableExporter';
import {
  executeMoveOrSwap,
  executePlaceFromBin,
  executeUnassignToBin,
  getBlockSlotsForAssignment,
  getLockKey,
} from '../utils/dndRulesHelper';
import { ClassTeacherView } from './views/ClassTeacherView';
import { ClassesAscMatrixView } from './views/ClassesAscMatrixView';
import { TeachersMatrixView } from './views/TeachersMatrixView';
import { SubjectView } from './views/SubjectView';
import {
  Calendar,
  Download,
  Printer,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Table,
  GraduationCap,
  Users,
  BookOpen,
  Undo2,
  Redo2,
  Lock,
  X,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  FileDown,
  SlidersHorizontal,
  ShieldCheck,
  CheckSquare,
  Square,
} from 'lucide-react';
import { PrintPdfModal } from './PrintPdfModal';
import { ReverseOverageModal } from './ReverseOverageModal';
import { getSubjectAbbreviation, getSubjectMeta } from '../utils/subjectFormatters';

interface TimetableGridProps {
  dataset: ImportDataset;
  planning: Planning;
  resultInfo?: SolverResult | null;
  onOpenGenerator: (
    relaxedMode?: boolean,
    disabledOverages?: string[],
    interdireTousDepassements?: boolean
  ) => void;
  onOpenGeneratorWithLocks?: (lockedAssignments: Affectation[]) => void;
  onUpdatePlanning?: (newPlanning: Planning) => void;
  onSaveConstraints?: (constraints: import('../rules/types').RulesOptions) => void;
}

export const TimetableGrid: React.FC<TimetableGridProps> = ({
  dataset,
  planning: initialPlanning,
  resultInfo,
  onOpenGenerator,
  onOpenGeneratorWithLocks,
  onUpdatePlanning,
  onSaveConstraints,
}) => {
  const [activeSubView, setActiveSubView] = useState<
    'asc' | 'individual' | 'subject' | 'teachers_matrix' | 'exceptions'
  >('individual');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isReverseModalOpen, setIsReverseModalOpen] = useState(false);
  const [selectedDisabledOverages, setSelectedDisabledOverages] = useState<string[]>(
    () => dataset.constraints?.disabledOverages || []
  );
  const [interdireTousDepassements, setInterdireTousDepassements] = useState<boolean>(
    () => dataset.constraints?.interdireTousDepassements || false
  );

  // Synchronisation avec dataset.constraints
  useEffect(() => {
    setSelectedDisabledOverages(dataset.constraints?.disabledOverages || []);
    setInterdireTousDepassements(dataset.constraints?.interdireTousDepassements || false);
  }, [dataset.constraints]);

  // --- HISTORIQUE ANNULER / RÉTABLIR ILLIMITÉ ---
  const [history, setHistory] = useState<Planning[]>([initialPlanning]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Synchronisation si initialPlanning change de l'extérieur
  useEffect(() => {
    setHistory([initialPlanning]);
    setHistoryIndex(0);
  }, [initialPlanning]);

  const currentPlanning = history[historyIndex] || initialPlanning;
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = () => {
    if (canUndo) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      onUpdatePlanning?.(history[nextIdx]);
      setToast({
        text: `Action annulée (étape ${nextIdx + 1}/${history.length})`,
        type: 'info',
      });
    }
  };

  const handleRedo = () => {
    if (canRedo) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      onUpdatePlanning?.(history[nextIdx]);
      setToast({
        text: `Action rétablie (étape ${nextIdx + 1}/${history.length})`,
        type: 'info',
      });
    }
  };

  // Écouteur clavier Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, historyIndex, history]);

  // --- GESTION DES COURS VERROUILLÉS (CADENAS) ---
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(new Set());

  const handleToggleLock = (uniteId: string, slot: number) => {
    const blockSlots = getBlockSlotsForAssignment(
      currentPlanning,
      uniteId,
      slot,
      dataset.semaine
    );

    setLockedKeys((prev) => {
      const next = new Set(prev);
      const isAnyLocked = blockSlots.some((s) => next.has(getLockKey(uniteId, s)));

      if (isAnyLocked) {
        // Déverrouiller
        for (const s of blockSlots) {
          next.delete(getLockKey(uniteId, s));
        }
        setToast({
          text: `Cours déverrouillé (${blockSlots.length} h). Il peut à nouveau être déplacé ou régénéré.`,
          type: 'info',
        });
      } else {
        // Verrouiller
        for (const s of blockSlots) {
          next.add(getLockKey(uniteId, s));
        }
        setToast({
          text: `Cours verrouillé (${blockSlots.length} h). Il restera figé lors de la régénération et du glisser-déposer.`,
          type: 'success',
        });
      }
      return next;
    });
  };

  // Liste des affectations actuellement verrouillées
  const lockedAssignments = useMemo(() => {
    return currentPlanning.filter((a) => lockedKeys.has(getLockKey(a.uniteId, a.slot)));
  }, [currentPlanning, lockedKeys]);

  // --- NOTIFICATIONS TOAST ---
  const [toast, setToast] = useState<{
    text: string;
    type: 'success' | 'warning' | 'error' | 'info';
  } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- SCORE ET VIOLATIONS MIS À JOUR EN DIRECT ---
  const liveScore = useMemo(() => score(currentPlanning, dataset), [currentPlanning, dataset]);
  const liveViolations = useMemo(() => verify(currentPlanning, dataset), [currentPlanning, dataset]);
  const hardViolations = useMemo(() => liveViolations.filter((v) => v.severite === 'DURE'), [liveViolations]);
  const softViolations = useMemo(() => liveViolations.filter((v) => v.severite === 'SOUPLE'), [liveViolations]);

  const totalRequiredHours = useMemo(() => {
    return dataset.unites.reduce((sum, u) => sum + u.heures, 0);
  }, [dataset]);
  const missingHours = Math.max(0, totalRequiredHours - currentPlanning.length);
  const insertionRate = totalRequiredHours > 0
    ? Math.round((currentPlanning.length / totalRequiredHours) * 100)
    : 100;

  const [showViolationsPanel, setShowViolationsPanel] = useState(false);

  // --- DÉPLACEMENT ET ÉCHANGE DE COURS ---
  const handleMoveCourse = (
    sourceUniteId: string,
    sourceSlots: number[],
    targetSlot: number,
    contextEntity?: { type: 'class' | 'teacher'; id: string }
  ) => {
    const res = executeMoveOrSwap(
      currentPlanning,
      sourceUniteId,
      sourceSlots,
      targetSlot,
      dataset,
      lockedKeys,
      undefined,
      contextEntity
    );

    if (!res.success) {
      setToast({
        text: `Déplacement refusé : ${res.error}`,
        type: 'error',
      });
      return { success: false, error: res.error };
    }

    // Succès : ajout à l'historique illimité
    const newHistory = history.slice(0, historyIndex + 1).concat([res.newPlanning]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    onUpdatePlanning?.(res.newPlanning);

    if (res.warning) {
      setToast({
        text: res.warning,
        type: 'warning',
      });
    } else {
      setToast({
        text: res.isSwap
          ? 'Échange de cours réalisé avec succès !'
          : 'Déplacement effectué avec succès (0 conflit dur).',
        type: 'success',
      });
    }

    return { success: true, warning: res.warning };
  };

  // --- PLACEMENT D'UNE SÉANCE DEPUIS LE BAC VERS LA GRILLE ---
  const handlePlaceFromBin = (
    uniteId: string,
    isBlock2h: boolean,
    targetSlot: number,
    contextEntity?: { type: 'class' | 'teacher'; id: string }
  ) => {
    const res = executePlaceFromBin(
      currentPlanning,
      uniteId,
      isBlock2h,
      targetSlot,
      dataset,
      lockedKeys,
      undefined,
      contextEntity
    );

    if (!res.success) {
      setToast({
        text: `Placement refusé : ${res.error}`,
        type: 'error',
      });
      return { success: false, error: res.error };
    }

    const newHistory = history.slice(0, historyIndex + 1).concat([res.newPlanning]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    onUpdatePlanning?.(res.newPlanning);

    if (res.isSwap) {
      setToast({
        text: 'Séance placée ! Le cours précédent a été renvoyé dans le bac de réserve.',
        type: 'warning',
      });
    } else {
      setToast({
        text: `Séance (${isBlock2h ? 'bloc de 2h' : '1h'}) placée avec succès sur l'emploi du temps !`,
        type: 'success',
      });
    }

    return { success: true, warning: res.warning };
  };

  // --- RETRAIT D'UN COURS VERS LE BAC DE RÉSERVE ---
  const handleUnassignToBin = (uniteId: string, slots: number[]) => {
    const res = executeUnassignToBin(currentPlanning, uniteId, slots);
    const newHistory = history.slice(0, historyIndex + 1).concat([res.newPlanning]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    onUpdatePlanning?.(res.newPlanning);

    setToast({
      text: `Séance (${slots.length}h) retirée de l'emploi du temps et déposée dans le bac de réserve.`,
      type: 'info',
    });

    return { success: true };
  };

  // --- RELANCER LE SOLVEUR AVEC LES COURS VERROUILLÉS FIXÉS ---
  const handleRegenerateWithLocks = () => {
    if (lockedAssignments.length === 0) {
      onOpenGenerator();
      return;
    }

    if (onOpenGeneratorWithLocks) {
      onOpenGeneratorWithLocks(lockedAssignments);
    } else {
      onOpenGenerator();
    }
  };

  // --- EXPORTS EXCEL ET IMPRESSION ---
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const exceptionsSummary = useMemo(
    () => analyzeScheduleExceptions(dataset, currentPlanning),
    [dataset, currentPlanning]
  );

  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);
      await exportTimetableMultiSheetsExcel(dataset, currentPlanning);
    } catch (err) {
      console.error("Erreur lors de l'exportation Excel :", err);
      setToast({
        text: "Une erreur est survenue lors de l'exportation Excel.",
        type: 'error',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleToggleOverage = (excId: string) => {
    if (interdireTousDepassements) return;
    const next = selectedDisabledOverages.includes(excId)
      ? selectedDisabledOverages.filter((id) => id !== excId)
      : [...selectedDisabledOverages, excId];
    setSelectedDisabledOverages(next);
    if (onSaveConstraints) {
      onSaveConstraints({
        ...(dataset.constraints || {}),
        disabledOverages: next,
        interdireTousDepassements,
      });
    }
  };

  const handleSelectAllOverages = () => {
    const allIds = exceptionsSummary.exces2hJour.map((e) => e.id);
    setSelectedDisabledOverages(allIds);
    if (onSaveConstraints) {
      onSaveConstraints({
        ...(dataset.constraints || {}),
        disabledOverages: allIds,
        interdireTousDepassements,
      });
    }
  };

  const handleDeselectAllOverages = () => {
    setSelectedDisabledOverages([]);
    setInterdireTousDepassements(false);
    if (onSaveConstraints) {
      onSaveConstraints({
        ...(dataset.constraints || {}),
        disabledOverages: [],
        interdireTousDepassements: false,
      });
    }
  };

  const handleToggleInterdireTous = (val: boolean) => {
    setInterdireTousDepassements(val);
    if (onSaveConstraints) {
      onSaveConstraints({
        ...(dataset.constraints || {}),
        disabledOverages: selectedDisabledOverages,
        interdireTousDepassements: val,
      });
    }
  };

  const handleRelaunchWithReverse = (customOverages?: string[], customInterdireAll?: boolean) => {
    const listToApply = customOverages ?? selectedDisabledOverages;
    const allToApply = customInterdireAll ?? interdireTousDepassements;
    if (onSaveConstraints) {
      onSaveConstraints({
        ...(dataset.constraints || {}),
        disabledOverages: listToApply,
        interdireTousDepassements: allToApply,
      });
    }
    onOpenGenerator(false, listToApply, allToApply);
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top duration-200">
          <div
            className={`p-3.5 rounded-xl border shadow-lg flex items-start gap-3 text-xs ${
              toast.type === 'error'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : toast.type === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : toast.type === 'info'
                ? 'bg-slate-900 border-slate-700 text-white'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {toast.type === 'error' ? (
                <ShieldAlert className="w-4 h-4 text-rose-600" />
              ) : toast.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              ) : toast.type === 'info' ? (
                <Calendar className="w-4 h-4 text-slate-300" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <p className="flex-1 leading-snug">{toast.text}</p>
            <button
              onClick={() => setToast(null)}
              className="shrink-0 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Barre d'outils supérieure : Titre, Score direct, Annuler/Rétablir & Actions */}
      <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4 print:hidden">
        {/* Titre & Qualité */}
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white">
              <Calendar className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              Emploi du temps scolaire
            </h2>

            {hardViolations.length === 0 ? (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>0 conflit dur</span>
              </span>
            ) : (
              <button
                onClick={() => setShowViolationsPanel(!showViolationsPanel)}
                className="text-xs font-semibold px-2.5 py-1 rounded-md bg-rose-50 text-rose-800 border border-rose-300 inline-flex items-center gap-1 hover:bg-rose-100 transition-colors"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                <span>{hardViolations.length} conflit(s) dur(s)</span>
              </button>
            )}

            {lockedAssignments.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.8 rounded-md bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1 font-mono">
                <Lock className="w-3 h-3 text-amber-700" />
                <span>{lockedAssignments.length} verrouillé(s)</span>
              </span>
            )}
          </div>

          {/* Synthèse score en direct */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5">
            <span>
              <strong className="text-slate-900 font-mono">{currentPlanning.length}</strong> h placées
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Score total : <strong className="text-slate-900 font-mono">{liveScore.total} pts</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Compacité : <strong className="text-slate-700 font-mono">{liveScore.coutCompacite}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Excès &gt; 2h : <strong className="text-slate-700 font-mono">{liveScore.penalitesExcesJour} pts</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Non consécutif : <strong className="text-slate-700 font-mono">{liveScore.penalitesNonConsecutif} pts</strong>
            </span>
          </div>
        </div>

        {/* Boutons d'interaction Étape 5 */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Annuler / Rétablir */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title="Annuler le dernier déplacement (Ctrl+Z)"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors text-slate-700 hover:text-slate-900 disabled:opacity-40 disabled:hover:text-slate-700 hover:bg-white shadow-2xs"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Annuler</span>
              {canUndo && <span className="text-[10px] text-slate-400">({historyIndex})</span>}
            </button>
            <div className="h-4 w-px bg-slate-300 mx-0.5" />
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              title="Rétablir le déplacement annulé (Ctrl+Y)"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors text-slate-700 hover:text-slate-900 disabled:opacity-40 disabled:hover:text-slate-700 hover:bg-white shadow-2xs"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span>Rétablir</span>
              {canRedo && <span className="text-[10px] text-slate-400">({history.length - 1 - historyIndex})</span>}
            </button>
          </div>

          {/* Bouton Regénérer en gardant les cours verrouillés */}
          <button
            onClick={handleRegenerateWithLocks}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors shadow-2xs"
            title="Relance le solveur avec les cours verrouillés fixés (x[u,s] = 1)"
          >
            <Lock className="w-3.5 h-3.5 text-amber-700" />
            <span>
              Regénérer ({lockedAssignments.length} verrouillés)
            </span>
          </button>

          {/* Exporter Excel */}
          <button
            onClick={handleExportExcel}
            disabled={isExportingExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
            title="Exporte le classeur complet Excel (.xlsx) avec tous les onglets"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>{isExportingExcel ? 'Export...' : 'Excel'}</span>
          </button>

          {/* Impression PDF paysage & Livrets */}
          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-2xs"
            title="Exporter en PDF au format paysage ou imprimer directement"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-600" />
            <span>Imprimer / PDF Paysage</span>
          </button>

          {/* Option Reverse Dépassement */}
          <button
            onClick={() => setIsReverseModalOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors shadow-2xs border ${
              exceptionsSummary.exces2hJour.length > 0
                ? 'bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title="Désactiver les dépassements de plus de 2h par jour et relancer le solveur"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600" />
            <span>Reverse Dépassement</span>
            {exceptionsSummary.exces2hJour.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-200 text-purple-900 font-bold">
                {interdireTousDepassements
                  ? 'Tous'
                  : selectedDisabledOverages.length > 0
                  ? `${selectedDisabledOverages.length}/${exceptionsSummary.exces2hJour.length}`
                  : exceptionsSummary.exces2hJour.length}
              </span>
            )}
          </button>

          {/* Solveur complet */}
          <button
            onClick={() => onOpenGenerator(false, selectedDisabledOverages, interdireTousDepassements)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Solveur</span>
          </button>
        </div>
      </div>

      {/* Alerte Reverse Dépassement si des dépassements de 2h/j sont présents dans l'output */}
      {exceptionsSummary.exces2hJour.length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 via-indigo-50/80 to-purple-50 border border-purple-300/80 rounded-xl p-4 text-xs shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-600 text-white shrink-0 mt-0.5 shadow-2xs">
              <SlidersHorizontal className="w-4 h-4 text-purple-200" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-purple-950">
                  Dépassements détectés dans l'output ({exceptionsSummary.exces2hJour.length} matière(s) &gt; 2 h/jour)
                </span>
                <span className="font-bold px-2 py-0.5 rounded-full bg-purple-200 text-purple-900 border border-purple-300 text-[10px]">
                  {interdireTousDepassements
                    ? 'Tous neutralisés (Règle dure stricte)'
                    : selectedDisabledOverages.length > 0
                    ? `${selectedDisabledOverages.length} neutralisé(s)`
                    : 'Tolérés (règle souple)'}
                </span>
              </div>
              <p className="text-purple-800 mt-0.5 text-[11px] leading-relaxed">
                Ces dépassements sont également récapitulés sur l'onglet 1 du classeur Excel. Activez le <strong>Reverse Dépassement</strong> pour les neutraliser et relancer le solveur avec contrainte dure.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsReverseModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-900 bg-white hover:bg-purple-100 border border-purple-300 rounded-lg shadow-2xs transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-700" />
              <span>Gérer ({selectedDisabledOverages.length}/{exceptionsSummary.exces2hJour.length})</span>
            </button>
            <button
              type="button"
              onClick={() => handleRelaunchWithReverse(exceptionsSummary.exces2hJour.map((e) => e.id), true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-2xs transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-300" />
              <span>Tout interdire & Relancer</span>
            </button>
          </div>
        </div>
      )}

      {/* Alerte si des matières ne sont pas affectées à 100 % avec appel à la recommandation IA */}
      {missingHours > 0 && (
        <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-amber-50/80 border border-indigo-200/90 rounded-xl p-4 text-xs shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5 shadow-2xs">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900">
                  Matières incomplètes ({missingHours} h non affectée(s) sur {totalRequiredHours} h requises)
                </span>
                <span className="font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px]">
                  Taux d'insertion : {insertionRate} %
                </span>
              </div>
              <p className="text-slate-600 mt-0.5 text-[11px]">
                Certaines contraintes (blocs de 2h max, créneaux interdits, plafonds journaliers) limitent le placement. L'IA propose d'assouplir des contraintes ciblées pour atteindre 100 % d'insertion.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenGenerator(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors shrink-0 self-start sm:self-auto"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Recommandations IA pour 100 %</span>
          </button>
        </div>
      )}

      {/* Panneau dépliable des violations en direct (si des violations existent) */}
      {hardViolations.length > 0 && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-xs space-y-2 animate-in fade-in duration-200">
          <div className="flex items-center justify-between font-bold text-rose-900">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-700" />
              <span>{hardViolations.length} violation(s) dure(s) détectée(s) dans le planning actif</span>
            </div>
            <button
              onClick={() => setShowViolationsPanel(!showViolationsPanel)}
              className="text-rose-700 hover:text-rose-900 underline flex items-center gap-1 font-normal"
            >
              <span>{showViolationsPanel ? 'Masquer' : 'Voir le détail'}</span>
              {showViolationsPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showViolationsPanel && (
            <ul className="mt-2 space-y-1 text-rose-800 list-disc list-inside">
              {hardViolations.map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Barre d'onglets de visualisation */}
      <div className="bg-white rounded-xl border border-slate-200 p-1.5 shadow-xs flex items-center gap-1 overflow-x-auto print:hidden">
        <button
          onClick={() => setActiveSubView('individual')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
            activeSubView === 'individual'
              ? 'bg-slate-900 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" />
          <span>Fiche interactive (Classe / Prof)</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        </button>

        <button
          onClick={() => setActiveSubView('subject')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
            activeSubView === 'subject'
              ? 'bg-slate-900 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Vue par Matière</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        </button>

        <button
          onClick={() => setActiveSubView('asc')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
            activeSubView === 'asc'
              ? 'bg-slate-900 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          <span>Vue aSc Horaires (Classes)</span>
        </button>

        <button
          onClick={() => setActiveSubView('teachers_matrix')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
            activeSubView === 'teachers_matrix'
              ? 'bg-slate-900 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Vue d'ensemble Profs</span>
        </button>

        <button
          onClick={() => setActiveSubView('exceptions')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap ml-auto ${
            activeSubView === 'exceptions'
              ? 'bg-slate-900 text-white shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle
            className={`w-3.5 h-3.5 ${
              exceptionsSummary.totalExceptions > 0 ? 'text-amber-500' : 'text-slate-400'
            }`}
          />
          <span>Audit & Exceptions</span>
          {exceptionsSummary.totalExceptions > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
              {exceptionsSummary.totalExceptions}
            </span>
          )}
        </button>
      </div>

      {/* Rendu dynamique de la sous-vue */}
      <div>
        {activeSubView === 'individual' && (
          <ClassTeacherView
            dataset={dataset}
            planning={currentPlanning}
            lockedKeys={lockedKeys}
            onToggleLock={handleToggleLock}
            onMoveCourse={handleMoveCourse}
            onPlaceFromBin={handlePlaceFromBin}
            onUnassignToBin={handleUnassignToBin}
          />
        )}

        {activeSubView === 'subject' && (
          <SubjectView
            dataset={dataset}
            planning={currentPlanning}
            lockedKeys={lockedKeys}
            onToggleLock={handleToggleLock}
            onMoveCourse={handleMoveCourse}
          />
        )}

        {activeSubView === 'asc' && (
          <ClassesAscMatrixView dataset={dataset} planning={currentPlanning} />
        )}

        {activeSubView === 'teachers_matrix' && (
          <TeachersMatrixView dataset={dataset} planning={currentPlanning} />
        )}

        {activeSubView === 'exceptions' && (
          <div className="space-y-6">
            {/* Cartes résumé */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">
                  Dépassements &gt; 2 h/j
                </span>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {exceptionsSummary.exces2hJour.length}
                </p>
                <span className="text-[11px] text-slate-400">
                  Règle souple (pénalité 100)
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">Heures scindées</span>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {exceptionsSummary.heuresCoupees.length}
                </p>
                <span className="text-[11px] text-slate-400">
                  Séances séparées (pénalité 15)
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">
                  Heures creuses (classes)
                </span>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {exceptionsSummary.trousClasses.length}
                </p>
                <span className="text-[11px] text-slate-400">
                  Trous dans l'emploi du temps
                </span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-xs text-slate-500 font-medium">
                  Créneaux libres totaux
                </span>
                <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
                  {exceptionsSummary.creneauxLibresTotal}
                </p>
                <span className="text-[11px] text-slate-400">
                  Sur {dataset.classes.length * 32} créneaux
                </span>
              </div>
            </div>

            {/* Panneau interactif Reverse Dépassement */}
            {exceptionsSummary.exces2hJour.length > 0 && (
              <div className="bg-gradient-to-r from-purple-50 via-indigo-50/70 to-purple-50 border border-purple-200 rounded-xl p-5 space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-purple-600 text-white shadow-2xs">
                      <SlidersHorizontal className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-purple-950">
                          Option Reverse Dépassement : Neutraliser les dépassements de 2h/jour
                        </h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200 text-purple-900">
                          {interdireTousDepassements
                            ? 'Tous neutralisés'
                            : `${selectedDisabledOverages.length}/${exceptionsSummary.exces2hJour.length} neutralisé(s)`}
                        </span>
                      </div>
                      <p className="text-xs text-purple-800 mt-0.5">
                        Cochez les dépassements ci-dessous pour les interdire au solveur HiGHS MIP (contrainte dure), puis relancez le solveur.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <label className="flex items-center gap-2 text-xs font-semibold text-purple-950 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-purple-300 shadow-2xs">
                      <input
                        type="checkbox"
                        checked={interdireTousDepassements}
                        onChange={(e) => handleToggleInterdireTous(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <span>Interdire TOUS les dépassements</span>
                    </label>
                  </div>
                </div>

                {!interdireTousDepassements && (
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-purple-200/60">
                    <span className="text-purple-900 font-medium">
                      Sélection individuelle des matières / jours à bloquer :
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllOverages}
                        className="text-purple-800 hover:text-purple-950 font-semibold underline text-xs"
                      >
                        Tout cocher
                      </button>
                      <span className="text-purple-300">·</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllOverages}
                        className="text-slate-600 hover:text-slate-800 font-medium underline text-xs"
                      >
                        Tout décocher
                      </button>
                    </div>
                  </div>
                )}

                {/* Grille des dépassements avec cases à cocher */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {exceptionsSummary.exces2hJour.map((exc) => {
                    const isChecked = interdireTousDepassements || selectedDisabledOverages.includes(exc.id);
                    const meta = exc.matiere ? getSubjectMeta(exc.matiere) : null;
                    const abbr = exc.matiere ? getSubjectAbbreviation(exc.matiere) : 'ENS';

                    return (
                      <label
                        key={exc.id}
                        onClick={() => !interdireTousDepassements && handleToggleOverage(exc.id)}
                        className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-purple-100/70 border-purple-300 shadow-2xs'
                            : 'bg-white border-purple-100 hover:border-purple-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={interdireTousDepassements}
                          onChange={() => handleToggleOverage(exc.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                meta?.badgeClass || 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              {abbr}
                            </span>
                            <span className="font-bold text-xs text-slate-900 font-mono">
                              {exc.entiteNom}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">· {exc.jourNom}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                              {exc.creneaux?.length || 3} h
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 leading-tight">
                            {exc.description}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {isChecked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-200 text-purple-900">
                              <ShieldCheck className="w-3 h-3 text-purple-700" />
                              <span>Interdit</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                              Toléré
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Bouton de relance directe avec les dépassements désactivés */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-purple-200/60">
                  <span className="text-xs text-purple-900">
                    {interdireTousDepassements
                      ? 'Tous les dépassements seront convertis en contraintes dures au solveur.'
                      : `${selectedDisabledOverages.length} dépassement(s) converti(s) en contrainte(s) dure(s).`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRelaunchWithReverse()}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl shadow-xs transition-colors self-stretch sm:self-auto"
                  >
                    <Sparkles className="w-4 h-4 text-purple-300" />
                    <span>
                      Relancer le solveur avec le ou les dépassement(s) désactivé(s)
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Liste complète des exceptions */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Journal détaillé des exceptions et alertes de régularité
                </h3>
                <span className="text-xs text-slate-500">
                  Exporté également dans l'onglet 1 du classeur Excel
                </span>
              </div>

              {exceptionsSummary.totalExceptions === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-900">
                    Aucune exception détectée
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    L'emploi du temps généré respecte à 100% l'ensemble des contraintes de compacité et de consécutivité.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {[
                    ...exceptionsSummary.exces2hJour,
                    ...exceptionsSummary.heuresCoupees,
                    ...exceptionsSummary.trousClasses,
                    ...exceptionsSummary.trousProfs,
                  ].map((exc) => (
                    <div
                      key={exc.id}
                      className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              exc.severity === 'warning'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {exc.titre}
                          </span>
                          <span className="text-xs font-semibold text-slate-900 font-mono">
                            {exc.entiteNom}
                          </span>
                          <span className="text-xs text-slate-500">· {exc.jourNom}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {exc.description}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {exc.type === 'EXCES_2H_JOUR' && (
                          <button
                            type="button"
                            onClick={() => handleToggleOverage(exc.id)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                              interdireTousDepassements || selectedDisabledOverages.includes(exc.id)
                                ? 'bg-purple-100 text-purple-900 border border-purple-300'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={interdireTousDepassements || selectedDisabledOverages.includes(exc.id)}
                              readOnly
                              className="rounded text-purple-600 focus:ring-purple-500 w-3 h-3 pointer-events-none"
                            />
                            <span>
                              {interdireTousDepassements || selectedDisabledOverages.includes(exc.id)
                                ? 'Reverse Dépassement actif'
                                : 'Désactiver ce dépassement'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal d'exportation et impression PDF paysage */}
      <PrintPdfModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        dataset={dataset}
        planning={currentPlanning}
        activeSubView={activeSubView}
      />

      {/* Modal interactif Reverse Dépassement */}
      <ReverseOverageModal
        isOpen={isReverseModalOpen}
        onClose={() => setIsReverseModalOpen(false)}
        dataset={dataset}
        planning={currentPlanning}
        currentDisabledOverages={selectedDisabledOverages}
        currentInterdireTous={interdireTousDepassements}
        onRelaunchWithDisabledOverages={(disabledIds, interdireAll) => {
          setSelectedDisabledOverages(disabledIds);
          setInterdireTousDepassements(interdireAll);
          if (onSaveConstraints) {
            onSaveConstraints({
              ...(dataset.constraints || {}),
              disabledOverages: disabledIds,
              interdireTousDepassements: interdireAll,
            });
          }
          onOpenGenerator(false, disabledIds, interdireAll);
        }}
        onSavePreferences={(disabledIds, interdireAll) => {
          setSelectedDisabledOverages(disabledIds);
          setInterdireTousDepassements(interdireAll);
          if (onSaveConstraints) {
            onSaveConstraints({
              ...(dataset.constraints || {}),
              disabledOverages: disabledIds,
              interdireTousDepassements: interdireAll,
            });
          }
          setToast({
            text: 'Préférences Reverse Dépassement enregistrées.',
            type: 'success',
          });
        }}
      />
    </div>
  );
};
