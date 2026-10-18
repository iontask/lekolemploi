/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  formatPartition,
  arePartitionsEqual,
  containsPartition,
  getStandard2hPartition,
  sortPartitionsForEducation,
} from '../BlockRulesMatrixGrid';
import { generatePossibleBlockPartitions, findMatchingBlockRule } from '../../rules';
import { SubjectLevelBlockRule } from '../../rules/types';

describe('BlockRulesMatrixGrid - Fonctions utilitaires et partitions', () => {
  it('formatPartition formate correctement les listes d heures', () => {
    expect(formatPartition([3, 2, 2])).toBe('3h + 2h + 2h');
    expect(formatPartition([2, 2, 2, 1])).toBe('2h + 2h + 2h + 1h');
    expect(formatPartition([2])).toBe('2h');
  });

  it('arePartitionsEqual compare deux partitions ordonnées', () => {
    expect(arePartitionsEqual([3, 3, 1], [3, 3, 1])).toBe(true);
    expect(arePartitionsEqual([3, 2, 2], [3, 3, 1])).toBe(false);
    expect(arePartitionsEqual([2, 2], [2, 2, 1])).toBe(false);
  });

  it('containsPartition vérifie la présence d une partition dans une liste', () => {
    const list = [
      [2, 2, 2, 1],
      [3, 3, 1],
      [3, 2, 2],
    ];
    expect(containsPartition(list, [3, 3, 1])).toBe(true);
    expect(containsPartition(list, [3, 2, 1, 1])).toBe(false);
  });

  it('getStandard2hPartition produit le découpage en blocs de 2h avec reliquat éventuel de 1h', () => {
    expect(getStandard2hPartition(7)).toEqual([2, 2, 2, 1]);
    expect(getStandard2hPartition(6)).toEqual([2, 2, 2]);
    expect(getStandard2hPartition(5)).toEqual([2, 2, 1]);
    expect(getStandard2hPartition(4)).toEqual([2, 2]);
    expect(getStandard2hPartition(3)).toEqual([2, 1]);
    expect(getStandard2hPartition(2)).toEqual([2]);
    expect(getStandard2hPartition(1)).toEqual([1]);
  });

  it('sortPartitionsForEducation trie les partitions en plaçant les découpages plus compacts en premier', () => {
    const parts7h = generatePossibleBlockPartitions(7, 3);
    const sorted = sortPartitionsForEducation(parts7h);
    // [3, 3, 1] ou [3, 2, 2] font 3 séances par semaine (les plus compactes)
    expect(sorted[0].length).toBe(3);
    expect(sorted[1].length).toBe(3);
    // Les découpages avec 1h isolée multiple (longueur 7) se retrouvent à la fin
    expect(sorted[sorted.length - 1]).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('valide la correspondance des règles générées par la grille avec findMatchingBlockRule', () => {
    const regleMaths2Bac: SubjectLevelBlockRule = {
      id: 'rule_Maths_2BAC_7h',
      matiere: 'Mathématiques',
      niveau: '2BAC',
      heuresHebdo: 7,
      possibilites: [
        [2, 2, 2, 1],
        [3, 3, 1],
        [3, 2, 2],
      ],
      actif: true,
    };

    const rules = [regleMaths2Bac];
    const match = findMatchingBlockRule('Mathématiques', '2BAC', 7, rules);
    expect(match).toBeDefined();
    expect(match?.id).toBe('rule_Maths_2BAC_7h');
    expect(match?.possibilites).toHaveLength(3);

    // Une autre matière ou niveau ne doit pas matcher cette règle
    const matchPC = findMatchingBlockRule('Physique-Chimie', '2BAC', 7, rules);
    expect(matchPC).toBeUndefined();

    const matchMaths1Bac = findMatchingBlockRule('Mathématiques', '1BAC', 6, rules);
    expect(matchMaths1Bac).toBeUndefined();
  });
});
