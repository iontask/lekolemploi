/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { canPlace, findMatchingBlockRule, getSubjectDailyLimit, verify } from '../index';
import { Classe, Teacher, Unite } from '../../types';
import { RulesOptions, ScheduleData, SubjectLevelBlockRule } from '../types';

describe('Contraintes horaires des matières par niveau et par classe', () => {
  const teacherMath: Teacher = {
    id: 't_math',
    nom: 'Prof Math',
    matiere: 'Mathématiques',
    dispo: Array(32).fill(true),
  };

  const class2Bac1: Classe = { id: 'c_2bac_1', nom: '2BAC-1', niveau: '2BAC' };
  const class2Bac2: Classe = { id: 'c_2bac_2', nom: '2BAC-2', niveau: '2BAC' };
  const classTcsf: Classe = { id: 'c_tcsf', nom: 'TCSF-1', niveau: 'TCSF' };

  describe('Hiérarchie de résolution getSubjectDailyLimit', () => {
    it('renvoie la valeur par défaut (2h) si aucune configuration spécifique n\'existe', () => {
      const limit = getSubjectDailyLimit('Mathématiques', ['c_2bac_1'], ['2BAC'], {});
      expect(limit).toBe(2);
    });

    it('applique la limite globale matière (ex: 3h) si aucun niveau ni classe n\'est surchargé', () => {
      const options: RulesOptions = {
        maxHeuresParJourParMatiere: {
          Mathématiques: 3,
        },
      };
      const limit = getSubjectDailyLimit('Mathématiques', ['c_2bac_1'], ['2BAC'], options);
      expect(limit).toBe(3);
    });

    it('priorise la limite par NIVEAU sur la limite globale matière', () => {
      const options: RulesOptions = {
        maxHeuresParJourParMatiere: {
          Mathématiques: 2,
        },
        maxHeuresParJourParMatiereNiveau: {
          '2BAC::Mathématiques': 3,
          'TCSF::Mathématiques': 1,
        },
      };

      const limit2Bac = getSubjectDailyLimit('Mathématiques', ['c_2bac_1'], ['2BAC'], options);
      expect(limit2Bac).toBe(3);

      const limitTcsf = getSubjectDailyLimit('Mathématiques', ['c_tcsf'], ['TCSF'], options);
      expect(limitTcsf).toBe(1);
    });

    it('priorise la limite par CLASSE sur la limite par niveau et globale', () => {
      const options: RulesOptions = {
        maxHeuresParJourParMatiere: {
          Mathématiques: 2,
        },
        maxHeuresParJourParMatiereNiveau: {
          '2BAC::Mathématiques': 3,
        },
        maxHeuresParJourParMatiereClasse: {
          'c_2bac_2::Mathématiques': 1, // Exception pour cette classe précise
        },
      };

      // 2BAC-1 hérite du niveau 2BAC -> 3h
      const limitClass1 = getSubjectDailyLimit('Mathématiques', ['c_2bac_1'], ['2BAC'], options);
      expect(limitClass1).toBe(3);

      // 2BAC-2 a une contrainte spécifique -> 1h
      const limitClass2 = getSubjectDailyLimit('Mathématiques', ['c_2bac_2'], ['2BAC'], options);
      expect(limitClass2).toBe(1);
    });
  });

  describe('Règles de blocs ciblées par classe ou niveau (findMatchingBlockRule)', () => {
    const ruleNiveau2Bac: SubjectLevelBlockRule = {
      id: 'r_lvl',
      matiere: 'Mathématiques',
      niveau: '2BAC',
      heuresHebdo: 7,
      possibilites: [[2, 2, 2, 1], [3, 2, 2]],
    };

    const ruleClassSpecifique: SubjectLevelBlockRule = {
      id: 'r_cls',
      matiere: 'Mathématiques',
      niveau: '2BAC',
      classeId: 'c_2bac_2',
      classeNom: '2BAC-2',
      heuresHebdo: 7,
      possibilites: [[3, 3, 1]], // Spécifique classe 2
    };

    it('trouve la règle de niveau pour une classe sans règle spécifique', () => {
      const rule = findMatchingBlockRule(
        'Mathématiques',
        '2BAC',
        7,
        [ruleNiveau2Bac, ruleClassSpecifique],
        'c_2bac_1'
      );
      expect(rule?.id).toBe('r_lvl');
      expect(rule?.possibilites).toEqual([[2, 2, 2, 1], [3, 2, 2]]);
    });

    it('trouve la règle spécifique à la classe lorsqu\'elle existe', () => {
      const rule = findMatchingBlockRule(
        'Mathématiques',
        '2BAC',
        7,
        [ruleNiveau2Bac, ruleClassSpecifique],
        'c_2bac_2'
      );
      expect(rule?.id).toBe('r_cls');
      expect(rule?.possibilites).toEqual([[3, 3, 1]]);
    });
  });

  describe('Validation par le moteur canPlace et verify selon niveau/classe', () => {
    const testData: ScheduleData = {
      teachers: [teacherMath],
      classes: [class2Bac1, class2Bac2],
      unites: [
        { id: 'u_math_1', teacherId: 't_math', classeIds: ['c_2bac_1'], heures: 3 },
        { id: 'u_math_2', teacherId: 't_math', classeIds: ['c_2bac_2'], heures: 3 },
      ],
      semaine: {
        jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
        creneauxParJour: [7, 7, 7, 7, 4],
      },
    };

    it('autorise une 3e heure sur le même jour pour la classe autorisée à 3h', () => {
      const options: RulesOptions = {
        maxHeuresParJourParMatiereClasse: {
          'c_2bac_1::Mathématiques': 3,
          'c_2bac_2::Mathématiques': 2,
        },
      };

      // Déjà 2h placées le lundi (créneaux 0 et 1)
      const planning = [
        { uniteId: 'u_math_1', slot: 0 },
        { uniteId: 'u_math_1', slot: 1 },
      ];

      // On tente de placer la 3e heure consécutive sur le créneau 2
      const resultClass1 = canPlace(planning, testData.unites[0], 2, testData, options);
      expect(resultClass1.ok).toBe(true);

      // Pour la classe 2, qui est à 2h max :
      const planning2 = [
        { uniteId: 'u_math_2', slot: 0 },
        { uniteId: 'u_math_2', slot: 1 },
      ];
      const resultClass2 = canPlace(planning2, testData.unites[1], 2, testData, options);
      expect(resultClass2.ok).toBe(false);
      expect(resultClass2.raisons.some((r) => r.includes('dépasse') || r.includes('ne peut pas dépasser'))).toBe(true);
    });
  });
});
