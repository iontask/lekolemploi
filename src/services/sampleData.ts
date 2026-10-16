/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, ImportDataset, MappingConfig, Teacher, Unite } from '../types';
import { DEFAULT_MAPPING_CONFIG } from './db';
import { generateAuditReport } from './excelParser';

export const OFFICIAL_CLASSES: { nom: string; niveau: string }[] = [
  { nom: '1APIC-1', niveau: '1APIC (1ère Collège)' },
  { nom: '1APIC-2', niveau: '1APIC (1ère Collège)' },
  { nom: '2APIC-1', niveau: '2APIC (2ème Collège)' },
  { nom: '2APIC-2', niveau: '2APIC (2ème Collège)' },
  { nom: '3APIC-1', niveau: '3APIC (3ème Collège)' },
  { nom: '3APIC-2', niveau: '3APIC (3ème Collège)' },
  { nom: 'TCSF-1', niveau: 'TCSF (Tronc Commun)' },
  { nom: 'TCSF-2', niveau: 'TCSF (Tronc Commun)' },
  { nom: '1BACSEF', niveau: '1BAC (1ère Bac)' },
  { nom: '1BACSEG', niveau: '1BAC (1ère Bac)' },
  { nom: '2BACSPF', niveau: '2BAC (2ème Bac)' },
  { nom: '2BACSE', niveau: '2BAC (2ème Bac)' },
];

export interface RawTeacherSeed {
  num: number;
  matiere: string;
  nom: string;
  prenom: string;
  // Dispos: 32 booleans (Lun 7, Mar 7, Mer 7, Jeu 7, Ven 4)
  dispoPattern: number[]; // index of available slots (0 to 31)
  // Assignments: [classIndex (0..11) or [c1, c2] for merged cours commun, hours]
  assignments: {
    classes: number | number[]; // index in OFFICIAL_CLASSES
    heures: number;
  }[];
}

/**
 * Jeu de données officiel 28 enseignants, 12 classes, 360 heures exactes.
 * Comprend des cours communs (cellules fusionnées 1BACSEF + 1BACSEG)
 * et des cas représentatifs pour tester les alertes (marge serrée, etc.).
 */
export const RAW_TEACHER_SEEDS: RawTeacherSeed[] = [
  // 1 à 4 : Mathématiques (4 profs)
  {
    num: 1,
    matiere: 'Mathématiques',
    nom: 'EL ALAMI',
    prenom: 'Karim',
    dispoPattern: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19, 21, 22, 23, 28, 29, 30], // 23 dispos
    assignments: [
      { classes: 0, heures: 5 }, // 1APIC-1
      { classes: 1, heures: 5 }, // 1APIC-2
      { classes: 2, heures: 5 }, // 2APIC-1
    ], // 15h
  },
  {
    num: 2,
    matiere: 'Mathématiques',
    nom: 'BENJELLOUN',
    prenom: 'Fatima',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 10, 11, 14, 15, 16, 21, 22, 23, 24, 25, 28, 29, 30, 31], // 21 dispos
    assignments: [
      { classes: 3, heures: 5 }, // 2APIC-2
      { classes: 4, heures: 5 }, // 3APIC-1
      { classes: 5, heures: 5 }, // 3APIC-2
    ], // 15h
  },
  {
    num: 3,
    matiere: 'Mathématiques',
    nom: 'TAHIRI',
    prenom: 'Rachid',
    dispoPattern: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 14, 15, 16, 17, 21, 22, 23, 24, 28, 29], // 20 dispos
    assignments: [
      { classes: 6, heures: 5 }, // TCSF-1
      { classes: 7, heures: 5 }, // TCSF-2
      { classes: 8, heures: 4 }, // 1BACSEF
    ], // 14h
  },
  {
    num: 4,
    matiere: 'Mathématiques',
    nom: 'OUAZZANI',
    prenom: 'Samir',
    dispoPattern: [1, 2, 3, 4, 8, 9, 10, 11, 15, 16, 17, 18, 22, 23, 24, 25, 28, 29], // 18 dispos
    assignments: [
      { classes: 9, heures: 4 }, // 1BACSEG
      { classes: 10, heures: 5 }, // 2BACSPF
      { classes: 11, heures: 5 }, // 2BACSE
    ], // 14h
  },

  // 5 à 7 : Physique-Chimie (3 profs)
  {
    num: 5,
    matiere: 'Physique-Chimie',
    nom: 'IDRISSI',
    prenom: 'Hassan',
    dispoPattern: [0, 1, 2, 7, 8, 9, 14, 15, 16, 21, 22, 23, 24, 28, 29, 30], // 16 dispos
    assignments: [
      { classes: 0, heures: 3 }, // 1APIC-1
      { classes: 1, heures: 3 }, // 1APIC-2
      { classes: 2, heures: 3 }, // 2APIC-1
      { classes: 3, heures: 3 }, // 2APIC-2
    ], // 12h
  },
  {
    num: 6,
    matiere: 'Physique-Chimie',
    nom: 'CHRAIBI',
    prenom: 'Nadia',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 10, 14, 15, 16, 17, 21, 22, 23, 28, 29], // 17 dispos
    assignments: [
      { classes: 4, heures: 3 }, // 3APIC-1
      { classes: 5, heures: 3 }, // 3APIC-2
      { classes: 6, heures: 4 }, // TCSF-1
      { classes: 7, heures: 4 }, // TCSF-2
    ], // 14h
  },
  {
    num: 7,
    matiere: 'Physique-Chimie',
    nom: 'MEKOUAR',
    prenom: 'Omar',
    dispoPattern: [0, 1, 2, 3, 4, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23, 24, 28, 29], // 18 dispos
    assignments: [
      { classes: 8, heures: 4 }, // 1BACSEF
      { classes: 9, heures: 4 }, // 1BACSEG
      { classes: 10, heures: 5 }, // 2BACSPF
      { classes: 11, heures: 5 }, // 2BACSE
    ], // 18h -> Marge 0 pour tester l'alerte tension !
  },

  // 8 à 10 : SVT (3 profs)
  {
    num: 8,
    matiere: 'SVT',
    nom: 'BOUZIDI',
    prenom: 'Meriem',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 14, 15, 16, 21, 22, 23, 28, 29, 30], // 16 dispos
    assignments: [
      { classes: 0, heures: 3 }, // 1APIC-1
      { classes: 1, heures: 3 }, // 1APIC-2
      { classes: 2, heures: 3 }, // 2APIC-1
      { classes: 3, heures: 3 }, // 2APIC-2
    ], // 12h
  },
  {
    num: 9,
    matiere: 'SVT',
    nom: 'AMRANI',
    prenom: 'Adil',
    dispoPattern: [1, 2, 3, 4, 8, 9, 10, 15, 16, 17, 22, 23, 24, 28, 29], // 15 dispos
    assignments: [
      { classes: 4, heures: 3 }, // 3APIC-1
      { classes: 5, heures: 3 }, // 3APIC-2
      { classes: 6, heures: 3 }, // TCSF-1
      { classes: 7, heures: 3 }, // TCSF-2
    ], // 12h
  },
  {
    num: 10,
    matiere: 'SVT',
    nom: 'KABBAJ',
    prenom: 'Souad',
    dispoPattern: [0, 1, 2, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23, 28, 29], // 15 dispos
    assignments: [
      { classes: 8, heures: 4 }, // 1BACSEF
      { classes: 9, heures: 4 }, // 1BACSEG
      { classes: 10, heures: 4 }, // 2BACSPF
      { classes: 11, heures: 5 }, // 2BACSE
    ], // 17h -> Marge négative (-2) pour tester l'alerte surcharge !
  },

  // 11 à 14 : Français (4 profs)
  {
    num: 11,
    matiere: 'Français',
    nom: 'BERRADA',
    prenom: 'Zineb',
    dispoPattern: [0, 1, 2, 3, 4, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23, 28, 29, 30], // 18 dispos
    assignments: [
      { classes: 0, heures: 5 }, // 1APIC-1
      { classes: 1, heures: 5 }, // 1APIC-2
      { classes: 2, heures: 5 }, // 2APIC-1
    ], // 15h
  },
  {
    num: 12,
    matiere: 'Français',
    nom: 'SLAOUI',
    prenom: 'Mehdi',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23, 28, 29, 30], // 17 dispos
    assignments: [
      { classes: 3, heures: 5 }, // 2APIC-2
      { classes: 4, heures: 5 }, // 3APIC-1
      { classes: 5, heures: 5 }, // 3APIC-2
    ], // 15h
  },
  {
    num: 13,
    matiere: 'Français',
    nom: 'NACIRI',
    prenom: 'Kenza',
    dispoPattern: [1, 2, 3, 4, 8, 9, 10, 11, 15, 16, 17, 22, 23, 24, 28, 29, 30], // 17 dispos
    assignments: [
      { classes: 6, heures: 4 }, // TCSF-1
      { classes: 7, heures: 4 }, // TCSF-2
      { classes: 8, heures: 4 }, // 1BACSEF
    ], // 12h
  },
  {
    num: 14,
    matiere: 'Français',
    nom: 'ZEGHARI',
    prenom: 'Youssef',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23, 28, 29], // 16 dispos
    assignments: [
      { classes: 9, heures: 4 }, // 1BACSEG
      { classes: 10, heures: 4 }, // 2BACSPF
      { classes: 11, heures: 4 }, // 2BACSE
    ], // 12h
  },

  // 15 à 18 : Arabe (4 profs)
  {
    num: 15,
    matiere: 'Arabe',
    nom: 'FILALI',
    prenom: 'Abdellah',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 14, 15, 16, 21, 22, 23, 28, 29, 30], // 16 dispos
    assignments: [
      { classes: 0, heures: 4 }, // 1APIC-1
      { classes: 1, heures: 4 }, // 1APIC-2
      { classes: 2, heures: 4 }, // 2APIC-1
    ], // 12h
  },
  {
    num: 16,
    matiere: 'Arabe',
    nom: 'LAHLOU',
    prenom: 'Amina',
    dispoPattern: [1, 2, 3, 4, 8, 9, 10, 15, 16, 17, 22, 23, 24, 28, 29], // 15 dispos
    assignments: [
      { classes: 3, heures: 4 }, // 2APIC-2
      { classes: 4, heures: 4 }, // 3APIC-1
      { classes: 5, heures: 4 }, // 3APIC-2
    ], // 12h
  },
  {
    num: 17,
    matiere: 'Arabe',
    nom: 'BENNANI',
    prenom: 'Mustapha',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23, 28, 29], // 16 dispos
    assignments: [
      { classes: 6, heures: 3 }, // TCSF-1
      { classes: 7, heures: 3 }, // TCSF-2
      { classes: 8, heures: 3 }, // 1BACSEF
    ], // 9h
  },
  {
    num: 18,
    matiere: 'Arabe',
    nom: 'SEKKAT',
    prenom: 'Khadija',
    dispoPattern: [0, 1, 2, 7, 8, 9, 14, 15, 16, 21, 22, 23, 28, 29], // 14 dispos
    assignments: [
      { classes: 9, heures: 3 }, // 1BACSEG
      { classes: 10, heures: 3 }, // 2BACSPF
      { classes: 11, heures: 3 }, // 2BACSE
    ], // 9h
  },

  // 19 à 21 : Anglais (3 profs)
  {
    num: 19,
    matiere: 'Anglais',
    nom: 'MANSOURI',
    prenom: 'Tariq',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23, 28, 29], // 16 dispos
    assignments: [
      { classes: 4, heures: 2 }, // 3APIC-1
      { classes: 5, heures: 2 }, // 3APIC-2
      { classes: 6, heures: 3 }, // TCSF-1
      { classes: 7, heures: 3 }, // TCSF-2
    ], // 10h
  },
  {
    num: 20,
    matiere: 'Anglais',
    nom: 'EL FASSI',
    prenom: 'Houda',
    dispoPattern: [1, 2, 3, 4, 8, 9, 10, 15, 16, 17, 22, 23, 24, 28, 29, 30], // 16 dispos
    assignments: [
      { classes: 8, heures: 3 }, // 1BACSEF
      { classes: 9, heures: 3 }, // 1BACSEG
      { classes: 10, heures: 3 }, // 2BACSPF
      { classes: 11, heures: 3 }, // 2BACSE
    ], // 12h
  },
  {
    num: 21,
    matiere: 'Anglais',
    nom: 'HASSANI',
    prenom: 'Jamal',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 10, 14, 15, 16, 21, 22, 28, 29], // 15 dispos
    assignments: [
      { classes: 0, heures: 3 }, // 1APIC-1
      { classes: 1, heures: 3 }, // 1APIC-2
      { classes: 2, heures: 3 }, // 2APIC-1
      { classes: 3, heures: 3 }, // 2APIC-2
    ], // 12h
  },

  // 22 à 24 : Histoire-Géographie (3 profs)
  {
    num: 22,
    matiere: 'Histoire-Géo',
    nom: 'TOUIMI',
    prenom: 'Salma',
    dispoPattern: [0, 1, 2, 7, 8, 9, 14, 15, 16, 21, 22, 23, 28, 29], // 14 dispos
    assignments: [
      { classes: 0, heures: 3 }, // 1APIC-1
      { classes: 1, heures: 3 }, // 1APIC-2
      { classes: 2, heures: 3 }, // 2APIC-1
      { classes: 3, heures: 3 }, // 2APIC-2
    ], // 12h
  },
  {
    num: 23,
    matiere: 'Histoire-Géo',
    nom: 'GUEDIRA',
    prenom: 'Nabil',
    dispoPattern: [1, 2, 3, 8, 9, 10, 15, 16, 17, 22, 23, 24, 28, 29], // 14 dispos
    assignments: [
      { classes: 4, heures: 3 }, // 3APIC-1
      { classes: 5, heures: 3 }, // 3APIC-2
      { classes: 6, heures: 2 }, // TCSF-1
      { classes: 7, heures: 2 }, // TCSF-2
    ], // 10h
  },
  {
    num: 24,
    matiere: 'Histoire-Géo',
    nom: 'ALAMI OUAHABI',
    prenom: 'Bouchra',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 14, 15, 16, 21, 22, 23, 28, 29], // 15 dispos
    assignments: [
      { classes: 8, heures: 3 }, // 1BACSEF
      { classes: 9, heures: 3 }, // 1BACSEG
      { classes: 10, heures: 3 }, // 2BACSPF
      { classes: 11, heures: 3 }, // 2BACSE
    ], // 12h
  },

  // 25 et 26 : Éducation Islamique (2 profs)
  {
    num: 25,
    matiere: 'Éduc. Islamique',
    nom: 'RHANMI',
    prenom: 'Abdelali',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 10, 14, 15, 16, 21, 22, 23, 28, 29], // 16 dispos
    assignments: [
      { classes: 0, heures: 2 }, // 1APIC-1
      { classes: 1, heures: 2 }, // 1APIC-2
      { classes: 2, heures: 2 }, // 2APIC-1
      { classes: 3, heures: 2 }, // 2APIC-2
      { classes: 4, heures: 2 }, // 3APIC-1
      { classes: 5, heures: 2 }, // 3APIC-2
    ], // 12h
  },
  {
    num: 26,
    matiere: 'Éduc. Islamique',
    nom: 'BENCHEIKH',
    prenom: 'Mouna',
    dispoPattern: [0, 1, 2, 7, 8, 9, 14, 15, 16, 21, 22, 23, 28, 29], // 14 dispos
    assignments: [
      { classes: 6, heures: 2 }, // TCSF-1
      { classes: 7, heures: 2 }, // TCSF-2
      // COURS COMMUN FUSIONNÉ : 1BACSEF + 1BACSEG (classes 8 et 9) -> 2h comptées UNE SEULE FOIS pour le prof !
      { classes: [8, 9], heures: 2 },
      { classes: 10, heures: 3 }, // 2BACSPF
      { classes: 11, heures: 3 }, // 2BACSE
    ], // 12h pour le prof (+2)
  },

  // 27 : Philosophie (1 prof) avec COURS COMMUN FUSIONNÉ !
  {
    num: 27,
    matiere: 'Philosophie',
    nom: 'DERKAOUI',
    prenom: 'Hamza',
    dispoPattern: [0, 1, 2, 3, 4, 7, 8, 9, 10, 14, 15, 16, 17, 21, 22, 23, 28, 29], // 18 dispos
    assignments: [
      { classes: 6, heures: 3 }, // TCSF-1
      { classes: 7, heures: 3 }, // TCSF-2
      // COURS COMMUN FUSIONNÉ : 1BACSEF + 1BACSEG (classes 8 et 9) -> 2h comptées UNE SEULE FOIS pour le prof !
      { classes: [8, 9], heures: 2 },
      { classes: 10, heures: 3 }, // 2BACSPF
      { classes: 11, heures: 3 }, // 2BACSE
    ], // 14h pour le prof (+4)
  },

  // 28 : Informatique (1 prof)
  {
    num: 28,
    matiere: 'Informatique',
    nom: 'ZOUITEN',
    prenom: 'Latifa',
    dispoPattern: [0, 1, 2, 3, 7, 8, 9, 10, 14, 15, 16, 17, 21, 22, 23, 28, 29, 30], // 18 dispos
    assignments: [
      { classes: 0, heures: 1 }, // 1APIC-1
      { classes: 1, heures: 1 }, // 1APIC-2
      { classes: 2, heures: 1 }, // 2APIC-1
      { classes: 3, heures: 1 }, // 2APIC-2
      { classes: 4, heures: 1 }, // 3APIC-1
      { classes: 5, heures: 1 }, // 3APIC-2
      { classes: 6, heures: 3 }, // TCSF-1 (+1)
      { classes: 7, heures: 3 }, // TCSF-2 (+1)
      // COURS COMMUN FUSIONNÉ : 1BACSEF + 1BACSEG -> 1h
      { classes: [8, 9], heures: 1 },
      // COURS COMMUN FUSIONNÉ : 2BACSPF + 2BACSE -> 2h (+1)
      { classes: [10, 11], heures: 2 },
    ], // 15h pour le prof (+3)
  },
];

import referenceData from '../data/referencePlanning360.json';
import ascData from '../data/ascTimetableMinhaEscola.json';

/**
 * Crée le jeu de données officiel de référence : 28 profs, 12 classes, 360 heures exactes.
 */
export function buildOfficialSampleDataset(withPlanning = true): ImportDataset {
  const cloned = JSON.parse(JSON.stringify(referenceData.dataset)) as ImportDataset;
  const planning = withPlanning ? JSON.parse(JSON.stringify(referenceData.planning)) : [];

  const report = generateAuditReport(
    cloned.teachers,
    cloned.classes,
    cloned.unites,
    cloned.semaine
  );

  return {
    ...cloned,
    id: `ds_ref_360h_${Date.now()}`,
    fileName: withPlanning
      ? 'Emploi_du_Temps_Reference_360h.xlsx'
      : 'Emploi_du_Temps_Reference_Vierge_360h.xlsx',
    importedAt: new Date().toISOString(),
    planning,
    report,
  };
}

/**
 * Crée le jeu de données déduit des outputs du logiciel aSc Timetables (Minha Escola) :
 * 29 profs, 12 classes, 384 heures au total, avec 381 heures planifiées fidèlement.
 * Les heures non placées ou déplaçables vont dans le bac de cours non affectés en haut de grille.
 */
export function buildAscTimetableSampleDataset(withPlanning = true): ImportDataset {
  const cloned = JSON.parse(JSON.stringify(ascData.dataset)) as ImportDataset;
  const planning = withPlanning ? JSON.parse(JSON.stringify(ascData.planning)) : [];

  const report = generateAuditReport(
    cloned.teachers,
    cloned.classes,
    cloned.unites,
    cloned.semaine
  );

  return {
    ...cloned,
    id: `ds_asc_minha_escola_${Date.now()}`,
    fileName: withPlanning
      ? 'Emploi_du_Temps_aSc_MinhaEscola_384h.xlsx'
      : 'Emploi_du_Temps_aSc_MinhaEscola_Vierge_384h.xlsx',
    importedAt: new Date().toISOString(),
    planning,
    report,
    constraints: cloned.constraints || {
      toutesMatieresABlocs: false,
      matieresABlocs: ['Arabe', 'Anglais'],
      prefererBlocs2hMemeJour: true,
      maxHeuresParJourUnite: 2,
      maxHeuresParJourProf: 6,
      maxHeuresParJourClasse: 6,
      respecterPauseMidiBlocs: true,
    },
  };
}

export const createSampleDataset = buildOfficialSampleDataset;

export interface SamplePreset {
  id: string;
  name: string;
  shortLabel: string;
  badge: string;
  badgeStyle: string;
  category: 'asc' | 'official';
  description: string;
  totalHours: number;
  classesCount: number;
  teachersCount: number;
  hasPlanning: boolean;
  plannedHours: number;
  unassignedHours: number;
  load: () => ImportDataset;
}

export const SAMPLE_PRESETS: SamplePreset[] = [
  {
    id: 'asc-minha-escola-with-planning',
    name: 'aSc Timetables — Minha Escola (381 h)',
    shortLabel: 'aSc Réel (381 h)',
    badge: 'Emploi du temps aSc Réel',
    badgeStyle: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    category: 'asc',
    description:
      'Sortie réelle du logiciel aSc Timetables (12 classes, 29 profs, 381 h). Emploi du temps complet + bac interactif pour ajustements et drag & drop.',
    totalHours: 381,
    classesCount: 12,
    teachersCount: 29,
    hasPlanning: true,
    plannedHours: 381,
    unassignedHours: 0,
    load: () => buildAscTimetableSampleDataset(true),
  },
  {
    id: 'asc-minha-escola-empty',
    name: 'aSc Timetables — Minha Escola (Vierge, 381 h)',
    shortLabel: 'aSc Vierge (381 h)',
    badge: 'Structure à générer',
    badgeStyle: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    category: 'asc',
    description:
      'Structure complète des 12 classes et 29 enseignants aSc prête pour une nouvelle résolution automatique avec le solveur MIP.',
    totalHours: 381,
    classesCount: 12,
    teachersCount: 29,
    hasPlanning: false,
    plannedHours: 0,
    unassignedHours: 381,
    load: () => buildAscTimetableSampleDataset(false),
  },
  {
    id: 'official-reference-360h-with-planning',
    name: 'Modèle Officiel Résolu (360 h)',
    shortLabel: 'Officiel Résolu (360 h)',
    badge: '100% sans conflit',
    badgeStyle: 'bg-blue-100 text-blue-800 border-blue-300',
    category: 'official',
    description:
      'Emploi du temps de référence 100% planifié (28 profs, 12 classes, 360 h), cours communs fusionnés 1BAC et blocs de 2h respectés.',
    totalHours: 360,
    classesCount: 12,
    teachersCount: 28,
    hasPlanning: true,
    plannedHours: 360,
    unassignedHours: 0,
    load: () => buildOfficialSampleDataset(true),
  },
  {
    id: 'official-reference-360h-empty',
    name: 'Modèle Officiel Vierge (360 h)',
    shortLabel: 'Officiel Vierge (360 h)',
    badge: 'Structure à générer',
    badgeStyle: 'bg-slate-100 text-slate-800 border-slate-300',
    category: 'official',
    description:
      '28 profs, 12 classes, 360 h avec cours communs 1BAC, prêt pour une génération intégrale.',
    totalHours: 360,
    classesCount: 12,
    teachersCount: 28,
    hasPlanning: false,
    plannedHours: 0,
    unassignedHours: 360,
    load: () => buildOfficialSampleDataset(false),
  },
];
