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

    const trous = violations.filter((v) => v.type === 'PROF_TROU_JOURNEE');
    expect(trous).toHaveLength(0);
  });

  it('rassemble les cours et élimine trous et 1h isolée pour un professeur multi-classes (cas Kaoutar Hama 11h)', () => {
    const profPhilo: Teacher = {
      id: 'p_philo',
      nom: 'Kaoutar Hama',
      matiere: 'Philo',
      dispo: new Array(32).fill(true),
    };

    const c62BacSpf: Classe = { id: 'c_62bac_spf', nom: '6-2-BAC-SPF', niveau: '2BAC' };
    const c62BacSe: Classe = { id: 'c_62bac_se', nom: '6-2-BAC-SE', niveau: '2BAC' };
    const c4Tcsf1: Classe = { id: 'c_4tcsf_1', nom: '4-TCSF-1', niveau: 'TCSF' };
    const c4Tcsf2: Classe = { id: 'c_4tcsf_2', nom: '4-TCSF-2', niveau: 'TCSF' };
    const c51BacSef: Classe = { id: 'c_51bac_sef', nom: '5-1-BAC-SEF', niveau: '1BAC' };
    const c51BacSeg: Classe = { id: 'c_51bac_seg', nom: '5-1-BAC-SEG', niveau: '1BAC' };

    const unitesPhilo: Unite[] = [
      { id: 'u_philo_spf', teacherId: profPhilo.id, classeIds: [c62BacSpf.id], heures: 4 },
      { id: 'u_philo_se', teacherId: profPhilo.id, classeIds: [c62BacSe.id], heures: 3 },
      { id: 'u_philo_tc1', teacherId: profPhilo.id, classeIds: [c4Tcsf1.id], heures: 1 },
      { id: 'u_philo_tc2', teacherId: profPhilo.id, classeIds: [c4Tcsf2.id], heures: 1 },
      { id: 'u_philo_1bac1', teacherId: profPhilo.id, classeIds: [c51BacSef.id], heures: 1 },
      { id: 'u_philo_1bac2', teacherId: profPhilo.id, classeIds: [c51BacSeg.id], heures: 1 },
    ];

    const philoData: ScheduleData = {
      teachers: [profPhilo],
      classes: [c62BacSpf, c62BacSe, c4Tcsf1, c4Tcsf2, c51BacSef, c51BacSeg],
      unites: unitesPhilo,
      semaine: semaineStandard,
    };

    const config = {
      ...DEFAULT_SOLVER_CONFIG,
      profsEviter1hDemiJournee: [profPhilo.id],
      profsRegrouperHeuresAntiTrous: [profPhilo.id],
    };

    const planning = solvePhaseA(philoData, config);
    expect(planning.length).toBe(11);

    const violations = verify(planning, philoData, config);
    const isolatedHalfDays = violations.filter((v) => v.type === 'PROF_ISOLE_DEMI_JOURNEE');
    const trous = violations.filter((v) => v.type === 'PROF_TROU_JOURNEE');

    expect(isolatedHalfDays).toHaveLength(0);
    expect(trous).toHaveLength(0);
  });
});
