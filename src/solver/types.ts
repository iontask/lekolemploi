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
  /** Règle générale des blocs de 2h consécutives applicable à toutes les matières (défaut true) */
  toutesMatieresABlocs?: boolean;
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
  /** Préférer des blocs de 2h consécutives pour toute matière > 2h (défaut : true) */
  prefererBlocs2hMemeJour?: boolean;
  /** Configuration des possibilités de blocs par matière / niveau */
  subjectBlockRules?: import('../rules/types').SubjectLevelBlockRule[];
  /** Limite maximale d'heures par jour/séance par matière (1h, 2h ou 3h) */
  maxHeuresParJourParMatiere?: Record<string, 1 | 2 | 3>;
  /** Limite maximale d'heures par jour/séance par matière et par NIVEAU (clé: `${niveau}::${matiere}`) */
  maxHeuresParJourParMatiereNiveau?: Record<string, 1 | 2 | 3>;
  /** Limite maximale d'heures par jour/séance par matière et par CLASSE (clé: `${classeId}::${matiere}`) */
  maxHeuresParJourParMatiereClasse?: Record<string, 1 | 2 | 3>;
  /** Respecter la pause de 1h après 4h (entre C4 et C5) : aucun bloc à cheval */
  respecterPauseMidiBlocs?: boolean;
  /** Mode relâché : règles souples assouplies en cas d'infaisabilité */
  relaxedMode?: boolean;
  /** Reverse Dépassement : liste des identifiants de dépassements désactivés (interdits strictement au solveur) */
  disabledOverages?: string[];
  /** Interdire strictement tous les dépassements de 2h/jour (contrainte dure globale) */
  interdireTousDepassements?: boolean;
}

export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  timeLimitSeconds: 120,
  enablePhaseB: true,
  toutesMatieresABlocs: true,
  matieresABlocs: ['Arabe', 'Anglais'],
  prefererBlocs2hMemeJour: true,
  respecterPauseMidiBlocs: true,
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
  subjectBlockRules: [],
  maxHeuresParJourParMatiere: {},
  maxHeuresParJourParMatiereNiveau: {},
  maxHeuresParJourParMatiereClasse: {},
  relaxedMode: false,
  disabledOverages: [],
  interdireTousDepassements: false,
};

export type LogSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'BOTTLENECK';

export interface GenerationLogEntry {
  id: string;
  timestamp: number;
  phase: 'INIT' | 'PHASE_A' | 'PHASE_B' | 'RELAX' | 'SUMMARY';
  severity: LogSeverity;
  message: string;
  details?: string;
  entityId?: string;
  entityName?: string;
  bottleneckType?:
    | 'TEACHER_DISPO'
    | 'TEACHER_MAX_HOURS'
    | 'CLASS_COLLISION'
    | 'BLOCK_CONSTRAINT'
    | 'LUNCH_BREAK'
    | 'FORBIDDEN_SLOT'
    | 'ROOM_OR_QUOTA';
  actionLabel?: string;
  actionPatch?: Partial<SolverConfig>;
}

export interface GenerationBottleneck {
  id: string;
  matiere: string;
  teacherNom: string;
  classesNoms: string[];
  missingHours: number;
  bottleneckType: string;
  primaryCause: string;
  diagnosticExplanation: string;
  suggestedSolution: string;
  patch?: Partial<SolverConfig>;
}

export interface SolverProgress {
  phase: 'A' | 'B';
  percent: number; // 0..100
  message: string;
  elapsedMs: number;
  currentScore?: number;
  phaseADurationMs?: number;
  recentLogs?: GenerationLogEntry[];
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
  logs?: GenerationLogEntry[];
  bottlenecks?: GenerationBottleneck[];
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
