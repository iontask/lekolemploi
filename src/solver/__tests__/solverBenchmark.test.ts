/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import referenceData from '../../data/referencePlanning360.json';
import { DEFAULT_SOLVER_CONFIG } from '../types';
import { buildLpModel } from '../lpModelBuilder';
import { solvePhaseA } from '../phaseA';
import { verify, score } from '../../rules';
import { Affectation, Planning, ScheduleData } from '../../rules/types';
import { ImportDataset } from '../../types';

describe('Jeu de référence officiel (360 heures, 28 enseignants, 12 classes)', () => {
  const dataset = referenceData.dataset as unknown as ImportDataset;
  const referencePlanning = referenceData.planning as Affectation[];
  const benchmarkConfig = {
    ...DEFAULT_SOLVER_CONFIG,
    toutesMatieresABlocs: false,
    respecterPauseMidiBlocs: false,
    matieresABlocs: ['Arabe', 'Anglais'],
  };

  describe('1. Validation structurelle du jeu de données de référence', () => {
    it('contient exactement 28 enseignants, 12 classes et 360 heures totales', () => {
      expect(dataset.teachers).toHaveLength(28);
      expect(dataset.classes).toHaveLength(12);

      const totalHours = dataset.unites.reduce((sum, u) => sum + u.heures, 0);
      expect(totalHours).toBe(360);
    });

    it('chaque classe a au plus 32 heures (capacité hebdomadaire)', () => {
      for (const cls of dataset.classes) {
        const clsUnites = dataset.unites.filter((u) => u.classeIds.includes(cls.id));
        const hours = clsUnites.reduce((sum, u) => sum + u.heures, 0);
        expect(hours).toBeLessThanOrEqual(32);
      }
    });

    it('chaque enseignant dispose d\'assez de créneaux disponibles pour sa charge (marge >= 0)', () => {
      for (const teacher of dataset.teachers) {
        const teacherUnites = dataset.unites.filter((u) => u.teacherId === teacher.id);
        const hours = teacherUnites.reduce((sum, u) => sum + u.heures, 0);
        const dispoSlots = teacher.dispo.filter(Boolean).length;
        expect(dispoSlots).toBeGreaterThanOrEqual(hours);
      }
    });
  });

  describe('2. Validation formelle des règles sur l\'emploi du temps de référence (360 h)', () => {
    it('place exactement les 360 heures', () => {
      expect(referencePlanning).toHaveLength(360);
    });

    it('présente 0 conflit dur (0 violation dure)', () => {
      const violations = verify(referencePlanning, dataset, benchmarkConfig);
      const hardViolations = violations.filter((v) => v.severite === 'DURE');

      if (hardViolations.length > 0) {
        console.error('Violations dures inattendues:', hardViolations);
      }
      expect(hardViolations).toHaveLength(0);
    });

    it('respecte strictement les blocs de 2 heures pour l\'Arabe et l\'Anglais', () => {
      const violations = verify(referencePlanning, dataset, benchmarkConfig);
      const blockViolations = violations.filter(
        (v) =>
          v.type === 'BLOC_EXCES_JOUR' ||
          v.type === 'BLOC_NON_CONSECUTIF' ||
          v.type === 'BLOC_HEURE_ISOLEE_INVALIDE'
      );
      expect(blockViolations).toHaveLength(0);
    });

    it('respecte la disponibilité de tous les enseignants (aucun prof sur créneau indisponible)', () => {
      const violations = verify(referencePlanning, dataset, benchmarkConfig);
      const indispoViolations = violations.filter((v) => v.type === 'PROF_INDISPONIBLE');
      expect(indispoViolations).toHaveLength(0);
    });

    it('aucun conflit enseignant (un seul cours par créneau et par prof)', () => {
      const violations = verify(referencePlanning, dataset, benchmarkConfig);
      const profConflits = violations.filter((v) => v.type === 'PROF_CONFLIT');
      expect(profConflits).toHaveLength(0);
    });

    it('aucun conflit classe (un seul cours par créneau et par classe)', () => {
      const violations = verify(referencePlanning, dataset, benchmarkConfig);
      const classeConflits = violations.filter((v) => v.type === 'CLASSE_CONFLIT');
      expect(classeConflits).toHaveLength(0);
    });

    it('calcule un score d\'optimisation valide et sans pénalité dure', () => {
      const scoreResult = score(referencePlanning, dataset, benchmarkConfig);
      expect(scoreResult.total).toBeGreaterThan(0);
      expect(scoreResult.nombreViolationsDures).toBe(0);
    });
  });

  describe('3. Validation du modèle mathématique LP pour le solveur', () => {
    it('construit un modèle MIP complet pour les 360 heures avec variables et contraintes conformes', () => {
      const lpResult = buildLpModel(dataset, DEFAULT_SOLVER_CONFIG, referencePlanning);

      expect(lpResult.variablesCount).toBeGreaterThan(3000);
      expect(lpResult.constraintsCount).toBeGreaterThan(2500);
      expect(lpResult.lpText).toContain('Minimize');
      expect(lpResult.lpText).toContain('Subject To');
      expect(lpResult.lpText).toContain('Binary');

      // Vérifie que toutes les unités ont des contraintes de quota
      dataset.unites.forEach((_, idx) => {
        expect(lpResult.lpText).toContain(`quota_u${idx}:`);
      });
    });

    it('l\'heuristique Phase A résout un sous-ensemble complexe avec 0 conflit dur', () => {
      // Sous-ensemble représentatif (3 classes, 10 profs, 80h avec blocs Arabe/Anglais)
      const subsetClasses = dataset.classes.slice(0, 3);
      const subsetUnites = dataset.unites.filter((u) =>
        u.classeIds.some((cid) => subsetClasses.some((c) => c.id === cid))
      );
      const subsetTeacherIds = new Set(subsetUnites.map((u) => u.teacherId));
      const subsetTeachers = dataset.teachers.filter((t) => subsetTeacherIds.has(t.id));

      const subsetData: ScheduleData = {
        teachers: subsetTeachers,
        classes: subsetClasses,
        unites: subsetUnites,
        semaine: dataset.semaine,
      };

      const planning = solvePhaseA(subsetData, benchmarkConfig);
      const expectedHours = subsetUnites.reduce((sum, u) => sum + u.heures, 0);

      expect(planning.length).toBe(expectedHours);

      const violations = verify(planning, subsetData, benchmarkConfig);
      const hardViolations = violations.filter((v) => v.severite === 'DURE');
      expect(hardViolations).toHaveLength(0);

      const blockViolations = violations.filter(
        (v) =>
          v.type === 'BLOC_EXCES_JOUR' ||
          v.type === 'BLOC_NON_CONSECUTIF' ||
          v.type === 'BLOC_HEURE_ISOLEE_INVALIDE'
      );
      expect(blockViolations).toHaveLength(0);
    });
  });
});
