/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { buildOfficialSampleDataset } from '../sampleData';
import {
  downloadAllClassesBookletPDF,
  downloadAllTeachersBookletPDF,
  downloadAscMatrixPDF,
  downloadClassTimetablePDF,
  downloadTeacherTimetablePDF,
  triggerSafeBrowserPrint,
} from '../pdfExportService';

describe('Service d\'export PDF au format Paysage (A4 Landscape)', () => {
  const dataset = buildOfficialSampleDataset(true);
  const planning = dataset.planning || [];

  it('génère sans erreur le PDF paysage d\'une classe', () => {
    const classId = dataset.classes[0].id;
    expect(() => {
      downloadClassTimetablePDF(dataset, planning, classId);
    }).not.toThrow();
  });

  it('génère sans erreur le PDF paysage d\'un enseignant', () => {
    const teacherId = dataset.teachers[0].id;
    expect(() => {
      downloadTeacherTimetablePDF(dataset, planning, teacherId);
    }).not.toThrow();
  });

  it('génère le livret complet multi-pages de toutes les classes en paysage', () => {
    expect(() => {
      downloadAllClassesBookletPDF(dataset, planning);
    }).not.toThrow();
  });

  it('génère le livret complet de tous les professeurs en paysage', () => {
    expect(() => {
      downloadAllTeachersBookletPDF(dataset, planning);
    }).not.toThrow();
  });

  it('génère la matrice aSc Horaires (12 classes x 32 créneaux) en PDF paysage', () => {
    expect(() => {
      downloadAscMatrixPDF(dataset, planning);
    }).not.toThrow();
  });

  it('triggerSafeBrowserPrint gère l\'absence ou la présence de window.print de manière sûre', () => {
    const result = triggerSafeBrowserPrint();
    expect(typeof result.success).toBe('boolean');
  });
});
