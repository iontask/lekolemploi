/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Classe, Semaine, Teacher, Unite } from '../../types';
import { verify } from '../../rules';
import { solvePhaseA } from '../phaseA';
import { DEFAULT_SOLVER_CONFIG } from '../types';
import { ScheduleData } from '../../rules/types';

describe('Optimisation des contraintes enseignants : Regroupement anti-trous & Éviter 1h en demi-journée', () => {
  const semaineStandard: Semaine = {
    jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    creneauxParJour: [7, 7, 7, 7, 4],
  };

  const profMath: Teacher = {
    id: 'p_math',
    nom: 'BENALI Ahmed',
    matiere: 'Mathématiques',
    dispo: new Array(32).fill(true),
  };

  const profPhysique: Teacher = {
    id: 'p_physique',
    nom: 'KADIRI Souad',
    matiere: 'Physique',
    dispo: new Array(32).fill(true),
  };

  const classe1: Classe = { id: 'c_3apic1', nom: '3APIC-1', niveau: '3APIC' };
  const classe2: Classe = { id: 'c_3apic2', nom: '3APIC-2', niveau: '3APIC' };

  // 4h de math en classe 1 et 4h de math en classe 2 (total 8h)
  const uniteMath1: Unite = {
    id: 'u_math_c1',
    teacherId: profMath.id,
    classeIds: [classe1.id],
    heures: 4,
  };
  const uniteMath2: Unite = {
    id: 'u_math_c2',
    teacherId: profMath.id,
    classeIds: [classe2.id],
    heures: 4,
  };

  // 2h de physique en classe 1 et 2h en classe 2
  const unitePhy1: Unite = {
    id: 'u_phy_c1',
    teacherId: profPhysique.id,
    classeIds: [classe1.id],
    heures: 2,
  };
  const unitePhy2: Unite = {
    id: 'u_phy_c2',
    teacherId: profPhysique.id,
    classeIds: [classe2.id],
    heures: 2,
  };

  const testData: ScheduleData = {
    teachers: [profMath, profPhysique],
    classes: [classe1, classe2],
    unites: [uniteMath1, uniteMath2, unitePhy1, unitePhy2],
    semaine: semaineStandard,
  };

  it('élimine les demi-journées à 1h isolée et compacte les heures sans trous lorsque les options sont activées', () => {
    const configWithTeacherOpts = {
      ...DEFAULT_SOLVER_CONFIG,
      profsEviter1hDemiJournee: [profMath.id, profPhysique.id],
      profsRegrouperHeuresAntiTrous: [profMath.id, profPhysique.id],
    };

    const planning = solvePhaseA(testData, configWithTeacherOpts);
    expect(planning.length).toBe(12);

    const violations = verify(planning, testData, configWithTeacherOpts);
    const hardViolations = violations.filter((v) => v.severite === 'DURE');
    expect(hardViolations).toHaveLength(0);

    const isolatedHalfDays = violations.filter((v) => v.type === 'PROF_ISOLE_DEMI_JOURNEE');
    expect(isolatedHalfDays).toHaveLength(0);

    const trous = violations.filter((v) => v.type === 'PROF_TROUS_JOURNEE');
    expect(trous).toHaveLength(0);
  });
});
