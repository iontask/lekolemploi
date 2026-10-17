/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Classe, ImportDataset, Teacher, Unite } from '../../types';
import { Affectation, Planning } from '../../rules/types';
import { getSlotTimeRange } from '../../rules';
import { getSubjectMeta } from '../../utils/subjectFormatters';
import {
  CellDropEvaluation,
  evaluateMoveOrSwap,
  evaluatePlaceFromBin,
  getBlockSlotsForAssignment,
  getLockKey,
  getUnassignedSessionsForEntity,
  UnassignedSessionItem,
} from '../../utils/dndRulesHelper';
import { DraggableCourseCard } from '../dnd/DraggableCourseCard';
import { DroppableCell } from '../dnd/DroppableCell';
import { UnassignedBin } from '../dnd/UnassignedBin';
import {
  ArrowLeftRight,
  Check,
  XCircle,
  AlertTriangle,
  X,
  Clock,
  Inbox,
  ArrowDownToLine,
  FileDown,
  Printer,
} from 'lucide-react';
import {
  downloadClassTimetablePDF,
  downloadTeacherTimetablePDF,
  triggerSafeBrowserPrint,
} from '../../services/pdfExportService';

interface ClassTeacherViewProps {
  dataset: ImportDataset;
  planning: Planning;
  lockedKeys: Set<string>;
  onToggleLock: (uniteId: string, slot: number) => void;
  onMoveCourse: (
    sourceUniteId: string,
    sourceSlots: number[],
    targetSlot: number,
    contextEntity?: { type: 'class' | 'teacher'; id: string }
  ) => { success: boolean; warning?: string; error?: string };
  onPlaceFromBin?: (
    uniteId: string,
    isBlock2h: boolean,
    targetSlot: number,
    contextEntity?: { type: 'class' | 'teacher'; id: string }
  ) => { success: boolean; warning?: string; error?: string };
  onUnassignToBin?: (
    uniteId: string,
    slots: number[]
  ) => { success: boolean; error?: string };
}

export const ClassTeacherView: React.FC<ClassTeacherViewProps> = ({
  dataset,
  planning,
  lockedKeys,
  onToggleLock,
  onMoveCourse,
  onPlaceFromBin,
  onUnassignToBin,
}) => {
  const { teachers, classes, unites, semaine } = dataset;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const [mode, setMode] = useState<'class' | 'teacher'>('class');
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');

  // État du glissement en cours
  const [activeDrag, setActiveDrag] = useState<{
    uniteId: string;
    sourceSlots: number[];
    isBlock2h: boolean;
    subject: string;
    subTitle: string;
    badgeClass: string;
    isFromBin?: boolean;
    binItemId?: string;
  } | null>(null);

  // État de sélection par clic pour mettre en surbrillance les échanges et déplacements
  const [selectedCourse, setSelectedCourse] = useState<{
    uniteId: string;
    slot?: number;
    sourceSlots: number[];
    isBlock2h: boolean;
    subject: string;
    subTitle: string;
    badgeClass: string;
    isFromBin?: boolean;
    binItemId?: string;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'success' | 'warning' | 'error' | 'info';
  } | null>(null);

  // Évaluations calculées pendant le glissement
  const [evaluations, setEvaluations] = useState<Map<number, CellDropEvaluation>>(new Map());

  // Capteurs DND avec distance d'activation pour distinguer le clic simple du drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const teacherMap = useMemo(() => new Map<string, Teacher>(teachers.map((t) => [t.id, t])), [teachers]);
  const classMap = useMemo(() => new Map<string, Classe>(classes.map((c) => [c.id, c])), [classes]);
  const uniteMap = useMemo(() => new Map<string, Unite>(unites.map((u) => [u.id, u])), [unites]);

  // Indexation des créneaux
  const slotToAffs = useMemo(() => {
    const map = new Map<number, Affectation[]>();
    for (const aff of planning) {
      const list = map.get(aff.slot) || [];
      list.push(aff);
      map.set(aff.slot, list);
    }
    return map;
  }, [planning]);

  const selectedClass = classMap.get(selectedClassId);
  const selectedTeacher = teacherMap.get(selectedTeacherId);

  // Contexte d'entité active (classe ou prof) pour évaluer les échanges précisément
  const contextEntity = useMemo(
    () => ({
      type: mode,
      id: mode === 'class' ? selectedClassId : selectedTeacherId,
    }),
    [mode, selectedClassId, selectedTeacherId]
  );

  // Séances non affectées dans le bac de réserve pour cette entité
  const unassignedItems = useMemo(() => {
    return getUnassignedSessionsForEntity(dataset, planning, contextEntity);
  }, [dataset, planning, contextEntity]);

  // Réinitialiser la sélection si l'entité change
  useEffect(() => {
    setSelectedCourse(null);
  }, [mode, selectedClassId, selectedTeacherId]);

  // Écoute de la touche Échap pour désélectionner
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCourse(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Statistiques pour l'entité sélectionnée
  const relevantAffs = useMemo(() => {
    return planning.filter((a) => {
      const u = uniteMap.get(a.uniteId);
      if (!u) return false;
      return mode === 'class' ? u.classeIds.includes(selectedClassId) : u.teacherId === selectedTeacherId;
    });
  }, [planning, mode, selectedClassId, selectedTeacherId, uniteMap]);

  // Évaluations complètes lors d'un clic de sélection de cours (grille ou bac)
  const clickEvaluations = useMemo(() => {
    if (!selectedCourse) return new Map<number, CellDropEvaluation>();
    const evals = new Map<number, CellDropEvaluation>();
    for (let s = 0; s < totalSlots; s++) {
      const res = selectedCourse.isFromBin
        ? evaluatePlaceFromBin(
            planning,
            selectedCourse.uniteId,
            selectedCourse.isBlock2h,
            s,
            dataset,
            lockedKeys,
            undefined,
            contextEntity
          )
        : evaluateMoveOrSwap(
            planning,
            selectedCourse.uniteId,
            selectedCourse.sourceSlots,
            s,
            dataset,
            lockedKeys,
            undefined,
            contextEntity
          );
      evals.set(s, res);
    }
    return evals;
  }, [selectedCourse, planning, dataset, lockedKeys, contextEntity, totalSlots]);

  // Début du glissement : depuis la grille ou depuis le bac
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (!data) return;

    setSelectedCourse(null); // Annuler toute sélection par clic en cours

    if (data.isFromBin) {
      // Glissement depuis le bac de réserve
      setActiveDrag({
        uniteId: data.uniteId,
        sourceSlots: [],
        isBlock2h: !!data.isBlock2h,
        subject: data.subject,
        subTitle: data.subTitle,
        badgeClass: data.badgeClass,
        isFromBin: true,
        binItemId: data.binItemId,
      });

      const evals = new Map<number, CellDropEvaluation>();
      for (let s = 0; s < totalSlots; s++) {
        const res = evaluatePlaceFromBin(
          planning,
          data.uniteId,
          !!data.isBlock2h,
          s,
          dataset,
          lockedKeys,
          undefined,
          contextEntity
        );
        evals.set(s, res);
      }
      setEvaluations(evals);
      return;
    }

    // Glissement régulier depuis la grille
    const { uniteId, sourceSlots, isBlock2h, subject, subTitle } = data;
    const u = uniteMap.get(uniteId);
    const prof = u ? teacherMap.get(u.teacherId) : null;
    const meta = getSubjectMeta(prof?.matiere || '');

    setActiveDrag({
      uniteId,
      sourceSlots,
      isBlock2h,
      subject,
      subTitle,
      badgeClass: meta.badgeClass,
      isFromBin: false,
    });

    const evals = new Map<number, CellDropEvaluation>();
    for (let s = 0; s < totalSlots; s++) {
      const res = evaluateMoveOrSwap(
        planning,
        uniteId,
        sourceSlots,
        s,
        dataset,
        lockedKeys,
        undefined,
        contextEntity
      );
      evals.set(s, res);
    }
    setEvaluations(evals);
  };

  // Fin du glissement : placement depuis le bac, renvoi au bac, ou déplacement / échange
  const handleDragEnd = (event: DragEndEvent) => {
    const { over } = event;
    if (activeDrag && over) {
      // Cas 1 : Glissé d'un cours de la grille vers le bac de réserve
      if (over.id === 'unassigned_bin' && !activeDrag.isFromBin) {
        onUnassignToBin?.(activeDrag.uniteId, activeDrag.sourceSlots);
        setActiveDrag(null);
        setEvaluations(new Map());
        return;
      }

      // Cas 2 : Déposé sur un créneau horaire
      const targetSlot = over.data.current?.slot;
      if (typeof targetSlot === 'number') {
        if (activeDrag.isFromBin) {
          onPlaceFromBin?.(activeDrag.uniteId, activeDrag.isBlock2h, targetSlot, contextEntity);
        } else {
          onMoveCourse(activeDrag.uniteId, activeDrag.sourceSlots, targetSlot, contextEntity);
        }
      }
    }

    setActiveDrag(null);
    setEvaluations(new Map());
  };

  // Clic sur une case de l'emploi du temps en mode sélection
  const handleClickCell = (targetSlot: number) => {
    if (!selectedCourse) return;

    // Clic sur l'emplacement actuel d'un cours de la grille : désélectionner
    if (!selectedCourse.isFromBin && selectedCourse.sourceSlots.includes(targetSlot)) {
      setSelectedCourse(null);
      return;
    }

    const evaluation = clickEvaluations.get(targetSlot);
    if (!evaluation) return;

    if (evaluation.status === 'green' || evaluation.status === 'orange') {
      const res = selectedCourse.isFromBin
        ? onPlaceFromBin?.(
            selectedCourse.uniteId,
            selectedCourse.isBlock2h,
            targetSlot,
            contextEntity
          )
        : onMoveCourse(
            selectedCourse.uniteId,
            selectedCourse.sourceSlots,
            targetSlot,
            contextEntity
          );
      if (res?.success) {
        setSelectedCourse(null);
      }
    } else {
      setToastMessage({
        text: `Action impossible sur ce créneau : ${evaluation.reasons[0] || 'Conflit de règles dures'}`,
        type: 'error',
      });
    }
  };

  // Clic sur un item du bac de réserve
  const handleSelectBinItem = (item: UnassignedSessionItem) => {
    if (selectedCourse?.isFromBin && selectedCourse.binItemId === item.id) {
      setSelectedCourse(null);
      return;
    }

    const meta = getSubjectMeta(item.matiere);
    setSelectedCourse({
      uniteId: item.uniteId,
      sourceSlots: [],
      isBlock2h: item.isBlock2h,
      subject: item.matiere,
      subTitle: `${item.profNom} · ${item.classesLabel}`,
      badgeClass: meta.badgeClass,
      isFromBin: true,
      binItemId: item.id,
    });
  };

  // Clic sur un cours pour le sélectionner ou échanger
  const handleSelectCourse = (
    aff: Affectation,
    blockSlots: number[],
    subject: string,
    subTitle: string,
    badgeClass: string,
    isBlock2h: boolean
  ) => {
    // Si on clique sur le cours déjà sélectionné : on le désélectionne
    if (selectedCourse?.uniteId === aff.uniteId && selectedCourse?.sourceSlots.includes(aff.slot)) {
      setSelectedCourse(null);
      return;
    }

    // Si un cours est déjà sélectionné et que la case cliquée permet un échange direct
    if (selectedCourse) {
      const targetEval = clickEvaluations.get(aff.slot);
      if (targetEval && (targetEval.status === 'green' || targetEval.status === 'orange')) {
        const res = onMoveCourse(
          selectedCourse.uniteId,
          selectedCourse.sourceSlots,
          aff.slot,
          contextEntity
        );
        if (res.success) {
          setSelectedCourse(null);
          return;
        }
      }
    }

    // Sélection du nouveau cours
    setSelectedCourse({
      uniteId: aff.uniteId,
      slot: aff.slot,
      sourceSlots: blockSlots,
      isBlock2h,
      subject,
      subTitle,
      badgeClass,
    });
  };

  const isSelectionActive = selectedCourse !== null;
  const isDragActive = activeDrag !== null;
  const currentEvaluations = isDragActive ? evaluations : clickEvaluations;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Sélecteurs et barre d'actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-xs print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setMode('class')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'class' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Vue par Classe
              </button>
              <button
                onClick={() => setMode('teacher')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'teacher' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Vue par Professeur
              </button>
            </div>

            {mode === 'class' ? (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold font-mono focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} ({c.niveau})
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nom} · {t.matiere}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="text-slate-500 font-medium">
              <strong className="text-slate-900 font-mono">{relevantAffs.length} h</strong> affectées
            </span>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              <span>Clic ou glisser pour échanger</span>
            </div>

            {/* Télécharger PDF Paysage */}
            <button
              onClick={() => {
                if (mode === 'class') {
                  downloadClassTimetablePDF(dataset, planning, selectedClassId);
                } else {
                  downloadTeacherTimetablePDF(dataset, planning, selectedTeacherId);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-2xs"
              title="Télécharger l'emploi du temps en PDF format paysage A4"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>PDF Paysage</span>
            </button>

            {/* Imprimer via navigateur */}
            <button
              onClick={() => {
                const res = triggerSafeBrowserPrint();
                if (!res.success) {
                  if (mode === 'class') {
                    downloadClassTimetablePDF(dataset, planning, selectedClassId);
                  } else {
                    downloadTeacherTimetablePDF(dataset, planning, selectedTeacherId);
                  }
                }
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-2xs"
              title="Imprimer directement"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Imprimer</span>
            </button>
          </div>
        </div>

        {/* Message d'erreur / notification contextuelle */}
        {toastMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{toastMessage.text}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 text-rose-500 hover:text-rose-800 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Bannière de cours sélectionné par clic : guide interactif des échanges */}
        {selectedCourse && (
          <div
            className={`p-3.5 rounded-xl shadow-lg border flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150 ${
              selectedCourse.isFromBin
                ? 'bg-amber-900 border-amber-700 text-white'
                : 'bg-blue-900 border-blue-700 text-white'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full animate-ping inline-block ${
                  selectedCourse.isFromBin ? 'bg-amber-400' : 'bg-blue-400'
                }`}
              />
              <span className="font-bold">
                {selectedCourse.isFromBin ? 'Séance en attente du bac :' : 'Cours sélectionné :'}
              </span>
              <span className="font-semibold text-amber-300 text-sm">{selectedCourse.subject}</span>
              <span className="text-slate-200">({selectedCourse.subTitle})</span>
              <span className="px-2 py-0.5 rounded bg-black/30 text-white font-bold text-[10px]">
                {selectedCourse.isBlock2h ? 'Bloc de 2h consécutives' : 'Séance de 1h'}
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                Vert = Compatible
              </span>
              <span className="flex items-center gap-1 text-amber-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                Orange = Remplacement / Avert.
              </span>
              <span className="flex items-center gap-1 text-rose-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                Grisé = Conflit
              </span>

              {!selectedCourse.isFromBin && onUnassignToBin && (
                <button
                  type="button"
                  onClick={() => {
                    onUnassignToBin(selectedCourse.uniteId, selectedCourse.sourceSlots);
                    setSelectedCourse(null);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
                  title="Retirer ce cours de l'emploi du temps et le déposer dans le bac de réserve"
                >
                  <Inbox className="w-3.5 h-3.5" />
                  <span>Renvoyer au bac</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedCourse(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-black/30 hover:bg-black/50 text-white font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Désélectionner (Échap)</span>
              </button>
            </div>
          </div>
        )}

        {/* Légende interactive lors du glisser-déposer */}
        {activeDrag && (
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="font-bold">
                {activeDrag.isFromBin ? 'Placement depuis le bac :' : 'Déplacement en cours :'}
              </span>
              <span className="font-semibold text-amber-300">{activeDrag.subject}</span>
              <span className="text-slate-300">({activeDrag.subTitle})</span>
              {activeDrag.isBlock2h && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-800 text-indigo-100 font-bold text-[10px]">
                  Bloc de 2h
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                Vert = Compatible
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                Orange = Remplacement / Avert.
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                Rouge = Conflit dur interdit
              </span>
            </div>
          </div>
        )}

        {/* Bac de matières non affectées (en haut de l'emploi du temps de chaque classe) */}
        <UnassignedBin
          items={unassignedItems}
          selectedBinItemId={selectedCourse?.isFromBin ? selectedCourse.binItemId || null : null}
          onSelectBinItem={handleSelectBinItem}
          isDragActive={isDragActive}
          isDraggingGridCourse={isDragActive && !activeDrag?.isFromBin}
          contextLabel={mode === 'class' ? `Classe ${selectedClass?.nom || ''}` : `${selectedTeacher?.nom || ''}`}
        />

        {/* Titre d'impression paysage */}
        <div className="hidden print:block text-center pb-3">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            EMPLOI DU TEMPS · {mode === 'class' ? `CLASSE : ${selectedClass?.nom} (${selectedClass?.niveau})` : `PROFESSEUR : ${selectedTeacher?.nom} (${selectedTeacher?.matiere})`}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Établissement scolaire · Format Paysage A4 · {relevantAffs.length} h planifiées · Pause méridienne 12h30-13h30
          </p>
        </div>

        {/* Grille Jours x Créneaux */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:border-slate-300 print:w-full">
          <div className="overflow-x-auto print:overflow-visible">
            <div className="min-w-[760px] print:min-w-0 print:w-full">
              {/* En-tête des jours */}
              <div className="grid grid-cols-5 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                {semaine.jours.map((jour, jIdx) => (
                  <div key={jIdx} className="py-2.5 px-3 text-center border-r last:border-r-0 border-slate-200">
                    <span className="text-slate-900">{jour}</span>
                    <span className="block text-[11px] font-normal text-slate-500">
                      {semaine.creneauxParJour[jIdx]} créneaux de 1h
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {jIdx === 4 ? '08h30 - 12h30 (4h)' : '08h30 - 16h30 (7h + 1h pause)'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Rangées de créneaux (7 créneaux Lundi..Jeudi, 4 créneaux Vendredi) */}
              {Array.from({ length: Math.max(...semaine.creneauxParJour) }).map((_, slotInDay) => (
                <React.Fragment key={slotInDay}>
                  {/* Pause méridienne obligatoire de 1 heure après 4h (entre C4 et C5) */}
                  {slotInDay === 4 && (
                    <div className="border-y border-amber-300 bg-amber-50/95 py-2 px-4 flex flex-wrap items-center justify-between gap-2 text-xs select-none print:py-1 print:bg-slate-100">
                      <div className="flex items-center gap-2 text-amber-900 font-bold">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>PAUSE MÉRIDIENNE · 1 HEURE (12h30 - 13h30)</span>
                      </div>
                      <div className="text-[11px] text-amber-800 font-medium">
                        Coupure de midi : Journée divisée en 2 grands blocs (4h matin [C1-C4] · 1h pause · 3h après-midi [C5-C7])
                      </div>
                    </div>
                  )}
                  <div
                    className="grid grid-cols-5 border-b last:border-b-0 border-slate-100 min-h-[74px] print:min-h-[58px]"
                  >
                  {semaine.jours.map((jour, jIdx) => {
                    const daySlotsCount = semaine.creneauxParJour[jIdx];
                    if (slotInDay >= daySlotsCount) {
                      return (
                        <div
                          key={jIdx}
                          className="p-2 border-r last:border-r-0 border-slate-100 bg-slate-50/70 flex flex-col justify-center items-center text-center text-[10px] text-slate-400 select-none"
                        >
                          <span className="font-medium text-slate-400">Après-midi libéré</span>
                          <span className="text-[9px] text-slate-400">(4 créneaux max le vendredi)</span>
                        </div>
                      );
                    }

                    const startOfDay = semaine.creneauxParJour.slice(0, jIdx).reduce((a, b) => a + b, 0);
                    const globalSlot = startOfDay + slotInDay;

                    const affs = slotToAffs.get(globalSlot) || [];
                    const matching = affs.filter((a) => {
                      const u = uniteMap.get(a.uniteId);
                      if (!u) return false;
                      return mode === 'class' ? u.classeIds.includes(selectedClassId) : u.teacherId === selectedTeacherId;
                    });

                    const isDispo = mode === 'teacher' && selectedTeacher ? selectedTeacher.dispo[globalSlot] : true;
                    const evaluation = currentEvaluations.get(globalSlot) || null;
                    const isSourceSlot = selectedCourse?.sourceSlots.includes(globalSlot) || false;

                    return (
                      <DroppableCell
                        key={jIdx}
                        id={`slot_${globalSlot}`}
                        slot={globalSlot}
                        isDispo={isDispo}
                        evaluation={evaluation}
                        isDragActive={isDragActive}
                        isClickSelectionActive={isSelectionActive}
                        isSourceSlot={isSourceSlot}
                        onClickCell={() => handleClickCell(globalSlot)}
                        headerLabel={`C${slotInDay + 1} (1h) · ${getSlotTimeRange(slotInDay)}`}
                        className="border-r last:border-r-0 border-slate-100"
                      >
                        {matching.length > 0 ? (
                          matching.map((aff) => {
                            const u = uniteMap.get(aff.uniteId)!;
                            const prof = teacherMap.get(u.teacherId);
                            const involvedClasses = classes.filter((c) => u.classeIds.includes(c.id));
                            const meta = getSubjectMeta(prof?.matiere || '');

                            const blockSlots = getBlockSlotsForAssignment(
                              planning,
                              aff.uniteId,
                              aff.slot,
                              semaine
                            );
                            const isBlock2h = blockSlots.length === 2;
                            const isLocked = lockedKeys.has(getLockKey(aff.uniteId, aff.slot));
                            const isSelected =
                              selectedCourse?.uniteId === aff.uniteId &&
                              selectedCourse?.sourceSlots.includes(aff.slot);

                            return (
                              <DraggableCourseCard
                                key={`${aff.uniteId}_slot_${aff.slot}`}
                                id={`${aff.uniteId}_slot_${aff.slot}`}
                                uniteId={aff.uniteId}
                                sourceSlots={blockSlots}
                                isLocked={isLocked}
                                onToggleLock={() => onToggleLock(aff.uniteId, aff.slot)}
                                subject={prof?.matiere || 'Matière'}
                                subTitle={
                                  mode === 'class'
                                    ? prof?.nom || ''
                                    : involvedClasses.map((c) => c.nom).join(' + ')
                                }
                                badgeClass={meta.badgeClass}
                                isCommon={u.estCommun}
                                isBlock2h={isBlock2h}
                                isSelected={isSelected}
                                onSelect={() =>
                                  handleSelectCourse(
                                    aff,
                                    blockSlots,
                                    prof?.matiere || 'Matière',
                                    mode === 'class'
                                      ? prof?.nom || ''
                                      : involvedClasses.map((c) => c.nom).join(' + '),
                                    meta.badgeClass,
                                    isBlock2h
                                  )
                                }
                              />
                            );
                          })
                        ) : null}
                      </DroppableCell>
                    );
                  })}
                </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Rendu flottant lors du glissement */}
      <DragOverlay>
        {activeDrag ? (
          <div className={`p-2 rounded-lg border text-xs shadow-2xl opacity-90 scale-105 ${activeDrag.badgeClass} ring-2 ring-slate-900`}>
            <div className="font-bold flex items-center justify-between gap-2">
              <span>{activeDrag.subject}</span>
              {activeDrag.isBlock2h && (
                <span className="text-[9px] font-bold px-1 rounded bg-indigo-200 text-indigo-900 uppercase">
                  2h
                </span>
              )}
            </div>
            <div className="text-[10px] mt-0.5">{activeDrag.subTitle}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
