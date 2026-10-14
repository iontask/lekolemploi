/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Classe, Semaine, Teacher, Unite } from '../../types';
import { verify } from '../../rules';
import { buildLpModel } from '../lpModelBuilder';
import { solvePhaseA } from '../phaseA';
import { DEFAULT_SOLVER_CONFIG } from '../types';
import { ScheduleData } from '../../rules/types';

describe('Module solver - Phase A & LP Model Builder', () => {
  const semaineStandard: Semaine = {
    jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    creneauxParJour: [7, 7, 7, 7, 4],
  };

  const profMath: Teacher = {
    id: 'p_math',
    nom: 'ALAMI Karim',
    matiere: 'Mathématiques',
    dispo: new Array(32).fill(true),
  };

  const profArabe: Teacher = {
    id: 'p_arabe',
    nom: 'FILALI Abdellah',
    matiere: 'Arabe',
    dispo: new Array(32).fill(true),
  };

  const profAnglais: Teacher = {
    id: 'p_anglais',
    nom: 'MANSOURI Tariq',
    matiere: 'Anglais',
    dispo: new Array(32).fill(true),
  };

  const classe1: Classe = { id: 'c_1apic1', nom: '1APIC-1', niveau: '1APIC' };
  const classe2: Classe = { id: 'c_1apic2', nom: '1APIC-2', niveau: '1APIC' };

  const uniteMath4h: Unite = {
    id: 'u_math_4h',
    teacherId: profMath.id,
    classeIds: [classe1.id],
    heures: 4,
  };

  const uniteArabe4h: Unite = {
    id: 'u_arabe_4h',
    teacherId: profArabe.id,
    classeIds: [classe1.id],
    heures: 4,
  };

  const uniteAnglais3h: Unite = {
    id: 'u_anglais_3h',
    teacherId: profAnglais.id,
    classeIds: [classe1.id],
    heures: 3,
  };

  const uniteMathClasse2: Unite = {
    id: 'u_math_cls2_4h',
    teacherId: profMath.id,
    classeIds: [classe2.id],
    heures: 4,
  };

  const testData: ScheduleData = {
    teachers: [profMath, profArabe, profAnglais],
    classes: [classe1, classe2],
    unites: [uniteMath4h, uniteArabe4h, uniteAnglais3h, uniteMathClasse2],
    semaine: semaineStandard,
  };

  describe('Phase A : Heuristique Difficiles d abord', () => {
    it('génère un emploi du temps complet sans violation dure en quelques millisecondes', () => {
      const startTime = performance.now();
      const planning = solvePhaseA(testData, DEFAULT_SOLVER_CONFIG);
      const elapsed = performance.now() - startTime;

      expect(elapsed).toBeLessThan(3000); // Exécution rapide (< 3s)

      // Total des heures attendues : 4 + 4 + 3 + 4 = 15h
      expect(planning.length).toBe(15);

      // Vérification des règles dures avec verify()
      const violations = verify(planning, testData, DEFAULT_SOLVER_CONFIG);
      const hardViolations = violations.filter((v) => v.severite === 'DURE');
      expect(hardViolations).toHaveLength(0);
    });

    it('gère correctement la priorité des professeurs à marge nulle', () => {
      // Prof à marge nulle : 6h d'enseignement pour 6 créneaux disponibles
      const profMargeNulle: Teacher = {
        id: 'p_tight',
        nom: 'TIGHT Prof',
        matiere: 'SVT',
        dispo: new Array(32).fill(false),
      };
      // Exactement 6 créneaux dispos
      [0, 1, 7, 8, 14, 15].forEach((s) => {
        profMargeNulle.dispo[s] = true;
      });

      const uniteMargeNulle: Unite = {
        id: 'u_tight_6h',
        teacherId: profMargeNulle.id,
        classeIds: [classe2.id],
        heures: 6,
      };

      const tightData: ScheduleData = {
        teachers: [profMargeNulle, profMath],
        classes: [classe1, classe2],
        unites: [uniteMargeNulle, uniteMath4h],
        semaine: semaineStandard,
      };

      const planning = solvePhaseA(tightData, DEFAULT_SOLVER_CONFIG);
      const violations = verify(planning, tightData, DEFAULT_SOLVER_CONFIG);
      const hardViolations = violations.filter((v) => v.severite === 'DURE');
      expect(hardViolations).toHaveLength(0);

      const tightPlaced = planning.filter((a) => a.uniteId === uniteMargeNulle.id);
      expect(tightPlaced.length).toBe(6);
    });

    it('place de préférence les matières > 2h en créneaux suivis (ex: 4h = 2h+2h, 7h = 2h/j x3 + 1h)', () => {
      const profPC: Teacher = {
        id: 'p_pc',
        nom: 'PC Teacher',
        matiere: 'Physique-Chimie',
        dispo: new Array(32).fill(true),
      };

      const unitePC4h: Unite = {
        id: 'u_pc_4h',
        teacherId: profPC.id,
        classeIds: [classe1.id],
        heures: 4,
      };

      const uniteMath7h: Unite = {
        id: 'u_math_7h',
        teacherId: profMath.id,
        classeIds: [classe2.id],
        heures: 7,
      };

      const testMultiData: ScheduleData = {
        teachers: [profPC, profMath],
        classes: [classe1, classe2],
        unites: [unitePC4h, uniteMath7h],
        semaine: semaineStandard,
      };

      const planning = solvePhaseA(testMultiData, DEFAULT_SOLVER_CONFIG);
      const violations = verify(planning, testMultiData, DEFAULT_SOLVER_CONFIG);
      expect(violations.filter((v) => v.severite === 'DURE')).toHaveLength(0);

      // Vérifier pour PC 4h : 2 blocs de 2h sur 2 jours distincts, chaque bloc consécutif
      const pcSlots = planning
        .filter((a) => a.uniteId === unitePC4h.id)
        .map((a) => a.slot)
        .sort((a, b) => a - b);
      expect(pcSlots).toHaveLength(4);

      // Vérifier pour Math 7h : 7 heures au total, au plus 2h par jour, 3 jours de 2h consécutives et 1 jour de 1h
      const mathSlots = planning
        .filter((a) => a.uniteId === uniteMath7h.id)
        .map((a) => a.slot)
        .sort((a, b) => a - b);
      expect(mathSlots).toHaveLength(7);

      const mathDays = new Map<number, number[]>();
      for (const s of mathSlots) {
        // Déterminer jour (0..4)
        let acc = 0;
        let day = 0;
        for (let j = 0; j < semaineStandard.jours.length; j++) {
          if (s < acc + semaineStandard.creneauxParJour[j]) {
            day = j;
            break;
          }
          acc += semaineStandard.creneauxParJour[j];
        }
        const list = mathDays.get(day) || [];
        list.push(s);
        mathDays.set(day, list);
      }

      // 4 jours distincts au total (3 jours avec 2h consécutives et 1 jour avec 1h)
      expect(mathDays.size).toBe(4);
      let daysWith2h = 0;
      let daysWith1h = 0;
      for (const slots of mathDays.values()) {
        expect(slots.length).toBeLessThanOrEqual(2);
        if (slots.length === 2) {
          daysWith2h++;
          expect(slots[1]).toBe(slots[0] + 1); // Strictly consecutive!
        } else if (slots.length === 1) {
          daysWith1h++;
        }
      }
      expect(daysWith2h).toBe(3);
      expect(daysWith1h).toBe(1);
    });
  });

  describe('buildLpModel (CPLEX LP)', () => {
    it('génère un modèle LP syntaxiquement conforme avec variables x, b, z, e, nc', () => {
      const result = buildLpModel(testData, DEFAULT_SOLVER_CONFIG);

      expect(result.lpText).toContain('Minimize');
      expect(result.lpText).toContain('Subject To');
      expect(result.lpText).toContain('Binary');
      expect(result.lpText).toContain('Generals');
      expect(result.lpText).toContain('End');

      // Vérifie les contraintes de quotas
      expect(result.lpText).toContain('quota_u0:');
      expect(result.lpText).toContain('= 4');

      // Vérifie les contraintes de matières à blocs pour Arabe (u1) et Anglais (u2)
      expect(result.lpText).toContain('link_block_u1');
      expect(result.lpText).toContain('z_sum_u1'); // z = 0 pour 4h (pair)
      expect(result.lpText).toContain('z_sum_u2'); // z = 1 pour 3h (impair)

      // Vérifie les variables d'écart et de non-consécutivité
      expect(result.lpText).toContain('soft_excess_u0');
      expect(result.variablesCount).toBeGreaterThan(0);
      expect(result.constraintsCount).toBeGreaterThan(0);
    });
  });
});
