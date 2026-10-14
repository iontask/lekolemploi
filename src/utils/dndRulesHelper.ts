/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, Semaine, Teacher, Unite } from '../types';
import { canPlace, getSlotCoordinates, isBlockSubject, score, verify } from '../rules';
import { Affectation, Planning, RulesOptions, ScheduleData, ScoreBreakdown } from '../rules/types';

export type CellDropStatus = 'green' | 'orange' | 'red';

export interface CellDropEvaluation {
  status: CellDropStatus;
  reasons: string[];
  isSwap: boolean;
  swapTargetUniteId?: string;
  swapTargetSlots?: number[];
  scoreDelta?: number;
  warningMessage?: string;
}

/**
 * Crée une clé unique pour une affectation verrouillée
 */
export function getLockKey(uniteId: string, slot: number): string {
  return `${uniteId}_slot_${slot}`;
}

/**
 * Vérifie si un créneau d'une unité est verrouillé
 */
export function isSlotLocked(lockedKeys: Set<string>, uniteId: string, slot: number): boolean {
  return lockedKeys.has(getLockKey(uniteId, slot));
}

/**
 * Détecte si un cours sur un créneau donné fait partie d'un bloc de 2h consécutives le même jour
 */
export function getBlockSlotsForAssignment(
  planning: Planning,
  uniteId: string,
  slot: number,
  semaine: Semaine
): number[] {
  const currentCoords = getSlotCoordinates(slot, semaine);
  const sameUnitAffs = planning.filter((a) => a.uniteId === uniteId);

  // Vérifier si le créneau suivant est sur le même jour et affecté à la même unité
  const nextSlot = slot + 1;
  const hasNext = sameUnitAffs.some((a) => a.slot === nextSlot);
  if (hasNext) {
    const nextCoords = getSlotCoordinates(nextSlot, semaine);
    if (nextCoords.jourIndex === currentCoords.jourIndex) {
      return [slot, nextSlot];
    }
  }

  // Vérifier si le créneau précédent est sur le même jour et affecté à la même unité
  const prevSlot = slot - 1;
  const hasPrev = slot > 0 && sameUnitAffs.some((a) => a.slot === prevSlot);
  if (hasPrev) {
    const prevCoords = getSlotCoordinates(prevSlot, semaine);
    if (prevCoords.jourIndex === currentCoords.jourIndex) {
      return [prevSlot, slot];
    }
  }

  return [slot];
}

/**
 * Évalue en temps réel la validité et l'impact d'un glissement vers une case cible
 */
export function evaluateMoveOrSwap(
  planning: Planning,
  sourceUniteId: string,
  sourceSlots: number[],
  targetSlot: number,
  data: ScheduleData,
  lockedKeys: Set<string>,
  options?: RulesOptions
): CellDropEvaluation {
  const { unites, teachers, classes, semaine } = data;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const unite = unites.find((u) => u.id === sourceUniteId);
  if (!unite) {
    return {
      status: 'red',
      reasons: ['Unité source introuvable.'],
      isSwap: false,
    };
  }

  const prof = teachers.find((t) => t.id === unite.teacherId);
  const isBlock = sourceSlots.length === 2;

  // Déterminer les créneaux cibles prévus
  const targetSlots: number[] = isBlock ? [targetSlot, targetSlot + 1] : [targetSlot];

  // Si on dépose exactement sur les mêmes créneaux : pas de changement
  const isSameSlots =
    sourceSlots.length === targetSlots.length &&
    sourceSlots.every((s, i) => s === targetSlots[i]);
  if (isSameSlots) {
    return {
      status: 'green',
      reasons: ['Emplacement actuel conservé.'],
      isSwap: false,
    };
  }

  // Vérification de validité temporelle des créneaux cibles
  for (const s of targetSlots) {
    if (s < 0 || s >= totalSlots) {
      return {
        status: 'red',
        reasons: [`Le créneau ${s} est hors limites de la semaine.`],
        isSwap: false,
      };
    }
  }

  // Pour un bloc de 2h : doit impérativement être le même jour
  if (isBlock) {
    const c0 = getSlotCoordinates(targetSlots[0], semaine);
    const c1 = getSlotCoordinates(targetSlots[1], semaine);
    if (c0.jourIndex !== c1.jourIndex) {
      return {
        status: 'red',
        reasons: ['Un bloc de 2 h ne peut pas être coupé sur deux journées différentes.'],
        isSwap: false,
      };
    }
  }

  // Vérifier la disponibilité du professeur sur les créneaux cibles
  if (prof) {
    for (const s of targetSlots) {
      if (!prof.dispo[s]) {
        const c = getSlotCoordinates(s, semaine);
        return {
          status: 'red',
          reasons: [
            `L'enseignant ${prof.nom} est indisponible sur ce créneau (${c.jourNom} C${c.creneauNumero}).`,
          ],
          isSwap: false,
        };
      }
    }
  }

  // Vérifier si le cours source est verrouillé
  for (const s of sourceSlots) {
    if (isSlotLocked(lockedKeys, sourceUniteId, s)) {
      return {
        status: 'red',
        reasons: ['Ce cours est verrouillé (cadenas) et ne peut pas être déplacé.'],
        isSwap: false,
      };
    }
  }

  // Trouver les affectations actuellement présentes sur les créneaux cibles
  const occupiedAffs = planning.filter(
    (a) => targetSlots.includes(a.slot) && a.uniteId !== sourceUniteId
  );

  // -------------------------------------------------------------
  // CAS 1 : ÉCHANGE (SWAP) avec un cours présent sur la case cible
  // -------------------------------------------------------------
  if (occupiedAffs.length > 0) {
    const targetUniteId = occupiedAffs[0].uniteId;
    const targetUnite = unites.find((u) => u.id === targetUniteId);

    if (!targetUnite) {
      return {
        status: 'red',
        reasons: ['Cours cible inconnu.'],
        isSwap: false,
      };
    }

    // Déterminer les créneaux complets du cours cible
    const swapTargetSlots = isBlock
      ? targetSlots
      : getBlockSlotsForAssignment(planning, targetUniteId, targetSlot, semaine);

    // Vérifier si un des créneaux cibles est verrouillé
    for (const ts of swapTargetSlots) {
      if (isSlotLocked(lockedKeys, targetUniteId, ts)) {
        return {
          status: 'red',
          reasons: ['Le cours présent sur cette case est verrouillé et ne peut pas être déplacé.'],
          isSwap: true,
          swapTargetUniteId: targetUniteId,
        };
      }
    }

    // Si les tailles de blocs sont incompatibles (ex: bloc 2h avec 1h isolée)
    if (sourceSlots.length !== swapTargetSlots.length) {
      return {
        status: 'red',
        reasons: [
          `Échange impossible : un bloc de ${sourceSlots.length} h ne peut pas être échangé avec un créneau de ${swapTargetSlots.length} h.`,
        ],
        isSwap: true,
        swapTargetUniteId: targetUniteId,
      };
    }

    // Simuler le planning échangé
    const swappedPlanning: Planning = planning
      .filter(
        (a) =>
          !(a.uniteId === sourceUniteId && sourceSlots.includes(a.slot)) &&
          !(a.uniteId === targetUniteId && swapTargetSlots.includes(a.slot))
      )
      .concat(
        sourceSlots.map((srcSlot, idx) => ({
          uniteId: targetUniteId,
          slot: srcSlot,
        })),
        swapTargetSlots.map((tgtSlot, idx) => ({
          uniteId: sourceUniteId,
          slot: tgtSlot,
        }))
      );

    // Valider formellement avec verify() (ignorer HEURES_NON_PLACEES pré-existantes)
    const violations = verify(swappedPlanning, data, options);
    const hardViolations = violations.filter(
      (v) => v.severite === 'DURE' && v.type !== 'HEURES_NON_PLACEES'
    );

    if (hardViolations.length > 0) {
      return {
        status: 'red',
        reasons: hardViolations.map((v) => v.message),
        isSwap: true,
        swapTargetUniteId: targetUniteId,
        swapTargetSlots,
      };
    }

    // Vérifier l'impact sur le score
    const scoreOld = score(planning, data, options);
    const scoreNew = score(swappedPlanning, data, options);
    const delta = Math.round((scoreNew.total - scoreOld.total) * 100) / 100;

    const targetProf = teachers.find((t) => t.id === targetUnite.teacherId);
    const labelProf = targetProf ? `${targetProf.nom} (${targetProf.matiere})` : targetUniteId;

    if (delta > 0) {
      return {
        status: 'orange',
        reasons: [
          `Échange possible avec ${labelProf}, mais dégrade le score (+${delta} pts).`,
        ],
        isSwap: true,
        swapTargetUniteId: targetUniteId,
        swapTargetSlots,
        scoreDelta: delta,
        warningMessage: `Échange valide avec avertissement : augmentation du score de +${delta} points.`,
      };
    }

    return {
      status: 'green',
      reasons: [`Échange possible avec ${labelProf} (0 conflit dur).`],
      isSwap: true,
      swapTargetUniteId: targetUniteId,
      swapTargetSlots,
      scoreDelta: delta,
    };
  }

  // -------------------------------------------------------------
  // CAS 2 : DÉPLACEMENT VERS UNE CASE LIBRE
  // -------------------------------------------------------------
  // Planning temporaire sans les heures de l'unité source
  const basePlanning = planning.filter(
    (a) => !(a.uniteId === sourceUniteId && sourceSlots.includes(a.slot))
  );

  // Vérifier canPlace pour chaque créneau cible séquentiellement
  const simulatedPlanning = [...basePlanning];
  const reasonsAccum: string[] = [];

  for (const s of targetSlots) {
    const cp = canPlace(simulatedPlanning, unite, s, data, options);
    if (!cp.ok) {
      reasonsAccum.push(...cp.raisons);
    }
    simulatedPlanning.push({ uniteId: sourceUniteId, slot: s });
  }

  if (reasonsAccum.length > 0) {
    return {
      status: 'red',
      reasons: reasonsAccum,
      isSwap: false,
    };
  }

  // Validation globale de l'emploi du temps avec verify()
  const violations = verify(simulatedPlanning, data, options);
  const hardViolations = violations.filter(
    (v) => v.severite === 'DURE' && v.type !== 'HEURES_NON_PLACEES'
  );

  if (hardViolations.length > 0) {
    return {
      status: 'red',
      reasons: hardViolations.map((v) => v.message),
      isSwap: false,
    };
  }

  // Calcul du différentiel de score souple
  const scoreOld = score(planning, data, options);
  const scoreNew = score(simulatedPlanning, data, options);
  const delta = Math.round((scoreNew.total - scoreOld.total) * 100) / 100;

  if (delta > 0) {
    const softReasons: string[] = [];
    if (scoreNew.penalitesExcesJour > scoreOld.penalitesExcesJour) {
      softReasons.push('Dépassement du quota souple de 2 h / jour');
    }
    if (scoreNew.penalitesNonConsecutif > scoreOld.penalitesNonConsecutif) {
      softReasons.push('Heures non consécutives dans la même journée');
    }
    if (scoreNew.coutCompacite > scoreOld.coutCompacite) {
      softReasons.push('Dégradation de la compacité temporelle');
    }

    return {
      status: 'orange',
      reasons: [
        `Déplacement autorisé mais dégrade une règle souple (+${delta} pts) :`,
        ...softReasons,
      ],
      isSwap: false,
      scoreDelta: delta,
      warningMessage: `Déplacement accepté avec avertissement (+${delta} pts) : ${softReasons.join(', ')}.`,
    };
  }

  return {
    status: 'green',
    reasons: ['Déplacement optimal (0 conflit, respecte toutes les règles dures).'],
    isSwap: false,
    scoreDelta: delta,
  };
}

/**
 * Exécute le déplacement ou l'échange si validé
 */
export function executeMoveOrSwap(
  planning: Planning,
  sourceUniteId: string,
  sourceSlots: number[],
  targetSlot: number,
  data: ScheduleData,
  lockedKeys: Set<string>,
  options?: RulesOptions
): {
  newPlanning: Planning;
  success: boolean;
  isSwap: boolean;
  warning?: string;
  error?: string;
} {
  const evalResult = evaluateMoveOrSwap(
    planning,
    sourceUniteId,
    sourceSlots,
    targetSlot,
    data,
    lockedKeys,
    options
  );

  if (evalResult.status === 'red') {
    return {
      newPlanning: planning,
      success: false,
      isSwap: evalResult.isSwap,
      error: evalResult.reasons.join(' '),
    };
  }

  const isBlock = sourceSlots.length === 2;
  const targetSlots = isBlock ? [targetSlot, targetSlot + 1] : [targetSlot];

  if (evalResult.isSwap && evalResult.swapTargetUniteId && evalResult.swapTargetSlots) {
    // Échange
    const newPlanning: Planning = planning
      .filter(
        (a) =>
          !(a.uniteId === sourceUniteId && sourceSlots.includes(a.slot)) &&
          !(a.uniteId === evalResult.swapTargetUniteId && evalResult.swapTargetSlots!.includes(a.slot))
      )
      .concat(
        sourceSlots.map((srcSlot) => ({
          uniteId: evalResult.swapTargetUniteId!,
          slot: srcSlot,
        })),
        evalResult.swapTargetSlots.map((tgtSlot) => ({
          uniteId: sourceUniteId,
          slot: tgtSlot,
        }))
      );

    return {
      newPlanning,
      success: true,
      isSwap: true,
      warning: evalResult.warningMessage,
    };
  }

  // Déplacement simple
  const newPlanning: Planning = planning
    .filter((a) => !(a.uniteId === sourceUniteId && sourceSlots.includes(a.slot)))
    .concat(
      targetSlots.map((s) => ({
        uniteId: sourceUniteId,
        slot: s,
      }))
    );

  return {
    newPlanning,
    success: true,
    isSwap: false,
    warning: evalResult.warningMessage,
  };
}
