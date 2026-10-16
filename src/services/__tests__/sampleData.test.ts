/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  SAMPLE_PRESETS,
  buildAscTimetableSampleDataset,
  buildOfficialSampleDataset,
} from '../sampleData';
import { getUnassignedSessionsForEntity } from '../../utils/dndRulesHelper';

describe('Jeu de données exemples & Presets (aSc Timetables et Modèle officiel)', () => {
  it('charge correctement l\'emploi du temps réel aSc Timetables (Minha Escola, 384h)', () => {
    const dataset = buildAscTimetableSampleDataset(true);

    expect(dataset.classes).toHaveLength(12);
    expect(dataset.teachers).toHaveLength(29);
    expect(dataset.unites.length).toBeGreaterThan(0);

    const totalHours = dataset.unites.reduce((acc, u) => acc + u.heures, 0);
    expect(totalHours).toBe(381);

    expect(dataset.planning).toBeDefined();
    expect(dataset.planning!.length).toBe(381);

    // Vérifier que le rapport d'audit est généré
    expect(dataset.report).toBeDefined();
    expect(dataset.report?.totalClasses).toBe(12);
    expect(dataset.report?.totalProfs).toBe(29);

    // Vérifier les séances non affectées dans le bac pour une classe
    const firstClass = dataset.classes[0];
    const unassigned = getUnassignedSessionsForEntity(
      dataset,
      dataset.planning!,
      { type: 'class', id: firstClass.id }
    );
    expect(Array.isArray(unassigned)).toBe(true);
  });

  it('charge correctement la version vierge aSc Timetables sans planning', () => {
    const dataset = buildAscTimetableSampleDataset(false);
    expect(dataset.planning).toEqual([]);
    expect(dataset.classes).toHaveLength(12);
    expect(dataset.teachers).toHaveLength(29);
  });

  it('charge le modèle de référence officiel 360h avec planning complet', () => {
    const dataset = buildOfficialSampleDataset(true);
    expect(dataset.classes).toHaveLength(12);
    expect(dataset.teachers).toHaveLength(28);

    const totalHours = dataset.unites.reduce((acc, u) => acc + u.heures, 0);
    expect(totalHours).toBe(360);
    expect(dataset.planning!.length).toBe(360);
  });

  it('tous les SAMPLE_PRESETS se chargent sans erreur et ont des métadonnées cohérentes', () => {
    expect(SAMPLE_PRESETS.length).toBeGreaterThanOrEqual(4);

    for (const preset of SAMPLE_PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.badge).toBeTruthy();
      expect(preset.totalHours).toBeGreaterThan(0);
      expect(preset.classesCount).toBe(12);
      expect(preset.teachersCount).toBeGreaterThanOrEqual(28);

      const loaded = preset.load();
      expect(loaded).toBeDefined();
      expect(loaded.classes.length).toBe(preset.classesCount);
      expect(loaded.teachers.length).toBe(preset.teachersCount);
      if (preset.hasPlanning) {
        expect(loaded.planning!.length).toBe(preset.plannedHours);
      } else {
        expect(loaded.planning).toHaveLength(0);
      }
    }
  });
});
