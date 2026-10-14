/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import referenceData from '../../data/referencePlanning360.json';
import { parseProjectFromJson } from '../projectJsonIO';
import { ImportDataset } from '../../types';

describe('projectJsonIO - Import / Export JSON', () => {
  const dataset = referenceData.dataset as unknown as ImportDataset;

  it('valide et importe correctement un fichier JSON de projet complet', async () => {
    const jsonContent = JSON.stringify({
      app: 'EmploiDuTemps-Pro',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      project: dataset,
    });

    const file = new File([jsonContent], 'Projet_Test.json', { type: 'application/json' });
    const imported = await parseProjectFromJson(file);

    expect(imported).toBeDefined();
    expect(imported.teachers).toHaveLength(28);
    expect(imported.classes).toHaveLength(12);
    expect(imported.unites).toHaveLength(110);
    expect(imported.fileName).toBe('Projet_Test');
  });

  it('rejette un fichier JSON invalide ou corrompu', async () => {
    const invalidFile = new File(['{"invalid": true}'], 'Corrupted.json', {
      type: 'application/json',
    });

    await expect(parseProjectFromJson(invalidFile)).rejects.toThrow(
      'Le projet JSON ne contient aucune donnée d\'enseignants valide'
    );
  });
});
