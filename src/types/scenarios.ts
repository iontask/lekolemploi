/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImportDataset, Teacher, Classe } from './index';
import { Planning, RulesOptions, ScoreBreakdown } from '../rules/types';
import { SolverResult } from '../solver/types';

export interface PartialLevelWarning {
  teacherId: string;
  teacherNom: string;
  matiere: string;
  niveau: string;
  classesEnseignees: string[]; // Noms des classes enseignées
  totalClassesNiveau: number;
  totalClassesNoms: string[];
  heuresEnseignees: number;
  isPartial: boolean;
  message: string;
}

export interface InfeasibilityDiagnostic {
  canSolve: boolean;
  severity: 'OK' | 'TIGHT' | 'CRITICAL';
  summaryLabel: string;
  profsOverloaded: {
    teacherId: string;
    teacherNom: string;
    matiere: string;
    totalHeures: number;
    dispos: number;
    diff: number;
    message: string;
  }[];
  classesOverloaded: {
    classeId: string;
    classeNom: string;
    totalHeures: number;
    capacity: number;
    diff: number;
    message: string;
  }[];
  profsTight: {
    teacherId: string;
    teacherNom: string;
    matiere: string;
    totalHeures: number;
    dispos: number;
    marge: number;
    message: string;
  }[];
  profsExceedCeiling: {
    teacherId: string;
    teacherNom: string;
    matiere: string;
    totalHeures: number;
    plafond: number;
    diff: number;
    message: string;
  }[];
  partialLevelWarnings: PartialLevelWarning[];
  detailedReports: string[];
  recommendedRelaxations: string[];
}

export interface ScheduleScenario {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  dataset: ImportDataset;
  planning: Planning;
  constraints: RulesOptions;
  solverResult?: SolverResult | null;
  score?: ScoreBreakdown | null;
}
