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
  isBlockSubject,
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
}

export interface PhaseAResultWithDiagnostics {
  planning: Planning;
  logs: GenerationLogEntry[];
  bottlenecks: GenerationBottleneck[];
}

/**
 * Phase A : Heuristique constructive « Difficiles d'abord » avec backtracking borné,
 * passes adaptatives et diagnostic temps réel des goulots d'étranglement.
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

  // 2. Préparation et tri des unités par difficulté
  const unitInfos: SortedUnitInfo[] = unites.map((unite) => {
    const teacher = teachers.find((t) => t.id === unite.teacherId)!;
    const margin = teacherMarginMap.get(unite.teacherId) ?? 99;
    const isBlock = isBlockSubject(teacher.matiere, config.matieresABlocs, config.toutesMatieresABlocs !== false);
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
    let allPlacedInAttempt = true;

    if (onProgress && attempt % 5 === 0) {
      const pct = Math.min(48, Math.round((attempt / MAX_RESTARTS) * 45) + 5);
      onProgress(pct, `Phase A : exploration heuristique ${attempt + 1}/${MAX_RESTARTS}...`, logs.slice(-5));
    }

    const attemptUnits = [...unitInfos];
    if (attempt > 0) {
      attemptUnits.sort((a, b) => {
        if (a.teacherMargin === 0 || b.teacherMargin === 0) {
          return a.teacherMargin - b.teacherMargin;
        }
        const diff = a.teacherMargin - b.teacherMargin;
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
        config.subjectBlockRules
      );

      // (A) Modèle personnalisé avec subjectBlockRules
      if (matchingRule && matchingRule.possibilites.length > 0) {
        const chosenPattern = matchingRule.possibilites[attempt % matchingRule.possibilites.length];
        const blocksToPlace = [...chosenPattern].sort((a, b) => b - a);
        const placedDays = new Set<number>();
        let unitSuccess = true;

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
            } else {
              unitSuccess = false;
              break;
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
            } else {
              unitSuccess = false;
              break;
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
            } else {
              unitSuccess = false;
              break;
            }
          }
        }

        if (!unitSuccess) {
          allPlacedInAttempt = false;
          // NE PAS abandonner les unités suivantes : continuer !
        }
        continue;
      }

      // (B) Modèle standard ou configuré par matière (1h, 2h ou 3h)
      const subjectLimit = config.maxHeuresParJourParMatiere?.[teacher.matiere]
        ?? config.maxHeuresParJourUnite
        ?? 2;

      const placedDays = new Set<number>();
      let hoursPlacedForUnit = 0;

      // 1. Si la matière autorise jusqu'à 3h par jour
      if (subjectLimit === 3 && remainingHeures >= 3) {
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
          hoursPlacedForUnit += 3;
        }
      }

      // 2. Si la matière est en blocs de 2h (ou reste >= 2h après triplet)
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

      if (hoursPlacedForUnit < remainingHeures) {
        allPlacedInAttempt = false;
        // Continuer vers l'unité suivante pour maximiser l'ensemble !
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

      // Tester tous les créneaux pour identifier pourquoi l'unité a été bloquée
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

      // Déterminer la cause prépondérante
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

      if (teacherIndispoCount > totalSlots * 0.5) {
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
        `Goulot détecté pour « ${matiere} » (${missing} h manquante(s)) : ${primaryCause}.`,
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
