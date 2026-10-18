/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, Teacher, Unite } from '../types';
import {
  areSlotsConsecutiveBlockWithoutPause,
  areSlotsConsecutiveWithoutPause,
  canPlace,
  findMatchingBlockRule,
  getSlotCoordinates,
  getSubjectDailyLimit,
  isBlockSubject,
  isOverageDisabledForUnit,
  verify,
} from '../rules';
import { Affectation, Planning, ScheduleData } from '../rules/types';
import {
  GenerationBottleneck,
  GenerationLogEntry,
  LogSeverity,
  SolverConfig,
} from './types';

interface SortedUnitInfo {
  unite: Unite;
  teacher: Teacher;
  teacherMargin: number;
  classesCount: number;
  isBlock: boolean;
  heures: number;
  difficultyScore: number;
}

export interface PhaseAResultWithDiagnostics {
  planning: Planning;
  logs: GenerationLogEntry[];
  bottlenecks: GenerationBottleneck[];
}

/**
 * Chaîne d'éjection locale (Kempe Chain / Ejection Swapper)
 * Permet de libérer les créneaux critiques occupés par des cours plus flexibles
 * pour insérer les unités contraintes (cours communs multi-classes, profs à forte indisponibilité).
 */
function ejectionChainRepair(
  currentPlanning: Planning,
  data: ScheduleData,
  config: SolverConfig,
  lockedAssignments: Affectation[] = []
): boolean {
  const { unites, teachers, semaine } = data;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);
  const lockedKeys = new Set(lockedAssignments.map((l) => `${l.uniteId}_${l.slot}`));
  let placedAny = false;

  // Itérer jusqu'à 30 passes de réparation
  for (let pass = 0; pass < 30; pass++) {
    let placedInPass = false;

    // Trouver toutes les unités ayant encore des heures manquantes
    for (const unite of unites) {
      const placedCount = currentPlanning.filter((a) => a.uniteId === unite.id).length;
      if (placedCount >= unite.heures) continue;

      const teacher = teachers.find((t) => t.id === unite.teacherId);
      if (!teacher) continue;

      // Parcourir tous les créneaux où l'enseignant est libre et disponible
      for (let s = 0; s < totalSlots; s++) {
        if (!teacher.dispo[s]) continue;

        // Le prof est-il déjà en cours sur ce créneau ?
        const profCourse = currentPlanning.find((a) => {
          if (a.slot !== s) return false;
          const u = unites.find((unt) => unt.id === a.uniteId);
          return u && u.teacherId === unite.teacherId;
        });
        if (profCourse) continue;

        // Quelles affectations occupent les classes de cette unité sur ce créneau ?
        const conflictingAffs = currentPlanning.filter((a) => {
          if (a.slot !== s) return false;
          const u = unites.find((unt) => unt.id === a.uniteId);
          return u && u.classeIds.some((cid) => unite.classeIds.includes(cid));
        });

        // Cas 1 : Aucune classe en conflit -> insertion directe si valide
        if (conflictingAffs.length === 0) {
          if (canPlace(currentPlanning, unite, s, data, config).ok) {
            currentPlanning.push({ uniteId: unite.id, slot: s });
            placedInPass = true;
            placedAny = true;
            break;
          }
          continue;
        }

        // Cas 2 : 1 ou 2 unités bloquantes
        if (conflictingAffs.length <= 2) {
          // Si l'une des unités bloquantes est verrouillée, abandonner ce créneau
          if (conflictingAffs.some((a) => lockedKeys.has(`${a.uniteId}_${a.slot}`))) {
            continue;
          }

          // Retirer temporairement les unités bloquantes
          const tempPlanning = currentPlanning.filter(
            (a) => !conflictingAffs.some((ca) => ca.uniteId === a.uniteId && ca.slot === a.slot)
          );

          // Vérifier si `unite` peut se placer sur le créneau libéré
          const canPlaceTarget = canPlace(tempPlanning, unite, s, data, config);
          if (!canPlaceTarget.ok) continue;

          // Ajouter `unite` sur `s`
          const planningWithTarget = [...tempPlanning, { uniteId: unite.id, slot: s }];

          // Chercher un créneau de relogement pour chaque unité bloquante
          const relocations: { uniteId: string; oldSlot: number; newSlot: number }[] = [];
          let allRelocated = true;

          for (const confAff of conflictingAffs) {
            const confUnite = unites.find((u) => u.id === confAff.uniteId);
            if (!confUnite) {
              allRelocated = false;
              break;
            }

            let altSlotFound = -1;
            for (let alt = 0; alt < totalSlots; alt++) {
              if (alt === s) continue;
              if (canPlace(planningWithTarget, confUnite, alt, data, config).ok) {
                altSlotFound = alt;
                planningWithTarget.push({ uniteId: confUnite.id, slot: alt });
                break;
              }
            }

            if (altSlotFound !== -1) {
              relocations.push({
                uniteId: confAff.uniteId,
                oldSlot: confAff.slot,
                newSlot: altSlotFound,
              });
            } else {
              allRelocated = false;
              break;
            }
          }

          if (allRelocated) {
            // Relogement validé avec succès !
            for (const rel of relocations) {
              const idx = currentPlanning.findIndex(
                (a) => a.uniteId === rel.uniteId && a.slot === rel.oldSlot
              );
              if (idx >= 0) {
                currentPlanning[idx].slot = rel.newSlot;
              }
            }
            currentPlanning.push({ uniteId: unite.id, slot: s });
            placedInPass = true;
            placedAny = true;
            break;
          }
        }
      }
    }

    if (!placedInPass) break;
  }

  return placedAny;
}

/**
 * Phase A : Heuristique constructive « Difficiles d'abord » avec backtracking borné,
 * passes adaptatives, chaînes d'éjection et diagnostic temps réel des goulots d'étranglement.
 */
export function solvePhaseAWithDiagnostics(
  data: ScheduleData,
  config: SolverConfig,
  onProgress?: (percent: number, msg: string, logs?: GenerationLogEntry[]) => void,
  isCancelled?: () => boolean,
  lockedAssignments: Affectation[] = []
): PhaseAResultWithDiagnostics {
  const { teachers, classes, unites, semaine } = data;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);
  const totalTargetHours = unites.reduce((sum, u) => sum + u.heures, 0);

  const logs: GenerationLogEntry[] = [];
  const bottlenecks: GenerationBottleneck[] = [];

  let logSeq = 0;
  const addLog = (
    severity: LogSeverity,
    message: string,
    phase: GenerationLogEntry['phase'] = 'PHASE_A',
    details?: string,
    bottleneckType?: GenerationLogEntry['bottleneckType'],
    actionLabel?: string,
    actionPatch?: Partial<SolverConfig>
  ): GenerationLogEntry => {
    logSeq++;
    const entry: GenerationLogEntry = {
      id: `log_${Date.now()}_${logSeq}`,
      timestamp: performance.now(),
      phase,
      severity,
      message,
      details,
      bottleneckType,
      actionLabel,
      actionPatch,
    };
    logs.push(entry);
    return entry;
  };

  addLog(
    'INFO',
    `Démarrage de la Phase A : ${unites.length} unités à affecter (${totalTargetHours} h totales, ${classes.length} classes, ${teachers.length} enseignants).`,
    'INIT'
  );

  if (config.relaxedMode) {
    addLog(
      'INFO',
      'Mode « Règles souples relâchées » actif : priorité absolue à 100 % d\'insertion.',
      'RELAX'
    );
  }

  // 1. Calcul des marges pour chaque enseignant (créneaux disponibles - heures totales)
  const teacherMarginMap = new Map<string, number>();
  const tightTeachers: { prof: Teacher; margin: number; totalH: number }[] = [];

  for (const t of teachers) {
    const profUnites = unites.filter((u) => u.teacherId === t.id);
    const totalHeures = profUnites.reduce((sum, u) => sum + u.heures, 0);
    const dispos = t.dispo.filter(Boolean).length;
    const margin = dispos - totalHeures;
    teacherMarginMap.set(t.id, margin);
    if (margin <= 2) {
      tightTeachers.push({ prof: t, margin, totalH: totalHeures });
    }
  }

  if (tightTeachers.length > 0) {
    tightTeachers.forEach(({ prof, margin, totalH }) => {
      addLog(
        margin <= 0 ? 'WARNING' : 'INFO',
        `Enseignant sous tension : ${prof.nom} (${prof.matiere}) a une marge de ${margin}h (${totalH}h de cours pour ${prof.dispo.filter(Boolean).length} créneaux libres).`,
        'PHASE_A',
        undefined,
        'TEACHER_DISPO'
      );
    });
  }

  // 2. Préparation et tri des unités par difficulté réelle (MRV / Criticité)
  const unitInfos: SortedUnitInfo[] = unites.map((unite) => {
    const teacher = teachers.find((t) => t.id === unite.teacherId)!;
    const margin = teacherMarginMap.get(unite.teacherId) ?? 99;
    const isBlock = isBlockSubject(teacher.matiere, config.matieresABlocs, config.toutesMatieresABlocs !== false);
    const dispos = teacher.dispo.filter(Boolean).length;

    // Calcul de la criticité :
    // 1. Cours communs multi-classes (unite.classeIds.length >= 2) avec peu de créneaux prof sont prioritaires absolus
    const multiClassScore = unite.classeIds.length >= 2 ? (dispos <= 14 ? 3000 : 1500) : 0;
    const tightDispoScore = dispos <= 8 ? 1200 : dispos <= 14 ? 600 : dispos <= 20 ? 200 : 0;
    const marginScore = margin <= 0 ? 1000 : margin <= 1 ? 500 : margin <= 2 ? 250 : 0;
    const blockScore = isBlock ? 80 : 0;
    const difficultyScore = multiClassScore + tightDispoScore + marginScore + blockScore + unite.heures;

    return {
      unite,
      teacher,
      teacherMargin: margin,
      classesCount: unite.classeIds.length,
      isBlock,
      heures: unite.heures,
      difficultyScore,
    };
  });

  // Tri par score de difficulté décroissant (les plus contraints en premier)
  unitInfos.sort((a, b) => b.difficultyScore - a.difficultyScore);

  // Décomposition en paires et triplets consécutifs sans franchir la pause
  const validBlockPairs: { slot1: number; slot2: number; jourIndex: number }[] = [];
  const validBlockTriplets: { slot1: number; slot2: number; slot3: number; jourIndex: number }[] = [];
  let slotCursor = 0;
  for (let j = 0; j < semaine.jours.length; j++) {
    const daySlots = semaine.creneauxParJour[j];
    for (let c = 0; c < daySlots - 1; c++) {
      const s1 = slotCursor + c;
      const s2 = slotCursor + c + 1;
      if (areSlotsConsecutiveWithoutPause(s1, s2, semaine, config.respecterPauseMidiBlocs !== false)) {
        validBlockPairs.push({
          slot1: s1,
          slot2: s2,
          jourIndex: j,
        });
      }
    }
    for (let c = 0; c < daySlots - 2; c++) {
      const s1 = slotCursor + c;
      const s2 = slotCursor + c + 1;
      const s3 = slotCursor + c + 2;
      if (areSlotsConsecutiveBlockWithoutPause([s1, s2, s3], semaine, config.respecterPauseMidiBlocs !== false)) {
        validBlockTriplets.push({
          slot1: s1,
          slot2: s2,
          slot3: s3,
          jourIndex: j,
        });
      }
    }
    slotCursor += daySlots;
  }

  const MAX_RESTARTS = 35;
  let bestPlanning: Planning = [];
  let bestPlacedCount = -1;

  for (let attempt = 0; attempt < MAX_RESTARTS; attempt++) {
    if (isCancelled && isCancelled()) break;

    const currentPlanning: Planning = [...lockedAssignments];

    if (onProgress && attempt % 5 === 0) {
      const pct = Math.min(48, Math.round((attempt / MAX_RESTARTS) * 45) + 5);
      onProgress(pct, `Phase A : exploration heuristique ${attempt + 1}/${MAX_RESTARTS}...`, logs.slice(-5));
    }

    const attemptUnits = [...unitInfos];
    if (attempt > 0) {
      attemptUnits.sort((a, b) => {
        // Conserver les ultra-critiques en tête absolue
        if (a.difficultyScore >= 2000 || b.difficultyScore >= 2000) {
          return b.difficultyScore - a.difficultyScore;
        }
        const diff = b.difficultyScore - a.difficultyScore;
        if (diff !== 0) return diff;
        return Math.random() - 0.5;
      });
    }

    // --- PASS 1 : Placement principal des unités ---
    for (let uIdx = 0; uIdx < attemptUnits.length; uIdx++) {
      if (isCancelled && isCancelled()) break;

      const info = attemptUnits[uIdx];
      const { unite, teacher, isBlock, heures } = info;
      const alreadyPlaced = currentPlanning.filter((a) => a.uniteId === unite.id).length;
      const remainingHeures = Math.max(0, heures - alreadyPlaced);
      if (remainingHeures === 0) continue;

      const classMap = new Map<string, Classe>(classes.map((c) => [c.id, c]));
      const classesNiveaux = unite.classeIds
        .map((cid) => classMap.get(cid)?.niveau || '')
        .filter(Boolean)
        .join(' / ');

      const matchingRule = findMatchingBlockRule(
        teacher.matiere,
        classesNiveaux,
        unite.heures,
        config.subjectBlockRules,
        unite.classeIds[0]
      );

      // (A) Modèle personnalisé avec subjectBlockRules
      if (matchingRule && matchingRule.possibilites.length > 0) {
        const chosenPattern = matchingRule.possibilites[attempt % matchingRule.possibilites.length];
        const blocksToPlace = [...chosenPattern].sort((a, b) => b - a);
        const placedDays = new Set<number>();

        for (const bSize of blocksToPlace) {
          if (bSize === 3) {
            const candidateTriplets = validBlockTriplets.filter((t) => {
              if (placedDays.has(t.jourIndex)) return false;
              if (!teacher.dispo[t.slot1] || !teacher.dispo[t.slot2] || !teacher.dispo[t.slot3]) return false;
              if (!canPlace(currentPlanning, unite, t.slot1, data, config).ok) return false;
              const tp1 = [...currentPlanning, { uniteId: unite.id, slot: t.slot1 }];
              if (!canPlace(tp1, unite, t.slot2, data, config).ok) return false;
              const tp2 = [...tp1, { uniteId: unite.id, slot: t.slot2 }];
              return canPlace(tp2, unite, t.slot3, data, config).ok;
            });

            if (candidateTriplets.length > 0) {
              const best = candidateTriplets[0];
              currentPlanning.push({ uniteId: unite.id, slot: best.slot1 });
              currentPlanning.push({ uniteId: unite.id, slot: best.slot2 });
              currentPlanning.push({ uniteId: unite.id, slot: best.slot3 });
              placedDays.add(best.jourIndex);
            }
          } else if (bSize === 2) {
            const candidatePairs = validBlockPairs.filter((p) => {
              if (placedDays.has(p.jourIndex)) return false;
              if (!teacher.dispo[p.slot1] || !teacher.dispo[p.slot2]) return false;
              if (!canPlace(currentPlanning, unite, p.slot1, data, config).ok) return false;
              const tp1 = [...currentPlanning, { uniteId: unite.id, slot: p.slot1 }];
              return canPlace(tp1, unite, p.slot2, data, config).ok;
            });

            if (candidatePairs.length > 0) {
              const best = candidatePairs[0];
              currentPlanning.push({ uniteId: unite.id, slot: best.slot1 });
              currentPlanning.push({ uniteId: unite.id, slot: best.slot2 });
              placedDays.add(best.jourIndex);
            }
          } else {
            const singleCandidates = Array.from({ length: totalSlots }, (_, i) => i)
              .filter((s) => {
                const coords = getSlotCoordinates(s, semaine);
                if (placedDays.has(coords.jourIndex)) return false;
                return canPlace(currentPlanning, unite, s, data, config).ok;
              });

            if (singleCandidates.length > 0) {
              const best = singleCandidates[0];
              currentPlanning.push({ uniteId: unite.id, slot: best });
              placedDays.add(getSlotCoordinates(best, semaine).jourIndex);
            }
          }
        }
        continue;
      }

      // (B) Modèle standard ou configuré par matière/niveau/classe (1h, 2h ou 3h)
      const classesNiveauxList = unite.classeIds
        .map((cid) => classMap.get(cid)?.niveau)
        .filter(Boolean) as string[];
      const subjectLimit = getSubjectDailyLimit(
        teacher.matiere,
        unite.classeIds,
        classesNiveauxList,
        config
      );

      const placedDays = new Set<number>();
      let hoursPlacedForUnit = 0;

      // 1. Si la matière autorise jusqu'à 3h par jour
      if (subjectLimit === 3 && remainingHeures >= 3) {
        const candidateTriplets = validBlockTriplets.filter((t) => {
          if (placedDays.has(t.jourIndex)) return false;
          if (isOverageDisabledForUnit(unite.id, t.jourIndex, config)) return false;
          if (!teacher.dispo[t.slot1] || !teacher.dispo[t.slot2] || !teacher.dispo[t.slot3]) return false;
          if (!canPlace(currentPlanning, unite, t.slot1, data, config).ok) return false;
          const tp1 = [...currentPlanning, { uniteId: unite.id, slot: t.slot1 }];
          if (!canPlace(tp1, unite, t.slot2, data, config).ok) return false;
          const tp2 = [...tp1, { uniteId: unite.id, slot: t.slot2 }];
          return canPlace(tp2, unite, t.slot3, data, config).ok;
        });

        if (candidateTriplets.length > 0) {
          const best = candidateTriplets[0];
          currentPlanning.push({ uniteId: unite.id, slot: best.slot1 });
          currentPlanning.push({ uniteId: unite.id, slot: best.slot2 });
          currentPlanning.push({ uniteId: unite.id, slot: best.slot3 });
          placedDays.add(best.jourIndex);
          hoursPlacedForUnit += 3;
        }
      }

      // 2. Si la matière est en blocs de 2h
      const currentRemaining = remainingHeures - hoursPlacedForUnit;
      const isStrictBlock = isBlock && subjectLimit >= 2;
      const shouldPreferBlocks =
        subjectLimit >= 2 && (isStrictBlock || (config.prefererBlocs2hMemeJour !== false && currentRemaining >= 2));

      if (shouldPreferBlocks && currentRemaining >= 2) {
        const numberOf2hBlocks = Math.floor(currentRemaining / 2);

        const candidatePairs = validBlockPairs.filter((p) => {
          if (placedDays.has(p.jourIndex)) return false;
          if (!teacher.dispo[p.slot1] || !teacher.dispo[p.slot2]) return false;
          const cp1 = canPlace(currentPlanning, unite, p.slot1, data, config);
          if (!cp1.ok) return false;
          const tempPlanning = [...currentPlanning, { uniteId: unite.id, slot: p.slot1 }];
          const cp2 = canPlace(tempPlanning, unite, p.slot2, data, config);
          return cp2.ok;
        });

        candidatePairs.sort((pA, pB) => {
          const cA = getSlotCoordinates(pA.slot1, semaine);
          const cB = getSlotCoordinates(pB.slot1, semaine);
          return (
            cA.rangHeure * 1.0 +
            cA.rangJour * 0.3 -
            (cB.rangHeure * 1.0 + cB.rangJour * 0.3) +
            (attempt > 0 ? (Math.random() - 0.5) * 1.5 : 0)
          );
        });

        let blocksPlaced = 0;
        for (const pair of candidatePairs) {
          if (blocksPlaced >= numberOf2hBlocks) break;
          if (placedDays.has(pair.jourIndex)) continue;

          const cp1 = canPlace(currentPlanning, unite, pair.slot1, data, config);
          if (!cp1.ok) continue;

          currentPlanning.push({ uniteId: unite.id, slot: pair.slot1 });
          const cp2 = canPlace(currentPlanning, unite, pair.slot2, data, config);
          if (!cp2.ok) {
            currentPlanning.pop();
            continue;
          }

          currentPlanning.push({ uniteId: unite.id, slot: pair.slot2 });
          placedDays.add(pair.jourIndex);
          blocksPlaced++;
          hoursPlacedForUnit += 2;
        }
      }

      // 3. Heures restantes : placement en séances simples (1h)
      const stillNeeded = remainingHeures - hoursPlacedForUnit;
      if (stillNeeded > 0) {
        for (let rem = 0; rem < stillNeeded; rem++) {
          const singleCandidates = Array.from({ length: totalSlots }, (_, i) => i)
            .filter((s) => {
              const coords = getSlotCoordinates(s, semaine);
              const isOverDisabled = isOverageDisabledForUnit(unite.id, coords.jourIndex, config);
              if (isOverDisabled) {
                const alreadyOnThisDay = currentPlanning.filter(
                  (a) => a.uniteId === unite.id && getSlotCoordinates(a.slot, semaine).jourIndex === coords.jourIndex
                ).length;
                if (alreadyOnThisDay >= 2) return false;
              }
              if (placedDays.has(coords.jourIndex) && !config.relaxedMode && subjectLimit <= 2) {
                return false;
              }
              return canPlace(currentPlanning, unite, s, data, config).ok;
            })
            .sort((sA, sB) => {
              const cA = getSlotCoordinates(sA, semaine);
              const cB = getSlotCoordinates(sB, semaine);
              return cA.rangHeure - cB.rangHeure + (attempt > 0 ? (Math.random() - 0.5) * 1.5 : 0);
            });

          const candidates =
            singleCandidates.length > 0
              ? singleCandidates
              : Array.from({ length: totalSlots }, (_, i) => i).filter(
                  (s) => canPlace(currentPlanning, unite, s, data, config).ok
                );

          if (candidates.length > 0) {
            const chosen = candidates[0];
            currentPlanning.push({ uniteId: unite.id, slot: chosen });
            placedDays.add(getSlotCoordinates(chosen, semaine).jourIndex);
            hoursPlacedForUnit++;
          }
        }
      }
    }

    // --- PASS 2 : Réparation des heures manquantes de toutes les unités ---
    if (currentPlanning.length < totalTargetHours) {
      for (const unite of unites) {
        const placedCount = currentPlanning.filter((a) => a.uniteId === unite.id).length;
        const missingForUnit = unite.heures - placedCount;
        for (let m = 0; m < missingForUnit; m++) {
          for (let s = 0; s < totalSlots; s++) {
            if (canPlace(currentPlanning, unite, s, data, config).ok) {
              currentPlanning.push({ uniteId: unite.id, slot: s });
              break;
            }
          }
        }
      }
    }

    // --- PASS 3 (Secours Relâché) si des heures manquent et mode relâché actif ---
    if (config.relaxedMode && currentPlanning.length < totalTargetHours) {
      const relaxedOpts = { ...config, relaxedMode: true, respecterPauseMidiBlocs: false };
      for (const unite of unites) {
        const placedCount = currentPlanning.filter((a) => a.uniteId === unite.id).length;
        const missingForUnit = unite.heures - placedCount;
        for (let m = 0; m < missingForUnit; m++) {
          for (let s = 0; s < totalSlots; s++) {
            if (canPlace(currentPlanning, unite, s, data, relaxedOpts).ok) {
              currentPlanning.push({ uniteId: unite.id, slot: s });
              break;
            }
          }
        }
      }
    }

    // --- PASS 4 : Chaîne d'éjection locale (Swap / Ejection chain) ---
    if (currentPlanning.length < totalTargetHours) {
      ejectionChainRepair(currentPlanning, data, config, lockedAssignments);
    }

    // --- PASS 5 : Chaîne d'éjection en mode relâché si nécessaire ---
    if (config.relaxedMode && currentPlanning.length < totalTargetHours) {
      const relaxedOpts = { ...config, relaxedMode: true, respecterPauseMidiBlocs: false };
      ejectionChainRepair(currentPlanning, data, relaxedOpts, lockedAssignments);
    }

    if (currentPlanning.length > bestPlacedCount) {
      bestPlacedCount = currentPlanning.length;
      bestPlanning = [...currentPlanning];
    }

    // Si 100% atteint, validation formelle
    if (currentPlanning.length === totalTargetHours) {
      const violations = verify(currentPlanning, data, config);
      const hardViolations = violations.filter((v) => v.severite === 'DURE');
      if (hardViolations.length === 0) {
        addLog(
          'SUCCESS',
          `Phase A : Succès à 100 % à l'essai ${attempt + 1}/${MAX_RESTARTS} (${totalTargetHours} h placées sans conflit).`,
          'PHASE_A'
        );
        return {
          planning: currentPlanning,
          logs,
          bottlenecks: [],
        };
      }
    }
  }

  // --- PASS FINALE D'ÉJECTION GLOBALE SUR LA MEILLEURE SOLUTION ---
  if (bestPlanning.length < totalTargetHours) {
    ejectionChainRepair(bestPlanning, data, config, lockedAssignments);
    if (config.relaxedMode && bestPlanning.length < totalTargetHours) {
      const relaxedOpts = { ...config, relaxedMode: true, respecterPauseMidiBlocs: false };
      ejectionChainRepair(bestPlanning, data, relaxedOpts, lockedAssignments);
    }
  }

  if (bestPlanning.length === totalTargetHours) {
    const violations = verify(bestPlanning, data, config);
    const hardViolations = violations.filter((v) => v.severite === 'DURE');
    if (hardViolations.length === 0) {
      addLog(
        'SUCCESS',
        `Phase A : Succès à 100 % grâce aux chaînes d'éjection locale (${totalTargetHours} h placées sans conflit).`,
        'PHASE_A'
      );
      return {
        planning: bestPlanning,
        logs,
        bottlenecks: [],
      };
    }
  }

  // --- ANALYSE DES GOULOTS D'ÉTRANGLEMENT (Si heures manquantes) ---
  const missingTotal = totalTargetHours - bestPlanning.length;
  if (missingTotal > 0) {
    addLog(
      'WARNING',
      `Phase A terminée : ${bestPlanning.length}/${totalTargetHours} h placées (${missingTotal} h manquante(s)). Analyse des goulots d'étranglement en cours...`,
      'PHASE_A'
    );

    const classMap = new Map<string, Classe>(classes.map((c) => [c.id, c]));

    for (const unite of unites) {
      const placed = bestPlanning.filter((a) => a.uniteId === unite.id).length;
      const missing = unite.heures - placed;
      if (missing <= 0) continue;

      const teacher = teachers.find((t) => t.id === unite.teacherId);
      const classesNoms = unite.classeIds.map((cid) => classMap.get(cid)?.nom || cid);
      const matiere = teacher?.matiere || 'Matière inconnue';

      let teacherIndispoCount = 0;
      let classCollisionCount = 0;
      let blockOrPauseCount = 0;
      let forbiddenSlotCount = 0;

      for (let s = 0; s < totalSlots; s++) {
        const check = canPlace(bestPlanning, unite, s, data, config);
        if (!check.ok) {
          for (const raison of check.raisons) {
            if (raison.includes('indisponible')) teacherIndispoCount++;
            else if (raison.includes('déjà un cours')) classCollisionCount++;
            else if (raison.includes('bloc') || raison.includes('pause') || raison.includes('heures par jour')) blockOrPauseCount++;
            else if (raison.includes('interdite') || raison.includes('réservé')) forbiddenSlotCount++;
          }
        }
      }

      let bottleneckType = 'BLOCK_CONSTRAINT';
      let primaryCause = `Contrainte de blocs journaliers (${matiere})`;
      let diagnosticExplanation = `La matière « ${matiere} » plafonnée à 2h/jour ne trouve plus de paire consécutive compatible dans les créneaux libres de ${teacher?.nom}.`;
      let suggestedSolution = `Autoriser jusqu'à 3h par jour pour « ${matiere} »`;
      let patch: Partial<SolverConfig> = {
        maxHeuresParJourParMatiere: {
          ...(config.maxHeuresParJourParMatiere || {}),
          [matiere]: 3,
        },
      };

      if (teacherIndispoCount > totalSlots * 0.4) {
        bottleneckType = 'TEACHER_DISPO';
        primaryCause = `Indisponibilité forte de l'enseignant ${teacher?.nom}`;
        diagnosticExplanation = `${teacher?.nom} est indisponible sur ${teacherIndispoCount} créneaux. Il n'y a plus de créneaux simultanés disponibles avec les classes ${classesNoms.join(', ')}.`;
        suggestedSolution = `Activer le mode règles relâchées ou ajuster la grille de disponibilité de l'enseignant`;
        patch = { relaxedMode: true };
      } else if (forbiddenSlotCount > 0) {
        bottleneckType = 'FORBIDDEN_SLOT';
        primaryCause = `Plages interdites ou créneaux réservés sur les classes ${classesNoms.join(', ')}`;
        diagnosticExplanation = `Des plages interdites neutralisent les créneaux communs entre ${teacher?.nom} et la classe.`;
        suggestedSolution = `Désactiver temporairement les plages interdites`;
        patch = { forbiddenSlotsClasses: [], forbiddenSlotsTeachers: [] };
      } else if (blockOrPauseCount > 0) {
        bottleneckType = 'BLOCK_CONSTRAINT';
        primaryCause = `Plafonnement 2h/jour ou pause méridienne bloquante`;
        diagnosticExplanation = `L'enseignant est déjà présent sur les jours disponibles mais ne peut pas y placer un nouveau bloc de 2h sans dépasser la limite de 2h ou heurter la pause C4/C5.`;
        suggestedSolution = `Autoriser jusqu'à 3h par jour pour « ${matiere} »`;
        patch = {
          maxHeuresParJourParMatiere: {
            ...(config.maxHeuresParJourParMatiere || {}),
            [matiere]: 3,
          },
        };
      }

      const bottleneck: GenerationBottleneck = {
        id: `bn_${unite.id}`,
        matiere,
        teacherNom: teacher?.nom || unite.teacherId,
        classesNoms,
        missingHours: missing,
        bottleneckType,
        primaryCause,
        diagnosticExplanation,
        suggestedSolution,
        patch,
      };

      bottlenecks.push(bottleneck);

      addLog(
        'BOTTLENECK',
        `Goulot détecté pour « ${matiere} » (${missing} h manquante(s)) : ${primaryCause}. - ${diagnosticExplanation}`,
        'PHASE_A',
        diagnosticExplanation,
        bottleneckType as GenerationLogEntry['bottleneckType'],
        suggestedSolution,
        patch
      );
    }
  }

  return {
    planning: bestPlanning,
    logs,
    bottlenecks,
  };
}

/**
 * Interface standard solvePhaseA conservée pour rétro-compatibilité
 */
export function solvePhaseA(
  data: ScheduleData,
  config: SolverConfig,
  onProgress?: (percent: number, msg: string) => void,
  isCancelled?: () => boolean,
  lockedAssignments: Affectation[] = []
): Planning {
  const result = solvePhaseAWithDiagnostics(
    data,
    config,
    onProgress ? (pct, msg) => onProgress(pct, msg) : undefined,
    isCancelled,
    lockedAssignments
  );
  return result.planning;
}
