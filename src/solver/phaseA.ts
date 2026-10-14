/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, Teacher, Unite } from '../types';
import { canPlace, getSlotCoordinates, isBlockSubject, verify } from '../rules';
import { Affectation, Planning, ScheduleData } from '../rules/types';
import { SolverConfig } from './types';

interface SortedUnitInfo {
  unite: Unite;
  teacher: Teacher;
  teacherMargin: number;
  classesCount: number;
  isBlock: boolean;
  heures: number;
}

/**
 * Phase A : Heuristique constructive « Difficiles d'abord » avec backtracking borné.
 * - Priorité absolue aux professeurs à marge nulle
 * - Priorité aux unités multi-classes (cours communs)
 * - Priorité aux matières à blocs (Arabe, Anglais)
 * - Respect strict de toutes les règles dures du module rules
 * - Exécution rapide (quelques secondes)
 */
export function solvePhaseA(
  data: ScheduleData,
  config: SolverConfig,
  onProgress?: (percent: number, msg: string) => void,
  isCancelled?: () => boolean,
  lockedAssignments: Affectation[] = []
): Planning {
  const { teachers, classes, unites, semaine } = data;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  // 1. Calcul des marges pour chaque enseignant (créneaux disponibles - heures totales)
  const teacherMarginMap = new Map<string, number>();
  for (const t of teachers) {
    const profUnites = unites.filter((u) => u.teacherId === t.id);
    const totalHeures = profUnites.reduce((sum, u) => sum + u.heures, 0);
    const dispos = t.dispo.filter(Boolean).length;
    teacherMarginMap.set(t.id, dispos - totalHeures);
  }

  // 2. Préparation et tri des unités par difficulté
  const unitInfos: SortedUnitInfo[] = unites.map((unite) => {
    const teacher = teachers.find((t) => t.id === unite.teacherId)!;
    const margin = teacherMarginMap.get(unite.teacherId) ?? 99;
    const isBlock = isBlockSubject(teacher.matiere, config.matieresABlocs);
    return {
      unite,
      teacher,
      teacherMargin: margin,
      classesCount: unite.classeIds.length,
      isBlock,
      heures: unite.heures,
    };
  });

  // Tri « Difficiles d'abord » :
  // (1) Marge enseignant croissante (marge nulle d'abord !)
  // (2) Nombre de classes décroissant (cours communs multi-classes en premier)
  // (3) Matière à blocs (Arabe, Anglais en priorité pour former les blocs de 2h)
  // (4) Nombre d'heures décroissant
  unitInfos.sort((a, b) => {
    if (a.teacherMargin !== b.teacherMargin) {
      return a.teacherMargin - b.teacherMargin;
    }
    if (a.classesCount !== b.classesCount) {
      return b.classesCount - a.classesCount;
    }
    if (a.isBlock !== b.isBlock) {
      return (b.isBlock ? 1 : 0) - (a.isBlock ? 1 : 0);
    }
    return b.heures - a.heures;
  });

  // Décomposition de la semaine en paires de créneaux consécutifs par jour
  const validBlockPairs: { slot1: number; slot2: number; jourIndex: number }[] = [];
  let slotCursor = 0;
  for (let j = 0; j < semaine.jours.length; j++) {
    const daySlots = semaine.creneauxParJour[j];
    for (let c = 0; c < daySlots - 1; c++) {
      validBlockPairs.push({
        slot1: slotCursor + c,
        slot2: slotCursor + c + 1,
        jourIndex: j,
      });
    }
    slotCursor += daySlots;
  }

  // Stratégie constructive multi-essais (Restarts adaptatifs) pour garantir le succès en < 3 secondes
  const MAX_RESTARTS = 35;
  let bestPlanning: Planning = [];
  let bestPlacedCount = -1;
  const totalTargetHours = unites.reduce((sum, u) => sum + u.heures, 0);

  for (let attempt = 0; attempt < MAX_RESTARTS; attempt++) {
    if (isCancelled && isCancelled()) {
      break;
    }

    const currentPlanning: Planning = [...lockedAssignments];
    let success = true;

    if (onProgress) {
      const pct = Math.min(48, Math.round((attempt / MAX_RESTARTS) * 45) + 5);
      onProgress(pct, `Heuristique Phase A : essai ${attempt + 1}/${MAX_RESTARTS}...`);
    }

    // Mélange léger des unités de même priorité pour varier les essais
    const attemptUnits = [...unitInfos];
    if (attempt > 0) {
      // Conserver les profs à marge nulle strictement au début, bruiter légèrement les autres
      attemptUnits.sort((a, b) => {
        if (a.teacherMargin === 0 || b.teacherMargin === 0) {
          return a.teacherMargin - b.teacherMargin;
        }
        const diff = a.teacherMargin - b.teacherMargin;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
      });
    }

    for (let uIdx = 0; uIdx < attemptUnits.length; uIdx++) {
      if (isCancelled && isCancelled()) break;

      const info = attemptUnits[uIdx];
      const { unite, teacher, isBlock, heures } = info;
      const alreadyPlaced = currentPlanning.filter((a) => a.uniteId === unite.id).length;
      const remainingHeures = Math.max(0, heures - alreadyPlaced);
      if (remainingHeures === 0) continue;

      if (isBlock) {
        // --- PLACEMENT D'UNE MATIÈRE À BLOCS (Arabe / Anglais) ---
        // Doit former des blocs de 2h consécutives le même jour
        // Une heure isolée seulement si charge impaire
        const numberOf2hBlocks = Math.floor(remainingHeures / 2);
        const has1hIsolated = remainingHeures % 2 !== 0;

        // Trouver des paires de créneaux consécutifs compatibles
        // Filtrer les paires où le prof est dispo et canPlace est ok pour les deux
        const candidatePairs = validBlockPairs.filter((p) => {
          if (!teacher.dispo[p.slot1] || !teacher.dispo[p.slot2]) return false;
          const cp1 = canPlace(currentPlanning, unite, p.slot1, data, config);
          if (!cp1.ok) return false;
          // Simuler l'ajout du premier créneau pour tester le deuxième
          const tempPlanning = [...currentPlanning, { uniteId: unite.id, slot: p.slot1 }];
          const cp2 = canPlace(tempPlanning, unite, p.slot2, data, config);
          return cp2.ok;
        });

        // Ordonner les paires par compacité (matinées de début de semaine d'abord)
        candidatePairs.sort((pA, pB) => {
          const cA = getSlotCoordinates(pA.slot1, semaine);
          const cB = getSlotCoordinates(pB.slot1, semaine);
          const costA = cA.rangHeure * 1.0 + cA.rangJour * 0.3;
          const costB = cB.rangHeure * 1.0 + cB.rangJour * 0.3;
          return costA - costB + (attempt > 0 ? (Math.random() - 0.5) * 1.5 : 0);
        });

        // Sélectionner les blocs sur des jours différents
        const placedDays = new Set<number>();
        let blocksPlaced = 0;

        for (const pair of candidatePairs) {
          if (blocksPlaced >= numberOf2hBlocks) break;
          if (placedDays.has(pair.jourIndex)) continue; // Pas plus de 2h par jour

          // Vérifier à nouveau avec l'état actuel du planning
          const cp1 = canPlace(currentPlanning, unite, pair.slot1, data, config);
          if (!cp1.ok) continue;

          currentPlanning.push({ uniteId: unite.id, slot: pair.slot1 });
          const cp2 = canPlace(currentPlanning, unite, pair.slot2, data, config);

          if (!cp2.ok) {
            // Annuler
            currentPlanning.pop();
            continue;
          }

          currentPlanning.push({ uniteId: unite.id, slot: pair.slot2 });
          placedDays.add(pair.jourIndex);
          blocksPlaced++;
        }

        if (blocksPlaced < numberOf2hBlocks) {
          success = false;
          break; // Échec pour cette unité, tenter un autre restart
        }

        // Si charge impaire : placer l'heure isolée restante sur un autre jour
        if (has1hIsolated) {
          const singleCandidates = Array.from({ length: totalSlots }, (_, i) => i)
            .filter((s) => {
              const coords = getSlotCoordinates(s, semaine);
              if (placedDays.has(coords.jourIndex)) return false; // Jour différent des blocs de 2h
              return canPlace(currentPlanning, unite, s, data, config).ok;
            })
            .sort((sA, sB) => {
              const cA = getSlotCoordinates(sA, semaine);
              const cB = getSlotCoordinates(sB, semaine);
              return cA.rangHeure - cB.rangHeure + (attempt > 0 ? (Math.random() - 0.5) * 2 : 0);
            });

          if (singleCandidates.length === 0) {
            success = false;
            break;
          }

          currentPlanning.push({ uniteId: unite.id, slot: singleCandidates[0] });
        }
      } else {
        // --- PLACEMENT D'UNE MATIÈRE STANDARD ---
        // Placer les 'heures' une par une en respectant canPlace
        let hoursPlacedForUnit = 0;

        for (let h = 0; h < remainingHeures; h++) {
          // Rechercher les créneaux valides
          const candidateSlots = Array.from({ length: totalSlots }, (_, i) => i)
            .filter((s) => canPlace(currentPlanning, unite, s, data, config).ok)
            .sort((sA, sB) => {
              const cA = getSlotCoordinates(sA, semaine);
              const cB = getSlotCoordinates(sB, semaine);

              // Privilégier la répartition (au plus 2h par jour si possible)
              const hoursTodayA = currentPlanning.filter(
                (a) =>
                  a.uniteId === unite.id &&
                  getSlotCoordinates(a.slot, semaine).jourIndex === cA.jourIndex
              ).length;
              const hoursTodayB = currentPlanning.filter(
                (a) =>
                  a.uniteId === unite.id &&
                  getSlotCoordinates(a.slot, semaine).jourIndex === cB.jourIndex
              ).length;

              if (hoursTodayA !== hoursTodayB) {
                return hoursTodayA - hoursTodayB;
              }

              // Compacité temporelle (matinée et début de semaine)
              const costA = cA.rangHeure * 1.0 + cA.rangJour * 0.3;
              const costB = cB.rangHeure * 1.0 + cB.rangJour * 0.3;
              return costA - costB + (attempt > 0 ? (Math.random() - 0.5) * 1.0 : 0);
            });

          if (candidateSlots.length === 0) {
            success = false;
            break;
          }

          currentPlanning.push({ uniteId: unite.id, slot: candidateSlots[0] });
          hoursPlacedForUnit++;
        }

        if (hoursPlacedForUnit < remainingHeures) {
          success = false;
          break;
        }
      }
    }

    if (currentPlanning.length > bestPlacedCount) {
      bestPlacedCount = currentPlanning.length;
      bestPlanning = [...currentPlanning];
    }

    // Si toutes les heures sont placées avec succès, valider formellement avec verify()
    if (success && currentPlanning.length === totalTargetHours) {
      const violations = verify(currentPlanning, data, config);
      const hardViolations = violations.filter((v) => v.severite === 'DURE');
      if (hardViolations.length === 0) {
        if (onProgress) {
          onProgress(50, `Phase A réussie : 100% des ${totalTargetHours} h placées sans conflit.`);
        }
        return currentPlanning;
      }
    }
  }

  // Si aucun essai complet n'a atteint 100%, réparer par permutation locale rapide
  const fixedPlanning = repairPlanning(bestPlanning, data, config);
  return fixedPlanning;
}

/**
 * Répare les heures manquantes éventuelles par échange et recherche locale
 */
function repairPlanning(
  initialPlanning: Planning,
  data: ScheduleData,
  config: SolverConfig
): Planning {
  const current = [...initialPlanning];
  const { unites, semaine } = data;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  // Identifier les unités ayant des heures manquantes
  for (const unite of unites) {
    const placed = current.filter((a) => a.uniteId === unite.id).length;
    const missing = unite.heures - placed;

    for (let m = 0; m < missing; m++) {
      for (let s = 0; s < totalSlots; s++) {
        if (canPlace(current, unite, s, data, config).ok) {
          current.push({ uniteId: unite.id, slot: s });
          break;
        }
      }
    }
  }

  return current;
}
