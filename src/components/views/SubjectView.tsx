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
import { getSlotCoordinates } from '../../rules';
import { getSubjectMeta } from '../../utils/subjectFormatters';
import {
  CellDropEvaluation,
  evaluateMoveOrSwap,
  getBlockSlotsForAssignment,
  getLockKey,
} from '../../utils/dndRulesHelper';
import { Lock, Unlock, GripVertical, Printer } from 'lucide-react';
import { triggerSafeBrowserPrint } from '../../services/pdfExportService';

interface SubjectViewProps {
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

export const SubjectView: React.FC<SubjectViewProps> = ({
  dataset,
  planning,
  lockedKeys,
  onToggleLock,
  onMoveCourse,
}) => {
  const { teachers, classes, unites, semaine } = dataset;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  // Liste des matières uniques
  const subjects = useMemo(() => Array.from(new Set(teachers.map((t) => t.matiere))).sort(), [teachers]);
  const [selectedSubject, setSelectedSubject] = useState<string>(subjects[0] || 'Mathématiques');

  // État du glissement
  const [activeDrag, setActiveDrag] = useState<{
    uniteId: string;
    sourceSlots: number[];
    isBlock2h: boolean;
    subject: string;
    teacherName: string;
    badgeClass: string;
  } | null>(null);

  const [evaluations, setEvaluations] = useState<Map<number, CellDropEvaluation>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const teacherMap = useMemo(() => new Map<string, Teacher>(teachers.map((t) => [t.id, t])), [teachers]);
  const uniteMap = useMemo(() => new Map<string, Unite>(unites.map((u) => [u.id, u])), [unites]);

  // Indexation slot -> affectations
  const slotToAffs = useMemo(() => {
    const map = new Map<number, Affectation[]>();
    for (const aff of planning) {
      const list = map.get(aff.slot) || [];
      list.push(aff);
      map.set(aff.slot, list);
    }
    return map;
  }, [planning]);

  // Profs de la matière sélectionnée
  const subjectTeachers = useMemo(
    () => teachers.filter((t) => t.matiere === selectedSubject),
    [teachers, selectedSubject]
  );
  const meta = getSubjectMeta(selectedSubject);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (!data) return;

    const { uniteId, sourceSlots, isBlock2h, subject, teacherName } = data;
    setActiveDrag({
      uniteId,
      sourceSlots,
      isBlock2h,
      subject,
      teacherName,
      badgeClass: meta.badgeClass,
    });

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
        {/* Sélecteur de matière */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-xs print:hidden">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-700">Matière sélectionnée :</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg font-bold focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s} ({teachers.filter((t) => t.matiere === s).length} profs)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span>
              <strong className="text-slate-900 font-mono">{subjectTeachers.length}</strong> enseignant(s)
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-slate-900 font-mono">
                {unites
                  .filter((u) => {
                    const t = teacherMap.get(u.teacherId);
                    return t && t.matiere === selectedSubject;
                  })
                  .reduce((s, u) => s + u.heures, 0)} h
              </strong>{' '}
              totales
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Glisser-déposer actif
            </span>

            {/* Imprimer via navigateur */}
            <button
              onClick={() => triggerSafeBrowserPrint()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-2xs ml-1"
              title="Imprimer cette vue au format paysage"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Imprimer</span>
            </button>
          </div>
        </div>

        {/* Bannière de feedback lors du déplacement */}
        {activeDrag && (
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="font-bold">Déplacement en cours :</span>
              <span className="font-semibold text-amber-300">{activeDrag.subject}</span>
              <span className="text-slate-300">({activeDrag.teacherName})</span>
              {activeDrag.isBlock2h && (
                <span className="px-1.5 py-0.5 rounded bg-indigo-800 text-indigo-100 font-bold text-[10px]">
                  Bloc de 2h
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                Vert = Valide
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                Orange = Avertissement
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                Rouge = Interdit
              </span>
            </div>
          </div>
        )}

        {/* Titre pour impression */}
        <div className="hidden print:block text-center pb-3">
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            GRILLE D'ENSEIGNEMENT PAR MATIÈRE · {selectedSubject.toUpperCase()} ({subjectTeachers.length} ENSEIGNANTS)
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Répartition des cours et disponibilités · Format Paysage A4 · Pause méridienne 12h30-13h30
          </p>
        </div>

        {/* Grille : Profs de la matière x 32 Créneaux */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:border-slate-300 print:w-full">
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                {/* Ligne 1 : Jours */}
                <tr className="bg-slate-800 text-white border-b border-slate-700 text-[11px]">
                  <th className="py-2.5 px-3 sticky left-0 z-20 bg-slate-800 w-36" rowSpan={2}>
                    Enseignant
                  </th>
                  <th className="py-2.5 px-2 text-center w-14" rowSpan={2}>
                    Heures
                  </th>
                  <th className="py-2.5 px-2 text-center w-14" rowSpan={2}>
                    Dispos
                  </th>
                  <th className="py-2.5 px-2 text-center w-14" rowSpan={2}>
                    Marge
                  </th>
                  {semaine.jours.map((jour, jIdx) => (
                    <th
                      key={jIdx}
                      colSpan={semaine.creneauxParJour[jIdx]}
                      className="py-2 px-2 text-center border-l border-slate-700 font-bold uppercase tracking-wider"
                    >
                      {jour}
                    </th>
                  ))}
                </tr>

                {/* Ligne 2 : Numéros de créneaux (C1..C7) */}
                <tr className="bg-slate-700 text-slate-200 border-b border-slate-600 text-[10px] font-mono">
                  {semaine.jours.map((_, jIdx) =>
                    Array.from({ length: semaine.creneauxParJour[jIdx] }).map((__, cIdx) => (
                      <th
                        key={`${jIdx}_${cIdx}`}
                        className="py-1.5 px-1 text-center border-l border-slate-600 font-normal"
                      >
                        C{cIdx + 1}
                      </th>
                    ))
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200 text-slate-800">
                {subjectTeachers.map((prof) => {
                  const profUnites = unites.filter((u) => u.teacherId === prof.id);
                  const totalHeures = profUnites.reduce((s, u) => s + u.heures, 0);
                  const disposCount = prof.dispo.filter(Boolean).length;
                  const marge = disposCount - totalHeures;

                  return (
                    <tr key={prof.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Nom Enseignant */}
                      <td className="py-2 px-3 font-semibold text-slate-900 sticky left-0 z-10 bg-white border-r border-slate-200 truncate">
                        {prof.nom}
                      </td>

                      {/* Total Heures */}
                      <td className="py-2 px-2 text-center font-mono font-bold tabular-nums">
                        {totalHeures} h
                      </td>

                      {/* Dispos */}
                      <td className="py-2 px-2 text-center font-mono text-slate-600 tabular-nums">
                        {disposCount}
                      </td>

                      {/* Marge */}
                      <td className="py-2 px-2 text-center font-mono tabular-nums">
                        {marge < 0 ? (
                          <span className="text-rose-700 font-bold">{marge}</span>
                        ) : marge <= 1 ? (
                          <span className="text-amber-700 font-semibold">+{marge}</span>
                        ) : (
                          <span className="text-emerald-700">+{marge}</span>
                        )}
                      </td>

                      {/* 32 créneaux */}
                      {Array.from({ length: totalSlots }).map((_, s) => {
                        const isDispo = prof.dispo[s];
                        const aff = slotToAffs.get(s)?.find((a) => {
                          const u = uniteMap.get(a.uniteId);
                          return u && u.teacherId === prof.id;
                        });

                        const u = aff ? uniteMap.get(aff.uniteId) : null;
                        const involvedClasses = u ? classes.filter((c) => u.classeIds.includes(c.id)) : [];
                        const coords = getSlotCoordinates(s, semaine);
                        const isFirstOfDay = coords.creneauIndex === 0;

                        const blockSlots = aff
                          ? getBlockSlotsForAssignment(planning, aff.uniteId, aff.slot, semaine)
                          : [s];
                        const isBlock2h = blockSlots.length === 2;
                        const isLocked = aff ? lockedKeys.has(getLockKey(aff.uniteId, aff.slot)) : false;

                        const evaluation = evaluations.get(s) || null;

                        // Classes CSS selon le statut du drag
                        let cellBg = '';
                        if (activeDrag && evaluation) {
                          if (evaluation.status === 'red') {
                            cellBg = 'bg-rose-100/80 ring-1 ring-rose-300';
                          } else if (evaluation.status === 'orange') {
                            cellBg = 'bg-amber-100/80 ring-1 ring-amber-300';
                          } else if (evaluation.status === 'green') {
                            cellBg = 'bg-emerald-100/80 ring-1 ring-emerald-400';
                          }
                        } else if (!isDispo) {
                          cellBg = 'bg-rose-50/60 text-rose-300';
                        }

                        return (
                          <td
                            key={s}
                            data-slot={s}
                            className={`py-1 px-0.5 text-center text-[10px] font-mono border-slate-200 transition-colors ${
                              isFirstOfDay ? 'border-l-2 border-l-slate-300' : 'border-l'
                            } ${cellBg}`}
                          >
                            {aff ? (
                              <div
                                className={`group relative py-1 px-1 rounded border shadow-2xs transition-all select-none ${
                                  meta.badgeClass
                                } ${isLocked ? 'ring-1 ring-amber-400 bg-amber-50/60' : 'cursor-grab'}`}
                              >
                                <div className="flex items-center justify-between gap-0.5">
                                  <span className="font-bold truncate text-[10px]">
                                    {involvedClasses.map((c) => c.nom).join('+')}
                                  </span>

                                  {/* Cadenas */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleLock(aff.uniteId, aff.slot);
                                    }}
                                    title={
                                      isLocked
                                        ? 'Cours verrouillé. Cliquez pour déverrouiller.'
                                        : 'Verrouiller ce cours (le solveur ne le déplacera pas).'
                                    }
                                    className={`p-0.5 rounded transition-colors ${
                                      isLocked
                                        ? 'text-amber-800 bg-amber-100'
                                        : 'text-slate-400 opacity-40 group-hover:opacity-100 hover:text-slate-700'
                                    }`}
                                  >
                                    {isLocked ? (
                                      <Lock className="w-2.5 h-2.5" />
                                    ) : (
                                      <Unlock className="w-2.5 h-2.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            ) : !isDispo ? (
                              <span className="text-[9px] text-rose-400">×</span>
                            ) : (
                              <span className="text-slate-200">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DragOverlay>
        {activeDrag ? (
          <div className={`p-2 rounded-lg border text-xs shadow-2xl opacity-90 scale-105 ${activeDrag.badgeClass} ring-2 ring-slate-900`}>
            <div className="font-bold">{activeDrag.subject}</div>
            <div className="text-[10px] mt-0.5">{activeDrag.teacherName}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
