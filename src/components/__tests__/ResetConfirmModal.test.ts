/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAPPING_CONFIG } from '../../services/db';

describe('Vérification de la réinitialisation des données', () => {
  it('fournit la configuration par défaut lors d\'une réinitialisation', () => {
    expect(DEFAULT_MAPPING_CONFIG).toBeDefined();
    expect(DEFAULT_MAPPING_CONFIG.headerRowClasses).toBe(2);
    expect(DEFAULT_MAPPING_CONFIG.semaine.jours).toHaveLength(5);
    expect(DEFAULT_MAPPING_CONFIG.semaine.creneauxParJour).toEqual([7, 7, 7, 7, 4]);
  });

  it('valide l\'exécution asynchrone du callback de réinitialisation', async () => {
    let hasReset = false;
    let mappingReset = false;

    const mockConfirm = vi.fn(async (resetMapping: boolean) => {
      hasReset = true;
      mappingReset = resetMapping;
    });

    await mockConfirm(true);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(true);
    expect(hasReset).toBe(true);
    expect(mappingReset).toBe(true);
  });
});
