/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  evaluateMoveOrSwap,
  executeMoveOrSwap,
  getBlockSlotsForAssignment,
  getLockKey,
  isSlotLocked,
} from '../dndRulesHelper';
import { ScheduleData } from '../../rules/types';

describe('Étape 5 - Assistant Glisser-Déposer & Règles de Déplacement', () => {
  const sampleData: ScheduleData = {
    semaine: {
      jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
      creneauxParJour: [7, 7, 4, 7, 7], // 32 créneaux
    },
    teachers: [
      {
        id: 'T1',
        nom: 'M. Dubois',
        matiere: 'Mathématiques',
        dispo: Array.from({ length: 32 }, (_, i) => i !== 5), // Indisponible sur slot 5
      },
      {
        id: 'T2',
        nom: 'Mme Martin',
        matiere: 'Français',
        dispo: Array(32).fill(true),
      },
      {
        id: 'T3_BLOC',
        nom: 'M. Benali',
        matiere: 'Arabe',
        dispo: Array(32).fill(true),
      },
    ],
    classes: [
      { id: 'C1', nom: '6A', niveau: '6ème' },
      { id: 'C2', nom: '6B', niveau: '6ème' },
    ],
    unites: [
      { id: 'U1', teacherId: 'T1', classeIds: ['C1'], heures: 4, estCommun: false },
      { id: 'U2', teacherId: 'T2', classeIds: ['C1'], heures: 3, estCommun: false },
      { id: 'U3', teacherId: 'T3_BLOC', classeIds: ['C2'], heures: 4, estCommun: false },
    ],
  };

  it('détecte correctement un bloc de 2h consécutives sur la même journée', () => {
    const planning = [
      { uniteId: 'U3', slot: 0 },
      { uniteId: 'U3', slot: 1 },
      { uniteId: 'U3', slot: 7 }, // Mardi slot 1
    ];

    const blockSlots0 = getBlockSlotsForAssignment(planning, 'U3', 0, sampleData.semaine);
    expect(blockSlots0).toEqual([0, 1]);

    const blockSlots1 = getBlockSlotsForAssignment(planning, 'U3', 1, sampleData.semaine);
    expect(blockSlots1).toEqual([0, 1]);

    const blockSlots7 = getBlockSlotsForAssignment(planning, 'U3', 7, sampleData.semaine);
    expect(blockSlots7).toEqual([7]);
  });

  it('refuse le déplacement vers un créneau où le professeur est indisponible (ROUGE)', () => {
    const planning = [{ uniteId: 'U1', slot: 0 }];
    const locked = new Set<string>();

    const evaluation = evaluateMoveOrSwap(
      planning,
      'U1',
      [0],
      5, // T1 indisponible sur slot 5
      sampleData,
      locked
    );

    expect(evaluation.status).toBe('red');
    expect(evaluation.reasons[0]).toContain('indisponible');
  });

  it('refuse le déplacement si le cours source est verrouillé (ROUGE)', () => {
    const planning = [{ uniteId: 'U1', slot: 0 }];
    const locked = new Set<string>([getLockKey('U1', 0)]);

    expect(isSlotLocked(locked, 'U1', 0)).toBe(true);

    const evaluation = evaluateMoveOrSwap(
      planning,
      'U1',
      [0],
      1,
      sampleData,
      locked
    );

    expect(evaluation.status).toBe('red');
    expect(evaluation.reasons[0]).toContain('verrouillé');
  });

  it('refuse de scinder un bloc de 2h sur la frontière entre deux journées (ROUGE)', () => {
    const planning = [
      { uniteId: 'U3', slot: 0 },
      { uniteId: 'U3', slot: 1 },
    ];
    const locked = new Set<string>();

    // Slot 6 est la fin du Lundi (créneaux 0..6). Slot 7 est le début du Mardi.
    const evaluation = evaluateMoveOrSwap(
      planning,
      'U3',
      [0, 1],
      6,
      sampleData,
      locked
    );

    expect(evaluation.status).toBe('red');
    expect(evaluation.reasons[0]).toContain('bloc de 2 h');
  });

  it('autorise un déplacement valide sur une case libre et met à jour le planning', () => {
    const planning = [{ uniteId: 'U1', slot: 0 }];
    const locked = new Set<string>();

    const res = executeMoveOrSwap(
      planning,
      'U1',
      [0],
      1,
      sampleData,
      locked
    );

    expect(res.success).toBe(true);
    expect(res.isSwap).toBe(false);
    expect(res.newPlanning).toEqual([{ uniteId: 'U1', slot: 1 }]);
  });

  it('gère l\'échange (SWAP) valide entre deux cours distincts', () => {
    const planning = [
      { uniteId: 'U1', slot: 0 }, // T1 avec C1 en slot 0
      { uniteId: 'U2', slot: 8 }, // T2 avec C1 en slot 8
    ];
    const locked = new Set<string>();

    const evaluation = evaluateMoveOrSwap(
      planning,
      'U1',
      [0],
      8, // Dépose sur slot 8 occupé par U2
      sampleData,
      locked
    );

    expect(evaluation.isSwap).toBe(true);
    expect(evaluation.status).not.toBe('red');

    const exec = executeMoveOrSwap(
      planning,
      'U1',
      [0],
      8,
      sampleData,
      locked
    );

    expect(exec.success).toBe(true);
    expect(exec.isSwap).toBe(true);
    expect(exec.newPlanning).toContainEqual({ uniteId: 'U1', slot: 8 });
    expect(exec.newPlanning).toContainEqual({ uniteId: 'U2', slot: 0 });
  });
});
