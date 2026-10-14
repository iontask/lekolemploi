/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Teacher {
  id: string;
  num?: number | string;
  nom: string;
  prenom?: string;
  matiere: string;
  dispo: boolean[]; // Grille booléenne des créneaux (ex: 32 créneaux)
}

export interface Classe {
  id: string;
  nom: string;
  niveau: string; // Extrait ou calculé (ex: 1APIC, 2APIC, 3APIC, TCSF, 1BAC, 2BAC)
  colIndex?: number;
}

export interface Unite {
  id: string;
  teacherId: string;
  classeIds: string[]; // Plusieurs IDs si cours commun (cellules fusionnées)
  heures: number;
  estCommun?: boolean;
}

export interface Semaine {
  jours: string[]; // ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"]
  creneauxParJour: number[]; // [7, 7, 7, 7, 4]
}

export interface MappingConfig {
  sheetName?: string;
  headerRowClasses: number; // Ligne 2 par défaut
  teacherStartRow: number; // Ligne 3 par défaut
  teacherEndRow: number; // Ligne 30 par défaut
  colNum: string; // 'A'
  colMatiere: string; // 'B'
  colNom: string; // 'C'
  colPrenom: string; // 'D'
  colCreneauxStart: string; // 'E'
  colCreneauxEnd: string; // 'AJ'
  colClassesStart: string; // 'AK'
  colClassesEnd: string; // 'AV'
  semaine: Semaine;
  colorAvailableHex: string; // 'FFFFFF00' (jaune)
  colorUnavailableHex: string; // 'FFFF0000' (rouge)
  detectNumericFallback: boolean; // Si 1/0 est présent dans les cellules
}

export interface TeacherStats {
  teacher: Teacher;
  totalHeures: number;
  creneauxDispo: number;
  marge: number; // creneauxDispo - totalHeures
  unitesCount: number;
  hasOverload: boolean; // marge < 0
  isTight: boolean; // marge === 0 || marge === 1
}

export interface ClasseStats {
  classe: Classe;
  totalHeures: number;
  heuresCommunes: number;
  unitesCount: number;
  isOverCapacity: boolean; // totalHeures > totalCreneauxSemaine
}

export interface AuditReport {
  totalProfs: number;
  totalClasses: number;
  totalHeures: number;
  totalUnites: number;
  totalUnitesCommunes: number;
  totalCreneauxSemaine: number;
  profsEnSurcharge: TeacherStats[];
  profsTension: TeacherStats[];
  profsSansHeures: TeacherStats[];
  classesEnDepassement: ClasseStats[];
  avertissements: string[];
}

export interface ImportDataset {
  id: string;
  importedAt: string;
  fileName: string;
  semaine: Semaine;
  config: MappingConfig;
  teachers: Teacher[];
  classes: Classe[];
  unites: Unite[];
  report: AuditReport;
  planning?: { uniteId: string; slot: number }[];
  solverResult?: any;
  constraints?: import('../rules/types').RulesOptions;
  scenarios?: import('./scenarios').ScheduleScenario[];
}
