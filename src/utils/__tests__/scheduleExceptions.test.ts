/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { analyzeScheduleExceptions } from '../scheduleExceptions';
import { getSubjectAbbreviation, getSubjectMeta } from '../subjectFormatters';
import { solvePhaseA } from '../../solver/phaseA';
import { DEFAULT_SOLVER_CONFIG } from '../../solver/types';
import { Classe, Semaine, Teacher, Unite } from '../../types';
import { ScheduleData } from '../../rules/types';
import { DEFAULT_MAPPING_CONFIG } from '../../services/db';
import { generateAuditReport } from '../../services/excelParser';

describe('Étape 4 - Formatage matières et abréviations aSc Horaires', () => {
  it('abrège fidèlement les matières scolaires', () => {
    expect(getSubjectAbbreviation('Arabe')).toBe('AR');
    expect(getSubjectAbbreviation('Français')).toBe('FR');
    expect(getSubjectAbbreviation('Anglais')).toBe('ANG');
    expect(getSubjectAbbreviation('Mathématiques')).toBe('MAT');
    expect(getSubjectAbbreviation('Histoire-Géographie')).toBe('HG');
    expect(getSubjectAbbreviation('Physique-Chimie')).toBe('PC');
    expect(getSubjectAbbreviation('SVT')).toBe('SVT');
    expect(getSubjectAbbreviation('Éducation Islamique')).toBe('EI');
    expect(getSubjectAbbreviation('Philosophie')).toBe('PHI');
    expect(getSubjectAbbreviation('EPS')).toBe('EPS');
    expect(getSubjectAbbreviation('Commerce')).toBe('com');
    expect(getSubjectAbbreviation('Comptabilité')).toBe('Compt');
    expect(getSubjectAbbreviation('Économie')).toBe('Eco');
    expect(getSubjectAbbreviation('Organisation')).toBe('Orga');
  });

  it('génère des métadonnées de style cohérentes', () => {
    const meta = getSubjectMeta('Mathématiques');
    expect(meta.code).toBe('MAT');
    expect(meta.bgHex).toBe('FFDBEAFE');
    expect(meta.badgeClass).toContain('bg-blue-100');
  });
});

describe('Étape 4 - Détection et analyse des exceptions d\'emploi du temps', () => {
  const semaineStandard: Semaine = {
    jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    creneauxParJour: [7, 7, 7, 7, 4],
  };

  const profMath: Teacher = {
    id: 'p_math',
    nom: 'ALAMI',
    matiere: 'Mathématiques',
    dispo: new Array(32).fill(true),
  };

  const classe1: Classe = { id: 'c_1', nom: '1APIC-1', niveau: '1APIC' };
  const uniteMath4h: Unite = {
    id: 'u_math_4h',
    teacherId: profMath.id,
    classeIds: [classe1.id],
    heures: 4,
  };

  const testData: ScheduleData = {
    teachers: [profMath],
    classes: [classe1],
    unites: [uniteMath4h],
    semaine: semaineStandard,
  };

  it('analyse correctement les exceptions sur une solution Phase A', () => {
    const planning = solvePhaseA(testData, DEFAULT_SOLVER_CONFIG);
    expect(planning).toBeDefined();
    expect(planning.length).toBe(4);

    const report = generateAuditReport(
      testData.teachers,
      testData.classes,
      testData.unites,
      testData.semaine
    );

    const dataset = {
      ...testData,
      id: 'test_dataset',
      fileName: 'test.xlsx',
      importedAt: new Date().toISOString(),
      config: DEFAULT_MAPPING_CONFIG,
      report,
    };

    const analysis = analyzeScheduleExceptions(dataset, planning);
    expect(analysis).toBeDefined();
    expect(typeof analysis.totalExceptions).toBe('number');
    expect(Array.isArray(analysis.exces2hJour)).toBe(true);
    expect(Array.isArray(analysis.heuresCoupees)).toBe(true);
    expect(Array.isArray(analysis.trousClasses)).toBe(true);
    expect(Array.isArray(analysis.trousProfs)).toBe(true);
    expect(analysis.creneauxLibresTotal).toBe(1 * 32 - 4);
  });
});
