/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Classe, Semaine, Teacher, Unite } from '../../types';
import {
  areSlotsConsecutiveBlockWithoutPause,
  areSlotsConsecutiveWithoutPause,
  canPlace,
  findMatchingBlockRule,
  generatePossibleBlockPartitions,
  getSlotCoordinates,
  isBlockSubject,
  score,
  verify,
} from '../index';
import { Planning, ScheduleData, SubjectLevelBlockRule } from '../types';

describe('Module rules - Emplois du temps', () => {
  // Structure de la semaine standard (32 créneaux : 4x7 + 4)
  const semaineStandard: Semaine = {
    jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    creneauxParJour: [7, 7, 7, 7, 4],
  };

  // Données de base pour les tests
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
  const classeBac1: Classe = { id: 'c_1bacsef', nom: '1BACSEF', niveau: '1BAC' };
  const classeBac2: Classe = { id: 'c_1bacseg', nom: '1BACSEG', niveau: '1BAC' };

  const uniteMath4h: Unite = {
    id: 'u_math_4h',
    teacherId: profMath.id,
    classeIds: [classe1.id],
    heures: 4,
    estCommun: false,
  };

  const uniteArabe4h: Unite = {
    id: 'u_arabe_4h',
    teacherId: profArabe.id,
    classeIds: [classe1.id],
    heures: 4,
    estCommun: false,
  };

  const uniteAnglais3h: Unite = {
    id: 'u_anglais_3h',
    teacherId: profAnglais.id,
    classeIds: [classe1.id],
    heures: 3,
    estCommun: false,
  };

  const uniteCommuneBac2h: Unite = {
    id: 'u_commun_2h',
    teacherId: profArabe.id,
    classeIds: [classeBac1.id, classeBac2.id],
    heures: 2,
    estCommun: true,
  };

  const testData: ScheduleData = {
    teachers: [profMath, profArabe, profAnglais],
    classes: [classe1, classe2, classeBac1, classeBac2],
    unites: [uniteMath4h, uniteArabe4h, uniteAnglais3h, uniteCommuneBac2h],
    semaine: semaineStandard,
  };

  describe('getSlotCoordinates', () => {
    it('calcule correctement les coordonnées pour le Lundi (slots 0..6)', () => {
      const c0 = getSlotCoordinates(0, semaineStandard);
      expect(c0.jourIndex).toBe(0);
      expect(c0.jourNom).toBe('Lundi');
      expect(c0.rangHeure).toBe(0);
      expect(c0.creneauNumero).toBe(1);

      const c6 = getSlotCoordinates(6, semaineStandard);
      expect(c6.jourIndex).toBe(0);
      expect(c6.creneauNumero).toBe(7);
      expect(c6.rangHeure).toBe(6);
    });

    it('calcule correctement les coordonnées pour le Mardi (slots 7..13)', () => {
      const c7 = getSlotCoordinates(7, semaineStandard);
      expect(c7.jourIndex).toBe(1);
      expect(c7.jourNom).toBe('Mardi');
      expect(c7.rangHeure).toBe(0);
      expect(c7.creneauNumero).toBe(1);
    });

    it('calcule correctement les coordonnées pour le Vendredi (slots 28..31)', () => {
      const c28 = getSlotCoordinates(28, semaineStandard);
      expect(c28.jourIndex).toBe(4);
      expect(c28.jourNom).toBe('Vendredi');
      expect(c28.rangHeure).toBe(0);
      expect(c28.creneauNumero).toBe(1);

      const c31 = getSlotCoordinates(31, semaineStandard);
      expect(c31.jourIndex).toBe(4);
      expect(c31.creneauNumero).toBe(4);
      expect(c31.rangHeure).toBe(3);
    });
  });

  describe('Règle dure (1) : Toutes les heures sont placées', () => {
    it('détecte les heures non placées quand le planning est incomplet', () => {
      // uniteMath4h a 4h prévues, on en place seulement 2
      const planning: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 1 },
      ];

      const violations = verify(planning, testData);
      const missing = violations.filter((v) => v.type === 'HEURES_NON_PLACEES');
      expect(missing.length).toBeGreaterThan(0);
      expect(missing.some((v) => v.uniteId === uniteMath4h.id && v.message.includes('Il manque 2'))).toBe(true);
    });

    it('détecte les heures surnuméraires si trop d heures sont placées', () => {
      const planning: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 1 },
        { uniteId: uniteMath4h.id, slot: 7 },
        { uniteId: uniteMath4h.id, slot: 8 },
        { uniteId: uniteMath4h.id, slot: 14 }, // 5ème heure alors que quota = 4h
      ];

      const violations = verify(planning, testData);
      const over = violations.filter((v) => v.type === 'HEURES_SURNUMERAIRES');
      expect(over.length).toBe(1);
      expect(over[0].uniteId).toBe(uniteMath4h.id);
    });
  });

  describe('Règle dure (2) : Un prof au plus une unité par créneau', () => {
    it('détecte un conflit quand un enseignant est affecté sur 2 unités au même créneau', () => {
      const uniteMathB: Unite = {
        id: 'u_math_b',
        teacherId: profMath.id,
        classeIds: [classe2.id],
        heures: 2,
      };

      const customData: ScheduleData = {
        ...testData,
        unites: [uniteMath4h, uniteMathB],
      };

      // Même créneau (slot 5) pour le même prof
      const planning: Planning = [
        { uniteId: uniteMath4h.id, slot: 5 },
        { uniteId: uniteMathB.id, slot: 5 },
      ];

      const violations = verify(planning, customData);
      const profConflits = violations.filter((v) => v.type === 'PROF_CONFLIT');
      expect(profConflits.length).toBe(1);
      expect(profConflits[0].profId).toBe(profMath.id);
      expect(profConflits[0].slot).toBe(5);
      expect(profConflits[0].message).toContain('cours simultanés');
    });
  });

  describe('Règle dure (3) : Une classe au plus une unité par créneau', () => {
    it('détecte un conflit quand une classe a 2 cours différents au même créneau', () => {
      // uniteMath4h et uniteArabe4h sont toutes deux pour classe1
      const planning: Planning = [
        { uniteId: uniteMath4h.id, slot: 2 },
        { uniteId: uniteArabe4h.id, slot: 2 },
      ];

      const violations = verify(planning, testData);
      const classeConflits = violations.filter((v) => v.type === 'CLASSE_CONFLIT');
      expect(classeConflits.length).toBe(1);
      expect(classeConflits[0].classeId).toBe(classe1.id);
      expect(classeConflits[0].slot).toBe(2);
    });

    it('détecte un conflit si une classe en cours commun a un autre cours au même créneau', () => {
      // uniteCommuneBac2h occupe classeBac1 ET classeBac2
      const uniteSoloBac1: Unite = {
        id: 'u_solo_bac1',
        teacherId: profMath.id,
        classeIds: [classeBac1.id],
        heures: 2,
      };

      const customData: ScheduleData = {
        ...testData,
        unites: [uniteCommuneBac2h, uniteSoloBac1],
      };

      // Conflit au slot 9 pour classeBac1
      const planning: Planning = [
        { uniteId: uniteCommuneBac2h.id, slot: 9 },
        { uniteId: uniteSoloBac1.id, slot: 9 },
      ];

      const violations = verify(planning, customData);
      const classeConflits = violations.filter((v) => v.type === 'CLASSE_CONFLIT');
      expect(classeConflits.length).toBe(1);
      expect(classeConflits[0].classeId).toBe(classeBac1.id);
    });
  });

  describe('Règle dure (4) : Aucun cours sur créneau indisponible du professeur', () => {
    it('détecte une violation si un cours est placé sur un créneau où dispo = false', () => {
      const profIndispo: Teacher = {
        ...profMath,
        id: 'p_indispo',
        dispo: new Array(32).fill(true),
      };
      profIndispo.dispo[4] = false; // Indisponible le Lundi à C5 (slot 4)

      const uniteIndispo: Unite = {
        id: 'u_indispo',
        teacherId: profIndispo.id,
        classeIds: [classe1.id],
        heures: 1,
      };

      const customData: ScheduleData = {
        ...testData,
        teachers: [profIndispo],
        unites: [uniteIndispo],
      };

      const planning: Planning = [{ uniteId: uniteIndispo.id, slot: 4 }];

      const violations = verify(planning, customData);
      const indispoViolations = violations.filter((v) => v.type === 'PROF_INDISPONIBLE');
      expect(indispoViolations.length).toBe(1);
      expect(indispoViolations[0].slot).toBe(4);
      expect(indispoViolations[0].message).toContain('indisponible');
    });
  });

  describe('Règle dure (5) : Matières à blocs (Arabe et Anglais)', () => {
    it('accepte des blocs de 2h consécutives pour une charge paire (4h Arabe)', () => {
      // 4h = Lundi C1-C2 (slots 0, 1) + Mardi C1-C2 (slots 7, 8)
      const planning: Planning = [
        { uniteId: uniteArabe4h.id, slot: 0 },
        { uniteId: uniteArabe4h.id, slot: 1 },
        { uniteId: uniteArabe4h.id, slot: 7 },
        { uniteId: uniteArabe4h.id, slot: 8 },
      ];

      const dataArabeOnly: ScheduleData = {
        ...testData,
        unites: [uniteArabe4h],
      };

      const violations = verify(planning, dataArabeOnly);
      const blockViolations = violations.filter((v) => v.type.startsWith('BLOC_'));
      expect(blockViolations.length).toBe(0);
    });

    it('refuse plus de 2h par jour pour une matière à blocs', () => {
      // 3h le Lundi (slots 0, 1, 2)
      const planning: Planning = [
        { uniteId: uniteArabe4h.id, slot: 0 },
        { uniteId: uniteArabe4h.id, slot: 1 },
        { uniteId: uniteArabe4h.id, slot: 2 },
      ];

      const dataArabeOnly: ScheduleData = {
        ...testData,
        unites: [uniteArabe4h],
      };

      const violations = verify(planning, dataArabeOnly);
      const exces = violations.filter((v) => v.type === 'BLOC_EXCES_JOUR');
      expect(exces.length).toBe(1);
      expect(exces[0].message).toContain('dépasse la limite maximale de 2 h par jour');
    });

    it('refuse 2h non consécutives le même jour pour une matière à blocs', () => {
      // Lundi slot 0 et slot 2 (trou entre les deux)
      const planning: Planning = [
        { uniteId: uniteArabe4h.id, slot: 0 },
        { uniteId: uniteArabe4h.id, slot: 2 },
      ];

      const dataArabeOnly: ScheduleData = {
        ...testData,
        unites: [uniteArabe4h],
      };

      const violations = verify(planning, dataArabeOnly);
      const nonConsec = violations.filter((v) => v.type === 'BLOC_NON_CONSECUTIF');
      expect(nonConsec.length).toBe(1);
      expect(nonConsec[0].message).toContain('doivent être consécutives');
    });

    it('refuse des heures isolées (1h) quand la charge totale de la matière à blocs est paire (4h)', () => {
      // 4h réparties en 2h consécutives le Lundi + 1h le Mardi + 1h le Mercredi (interdit pour charge paire)
      const planning: Planning = [
        { uniteId: uniteArabe4h.id, slot: 0 },
        { uniteId: uniteArabe4h.id, slot: 1 },
        { uniteId: uniteArabe4h.id, slot: 7 }, // 1h mardi
        { uniteId: uniteArabe4h.id, slot: 14 }, // 1h mercredi
      ];

      const dataArabeOnly: ScheduleData = {
        ...testData,
        unites: [uniteArabe4h],
      };

      const violations = verify(planning, dataArabeOnly);
      const isolees = violations.filter((v) => v.type === 'BLOC_HEURE_ISOLEE_INVALIDE');
      expect(isolees.length).toBe(1);
      expect(isolees[0].message).toContain('charge paire');
    });

    it('accepte exactement une heure isolée un autre jour pour une charge impaire (3h Anglais)', () => {
      // 3h Anglais = 2h consécutives le Lundi (slots 0, 1) + 1h isolée le Mardi (slot 7) -> VALIDE
      const planning: Planning = [
        { uniteId: uniteAnglais3h.id, slot: 0 },
        { uniteId: uniteAnglais3h.id, slot: 1 },
        { uniteId: uniteAnglais3h.id, slot: 7 },
      ];

      const dataAnglaisOnly: ScheduleData = {
        ...testData,
        unites: [uniteAnglais3h],
      };

      const violations = verify(planning, dataAnglaisOnly);
      const blockViolations = violations.filter((v) => v.type.startsWith('BLOC_'));
      expect(blockViolations.length).toBe(0);
    });

    it('refuse plusieurs heures isolées pour une charge impaire (3h réparties 1h + 1h + 1h)', () => {
      const planning: Planning = [
        { uniteId: uniteAnglais3h.id, slot: 0 }, // 1h lun
        { uniteId: uniteAnglais3h.id, slot: 7 }, // 1h mar
        { uniteId: uniteAnglais3h.id, slot: 14 }, // 1h mer
      ];

      const dataAnglaisOnly: ScheduleData = {
        ...testData,
        unites: [uniteAnglais3h],
      };

      const violations = verify(planning, dataAnglaisOnly);
      const isolees = violations.filter((v) => v.type === 'BLOC_HEURE_ISOLEE_INVALIDE');
      expect(isolees.length).toBe(1);
      expect(isolees[0].message).toContain('charge impaire');
    });
  });

  describe('Règles souples et fonction score()', () => {
    it('applique une pénalité de 100 par heure en excès au-delà de 2h par jour', () => {
      // Matière non à blocs (Math) ayant 3h le Lundi (1h en excès)
      const planning: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 1 },
        { uniteId: uniteMath4h.id, slot: 2 },
      ];

      const dataMathOnly: ScheduleData = {
        ...testData,
        unites: [uniteMath4h],
      };

      const res = score(planning, dataMathOnly);
      expect(res.penalitesExcesJour).toBe(100);
    });

    it('applique une pénalité de 15 pour des heures non consécutives le même jour', () => {
      // Math : slot 0 et slot 2 le Lundi (non consécutifs)
      const planning: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 2 },
      ];

      const dataMathOnly: ScheduleData = {
        ...testData,
        unites: [uniteMath4h],
      };

      const res = score(planning, dataMathOnly);
      expect(res.penalitesNonConsecutif).toBe(15);
    });

    it('calcule la compacité (coût 1 par rang d heure + 0,3 par rang de jour)', () => {
      // Slot 0 (Lun C1) : rangHeure=0, rangJour=0 -> 0 + 0 = 0
      // Slot 2 (Lun C3) : rangHeure=2, rangJour=0 -> 2 + 0 = 2
      // Slot 7 (Mar C1) : rangHeure=0, rangJour=1 -> 0 + 0.3 = 0.3
      const planning: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 2 },
        { uniteId: uniteMath4h.id, slot: 7 },
      ];

      const dataMathOnly: ScheduleData = {
        ...testData,
        unites: [uniteMath4h],
      };

      const res = score(planning, dataMathOnly);
      // Compacité attendue : 0 + 2 + 0.3 = 2.3
      expect(res.coutCompacite).toBe(2.3);
    });
  });

  describe('canPlace(planning, unite, slot, data)', () => {
    it('renvoie ok: true pour un placement valide', () => {
      const planning: Planning = [];
      const res = canPlace(planning, uniteMath4h, 0, testData);
      expect(res.ok).toBe(true);
      expect(res.raisons).toHaveLength(0);
    });

    it('refuse si le professeur est indisponible', () => {
      const profPartiel: Teacher = {
        ...profMath,
        id: 'p_partiel',
        dispo: new Array(32).fill(true),
      };
      profPartiel.dispo[5] = false;

      const unitePartiel: Unite = {
        ...uniteMath4h,
        teacherId: profPartiel.id,
      };

      const customData: ScheduleData = {
        ...testData,
        teachers: [profPartiel],
      };

      const res = canPlace([], unitePartiel, 5, customData);
      expect(res.ok).toBe(false);
      expect(res.raisons[0]).toContain('indisponible');
    });

    it('refuse si le créneau est déjà occupé par le même enseignant', () => {
      const planning: Planning = [{ uniteId: uniteMath4h.id, slot: 3 }];
      const res = canPlace(planning, uniteMath4h, 3, testData);
      expect(res.ok).toBe(false);
      expect(res.raisons.some((r) => r.includes('déjà affectée') || r.includes('déjà un cours'))).toBe(true);
    });

    it('refuse si la classe est déjà occupée par une autre unité', () => {
      const planning: Planning = [{ uniteId: uniteMath4h.id, slot: 10 }]; // classe1 occupée
      const res = canPlace(planning, uniteArabe4h, 10, testData); // classe1 également
      expect(res.ok).toBe(false);
      expect(res.raisons.some((r) => r.includes('La classe 1APIC-1 a déjà un cours'))).toBe(true);
    });

    it('refuse si toutes les heures de l unité sont déjà placées', () => {
      const planning: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 1 },
        { uniteId: uniteMath4h.id, slot: 7 },
        { uniteId: uniteMath4h.id, slot: 8 },
      ];
      // Quota 4h déjà atteint
      const res = canPlace(planning, uniteMath4h, 14, testData);
      expect(res.ok).toBe(false);
      expect(res.raisons.some((r) => r.includes('Toutes les heures de cette unité sont déjà placées'))).toBe(true);
    });

    it('applique les contraintes de blocs dans canPlace (Arabe)', () => {
      // Arabe a déjà 1h le Lundi au slot 0. Le prochain créneau ce jour-là DOIT être slot 1 (consécutif).
      const planning: Planning = [{ uniteId: uniteArabe4h.id, slot: 0 }];

      // Essai sur slot 1 (consécutif) -> OK
      const resAdjacent = canPlace(planning, uniteArabe4h, 1, testData);
      expect(resAdjacent.ok).toBe(true);

      // Essai sur slot 3 (non consécutif le même jour) -> REFUSÉ
      const resNonAdjacent = canPlace(planning, uniteArabe4h, 3, testData);
      expect(resNonAdjacent.ok).toBe(false);
      expect(resNonAdjacent.raisons.some((r) => r.includes('doivent être consécutives'))).toBe(true);
    });
  });

  describe('Spécification complète : Blocs de 2h pour toutes les matières et Pause méridienne de 1h', () => {
    it('areSlotsConsecutiveWithoutPause vérifie la consécutivité et la pause de 1h', () => {
      // Dans une journée de 7h (slots 0..6 pour Lundi) :
      // Matin (4h) : C1(0), C2(1), C3(2), C4(3)
      // Pause de 1h : entre C4 et C5
      // Après-midi (3h) : C5(4), C6(5), C7(6)
      expect(areSlotsConsecutiveWithoutPause(0, 1, semaineStandard)).toBe(true); // C1 - C2
      expect(areSlotsConsecutiveWithoutPause(1, 2, semaineStandard)).toBe(true); // C2 - C3
      expect(areSlotsConsecutiveWithoutPause(2, 3, semaineStandard)).toBe(true); // C3 - C4
      expect(areSlotsConsecutiveWithoutPause(3, 4, semaineStandard)).toBe(false); // C4 - C5 (INTERDIT : PAUSE DE 1H)
      expect(areSlotsConsecutiveWithoutPause(4, 5, semaineStandard)).toBe(true); // C5 - C6
      expect(areSlotsConsecutiveWithoutPause(5, 6, semaineStandard)).toBe(true); // C6 - C7
      expect(areSlotsConsecutiveWithoutPause(0, 2, semaineStandard)).toBe(false); // Trou
      expect(areSlotsConsecutiveWithoutPause(6, 7, semaineStandard)).toBe(false); // Changement de jour (Lundi C7 vers Mardi C1)

      // Le vendredi (4h) :
      // Slots 28..31
      expect(areSlotsConsecutiveWithoutPause(28, 29, semaineStandard)).toBe(true); // C1 - C2
      expect(areSlotsConsecutiveWithoutPause(30, 31, semaineStandard)).toBe(true); // C3 - C4
    });

    it('applique la règle des blocs de 2h aux Mathématiques (charge paire 4h : 2 blocs de 2h sur 2 jours)', () => {
      // 4h Math = Lundi C1-C2 (slots 0, 1) + Mardi C1-C2 (slots 7, 8) -> VALIDE
      const planningValide: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 1 },
        { uniteId: uniteMath4h.id, slot: 7 },
        { uniteId: uniteMath4h.id, slot: 8 },
      ];

      const dataMath: ScheduleData = {
        ...testData,
        unites: [uniteMath4h],
      };

      const violationsValides = verify(planningValide, dataMath);
      const blockV = violationsValides.filter((v) => v.type.startsWith('BLOC_'));
      expect(blockV).toHaveLength(0);

      // Si divisé avec des séances de 1h isolées (2h + 1h + 1h) -> INVALIDE
      const planningInvalide: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 1 },
        { uniteId: uniteMath4h.id, slot: 7 }, // 1h isolée Mardi
        { uniteId: uniteMath4h.id, slot: 14 }, // 1h isolée Mercredi
      ];

      const violationsInvalides = verify(planningInvalide, dataMath);
      expect(violationsInvalides.some((v) => v.type === 'BLOC_HEURE_ISOLEE_INVALIDE')).toBe(true);
    });

    it('applique la règle aux charges impaires (ex: 7h = 3 blocs de 2h sur 3 jours et 1h un autre jour)', () => {
      const profSvt: Teacher = {
        id: 'p_svt',
        nom: 'BENNANI Hicham',
        matiere: 'SVT',
        dispo: new Array(32).fill(true),
      };

      const uniteSvt7h: Unite = {
        id: 'u_svt_7h',
        teacherId: profSvt.id,
        classeIds: [classe1.id],
        heures: 7,
      };

      const dataSvt: ScheduleData = {
        ...testData,
        teachers: [...testData.teachers, profSvt],
        unites: [uniteSvt7h],
      };

      // 7h réparties exactement comme demandé : 2h Lundi + 2h Mardi + 2h Mercredi + 1h Jeudi
      const planning7hValide: Planning = [
        { uniteId: uniteSvt7h.id, slot: 0 }, // Lun C1
        { uniteId: uniteSvt7h.id, slot: 1 }, // Lun C2
        { uniteId: uniteSvt7h.id, slot: 7 }, // Mar C1
        { uniteId: uniteSvt7h.id, slot: 8 }, // Mar C2
        { uniteId: uniteSvt7h.id, slot: 14 }, // Mer C1
        { uniteId: uniteSvt7h.id, slot: 15 }, // Mer C2
        { uniteId: uniteSvt7h.id, slot: 21 }, // Jeu C1 (1h isolée)
      ];

      const violationsValides = verify(planning7hValide, dataSvt);
      const bViolations = violationsValides.filter((v) => v.type.startsWith('BLOC_'));
      expect(bViolations).toHaveLength(0);

      // Si 7h est mal découpée (ex: 2h + 2h + 1h + 1h + 1h -> 3 séances isolées au lieu d'une seule) -> INVALIDE
      const planning7hInvalide: Planning = [
        { uniteId: uniteSvt7h.id, slot: 0 }, // Lun C1
        { uniteId: uniteSvt7h.id, slot: 1 }, // Lun C2
        { uniteId: uniteSvt7h.id, slot: 7 }, // Mar C1
        { uniteId: uniteSvt7h.id, slot: 8 }, // Mar C2
        { uniteId: uniteSvt7h.id, slot: 14 }, // Mer C1 (1h)
        { uniteId: uniteSvt7h.id, slot: 21 }, // Jeu C1 (1h)
        { uniteId: uniteSvt7h.id, slot: 28 }, // Ven C1 (1h)
      ];

      const violationsInvalides = verify(planning7hInvalide, dataSvt);
      expect(violationsInvalides.some((v) => v.type === 'BLOC_HEURE_ISOLEE_INVALIDE')).toBe(true);
    });

    it('refuse catégoriquement un bloc de 2h à cheval sur la pause méridienne de 1h (C4 et C5)', () => {
      // Slot 3 = Lundi C4 (11h30 - 12h30)
      // Slot 4 = Lundi C5 (13h30 - 14h30)
      // Entre les deux : 1h de pause méridienne !
      const planningPauseCross: Planning = [
        { uniteId: uniteMath4h.id, slot: 3 },
        { uniteId: uniteMath4h.id, slot: 4 },
      ];

      const dataMath: ScheduleData = {
        ...testData,
        unites: [uniteMath4h],
      };

      const violations = verify(planningPauseCross, dataMath);
      const pauseViolation = violations.find((v) => v.type === 'BLOC_NON_CONSECUTIF');
      expect(pauseViolation).toBeDefined();
      expect(pauseViolation?.message).toContain('pause méridienne de 1h');

      // canPlace refuse également d'ajouter le slot 4 (C5) si le slot 3 (C4) est déjà présent
      const planningWithC4: Planning = [{ uniteId: uniteMath4h.id, slot: 3 }];
      const cpRes = canPlace(planningWithC4, uniteMath4h, 4, dataMath);
      expect(cpRes.ok).toBe(false);
      expect(cpRes.raisons.some((r) => r.includes('pause méridienne de 1h'))).toBe(true);
    });

    it('génère mathématiquement toutes les partitions possibles en blocs avec max 3h', () => {
      const partitions7h = generatePossibleBlockPartitions(7, 3);
      // Doit inclure [3, 3, 1], [3, 2, 2], [2, 2, 2, 1]
      expect(partitions7h).toContainEqual([3, 3, 1]);
      expect(partitions7h).toContainEqual([3, 2, 2]);
      expect(partitions7h).toContainEqual([2, 2, 2, 1]);
      // Chaque bloc doit être <= 3
      for (const p of partitions7h) {
        expect(p.reduce((a, b) => a + b, 0)).toBe(7);
        expect(Math.max(...p)).toBeLessThanOrEqual(3);
      }
    });

    it('valide les possibilités de blocs paramétrées pour une matière/niveau (ex: 7h = 3h+3h+1h ou 3h+2h+2h)', () => {
      const uniteMath7h: Unite = {
        id: 'u_math_7h',
        teacherId: profMath.id,
        classeIds: [classeBac1.id], // 1BAC
        heures: 7,
      };

      const data7h: ScheduleData = {
        ...testData,
        unites: [uniteMath7h],
      };

      const regle7h: SubjectLevelBlockRule = {
        id: 'rule_math_7h',
        matiere: 'Mathématiques',
        niveau: '1BAC',
        heuresHebdo: 7,
        possibilites: [
          [2, 2, 2, 1],
          [3, 3, 1],
          [3, 2, 2],
        ],
        actif: true,
      };

      // Test Cas A : [3, 3, 1] -> Lundi 3h (C1,C2,C3), Mardi 3h (C1,C2,C3), Mercredi 1h (C1)
      const planning331: Planning = [
        { uniteId: uniteMath7h.id, slot: 0 }, // Lun C1
        { uniteId: uniteMath7h.id, slot: 1 }, // Lun C2
        { uniteId: uniteMath7h.id, slot: 2 }, // Lun C3
        { uniteId: uniteMath7h.id, slot: 7 }, // Mar C1
        { uniteId: uniteMath7h.id, slot: 8 }, // Mar C2
        { uniteId: uniteMath7h.id, slot: 9 }, // Mar C3
        { uniteId: uniteMath7h.id, slot: 14 }, // Mer C1
      ];

      const violations331 = verify(planning331, data7h, {
        subjectBlockRules: [regle7h],
      });
      expect(violations331.filter((v) => v.severite === 'DURE')).toHaveLength(0);

      // Test Cas B : [3, 2, 2] -> Lundi 3h (C1,C2,C3), Mardi 2h (C1,C2), Mercredi 2h (C1,C2)
      const planning322: Planning = [
        { uniteId: uniteMath7h.id, slot: 0 },
        { uniteId: uniteMath7h.id, slot: 1 },
        { uniteId: uniteMath7h.id, slot: 2 },
        { uniteId: uniteMath7h.id, slot: 7 },
        { uniteId: uniteMath7h.id, slot: 8 },
        { uniteId: uniteMath7h.id, slot: 14 },
        { uniteId: uniteMath7h.id, slot: 15 },
      ];

      const violations322 = verify(planning322, data7h, {
        subjectBlockRules: [regle7h],
      });
      expect(violations322.filter((v) => v.severite === 'DURE')).toHaveLength(0);

      // Test Cas C : Non-conforme aux possibilités -> ex: [3, 2, 1, 1] si non listé dans les possibilités
      const regleRestreinte: SubjectLevelBlockRule = {
        ...regle7h,
        possibilites: [
          [3, 3, 1],
          [3, 2, 2],
        ],
      };
      const planning3211: Planning = [
        { uniteId: uniteMath7h.id, slot: 0 },
        { uniteId: uniteMath7h.id, slot: 1 },
        { uniteId: uniteMath7h.id, slot: 2 },
        { uniteId: uniteMath7h.id, slot: 7 },
        { uniteId: uniteMath7h.id, slot: 8 },
        { uniteId: uniteMath7h.id, slot: 14 }, // Mer 1h
        { uniteId: uniteMath7h.id, slot: 21 }, // Jeu 1h
      ];

      const violations3211 = verify(planning3211, data7h, {
        subjectBlockRules: [regleRestreinte],
      });
      expect(violations3211.some((v) => v.type === 'BLOC_REPARTITION_NON_CONFORME')).toBe(true);

      // Test Cas D : Dépassement du maximum de 3h par bloc (ex: 4h le lundi)
      const planning4hLundi: Planning = [
        { uniteId: uniteMath7h.id, slot: 0 },
        { uniteId: uniteMath7h.id, slot: 1 },
        { uniteId: uniteMath7h.id, slot: 2 },
        { uniteId: uniteMath7h.id, slot: 3 }, // 4h le lundi !
        { uniteId: uniteMath7h.id, slot: 7 },
        { uniteId: uniteMath7h.id, slot: 8 },
        { uniteId: uniteMath7h.id, slot: 14 },
      ];
      const violations4h = verify(planning4hLundi, data7h, {
        subjectBlockRules: [regle7h],
      });
      expect(violations4h.some((v) => v.type === 'BLOC_EXCES_JOUR')).toBe(true);
    });

    it('autorise canPlace pour une 3ème heure consécutive lorsque les blocs de 3h sont configurés', () => {
      const uniteMath7h: Unite = {
        id: 'u_math_7h',
        teacherId: profMath.id,
        classeIds: [classeBac1.id],
        heures: 7,
      };

      const data7h: ScheduleData = {
        ...testData,
        unites: [uniteMath7h],
      };

      const regle7h: SubjectLevelBlockRule = {
        id: 'rule_math_7h',
        matiere: 'Mathématiques',
        niveau: '1BAC',
        heuresHebdo: 7,
        possibilites: [[3, 3, 1]],
        actif: true,
      };

      // 2 heures consécutives déjà placées sur Lundi C1 et C2
      const planning2h: Planning = [
        { uniteId: uniteMath7h.id, slot: 0 },
        { uniteId: uniteMath7h.id, slot: 1 },
      ];

      // Tenter de placer Lundi C3 (slot 2) -> doit réussir car 3h consécutives autorisées
      const cp3 = canPlace(planning2h, uniteMath7h, 2, data7h, {
        subjectBlockRules: [regle7h],
      });
      expect(cp3.ok).toBe(true);

      // Mais tenter de placer Lundi C4 (slot 3) quand 3h sont déjà placées -> doit échouer (max 3h)
      const planning3h: Planning = [
        { uniteId: uniteMath7h.id, slot: 0 },
        { uniteId: uniteMath7h.id, slot: 1 },
        { uniteId: uniteMath7h.id, slot: 2 },
      ];
      const cp4 = canPlace(planning3h, uniteMath7h, 3, data7h, {
        subjectBlockRules: [regle7h],
      });
      expect(cp4.ok).toBe(false);
      expect(cp4.raisons.some((r) => r.includes('3 heures par jour'))).toBe(true);
    });

    it('gère la règle flexible de limite journalière par matière (1h, 2h ou 3h)', () => {
      // 1. Matière limitée à 1h par séance / jour (ex: SVT ou Anglais)
      const options1h = {
        maxHeuresParJourParMatiere: {
          Anglais: 1 as const,
        },
      };

      // Le créneau 0 (Lundi C1) peut être placé
      const cp1 = canPlace([], uniteAnglais3h, 0, testData, options1h);
      expect(cp1.ok).toBe(true);

      // Le créneau 1 (Lundi C2) sur le même jour doit être refusé car limité à 1h
      const planning1h: Planning = [{ uniteId: uniteAnglais3h.id, slot: 0 }];
      const cp2 = canPlace(planning1h, uniteAnglais3h, 1, testData, options1h);
      expect(cp2.ok).toBe(false);
      expect(cp2.raisons.some((r) => r.includes('maximum de 1h'))).toBe(true);

      // Par contre, un créneau sur un autre jour (Mardi C1 = slot 7) doit être accepté
      const cpMardi = canPlace(planning1h, uniteAnglais3h, 7, testData, options1h);
      expect(cpMardi.ok).toBe(true);

      // Vérification verify() avec 2h le même jour pour matière à 1h max
      const planningInfraction1h: Planning = [
        { uniteId: uniteAnglais3h.id, slot: 0 },
        { uniteId: uniteAnglais3h.id, slot: 1 },
      ];
      const violations1h = verify(planningInfraction1h, testData, options1h);
      expect(violations1h.some((v) => v.type === 'BLOC_EXCES_JOUR' && v.message.includes('1 h par jour'))).toBe(true);

      // 2. Matière limitée à 3h par jour (ex: Mathématiques autorisées jusqu'à 3h)
      const options3h = {
        maxHeuresParJourParMatiere: {
          'Mathématiques': 3 as const,
        },
      };

      // 2h consécutives sur Lundi C1 et C2
      const planningMath2h: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 1 },
      ];

      // Tenter de placer Lundi C3 (slot 2) -> accepté car la matière autorise 3h
      const cpMath3 = canPlace(planningMath2h, uniteMath4h, 2, testData, options3h);
      expect(cpMath3.ok).toBe(true);

      // Mais une 4ème heure (slot 3) doit être refusée
      const planningMath3h: Planning = [
        { uniteId: uniteMath4h.id, slot: 0 },
        { uniteId: uniteMath4h.id, slot: 1 },
        { uniteId: uniteMath4h.id, slot: 2 },
      ];
      const cpMath4 = canPlace(planningMath3h, uniteMath4h, 3, testData, options3h);
      expect(cpMath4.ok).toBe(false);
      expect(cpMath4.raisons.some((r) => r.includes('3 heures par jour'))).toBe(true);

      // Score : avec 3h autorisées pour Maths, aucune pénalité d'excès journalier pour 3h
      const score3h = score(planningMath3h, testData, options3h);
      expect(score3h.penalitesExcesJour).toBe(0);

      // Avec 2h par défaut (sans config 3h), 3h déclenchent une pénalité d'excès (1 heure au-delà de 2h = 100 pts)
      const scoreDefaut = score(planningMath3h, testData, { maxHeuresParJourParMatiere: {} });
      expect(scoreDefaut.penalitesExcesJour).toBe(100);
    });
  });
});
