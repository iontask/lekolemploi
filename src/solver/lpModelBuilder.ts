/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, Teacher, Unite } from '../types';
import { areSlotsConsecutiveWithoutPause, getSlotCoordinates, isBlockSubject } from '../rules';
import { Planning, ScheduleData } from '../rules/types';
import { SolverConfig } from './types';

export interface LpModelBuildResult {
  lpText: string;
  variableMap: Map<string, { uniteId: string; slot: number }>;
  variablesCount: number;
  constraintsCount: number;
}

/**
 * Construit le modèle linéaire en nombres entiers (MIP) au format CPLEX LP
 * pour le solveur HiGHS.
 */
export function buildLpModel(
  data: ScheduleData,
  config: SolverConfig,
  initialWarmStart?: Planning,
  lockedAssignments: Planning = []
): LpModelBuildResult {
  const { teachers, classes, unites, semaine } = data;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
  const classMap = new Map<string, Classe>(classes.map((c) => [c.id, c]));

  // Indexation des slots valides par unité (seulement si le prof est disponible)
  // x[u, s] est binaire
  const xVarName = (uIdx: number, s: number) => `x_u${uIdx}_s${s}`;
  const bVarName = (uIdx: number, s: number) => `b_u${uIdx}_s${s}`;
  const zVarName = (uIdx: number, s: number) => `z_u${uIdx}_s${s}`;
  const eVarName = (uIdx: number, j: number) => `e_u${uIdx}_j${j}`;
  const ncVarName = (uIdx: number, j: number) => `nc_u${uIdx}_j${j}`;

  const variableMap = new Map<string, { uniteId: string; slot: number }>();
  const allBinaries: string[] = [];
  const allGenerals: string[] = [];
  const bounds: string[] = [];

  // 1. Définition des variables x[u, s]
  // Définies UNIQUEMENT si le prof est disponible sur le créneau s
  const validSlotsPerUnit = new Map<number, number[]>();

  for (let uIdx = 0; uIdx < unites.length; uIdx++) {
    const unite = unites[uIdx];
    const prof = teacherMap.get(unite.teacherId);
    const validSlots: number[] = [];

    for (let s = 0; s < totalSlots; s++) {
      if (prof && prof.dispo[s]) {
        validSlots.push(s);
        const varName = xVarName(uIdx, s);
        allBinaries.push(varName);
        variableMap.set(varName, { uniteId: unite.id, slot: s });
      }
    }
    validSlotsPerUnit.set(uIdx, validSlots);
  }

  // 2. Définition de l'objectif (Minimize)
  // - Coût de compacité (1 * rangHeure + 0.3 * rangJour)
  // - Dépassement de 2h/jour (100 * e[u, j])
  // - Heures non consécutives (15 * nc[u, j])
  const objTerms: string[] = [];

  for (let uIdx = 0; uIdx < unites.length; uIdx++) {
    const validSlots = validSlotsPerUnit.get(uIdx) || [];
    for (const s of validSlots) {
      const coords = getSlotCoordinates(s, semaine);
      const cost =
        coords.rangHeure * config.coutRangHeure + coords.rangJour * config.coutRangJour;
      const roundedCost = Math.round(cost * 100) / 100;
      if (roundedCost > 0) {
        objTerms.push(`${roundedCost} ${xVarName(uIdx, s)}`);
      }
    }

    // Variables souples pour chaque jour
    for (let j = 0; j < semaine.jours.length; j++) {
      // Écart d'heures au-delà de 2h
      const eName = eVarName(uIdx, j);
      allGenerals.push(eName);
      bounds.push(`0 <= ${eName} <= 3`);
      objTerms.push(`${config.penaliteHeureExcParJour} ${eName}`);

      // Heures non consécutives
      const ncName = ncVarName(uIdx, j);
      allBinaries.push(ncName);
      objTerms.push(`${config.penaliteNonConsecutiveMemeJour} ${ncName}`);
    }
  }

  // 3. Contraintes (Subject To)
  const constraints: string[] = [];

  // Contrainte 1 : Somme sur s de x[u, s] = h pour chaque unité
  for (let uIdx = 0; uIdx < unites.length; uIdx++) {
    const unite = unites[uIdx];
    const validSlots = validSlotsPerUnit.get(uIdx) || [];
    const sumTerms = validSlots.map((s) => xVarName(uIdx, s)).join(' + ');
    if (sumTerms.length > 0) {
      constraints.push(`quota_u${uIdx}: ${sumTerms} = ${unite.heures}`);
    } else {
      constraints.push(`quota_u${uIdx}: 0 = ${unite.heures}`);
    }
  }

  // Contrainte 2 : Au plus une unité par prof et par créneau
  for (let s = 0; s < totalSlots; s++) {
    for (const prof of teachers) {
      const unitTerms: string[] = [];
      for (let uIdx = 0; uIdx < unites.length; uIdx++) {
        const unite = unites[uIdx];
        if (unite.teacherId === prof.id) {
          const validSlots = validSlotsPerUnit.get(uIdx) || [];
          if (validSlots.includes(s)) {
            unitTerms.push(xVarName(uIdx, s));
          }
        }
      }
      if (unitTerms.length > 1) {
        constraints.push(`prof_${prof.id}_s${s}: ${unitTerms.join(' + ')} <= 1`);
      }
    }
  }

  // Contrainte 3 : Au plus une unité par classe et par créneau
  // (Une unité commune occupe toutes ses classes)
  for (let s = 0; s < totalSlots; s++) {
    for (const cls of classes) {
      const classTerms: string[] = [];
      for (let uIdx = 0; uIdx < unites.length; uIdx++) {
        const unite = unites[uIdx];
        if (unite.classeIds.includes(cls.id)) {
          const validSlots = validSlotsPerUnit.get(uIdx) || [];
          if (validSlots.includes(s)) {
            classTerms.push(xVarName(uIdx, s));
          }
        }
      }
      if (classTerms.length > 1) {
        constraints.push(`class_${cls.id}_s${s}: ${classTerms.join(' + ')} <= 1`);
      }
    }
  }

  // Contrainte 4 : Matières à blocs (Arabe et Anglais)
  // - Variables b[u, s] (bloc de 2h commençant en s, seulement si s et s+1 sont le même jour et prof dispo)
  // - Variable z[u, s] (heure isolée)
  // - x[u, s] = b[u, s] + b[u, s-1] + z[u, s]
  // - Somme des z = h modulo 2
  // - Au plus 2h par jour (dur)
  for (let uIdx = 0; uIdx < unites.length; uIdx++) {
    const unite = unites[uIdx];
    const prof = teacherMap.get(unite.teacherId);
    if (!prof || !isBlockSubject(prof.matiere, config.matieresABlocs, config.toutesMatieresABlocs !== false)) {
      continue;
    }

    const validSlots = validSlotsPerUnit.get(uIdx) || [];
    const zVarsForUnit: string[] = [];

    // Identifier les créneaux où un bloc de 2h peut débuter (s et s+1 même jour sans franchir la pause)
    for (const s of validSlots) {
      const nextSlot = s + 1;
      const hasNextSlot = validSlots.includes(nextSlot);
      const canFormNextBlock = hasNextSlot && areSlotsConsecutiveWithoutPause(s, nextSlot, semaine);

      if (canFormNextBlock) {
        const bName = bVarName(uIdx, s);
        allBinaries.push(bName);
      }

      // Variable d'heure isolée z[u, s]
      const zName = zVarName(uIdx, s);
      allBinaries.push(zName);
      zVarsForUnit.push(zName);

      // Liaison : x[u, s] - b[u, s] - b[u, s-1] - z[u, s] = 0
      const prevSlot = s - 1;
      const prevHasBlock =
        s > 0 && validSlots.includes(prevSlot) && areSlotsConsecutiveWithoutPause(prevSlot, s, semaine);

      const linkTerms: string[] = [xVarName(uIdx, s)];
      // b[u, s] si existe
      if (canFormNextBlock) {
        linkTerms.push(`- ${bVarName(uIdx, s)}`);
      }
      // b[u, s-1] si existe
      if (prevHasBlock) {
        linkTerms.push(`- ${bVarName(uIdx, prevSlot)}`);
      }
      // z[u, s]
      linkTerms.push(`- ${zName}`);

      constraints.push(`link_block_u${uIdx}_s${s}: ${linkTerms.join(' ')} = 0`);
    }

    // Somme des z = h modulo 2
    const zTarget = unite.heures % 2;
    if (zVarsForUnit.length > 0) {
      constraints.push(`z_sum_u${uIdx}: ${zVarsForUnit.join(' + ')} = ${zTarget}`);
    }

    // Au plus 2h par jour (dur pour matière à blocs)
    for (let j = 0; j < semaine.jours.length; j++) {
      const daySlots = validSlots.filter((s) => getSlotCoordinates(s, semaine).jourIndex === j);
      if (daySlots.length > 2) {
        const dayXTerms = daySlots.map((s) => xVarName(uIdx, s)).join(' + ');
        constraints.push(`max2h_dur_u${uIdx}_j${j}: ${dayXTerms} <= 2`);
      }
    }
  }

  // Contraintes souples :
  // (A) Dépassement de 2h/jour : sum(s in j) x[u, s] - e[u, j] <= 2
  // (B) Heures non consécutives : pour tout triplet s1 < k < s2 le même jour,
  //     x[u, s1] - x[u, k] + x[u, s2] - nc[u, j] <= 1
  for (let uIdx = 0; uIdx < unites.length; uIdx++) {
    const validSlots = validSlotsPerUnit.get(uIdx) || [];

    for (let j = 0; j < semaine.jours.length; j++) {
      const daySlots = validSlots.filter((s) => getSlotCoordinates(s, semaine).jourIndex === j);

      if (daySlots.length > 2) {
        const dayXTerms = daySlots.map((s) => xVarName(uIdx, s)).join(' + ');
        constraints.push(`soft_excess_u${uIdx}_j${j}: ${dayXTerms} - ${eVarName(uIdx, j)} <= 2`);
      }

      // Non-consécutif : détection de trou
      if (daySlots.length >= 3) {
        for (let i = 0; i < daySlots.length; i++) {
          for (let m = i + 1; m < daySlots.length; m++) {
            for (let k = m + 1; k < daySlots.length; k++) {
              const s1 = daySlots[i];
              const mid = daySlots[m];
              const s2 = daySlots[k];
              // Triplet avec trou
              constraints.push(
                `soft_nonconsec_u${uIdx}_j${j}_${s1}_${mid}_${s2}: ${xVarName(uIdx, s1)} - ${xVarName(uIdx, mid)} + ${xVarName(uIdx, s2)} - ${ncVarName(uIdx, j)} <= 1`
              );
            }
          }
        }
      }
    }
  }

  // Fixation des cours verrouillés (x[u, s] = 1)
  for (const locked of lockedAssignments) {
    const uIdx = unites.findIndex((u) => u.id === locked.uniteId);
    if (uIdx >= 0) {
      constraints.push(`lock_u${uIdx}_s${locked.slot}: ${xVarName(uIdx, locked.slot)} = 1`);
    }
  }

  // Assemblage du fichier CPLEX LP
  const lpLines: string[] = [];
  lpLines.push('Minimize');
  lpLines.push(`  obj: ${objTerms.join(' + ')}`);
  lpLines.push('Subject To');
  for (const c of constraints) {
    lpLines.push(`  ${c}`);
  }

  if (bounds.length > 0) {
    lpLines.push('Bounds');
    for (const b of bounds) {
      lpLines.push(`  ${b}`);
    }
  }

  if (allBinaries.length > 0) {
    lpLines.push('Binary');
    // Groupement par lignes pour garder un format propre
    for (let i = 0; i < allBinaries.length; i += 15) {
      lpLines.push(`  ${allBinaries.slice(i, i + 15).join(' ')}`);
    }
  }

  if (allGenerals.length > 0) {
    lpLines.push('Generals');
    for (let i = 0; i < allGenerals.length; i += 15) {
      lpLines.push(`  ${allGenerals.slice(i, i + 15).join(' ')}`);
    }
  }

  lpLines.push('End');

  const lpText = lpLines.join('\n');

  return {
    lpText,
    variableMap,
    variablesCount: allBinaries.length + allGenerals.length,
    constraintsCount: constraints.length,
  };
}
