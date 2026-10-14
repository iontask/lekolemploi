/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
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
import { getSubjectMeta } from '../../utils/subjectFormatters';
import {
  CellDropEvaluation,
  evaluateMoveOrSwap,
  getBlockSlotsForAssignment,
  getLockKey,
} from '../../utils/dndRulesHelper';
import { DraggableCourseCard } from '../dnd/DraggableCourseCard';
import { DroppableCell } from '../dnd/DroppableCell';

interface ClassTeacherViewProps {
  dataset: ImportDataset;
  planning: Planning;
  lockedKeys: Set<string>;
  onToggleLock: (uniteId: string, slot: number) => void;
  onMoveCourse: (
    sourceUniteId: string,
    sourceSlots: number[],
    targetSlot: number
  ) => { success: boolean; warning?: string; error?: string };
}

export const ClassTeacherView: React.FC<ClassTeacherViewProps> = ({
  dataset,
  planning,
  lockedKeys,
  onToggleLock,
  onMoveCourse,
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
  } | null>(null);

  const [evaluations, setEvaluations] = useState<Map<number, CellDropEvaluation>>(new Map());

  // Capteurs DND avec distance d'activation pour distinguer le clic sur le cadenas du drag
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

  // Statistiques pour l'entité sélectionnée
  const relevantAffs = useMemo(() => {
    return planning.filter((a) => {
      const u = uniteMap.get(a.uniteId);
      if (!u) return false;
      return mode === 'class' ? u.classeIds.includes(selectedClassId) : u.teacherId === selectedTeacherId;
    });
  }, [planning, mode, selectedClassId, selectedTeacherId, uniteMap]);

  // Début du glissement : calcul de canPlace() pour toutes les cases
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (!data) return;

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
    });

    // Évaluation en temps réel de tous les créneaux
    const evals = new Map<number, CellDropEvaluation>();
    for (let s = 0; s < totalSlots; s++) {
      const res = evaluateMoveOrSwap(
        planning,
        uniteId,
        sourceSlots,
        s,
        dataset,
        lockedKeys
      );
      evals.set(s, res);
    }
    setEvaluations(evals);
  };

  // Fin du glissement : exécution du déplacement / échange
  const handleDragEnd = (event: DragEndEvent) => {
    const { over } = event;
    if (activeDrag && over) {
      const targetSlot = over.data.current?.slot;
      if (typeof targetSlot === 'number') {
        onMoveCourse(activeDrag.uniteId, activeDrag.sourceSlots, targetSlot);
      }
    }

    setActiveDrag(null);
    setEvaluations(new Map());
  };

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

          <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
            <span>
              <strong className="text-slate-900 font-mono">{relevantAffs.length} h</strong> affectées
            </span>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span>Glisser-déposer actif</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            </div>
          </div>
        </div>

        {/* Légende interactive lors du glisser-déposer */}
        {activeDrag && (
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="font-bold">Déplacement en cours :</span>
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
                Vert = Possible
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                Orange = Règle souple / Avert.
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                Rouge = Conflit dur interdit
              </span>
            </div>
          </div>
        )}

        {/* Titre d'impression */}
        <div className="hidden print:block text-center pb-2">
          <h2 className="text-base font-bold text-slate-900">
            EMPLOI DU TEMPS · {mode === 'class' ? `CLASSE ${selectedClass?.nom}` : `${selectedTeacher?.nom} (${selectedTeacher?.matiere})`}
          </h2>
        </div>

        {/* Grille Jours x Créneaux */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:border-slate-300">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {/* En-tête des jours */}
              <div className="grid grid-cols-5 border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                {semaine.jours.map((jour, jIdx) => (
                  <div key={jIdx} className="py-2.5 px-3 text-center border-r last:border-r-0 border-slate-200">
                    <span>{jour}</span>
                    <span className="block text-[11px] font-normal text-slate-400">
                      {semaine.creneauxParJour[jIdx]} créneaux
                    </span>
                  </div>
                ))}
              </div>

              {/* Rangées de créneaux */}
              {Array.from({ length: Math.max(...semaine.creneauxParJour) }).map((_, slotInDay) => (
                <div
                  key={slotInDay}
                  className="grid grid-cols-5 border-b last:border-b-0 border-slate-100 min-h-[72px] print:min-h-[58px]"
                >
                  {semaine.jours.map((jour, jIdx) => {
                    const daySlotsCount = semaine.creneauxParJour[jIdx];
                    if (slotInDay >= daySlotsCount) {
                      return (
                        <div key={jIdx} className="p-2 border-r last:border-r-0 border-slate-100 bg-slate-50/60" />
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
                    const evaluation = evaluations.get(globalSlot) || null;

                    return (
                      <DroppableCell
                        key={jIdx}
                        id={`slot_${globalSlot}`}
                        slot={globalSlot}
                        isDispo={isDispo}
                        evaluation={evaluation}
                        isDragActive={activeDrag !== null}
                        headerLabel={`C${slotInDay + 1}`}
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

                            return (
                              <DraggableCourseCard
                                key={`${aff.uniteId}_slot_${aff.slot}`}
                                id={`${aff.uniteId}_slot_${aff.slot}`}
                                uniteId={aff.uniteId}
                                sourceSlots={blockSlots}
                                isLocked={isLocked}
                                onToggleLock={() => onToggleLock(aff.uniteId, aff.slot)}
                                subject={prof?.matiere || 'Matière'}
                                subTitle={mode === 'class' ? prof?.nom || '' : involvedClasses.map((c) => c.nom).join(' + ')}
                                badgeClass={meta.badgeClass}
                                isCommon={u.estCommun}
                                isBlock2h={isBlock2h}
                              />
                            );
                          })
                        ) : null}
                      </DroppableCell>
                    );
                  })}
                </div>
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
