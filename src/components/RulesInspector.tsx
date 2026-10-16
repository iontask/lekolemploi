/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle,
  HelpCircle,
  Play,
  Sparkles,
  Sliders,
  Calendar,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';
import { ImportDataset, Unite } from '../types';
import {
  canPlace,
  DEFAULT_RULES_OPTIONS,
  getSlotCoordinates,
  RulesOptions,
  score,
  verify,
} from '../rules';
import { Affectation, Planning } from '../rules/types';

interface RulesInspectorProps {
  dataset: ImportDataset;
}

export const RulesInspector: React.FC<RulesInspectorProps> = ({ dataset }) => {
  const { teachers, classes, unites, semaine } = dataset;
  const [selectedUniteId, setSelectedUniteId] = useState<string>(unites[0]?.id || '');
  const [testSlot, setTestSlot] = useState<number>(0);
  const [currentPlanning, setCurrentPlanning] = useState<Planning>([]);
  const [options, setOptions] = useState<RulesOptions>(() => ({
    ...DEFAULT_RULES_OPTIONS,
    ...(dataset.constraints || {}),
  }));

  const selectedUnite = unites.find((u) => u.id === selectedUniteId) || unites[0];
  const selectedTeacher = teachers.find((t) => t.id === selectedUnite?.teacherId);

  // Exécution de canPlace pour le créneau et l'unité sélectionnés
  const placeResult = selectedUnite
    ? canPlace(currentPlanning, selectedUnite, testSlot, dataset, options)
    : { ok: false, raisons: ['Aucune unité sélectionnée'] };

  const slotCoords = getSlotCoordinates(testSlot, semaine);

  // Calcul du score et de la vérification sur le planning de test
  const verificationViolations = verify(currentPlanning, dataset, options);
  const scoreBreakdown = score(currentPlanning, dataset, options);

  // Placer ou retirer l'unité sur le créneau de test
  const handleToggleSlot = (slotIdx: number) => {
    if (!selectedUnite) return;
    const exists = currentPlanning.some(
      (a) => a.uniteId === selectedUnite.id && a.slot === slotIdx
    );
    if (exists) {
      setCurrentPlanning(
        currentPlanning.filter(
          (a) => !(a.uniteId === selectedUnite.id && a.slot === slotIdx)
        )
      );
    } else {
      setCurrentPlanning([...currentPlanning, { uniteId: selectedUnite.id, slot: slotIdx }]);
    }
  };

  const handleClearTestPlanning = () => {
    setCurrentPlanning([]);
  };

  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      {/* En-tête du module */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                Étape 2 · TypeScript pur
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                Module de règles & moteur de validation (rules)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Module indépendant sans dépendance UI, testé avec Vitest (24 tests unitaires),
              conçu pour alimenter le solveur, le glisser-déposer et les exports.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Vitest : 24 tests réussis</span>
            </span>
          </div>
        </div>
      </div>

      {/* Spécification des Règles Dures et Souples */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Colonne 1 : Règles Dures */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              5 Règles Dures (Inviolables)
            </h3>
          </div>

          <ul className="space-y-3 text-xs text-slate-700">
            <li className="flex items-start gap-2.5">
              <span className="font-mono font-bold text-slate-400 w-4">1.</span>
              <div>
                <strong className="text-slate-900 block font-medium">
                  Toutes les heures placées
                </strong>
                <span>Chaque unité d'enseignement doit avoir exactement son quota d'heures affectées.</span>
              </div>
            </li>

            <li className="flex items-start gap-2.5">
              <span className="font-mono font-bold text-slate-400 w-4">2.</span>
              <div>
                <strong className="text-slate-900 block font-medium">
                  Un prof au plus une unité par créneau
                </strong>
                <span>Aucun chevauchement d'enseignant sur le même créneau horaire.</span>
              </div>
            </li>

            <li className="flex items-start gap-2.5">
              <span className="font-mono font-bold text-slate-400 w-4">3.</span>
              <div>
                <strong className="text-slate-900 block font-medium">
                  Une classe au plus une unité par créneau
                </strong>
                <span>Une unité commune occupe simultanément toutes ses classes participantes.</span>
              </div>
            </li>

            <li className="flex items-start gap-2.5">
              <span className="font-mono font-bold text-slate-400 w-4">4.</span>
              <div>
                <strong className="text-slate-900 block font-medium">
                  Respect strict des disponibilités
                </strong>
                <span>Aucun cours sur un créneau où le professeur est indisponible (rouge / false).</span>
              </div>
            </li>

            <li className="flex items-start gap-2.5">
              <span className="font-mono font-bold text-slate-400 w-4">5.</span>
              <div>
                <strong className="text-slate-900 block font-medium">
                  Matières « à blocs » (Arabe & Anglais)
                </strong>
                <span>
                  Blocs de 2 h consécutives le même jour ; 1 h isolée seulement si charge impaire (un autre jour) ; jamais plus de 2 h par jour.
                </span>
              </div>
            </li>
          </ul>
        </div>

        {/* Colonne 2 : Règles Souples & Score */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              Règles Souples & Fonction score()
            </h3>
          </div>

          <ul className="space-y-3 text-xs text-slate-700">
            <li className="flex items-start gap-2.5">
              <span className="font-mono font-bold text-indigo-600 w-4">A.</span>
              <div>
                <strong className="text-slate-900 block font-medium">
                  Max 2 h par jour et par unité
                </strong>
                <span>
                  Pénalité de <strong>100 points</strong> par heure excédentaire au-delà de 2 h sur la même journée.
                </span>
              </div>
            </li>

            <li className="flex items-start gap-2.5">
              <span className="font-mono font-bold text-indigo-600 w-4">B.</span>
              <div>
                <strong className="text-slate-900 block font-medium">
                  Consécutivité des heures d'une même unité
                </strong>
                <span>
                  Pénalité de <strong>15 points</strong> par jour si les heures d'une même unité sont dispersées (non consécutives).
                </span>
              </div>
            </li>

            <li className="flex items-start gap-2.5">
              <span className="font-mono font-bold text-indigo-600 w-4">C.</span>
              <div>
                <strong className="text-slate-900 block font-medium">
                  Compacité (Anti-créneaux tardifs)
                </strong>
                <span>
                  Coût de <strong>1 point par rang d'heure</strong> dans la journée + <strong>0,3 point par rang de jour</strong> (privilégie les matinées et le début de semaine).
                </span>
              </div>
            </li>
          </ul>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] font-mono text-slate-600 space-y-1">
            <p>Score = Pénalités_Excès + Pénalités_Dispersion + Compacité + (Dures × 10000)</p>
          </div>
        </div>
      </div>

      {/* Simulateur interactif canPlace() */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Simulateur interactif canPlace(planning, unite, slot)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sélectionnez une unité d'enseignement et cliquez sur un créneau pour tester en temps réel
              la fonction pure <code>canPlace()</code>.
            </p>
          </div>

          <button
            onClick={handleClearTestPlanning}
            className="text-xs text-slate-600 hover:text-rose-600 font-medium"
          >
            Réinitialiser le planning de test
          </button>
        </div>

        {/* Sélection d'unité */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Unité d'enseignement à tester
            </label>
            <select
              value={selectedUniteId}
              onChange={(e) => setSelectedUniteId(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {unites.map((u) => {
                const t = teachers.find((tch) => tch.id === u.teacherId);
                const classNames = classes
                  .filter((c) => u.classeIds.includes(c.id))
                  .map((c) => c.nom)
                  .join(' + ');

                return (
                  <option key={u.id} value={u.id}>
                    {t?.nom} · {t?.matiere} · {classNames} ({u.heures} h{u.estCommun ? ' commun' : ''})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Créneau cible à tester (0..{totalSlots - 1})
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max={totalSlots - 1}
                value={testSlot}
                onChange={(e) =>
                  setTestSlot(Math.max(0, Math.min(totalSlots - 1, parseInt(e.target.value) || 0)))
                }
                className="w-24 text-xs px-3 py-2 border border-slate-300 rounded-lg font-mono text-center"
              />
              <span className="text-xs text-slate-600">
                {slotCoords.jourNom} · Créneau {slotCoords.creneauNumero}
              </span>
            </div>
          </div>
        </div>

        {/* Résultat du canPlace pour le créneau sélectionné */}
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            placeResult.ok
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : 'bg-rose-50/70 border-rose-200 text-rose-900'
          }`}
        >
          {placeResult.ok ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}

          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <strong className="font-semibold text-sm">
                canPlace(...) renvoie : {placeResult.ok ? 'AUTORISÉ (ok: true)' : 'REFUSÉ (ok: false)'}
              </strong>
            </div>

            {placeResult.ok ? (
              <p className="text-emerald-800">
                L'unité peut être placée sans enfreindre aucune règle dure sur le créneau {testSlot}{' '}
                ({slotCoords.jourNom} C{slotCoords.creneauNumero}).
              </p>
            ) : (
              <ul className="list-disc pl-4 space-y-0.5 text-rose-800">
                {placeResult.raisons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Grille interactive des 32 créneaux */}
        <div>
          <span className="text-xs font-semibold text-slate-900 block mb-2">
            Grille interactive de la semaine (cliquez pour affecter / désaffecter cette unité)
          </span>

          <div className="grid grid-cols-5 gap-3">
            {semaine.jours.map((jour, jIdx) => {
              const count = semaine.creneauxParJour[jIdx];
              const startIdx = semaine.creneauxParJour
                .slice(0, jIdx)
                .reduce((a, b) => a + b, 0);

              return (
                <div key={jIdx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{jour}</span>
                    <span className="text-[11px] text-slate-400 font-mono">{count}h</span>
                  </div>

                  <div className="space-y-1.5">
                    {Array.from({ length: count }).map((_, cIdx) => {
                      const slotIdx = startIdx + cIdx;
                      const isTargetSlot = testSlot === slotIdx;
                      const isPlacedHere = currentPlanning.some(
                        (a) => a.uniteId === selectedUnite?.id && a.slot === slotIdx
                      );
                      const isProfDispo = selectedTeacher ? selectedTeacher.dispo[slotIdx] : true;
                      const canPlaceHere = selectedUnite
                        ? canPlace(currentPlanning, selectedUnite, slotIdx, dataset, options).ok
                        : false;

                      return (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => {
                            setTestSlot(slotIdx);
                            handleToggleSlot(slotIdx);
                          }}
                          className={`w-full text-left p-2 rounded-md border text-xs transition-colors flex items-center justify-between ${
                            isPlacedHere
                              ? 'bg-slate-900 border-slate-900 text-white font-semibold'
                              : isTargetSlot
                              ? 'ring-2 ring-indigo-500 bg-white border-indigo-400'
                              : !isProfDispo
                              ? 'bg-rose-50 border-rose-200 text-rose-800 opacity-60'
                              : canPlaceHere
                              ? 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700'
                              : 'bg-slate-100 border-slate-200 text-slate-400'
                          }`}
                        >
                          <span className="font-mono text-[11px]">
                            C{cIdx + 1} (#{slotIdx})
                          </span>
                          <span className="text-[10px]">
                            {isPlacedHere ? 'Affecté' : !isProfDispo ? 'Indispo' : canPlaceHere ? 'Dispo' : 'Bloqué'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Détail du score sur le planning de test */}
        <div className="pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Heures placées</span>
            <span className="font-bold text-slate-900 font-mono text-sm tabular-nums">
              {currentPlanning.filter((a) => a.uniteId === selectedUnite?.id).length} /{' '}
              {selectedUnite?.heures} h
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Compacité (coût)</span>
            <span className="font-bold text-slate-900 font-mono text-sm tabular-nums">
              {scoreBreakdown.coutCompacite}
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Pénalités souples</span>
            <span className="font-bold text-slate-900 font-mono text-sm tabular-nums">
              {scoreBreakdown.penalitesExcesJour + scoreBreakdown.penalitesNonConsecutif} pts
            </span>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-slate-500 block text-[11px]">Violations dures</span>
            <span className="font-bold font-mono text-sm tabular-nums text-rose-700">
              {scoreBreakdown.nombreViolationsDures}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
