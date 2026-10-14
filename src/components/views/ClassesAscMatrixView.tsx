/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Classe, ImportDataset, Teacher, Unite } from '../../types';
import { Affectation, Planning } from '../../rules/types';
import { getSlotCoordinates } from '../../rules';
import {
  getSubjectAbbreviation,
  getSubjectMeta,
  SUBJECT_DEFINITIONS,
} from '../../utils/subjectFormatters';
import { Search, Info } from 'lucide-react';

interface ClassesAscMatrixViewProps {
  dataset: ImportDataset;
  planning: Planning;
}

export const ClassesAscMatrixView: React.FC<ClassesAscMatrixViewProps> = ({
  dataset,
  planning,
}) => {
  const { teachers, classes, unites, semaine } = dataset;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const [search, setSearch] = useState('');
  const [showLegend, setShowLegend] = useState(true);

  const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
  const classMap = new Map<string, Classe>(classes.map((c) => [c.id, c]));
  const uniteMap = new Map<string, Unite>(unites.map((u) => [u.id, u]));

  // Indexation slot -> affectations
  const slotToAffs = new Map<number, Affectation[]>();
  for (const aff of planning) {
    const list = slotToAffs.get(aff.slot) || [];
    list.push(aff);
    slotToAffs.set(aff.slot, list);
  }

  // Filtrage des classes
  const filteredClasses = classes.filter((c) => {
    const q = search.toLowerCase();
    return c.nom.toLowerCase().includes(q) || c.niveau.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Barre de contrôle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-xs print:hidden">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer par nom de classe..."
            className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLegend(!showLegend)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{showLegend ? 'Masquer la légende' : 'Afficher la légende'}</span>
          </button>
          <span className="text-xs text-slate-500 font-mono">
            {filteredClasses.length} classe(s) affichée(s)
          </span>
        </div>
      </div>

      {/* Légende aSc Horaires des abréviations de matières */}
      {showLegend && (
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs print:border print:border-slate-300">
          <div className="text-xs font-semibold text-slate-700 mb-2.5 flex items-center justify-between">
            <span>Légende des abréviations de matières (style aSc Horaires)</span>
            <span className="text-[11px] font-normal text-slate-500">
              Cellules fusionnées = 2 h consécutives même prof
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.values(SUBJECT_DEFINITIONS).map((sub) => (
              <div
                key={sub.code}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium ${sub.badgeClass}`}
              >
                <span className="font-bold font-mono">{sub.code}</span>
                <span className="text-[11px] opacity-90">{sub.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Titre pour impression */}
      <div className="hidden print:block text-center pb-2">
        <h2 className="text-base font-bold text-slate-900">
          VUE D'ENSEMBLE DES CLASSES · STYLE aSc HORAIRES ({classes.length} CLASSES · 32 CRÉNEAUX)
        </h2>
      </div>

      {/* Tableau matrice aSc Horaires */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:border-slate-300">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              {/* Ligne 1 : Jours */}
              <tr className="bg-slate-800 text-white border-b border-slate-700 text-[11px]">
                <th
                  className="py-2.5 px-3 sticky left-0 z-20 bg-slate-800 w-28 text-center"
                  rowSpan={2}
                >
                  Classe
                </th>
                {semaine.jours.map((jour, jIdx) => (
                  <th
                    key={jIdx}
                    colSpan={semaine.creneauxParJour[jIdx]}
                    className="py-1.5 px-2 text-center border-r last:border-r-0 border-slate-700 tracking-wide font-bold"
                  >
                    {jour.toUpperCase()}
                  </th>
                ))}
              </tr>

              {/* Ligne 2 : Numéros de créneaux (C1..C7) */}
              <tr className="bg-slate-700 text-white border-b border-slate-600 text-[10px] font-mono">
                {semaine.jours.map((_, jIdx) =>
                  Array.from({ length: semaine.creneauxParJour[jIdx] }).map((_, cIdx) => (
                    <th
                      key={`${jIdx}-${cIdx}`}
                      className="py-1 px-1 text-center w-10 border-r last:border-r-0 border-slate-600 font-semibold"
                    >
                      C{cIdx + 1}
                    </th>
                  ))
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {filteredClasses.map((cls, cIdx) => {
                // Décomposition des créneaux en cellules (avec fusion colSpan des heures consécutives du même prof)
                const cellsToRender: React.ReactNode[] = [];
                let sIdx = 0;

                while (sIdx < totalSlots) {
                  const coords = getSlotCoordinates(sIdx, semaine);
                  const aff = slotToAffs.get(sIdx)?.find((a) => {
                    const u = uniteMap.get(a.uniteId);
                    return u && u.classeIds.includes(cls.id);
                  });

                  if (!aff) {
                    // Créneau vide
                    cellsToRender.push(
                      <td
                        key={`slot-${sIdx}`}
                        className="p-1 border-r last:border-r-0 border-slate-100 text-center text-slate-300 font-mono text-[10px] bg-slate-50/20"
                      >
                        ·
                      </td>
                    );
                    sIdx++;
                    continue;
                  }

                  const unite = uniteMap.get(aff.uniteId)!;
                  const prof = teacherMap.get(unite.teacherId);
                  const meta = getSubjectMeta(prof?.matiere || '');
                  const code = getSubjectAbbreviation(prof?.matiere || '');

                  // Chercher si les créneaux consécutifs du MÊME JOUR ont le MÊME PROF
                  let span = 1;
                  while (sIdx + span < totalSlots) {
                    const nextCoords = getSlotCoordinates(sIdx + span, semaine);
                    if (nextCoords.jourIndex !== coords.jourIndex) break; // Ne pas traverser de jour

                    const nextAff = slotToAffs.get(sIdx + span)?.find((a) => {
                      const u = uniteMap.get(a.uniteId);
                      return u && u.classeIds.includes(cls.id) && u.teacherId === unite.teacherId;
                    });

                    if (nextAff) {
                      span++;
                    } else {
                      break;
                    }
                  }

                  cellsToRender.push(
                    <td
                      key={`slot-${sIdx}`}
                      colSpan={span}
                      className="p-1 border-r last:border-r-0 border-slate-200 text-center align-middle"
                    >
                      <div
                        className={`py-1 px-1.5 rounded border text-[11px] leading-tight flex flex-col items-center justify-center ${meta.badgeClass}`}
                        title={`${prof?.matiere || ''} avec ${prof?.nom || ''}${
                          unite.estCommun ? ' (cours commun)' : ''
                        } - ${span} h`}
                      >
                        <span className="font-extrabold tracking-tight font-mono text-xs">
                          {code}
                        </span>
                        <span className="text-[10px] truncate max-w-[80px] font-medium opacity-90">
                          {prof?.nom}
                        </span>
                        {unite.estCommun && (
                          <span className="text-[8px] uppercase tracking-wider px-1 rounded bg-teal-200/80 text-teal-900 font-bold mt-0.5">
                            Com.
                          </span>
                        )}
                      </div>
                    </td>
                  );

                  sIdx += span;
                }

                return (
                  <tr
                    key={cls.id}
                    className={`hover:bg-slate-50/60 transition-colors ${
                      cIdx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                    }`}
                  >
                    <td className="py-2 px-3 sticky left-0 z-10 bg-inherit border-r border-slate-200 font-bold text-slate-900 text-center font-mono text-xs whitespace-nowrap">
                      {cls.nom}
                      <span className="block text-[10px] font-normal text-slate-500 font-sans">
                        {cls.niveau}
                      </span>
                    </td>
                    {cellsToRender}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
