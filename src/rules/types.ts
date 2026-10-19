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
  | 'BLOC_REPARTITION_NON_CONFORME'
  | 'CRENEAU_RESERVE_VIOLATION'
  | 'PLAGE_INTERDITE_CLASSE'
  | 'PLAGE_INTERDITE_PROF'
  | 'PLAFOND_PROF_DEPASSE'
  | 'PROF_ISOLE_DEMI_JOURNEE'
  | 'PROF_TROU_JOURNEE';

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

export interface SubjectLevelBlockRule {
  id: string;
  matiere: string; // Ex: 'Mathématiques', 'Physique-Chimie', ou '*' (Toutes)
  niveau: string; // Ex: '2BAC', '1BAC', 'TCSF', '3APIC', '2APIC', '1APIC', ou '*' (Tous)
  classeId?: string; // Spécifique à une classe précise (ou '*' / absent pour tout le niveau)
  classeNom?: string; // Nom de la classe pour affichage
  heuresHebdo: number; // Volume horaire hebdomadaire (ex: 7)
  possibilites: number[][]; // Ex: [[2, 2, 2, 1], [3, 3, 1], [3, 2, 2]] (chacun max 3h)
  maxHeuresParJour?: 1 | 2 | 3; // Limite journalière associée (optionnelle)
  description?: string;
  actif?: boolean;
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
  /** Configuration des possibilités de blocs par matière / niveau / classe (ex: 7h = 2h+2h+2h+1h ou 3h+3h+1h, max 3h) */
  subjectBlockRules?: SubjectLevelBlockRule[];
  /** Limite maximale globale d'heures par jour/séance par matière (1h, 2h ou 3h) */
  maxHeuresParJourParMatiere?: Record<string, 1 | 2 | 3>;
  /** Limite maximale d'heures par jour/séance par matière et par NIVEAU (clé: `${niveau}::${matiere}`) */
  maxHeuresParJourParMatiereNiveau?: Record<string, 1 | 2 | 3>;
  /** Limite maximale d'heures par jour/séance par matière et par CLASSE (clé: `${classeId}::${matiere}`) */
  maxHeuresParJourParMatiereClasse?: Record<string, 1 | 2 | 3>;
  /** Mode relâché : règles souples assouplies en cas d'infaisabilité */
  relaxedMode?: boolean;
  /** Reverse Dépassement : liste des identifiants de dépassements désactivés (interdits strictement au solveur) */
  disabledOverages?: string[];
  /** Interdire strictement tous les dépassements de 2h/jour (contrainte dure globale) */
  interdireTousDepassements?: boolean;
  /** Liste des IDs des enseignants pour lesquels il faut éviter une venue pour seulement 1h sur une demi-journée (minimum 2h si présent) */
  profsEviter1hDemiJournee?: string[];
  /** Liste des IDs des enseignants pour lesquels il faut regrouper au maximum les heures et éviter les trous / fenêtres */
  profsRegrouperHeuresAntiTrous?: string[];
}

export interface ScoreBreakdown {
  total: number;
  penalitesExcesJour: number; // (h - 2) * 100
  penalitesNonConsecutif: number; // 15 par jour avec heures séparées
  coutCompacite: number; // rangHeure * 1 + rangJour * 0.3
  nombreViolationsDures: number;
  penalitesProfIsoleDemiJournee?: number;
  penalitesProfTrous?: number;
}

export interface CanPlaceResult {
  ok: boolean;
  raisons: string[];
}
