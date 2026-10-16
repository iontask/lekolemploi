/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  extractUnplacedUnitsDetails,
  getAIConstraintRecommendations,
} from '../aiRecommendations';
import { ImportDataset, Semaine, Teacher, Classe, Unite } from '../../types';
import { Planning, RulesOptions } from '../../rules/types';
import { solvePhaseAWithDiagnostics } from '../../solver/phaseA';
import { DEFAULT_SOLVER_CONFIG } from '../../solver/types';

describe('Service Recommandations IA pour 100 % d\'insertion', () => {
  const semaineStandard: Semaine = {
    jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    creneauxParJour: [7, 7, 7, 7, 4],
  };

  const profMath: Teacher = {
    id: 'p_math',
    nom: 'ALAMI Karim',
    matiere: 'Mathématiques',
    dispo: new Array(32).fill(true),
  };

  const profPhysique: Teacher = {
    id: 'p_phys',
    nom: 'BENNANI Sara',
    matiere: 'Physique-Chimie',
    dispo: new Array(32).fill(true),
  };

  const classe1: Classe = { id: 'c_1', nom: '1APIC-1', niveau: '1APIC' };

  const uniteMath: Unite = {
    id: 'u_math',
    teacherId: profMath.id,
    classeIds: [classe1.id],
    heures: 7,
    estCommun: false,
  };

  const unitePhysique: Unite = {
    id: 'u_phys',
    teacherId: profPhysique.id,
    classeIds: [classe1.id],
    heures: 4,
    estCommun: false,
  };

  const datasetSample = {
    id: 'test_dataset',
    fileName: 'test.xlsx',
    importedAt: new Date().toISOString(),
    teachers: [profMath, profPhysique],
    classes: [classe1],
    unites: [uniteMath, unitePhysique],
    semaine: semaineStandard,
  } as unknown as ImportDataset;

  it('détecte correctement un taux d\'insertion de 100% quand toutes les heures sont placées', () => {
    // 7h de math + 4h de physique = 11h
    const fullPlanning: Planning = [
      ...Array.from({ length: 7 }, (_, i) => ({ uniteId: 'u_math', slot: i })),
      ...Array.from({ length: 4 }, (_, i) => ({ uniteId: 'u_phys', slot: 10 + i })),
    ];

    const analysis = extractUnplacedUnitsDetails(datasetSample, fullPlanning);
    expect(analysis.totalRequiredHours).toBe(11);
    expect(analysis.placedHours).toBe(11);
    expect(analysis.missingHours).toBe(0);
    expect(analysis.insertionRate).toBe(100);
    expect(analysis.unplacedDetails).toHaveLength(0);
  });

  it('extrait avec précision les matières et heures non affectées', () => {
    // Seulement 4h de math placées sur 7h, et 2h de physique sur 4h
    const partialPlanning: Planning = [
      ...Array.from({ length: 4 }, (_, i) => ({ uniteId: 'u_math', slot: i })),
      ...Array.from({ length: 2 }, (_, i) => ({ uniteId: 'u_phys', slot: 10 + i })),
    ];

    const analysis = extractUnplacedUnitsDetails(datasetSample, partialPlanning);
    expect(analysis.totalRequiredHours).toBe(11);
    expect(analysis.placedHours).toBe(6);
    expect(analysis.missingHours).toBe(5);
    expect(analysis.insertionRate).toBe(55);
    expect(analysis.unplacedDetails).toHaveLength(2);

    const mathDetail = analysis.unplacedDetails.find((u) => u.matiere === 'Mathématiques');
    expect(mathDetail).toBeDefined();
    expect(mathDetail?.heuresRequises).toBe(7);
    expect(mathDetail?.heuresPlacees).toBe(4);
    expect(mathDetail?.heuresManquantes).toBe(3);
    expect(mathDetail?.profNom).toBe('ALAMI Karim');
  });

  it('génère des recommandations IA pour relâcher les contraintes avec objectif 100%', async () => {
    const partialPlanning: Planning = [
      ...Array.from({ length: 4 }, (_, i) => ({ uniteId: 'u_math', slot: i })),
    ];

    const currentConstraints: RulesOptions = {
      toutesMatieresABlocs: true,
      maxHeuresParJourUnite: 2,
      maxHeuresParJourProf: 6,
      respecterPauseMidiBlocs: true,
      maxHeuresParJourParMatiere: {
        'Mathématiques': 2,
      },
    };

    const result = await getAIConstraintRecommendations({
      dataset: datasetSample,
      planning: partialPlanning,
      currentConstraints,
    });

    expect(result).toBeDefined();
    expect(result.predictedSuccessRate).toBe(100);
    expect(result.summary).toContain('100 %');
    expect(result.recommendations.length).toBeGreaterThan(0);

    // Vérifie qu'il y a une recommandation pour étendre la limite quotidienne de Mathématiques à 3h
    const blockRec = result.recommendations.find(
      (r) => r.category === 'BLOCKS' && r.title.includes('Mathématiques')
    );
    expect(blockRec).toBeDefined();
    expect(blockRec?.patch.maxHeuresParJourParMatiere?.['Mathématiques']).toBe(3);

    // Vérifie la recommandation de mode relâché
    const relaxedRec = result.recommendations.find((r) => r.category === 'RELAXED_MODE');
    expect(relaxedRec).toBeDefined();
    expect(relaxedRec?.patch.relaxedMode).toBe(true);
  });

  it('génère un journal d\'exécution structuré avec détection des goulots d\'étranglement', () => {
    // Données très contraintes avec prof à marge nulle
    const res = solvePhaseAWithDiagnostics(datasetSample, DEFAULT_SOLVER_CONFIG);

    expect(res).toBeDefined();
    expect(res.logs).toBeDefined();
    expect(res.logs.length).toBeGreaterThan(0);

    // Vérifier les phases et sévérités dans les logs
    const initLog = res.logs.find((l: any) => l.phase === 'INIT');
    expect(initLog).toBeDefined();
    expect(initLog?.severity).toBe('INFO');
  });

  it('augmente le pourcentage d\'insertion jusqu\'à 100 % lorsque les recommandations sont appliquées', () => {
    // Configuration relâchée issue d'une recommandation IA
    const relaxedConfig = {
      ...DEFAULT_SOLVER_CONFIG,
      relaxedMode: true,
      maxHeuresParJourParMatiere: {
        'Mathématiques': 3 as const,
      },
    };

    const res = solvePhaseAWithDiagnostics(datasetSample, relaxedConfig);

    // Vérifier que 100 % des heures (11h = 7h math + 4h physique) sont placées
    expect(res.planning.length).toBe(11);
    const analysis = extractUnplacedUnitsDetails(datasetSample, res.planning);
    expect(analysis.insertionRate).toBe(100);
    expect(analysis.missingHours).toBe(0);
  });
});
