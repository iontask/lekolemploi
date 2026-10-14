/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImportDataset } from '../types';
import { generateAuditReport } from '../services/excelParser';
import { DEFAULT_MAPPING_CONFIG } from '../services/db';

export interface ProjectExportFormat {
  app: string;
  version: string;
  exportedAt: string;
  project: ImportDataset;
}

/**
 * Exporte un projet complet sous forme de fichier JSON téléchargeable
 */
export function exportProjectToJson(dataset: ImportDataset): void {
  const exportData: ProjectExportFormat = {
    app: 'EmploiDuTemps-Pro',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    project: dataset,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const cleanName = (dataset.fileName || 'Projet_Emploi_du_Temps')
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${cleanName}_${dateStr}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Analyse et valide un fichier JSON importé
 */
export async function parseProjectFromJson(file: File): Promise<ImportDataset> {
  const text = await file.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('Le fichier sélectionné n\'est pas un document JSON valide.');
  }

  // Accepte soit le wrapper { project: ... } soit directement l'objet ImportDataset
  const rawProject = parsed.project || parsed;

  if (!rawProject || typeof rawProject !== 'object') {
    throw new Error('Format de projet invalide : contenu vide ou non structuré.');
  }

  if (!Array.isArray(rawProject.teachers) || rawProject.teachers.length === 0) {
    throw new Error('Le projet JSON ne contient aucune donnée d\'enseignants valide.');
  }

  if (!Array.isArray(rawProject.classes) || rawProject.classes.length === 0) {
    throw new Error('Le projet JSON ne contient aucune donnée de classes valide.');
  }

  if (!Array.isArray(rawProject.unites)) {
    throw new Error('Le projet JSON ne contient aucune unité d\'enseignement valide.');
  }

  const semaine = rawProject.semaine || DEFAULT_MAPPING_CONFIG.semaine;
  const config = rawProject.config || DEFAULT_MAPPING_CONFIG;

  // Régénérer ou compléter le rapport d'audit si absent
  const report =
    rawProject.report && typeof rawProject.report.totalHeures === 'number'
      ? rawProject.report
      : generateAuditReport(rawProject.teachers, rawProject.classes, rawProject.unites, semaine);

  const dataset: ImportDataset = {
    id: rawProject.id ? `ds_imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` : `ds_${Date.now()}`,
    fileName: file.name.replace(/\.json$/i, ''),
    importedAt: new Date().toISOString(),
    semaine,
    config,
    teachers: rawProject.teachers,
    classes: rawProject.classes,
    unites: rawProject.unites,
    planning: Array.isArray(rawProject.planning) ? rawProject.planning : undefined,
    constraints: rawProject.constraints || undefined,
    scenarios: Array.isArray(rawProject.scenarios) ? rawProject.scenarios : undefined,
    solverResult: rawProject.solverResult || undefined,
    report,
  };

  return dataset;
}
