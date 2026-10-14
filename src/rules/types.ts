/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, Semaine, Teacher, Unite } from '../types';

/**
 * Une affectation unitaire représente 1 heure d'une unité d'enseignement placée sur un créneau
 */
export interface Affectation {
  uniteId: string;
  slot: number; // Indice 0..totalSlots-1 (ex: 0..31)
}

/**
 * Représentation d'un emploi du temps : liste d'affectations {uniteId, slot}
 */
export type Planning = Affectation[];

export interface ScheduleData {
  teachers: Teacher[];
  classes: Classe[];
  unites: Unite[];
  semaine: Semaine;
}

export type ViolationType =
  | 'HEURES_NON_PLACEES'
  | 'HEURES_SURNUMERAIRES'
  | 'PROF_CONFLIT'
  | 'CLASSE_CONFLIT'
  | 'PROF_INDISPONIBLE'
  | 'BLOC_EXCES_JOUR'
  | 'BLOC_NON_CONSECUTIF'
  | 'BLOC_HEURE_ISOLEE_INVALIDE'
  | 'CRENEAU_RESERVE_VIOLATION'
  | 'PLAGE_INTERDITE_CLASSE'
  | 'PLAGE_INTERDITE_PROF'
  | 'PLAFOND_PROF_DEPASSE';

export interface RuleViolation {
  type: ViolationType;
  severite: 'DURE' | 'SOUPLE';
  message: string;
  uniteId?: string;
  profId?: string;
  profNom?: string;
  classeId?: string;
  classeNom?: string;
  slot?: number;
  jourNom?: string;
  creneauNumero?: number; // 1-indexé dans la journée
}

export interface ReservedSlotPerClass {
  classeId: string;
  slot: number;
  label: string;
}

export interface ForbiddenSlotPerClass {
  classeId: string;
  slot: number;
  reason?: string;
}

export interface ForbiddenSlotPerTeacher {
  teacherId: string;
  slot: number;
  reason?: string;
}

export interface RulesOptions {
  /** Règle générale des blocs de 2h consécutives applicable à toutes les matières (défaut true) */
  toutesMatieresABlocs?: boolean;
  /** Respecter la pause méridienne de 1h après 4h : interdit tout bloc de 2h entre C4 et C5 (défaut true) */
  respecterPauseMidiBlocs?: boolean;
  /** Matières nécessitant des blocs de 2h consécutives si toutesMatieresABlocs est false (par défaut Arabe et Anglais) */
  matieresABlocs?: string[];
  /** Préférer des blocs de 2h consécutives pour toute matière > 2h (ex: 4h = 2h+2h, 7h = 2h*3 + 1h) */
  prefererBlocs2hMemeJour?: boolean;
  /** Seuil max d'heures par jour pour une unité (défaut 2) */
  maxHeuresParJourUnite?: number;
  /** Max d'heures par jour pour un enseignant (défaut 6) */
  maxHeuresParJourProf?: number;
  /** Max d'heures par jour pour une classe (défaut 6) */
  maxHeuresParJourClasse?: number;
  /** Plafond horaire max par enseignant (défaut 24 h) */
  plafondHoraireProf?: number;
  /** Pénalité souple pour chaque heure au-delà du max par jour (défaut 100) */
  penaliteHeureExcParJour?: number;
  /** Pénalité souple pour heures non consécutives le même jour (défaut 15) */
  penaliteNonConsecutiveMemeJour?: number;
  /** Coût par rang d'heure dans la journée pour la compacité (défaut 1.0) */
  coutRangHeure?: number;
  /** Coût par rang de jour pour la compacité (défaut 0.3) */
  coutRangJour?: number;
  /** Créneaux réservés par classe (ex: 3 h de contrôles en 2 Bac) */
  reservedSlots?: ReservedSlotPerClass[];
  /** Plages interdites par classe */
  forbiddenSlotsClasses?: ForbiddenSlotPerClass[];
  /** Plages interdites par prof */
  forbiddenSlotsTeachers?: ForbiddenSlotPerTeacher[];
}

export interface ScoreBreakdown {
  total: number;
  penalitesExcesJour: number; // (h - 2) * 100
  penalitesNonConsecutif: number; // 15 par jour avec heures séparées
  coutCompacite: number; // rangHeure * 1 + rangJour * 0.3
  nombreViolationsDures: number;
}

export interface CanPlaceResult {
  ok: boolean;
  raisons: string[];
}
