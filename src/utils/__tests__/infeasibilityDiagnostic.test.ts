/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Classe, Semaine, Teacher, Unite } from '../../types';
import { ScheduleData } from '../../rules/types';
import {
  checkPartialLevelTeaching,
  extractClassLevel,
  runInstantDiagnostics,
  buildInfeasibilityReport,
} from '../infeasibilityDiagnostic';

describe('infeasibilityDiagnostic module', () => {
  const semaine: Semaine = {
    jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    creneauxParJour: [7, 7, 7, 7, 4], // 32 créneaux
  };

  const classes: Classe[] = [
    { id: 'c1', nom: '2BACSPF-1', niveau: '2BAC' },
    { id: 'c2', nom: '2BACSPF-2', niveau: '2BAC' },
    { id: 'c3', nom: '1BAC-1', niveau: '1BAC' },
  ];

  it('extrait correctement le niveau d\'une classe', () => {
    expect(extractClassLevel(classes[0])).toBe('2BAC');
    expect(extractClassLevel({ id: 'c_tc', nom: 'TCSF-1', niveau: '' })).toBe('TCS');
  });

  it('détecte un enseignement partiel de niveau (non bloquant)', () => {
    const profAghdif: Teacher = {
      id: 'p1',
      nom: 'Aghdif',
      matiere: 'Physique-Chimie',
      dispo: new Array(32).fill(true),
    };

    // Aghdif n'enseigne qu'en 2BACSPF-1 alors qu'il y a 2 classes en 2BAC
    const unites: Unite[] = [
      { id: 'u1', teacherId: 'p1', classeIds: ['c1'], heures: 7 },
    ];

    const warnings = checkPartialLevelTeaching([profAghdif], classes, unites);
    expect(warnings.length).toBe(1);
    expect(warnings[0].teacherNom).toBe('Aghdif');
    expect(warnings[0].niveau).toBe('2BAC');
    expect(warnings[0].isPartial).toBe(true);
    expect(warnings[0].classesEnseignees).toEqual(['2BACSPF-1']);
  });

  it('identifie un prof en surcharge et une classe en surcharge instantanément', () => {
    const profSurcharge: Teacher = {
      id: 'p_sur',
      nom: 'Prof Surcharge',
      matiere: 'Maths',
      dispo: [true, true, true, ...new Array(29).fill(false)], // seulement 3 dispos
    };

    const unites: Unite[] = [
      { id: 'u_sur', teacherId: 'p_sur', classeIds: ['c1'], heures: 8 },
    ];

    const data: ScheduleData = {
      teachers: [profSurcharge],
      classes: [classes[0]],
      unites,
      semaine,
    };

    const diag = runInstantDiagnostics(data, { plafondHoraireProf: 24 });
    expect(diag.canSolve).toBe(false);
    expect(diag.severity).toBe('CRITICAL');
    expect(diag.profsOverloaded.length).toBe(1);
    expect(diag.profsOverloaded[0].diff).toBe(5); // 8 - 3 = 5
  });

  it('détecte le dépassement du plafond horaire (ex: 26 h > 24 h)', () => {
    const profPlafond: Teacher = {
      id: 'p_plafond',
      nom: 'Prof Chargé',
      matiere: 'Maths',
      dispo: new Array(32).fill(true),
    };

    const unites: Unite[] = [
      { id: 'u_26h', teacherId: 'p_plafond', classeIds: ['c1'], heures: 26 },
    ];

    const data: ScheduleData = {
      teachers: [profPlafond],
      classes: [classes[0]],
      unites,
      semaine,
    };

    const diag = runInstantDiagnostics(data, { plafondHoraireProf: 24 });
    expect(diag.profsExceedCeiling.length).toBe(1);
    expect(diag.profsExceedCeiling[0].diff).toBe(2);
  });

  it('génère un rapport lisible d\'infaisabilité', () => {
    const profAghdif: Teacher = {
      id: 'p_aghdif',
      nom: 'Aghdif',
      matiere: 'Physique-Chimie',
      dispo: new Array(32).fill(false),
    };
    // 11 créneaux dispo dont 4 le lundi
    for (let i = 0; i < 4; i++) profAghdif.dispo[i] = true; // Lundi
    for (let i = 7; i < 14; i++) profAghdif.dispo[i] = true; // Mardi (7 créneaux) = 11 au total

    const unite: Unite = {
      id: 'u_pc',
      teacherId: 'p_aghdif',
      classeIds: ['c1'],
      heures: 7,
    };

    const reports = buildInfeasibilityReport(
      { teachers: [profAghdif], classes: [classes[0]], unites: [unite], semaine },
      [unite]
    );

    expect(reports.length).toBe(1);
    expect(reports[0]).toContain('Aghdif');
    expect(reports[0]).toContain('7 h de Physique-Chimie en 2BACSPF-1');
    expect(reports[0]).toContain('11 créneaux dispo');
  });
});
