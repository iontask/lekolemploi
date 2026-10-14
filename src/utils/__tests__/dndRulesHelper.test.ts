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

  it('évalue correctement l\'échange dans le contexte précis d\'une classe', () => {
    // Dans ce planning :
    // C1 a U1 en slot 0 et U2 en slot 8
    // C2 a U3 en slot 0
    const planning = [
      { uniteId: 'U1', slot: 0 },
      { uniteId: 'U3', slot: 0 },
      { uniteId: 'U3', slot: 1 },
      { uniteId: 'U2', slot: 8 },
    ];
    const locked = new Set<string>();

    // Évaluation pour la classe C1 depuis U1(slot 0) vers slot 8
    const evalClassC1 = evaluateMoveOrSwap(
      planning,
      'U1',
      [0],
      8,
      sampleData,
      locked,
      undefined,
      { type: 'class', id: 'C1' }
    );

    // Dans C1, le slot 8 est occupé par U2 (donc échange avec U2)
    expect(evalClassC1.isSwap).toBe(true);
    expect(evalClassC1.swapTargetUniteId).toBe('U2');
    expect(evalClassC1.status).not.toBe('red');
  });

  it('refuse formellement un bloc de 2h scindé par la pause méridienne de 1h (entre C4 et C5)', () => {
    const planning = [
      { uniteId: 'U1', slot: 0 },
      { uniteId: 'U1', slot: 1 },
    ];
    const locked = new Set<string>();

    // Sur une journée de 7h (Lundi: créneaux 0..6), slot 3 est C4 (11h30-12h30) et slot 4 est C5 (13h30-14h30)
    // Séparés par la pause de 1h de midi (12h30-13h30). Un bloc de 2h sur [3, 4] est strictement interdit.
    const evaluation = evaluateMoveOrSwap(
      planning,
      'U1',
      [0, 1],
      3, // C4 + C5
      sampleData,
      locked
    );

    expect(evaluation.status).toBe('red');
    expect(evaluation.reasons[0].toLowerCase()).toContain('pause');
  });

  it('calcule correctement les séances non affectées dans le bac (découpage en blocs de 2h et 1h)', async () => {
    const { getUnassignedSessionsForEntity } = await import('../dndRulesHelper');
    // U1 a 4h prévues pour C1, aucune placée dans planning
    // U2 a 3h prévues pour C1, 1h placée
    const planning = [
      { uniteId: 'U2', slot: 0 }, // Reste 2h pour U2
    ];

    const unassigned = getUnassignedSessionsForEntity(sampleData, planning, { type: 'class', id: 'C1' });

    // U1 (4h restantes) => deux blocs de 2h
    // U2 (2h restantes) => un bloc de 2h
    const u1Items = unassigned.filter((item) => item.uniteId === 'U1');
    expect(u1Items).toHaveLength(2);
    expect(u1Items.every((item) => item.duration === 2 && item.isBlock2h)).toBe(true);

    const u2Items = unassigned.filter((item) => item.uniteId === 'U2');
    expect(u2Items).toHaveLength(1);
    expect(u2Items[0].duration === 2 && u2Items[0].isBlock2h).toBe(true);
  });

  it('permet de placer une séance depuis le bac vers un créneau libre', async () => {
    const { executePlaceFromBin } = await import('../dndRulesHelper');
    const planning: import('../../rules/types').Planning = [];
    const locked = new Set<string>();

    const res = executePlaceFromBin(
      planning,
      'U1',
      true, // Bloc de 2h
      0,    // Lundi C1-C2
      sampleData,
      locked,
      undefined,
      { type: 'class', id: 'C1' }
    );

    expect(res.success).toBe(true);
    expect(res.isSwap).toBe(false);
    expect(res.newPlanning).toHaveLength(2);
    expect(res.newPlanning).toContainEqual({ uniteId: 'U1', slot: 0 });
    expect(res.newPlanning).toContainEqual({ uniteId: 'U1', slot: 1 });
  });

  it('retire une séance de la grille vers le bac avec executeUnassignToBin', async () => {
    const { executeUnassignToBin } = await import('../dndRulesHelper');
    const planning = [
      { uniteId: 'U1', slot: 0 },
      { uniteId: 'U1', slot: 1 },
      { uniteId: 'U2', slot: 8 },
    ];

    const res = executeUnassignToBin(planning, 'U1', [0, 1]);
    expect(res.success).toBe(true);
    expect(res.newPlanning).toHaveLength(1);
    expect(res.newPlanning).toEqual([{ uniteId: 'U2', slot: 8 }]);
  });
});
