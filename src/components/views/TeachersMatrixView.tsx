/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Classe, ImportDataset, Teacher, Unite } from '../../types';
import { Affectation, Planning } from '../../rules/types';
import { getSlotCoordinates } from '../../rules';
import { getSubjectMeta } from '../../utils/subjectFormatters';
import { checkPartialLevelTeaching } from '../../utils/infeasibilityDiagnostic';
import { Search } from 'lucide-react';

interface TeachersMatrixViewProps {
  dataset: ImportDataset;
  planning: Planning;
}

export const TeachersMatrixView: React.FC<TeachersMatrixViewProps> = ({ dataset, planning }) => {
  const { teachers, classes, unites, semaine } = dataset;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const [search, setSearch] = useState('');

  const partialWarnings = React.useMemo(
    () => checkPartialLevelTeaching(teachers, classes, unites),
    [teachers, classes, unites]
  );
  const partialWarningMap = React.useMemo(
    () => new Map(partialWarnings.map((w) => [w.teacherId, w])),
    [partialWarnings]
  );

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

  // Décompte de la ligne "Profs en cours" pour chaque créneau
  const activeProfsCount = new Array(totalSlots).fill(0);
  for (let s = 0; s < totalSlots; s++) {
    const affs = slotToAffs.get(s) || [];
    const profIds = new Set(affs.map((a) => uniteMap.get(a.uniteId)?.teacherId).filter(Boolean));
    activeProfsCount[s] = profIds.size;
  }

  // Filtrage des enseignants
  const filteredTeachers = teachers.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.nom.toLowerCase().includes(q) ||
      t.matiere.toLowerCase().includes(q) ||
      String(t.num ?? '').includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Barre d'outils et recherche */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-xs print:hidden">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un prof ou une matière..."
            className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-rose-100 border border-rose-300" />
            <span>Rouge clair = Indisponible</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
            <span>Case colorée = Cours placé</span>
          </div>
        </div>
      </div>

      {/* Titre pour impression */}
      <div className="hidden print:block text-center pb-2">
        <h2 className="text-base font-bold text-slate-900">
          MATRICE GLOBALE DES ENSEIGNANTS ({teachers.length} PROFESSEURS · 32 CRÉNEAUX)
        </h2>
      </div>

      {/* Tableau matrice */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs print:shadow-none print:border-slate-300">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              {/* Ligne 1 : Jours */}
              <tr className="bg-slate-800 text-white border-b border-slate-700 text-[11px]">
                <th className="py-2.5 px-3 sticky left-0 z-20 bg-slate-800 w-36" rowSpan={2}>
                  Enseignant
                </th>
                <th className="py-2.5 px-2 text-center w-24" rowSpan={2}>
                  Matière
                </th>
                <th className="py-2.5 px-2 text-center w-12" rowSpan={2}>
                  H.
                </th>
                {semaine.jours.map((jour, jIdx) => (
                  <th
                    key={jIdx}
                    colSpan={semaine.creneauxParJour[jIdx]}
                    className="py-2 px-1 text-center border-l border-slate-700 font-bold uppercase tracking-wider text-[11px]"
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
                      className="py-1 px-1 text-center border-l border-slate-600 font-normal min-w-[28px]"
                    >
                      C{cIdx + 1}
                    </th>
                  ))
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 text-slate-800">
              {filteredTeachers.map((prof) => {
                const profUnites = unites.filter((u) => u.teacherId === prof.id);
                const totalHeures = profUnites.reduce((s, u) => s + u.heures, 0);

                return (
                  <tr key={prof.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Nom Enseignant */}
                    <td className="py-1.5 px-3 font-semibold text-slate-900 sticky left-0 z-10 bg-white border-r border-slate-200">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate">{prof.nom}</span>
                        {partialWarningMap.has(prof.id) && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[9px] bg-amber-100 text-amber-900 border border-amber-300 font-bold shrink-0 cursor-help"
                            title={partialWarningMap.get(prof.id)?.message}
                          >
                            Niveau partiel
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Matière */}
                    <td className="py-1.5 px-2 text-slate-600 truncate border-r border-slate-200 text-[11px]">
                      {prof.matiere}
                    </td>

                    {/* Total Heures */}
                    <td className="py-1.5 px-1 text-center font-mono font-bold tabular-nums border-r border-slate-200">
                      {totalHeures}
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
                      const meta = getSubjectMeta(prof.matiere);

                      return (
                        <td
                          key={s}
                          className={`py-1 px-0.5 text-center text-[10px] font-mono border-slate-200 ${
                            isFirstOfDay ? 'border-l-2 border-l-slate-300' : 'border-l'
                          } ${
                            !isDispo
                              ? 'bg-rose-100/70 text-rose-500 font-bold'
                              : aff
                              ? `${meta.badgeClass} font-bold shadow-xs`
                              : 'bg-white'
                          }`}
                          title={`${coords.jourNom} C${coords.creneauNumero} · ${prof.nom} : ${
                            aff
                              ? `Classe ${involvedClasses.map((c) => c.nom).join(' + ')}`
                              : isDispo
                              ? 'Libre'
                              : 'Indisponible'
                          }`}
                        >
                          {aff ? (
                            <span className="truncate block max-w-[42px] mx-auto text-[9px]">
                              {involvedClasses.map((c) => c.nom).join('+')}
                            </span>
                          ) : !isDispo ? (
                            <span className="text-[9px]">×</span>
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

            {/* Ligne récapitulative « Profs en cours » en bas */}
            <tfoot>
              <tr className="bg-slate-800 text-white border-t-2 border-slate-700 font-bold text-[11px]">
                <td className="py-2.5 px-3 sticky left-0 z-20 bg-slate-800">PROFS EN COURS</td>
                <td className="py-2.5 px-2 text-center text-[10px] text-slate-300">Simultanés</td>
                <td className="py-2.5 px-1 text-center font-mono">
                  {planning.length}
                </td>
                {Array.from({ length: totalSlots }).map((_, s) => {
                  const count = activeProfsCount[s];
                  const coords = getSlotCoordinates(s, semaine);
                  const isFirstOfDay = coords.creneauIndex === 0;

                  return (
                    <td
                      key={s}
                      className={`py-2 px-0.5 text-center font-mono tabular-nums text-[10px] ${
                        isFirstOfDay ? 'border-l-2 border-l-slate-600' : 'border-l border-slate-700'
                      } ${count >= 18 ? 'bg-indigo-900 text-amber-300' : 'text-slate-100'}`}
                      title={`${coords.jourNom} C${coords.creneauNumero} : ${count} enseignant(s) en cours`}
                    >
                      {count}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
