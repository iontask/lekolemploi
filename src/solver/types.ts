/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Affectation, Planning, RuleViolation, ScheduleData, ScoreBreakdown } from '../rules/types';

export type SolutionQuality =
  | 'OPTIMAL' // Prouvé optimal par HiGHS
  | 'FEASIBLE_NON_OPTIMAL' // Solution valide trouvée par HiGHS mais temps limite atteint
  | 'HEURISTIC_ONLY'; // Solution produite par l'heuristique Phase A (fallback ou sans phase B)

export interface SolverConfig {
  /** Limite de temps en secondes pour HiGHS (défaut : 120s) */
  timeLimitSeconds: number;
  /** Activer la phase B avec HiGHS (si désactivé, utilise uniquement la phase A) */
  enablePhaseB: boolean;
  /** Matières à blocs (défaut : ['Arabe', 'Anglais']) */
  matieresABlocs: string[];
  /** Seuil max d'heures par jour et unité (défaut : 2) */
  maxHeuresParJourUnite: number;
  /** Max d'heures par jour pour un enseignant (défaut 6) */
  maxHeuresParJourProf?: number;
  /** Max d'heures par jour pour une classe (défaut 6) */
  maxHeuresParJourClasse?: number;
  /** Plafond horaire max par enseignant (défaut 24 h) */
  plafondHoraireProf?: number;
  /** Pénalité pour dépassement de 2h par jour (défaut : 100) */
  penaliteHeureExcParJour: number;
  /** Pénalité pour heures non consécutives (défaut : 15) */
  penaliteNonConsecutiveMemeJour: number;
  /** Coût par rang d'heure dans la journée (défaut : 1.0) */
  coutRangHeure: number;
  /** Coût par rang de jour (défaut : 0.3) */
  coutRangJour: number;
  /** Créneaux réservés par classe (ex: 3 h de contrôles en 2 Bac) */
  reservedSlots?: import('../rules/types').ReservedSlotPerClass[];
  /** Plages interdites par classe */
  forbiddenSlotsClasses?: import('../rules/types').ForbiddenSlotPerClass[];
  /** Plages interdites par prof */
  forbiddenSlotsTeachers?: import('../rules/types').ForbiddenSlotPerTeacher[];
  /** Mode relâché : règles souples assouplies en cas d'infaisabilité */
  relaxedMode?: boolean;
}

export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  timeLimitSeconds: 120,
  enablePhaseB: true,
  matieresABlocs: ['Arabe', 'Anglais'],
  maxHeuresParJourUnite: 2,
  maxHeuresParJourProf: 6,
  maxHeuresParJourClasse: 6,
  plafondHoraireProf: 24,
  penaliteHeureExcParJour: 100,
  penaliteNonConsecutiveMemeJour: 15,
  coutRangHeure: 1.0,
  coutRangJour: 0.3,
  reservedSlots: [],
  forbiddenSlotsClasses: [],
  forbiddenSlotsTeachers: [],
  relaxedMode: false,
};

export interface SolverProgress {
  phase: 'A' | 'B';
  percent: number; // 0..100
  message: string;
  elapsedMs: number;
  currentScore?: number;
  phaseADurationMs?: number;
}

export interface SolverResult {
  success: boolean;
  planning: Planning;
  quality: SolutionQuality;
  qualityLabel: string;
  score: ScoreBreakdown;
  phaseADurationMs: number;
  phaseBDurationMs?: number;
  totalDurationMs: number;
  violations: RuleViolation[];
  benchmark: {
    totalUnits: number;
    totalHours: number;
    variablesCount?: number;
    constraintsCount?: number;
    highsStatus?: string;
  };
  error?: string;
}

export type WorkerInMessage =
  | { type: 'START'; data: ScheduleData; config: SolverConfig; lockedAssignments?: Affectation[] }
  | { type: 'CANCEL' };

export type WorkerOutMessage =
  | { type: 'PROGRESS'; progress: SolverProgress }
  | { type: 'PHASE_A_DONE'; planning: Planning; score: ScoreBreakdown; durationMs: number }
  | { type: 'DONE'; result: SolverResult }
  | { type: 'ERROR'; error: string };
