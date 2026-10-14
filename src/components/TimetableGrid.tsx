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
} from 'lucide-react';

interface TimetableGridProps {
  dataset: ImportDataset;
  planning: Planning;
  resultInfo?: SolverResult | null;
  onOpenGenerator: () => void;
  onOpenGeneratorWithLocks?: (lockedAssignments: Affectation[]) => void;
  onUpdatePlanning?: (newPlanning: Planning) => void;
}

export const TimetableGrid: React.FC<TimetableGridProps> = ({
  dataset,
  planning: initialPlanning,
  resultInfo,
  onOpenGenerator,
  onOpenGeneratorWithLocks,
  onUpdatePlanning,
}) => {
  const [activeSubView, setActiveSubView] = useState<
    'asc' | 'individual' | 'subject' | 'teachers_matrix' | 'exceptions'
  >('individual');

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

  const [showViolationsPanel, setShowViolationsPanel] = useState(false);

  // --- DÉPLACEMENT ET ÉCHANGE DE COURS ---
  const handleMoveCourse = (
    sourceUniteId: string,
    sourceSlots: number[],
    targetSlot: number
  ) => {
    const res = executeMoveOrSwap(
      currentPlanning,
      sourceUniteId,
      sourceSlots,
      targetSlot,
      dataset,
      lockedKeys
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

  // --- RELANCER LE SOLVEUR AVEC LES COURS VERROUILLÉS FIXÉS ---
  const handleRegenerateWithLocks = () => {
    if (lockedAssignments.length === 0) {
      if (
        window.confirm(
          "Aucun cours n'est actuellement verrouillé. Souhaitez-vous lancer une génération standard ?"
        )
      ) {
        onOpenGenerator();
      }
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
      alert("Une erreur est survenue lors de la génération du fichier Excel.");
    } finally {
      setIsExportingExcel(false);
    }
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

          {/* Impression PDF paysage */}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-2xs"
            title="Imprime la vue active au format paysage"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Imprimer</span>
          </button>

          {/* Solveur complet */}
          <button
            onClick={onOpenGenerator}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Solveur</span>
          </button>
        </div>
      </div>

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
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
