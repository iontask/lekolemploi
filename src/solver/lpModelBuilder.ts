/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, Teacher, Unite } from '../types';
import {
  areSlotsConsecutiveWithoutPause,
  findMatchingBlockRule,
  getSlotCoordinates,
  getSubjectDailyLimit,
  isBlockSubject,
  isOverageDisabledForUnit,
} from '../rules';
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

  // Contrainte 1 : Somme sur s de x[u, s] + miss_u = h pour chaque unité (Goal Programming / Slack)
  for (let uIdx = 0; uIdx < unites.length; uIdx++) {
    const unite = unites[uIdx];
    const validSlots = validSlotsPerUnit.get(uIdx) || [];
    const sumTerms = validSlots.map((s) => xVarName(uIdx, s)).join(' + ');
    const missVar = `miss_u${uIdx}`;
    allGenerals.push(missVar);
    bounds.push(`0 <= ${missVar} <= ${unite.heures}`);
    objTerms.push(`100000 ${missVar}`);

    if (sumTerms.length > 0) {
      constraints.push(`quota_u${uIdx}: ${sumTerms} + ${missVar} = ${unite.heures}`);
    } else {
      constraints.push(`quota_u${uIdx}: ${missVar} = ${unite.heures}`);
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

    const classesNiveauxList = unite.classeIds
      .map((cid) => classMap.get(cid)?.niveau)
      .filter(Boolean) as string[];
    const subjectLimit = getSubjectDailyLimit(
      prof.matiere,
      unite.classeIds,
      classesNiveauxList,
      config
    );

    // Somme des z = h modulo 2
    // En mode relâché, ou si la matière autorise 3h/jour, ou si toutesMatieresABlocs est désactivé,
    // on n'impose pas une égalité stricte z = h % 2 afin d'éviter l'infaisabilité MIP.
    const zTarget = unite.heures % 2;
    if (zVarsForUnit.length > 0 && !config.relaxedMode && subjectLimit !== 3 && config.toutesMatieresABlocs !== false) {
      constraints.push(`z_sum_u${uIdx}: ${zVarsForUnit.join(' + ')} = ${zTarget}`);
    }

    if (subjectLimit === 1) {
      // Pour une matière limitée à 1h par séance/jour, pas de blocs de 2h
      continue;
    }

    const classesNiveaux = unite.classeIds
      .map((cid) => classMap.get(cid)?.niveau || '')
      .filter(Boolean)
      .join(' / ');
    const matchingRule = findMatchingBlockRule(
      prof.matiere,
      classesNiveaux,
      unite.heures,
      config.subjectBlockRules,
      unite.classeIds[0]
    );

    const maxDurForUnit =
      matchingRule && matchingRule.possibilites.length > 0
        ? Math.min(3, Math.max(1, ...matchingRule.possibilites.map((p) => Math.max(...p))))
        : subjectLimit;

    // Au plus maxDurForUnit h par jour (dur pour matière à blocs sauf en mode relâché)
    if (!config.relaxedMode) {
      for (let j = 0; j < semaine.jours.length; j++) {
        const daySlots = validSlots.filter((s) => getSlotCoordinates(s, semaine).jourIndex === j);
        if (daySlots.length > maxDurForUnit) {
          const dayXTerms = daySlots.map((s) => xVarName(uIdx, s)).join(' + ');
          constraints.push(`max_dur_u${uIdx}_j${j}: ${dayXTerms} <= ${maxDurForUnit}`);
        }
      }
    }
  }

  // Contraintes souples :
  // (A) Dépassement de maxDur/jour : sum(s in j) x[u, s] - e[u, j] <= maxDur
  // (B) Heures non consécutives : pour tout triplet s1 < k < s2 le même jour,
  //     x[u, s1] - x[u, k] + x[u, s2] - nc[u, j] <= 1
  for (let uIdx = 0; uIdx < unites.length; uIdx++) {
    const validSlots = validSlotsPerUnit.get(uIdx) || [];
    const unitProf = teacherMap.get(unites[uIdx].teacherId);
    const uClassesNiveauxList = unites[uIdx].classeIds
      .map((cid) => classMap.get(cid)?.niveau)
      .filter(Boolean) as string[];
    const uClassesNiveaux = uClassesNiveauxList.join(' / ');
    const uMatchingRule = unitProf
      ? findMatchingBlockRule(
          unitProf.matiere,
          uClassesNiveaux,
          unites[uIdx].heures,
          config.subjectBlockRules,
          unites[uIdx].classeIds[0]
        )
      : undefined;
    const uSubjectLimit = unitProf
      ? getSubjectDailyLimit(
          unitProf.matiere,
          unites[uIdx].classeIds,
          uClassesNiveauxList,
          config
        )
      : (config.maxHeuresParJourUnite ?? 2);
    const uMaxDur =
      uMatchingRule && uMatchingRule.possibilites.length > 0
        ? Math.min(3, Math.max(1, ...uMatchingRule.possibilites.map((p) => Math.max(...p))))
        : uSubjectLimit;

    for (let j = 0; j < semaine.jours.length; j++) {
      const daySlots = validSlots.filter((s) => getSlotCoordinates(s, semaine).jourIndex === j);
      const isOverDisabled = isOverageDisabledForUnit(unites[uIdx].id, j, config);
      const effectiveMaxDur = isOverDisabled ? Math.min(2, uMaxDur) : uMaxDur;

      if (daySlots.length > effectiveMaxDur) {
        const dayXTerms = daySlots.map((s) => xVarName(uIdx, s)).join(' + ');
        if (isOverDisabled) {
          // CONTRAINTE DURE (Reverse Dépassement) : Interdiction stricte de dépasser
          constraints.push(`hard_no_excess_u${uIdx}_j${j}: ${dayXTerms} <= ${effectiveMaxDur}`);
          bounds.push(`${eVarName(uIdx, j)} = 0`);
        } else {
          constraints.push(`soft_excess_u${uIdx}_j${j}: ${dayXTerms} - ${eVarName(uIdx, j)} <= ${effectiveMaxDur}`);
        }
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

  // 5. Contraintes spécifiques enseignants (Anti-1h demi-journée & Regroupement / Anti-trous)
  const profsEviter1hList = config.profsEviter1hDemiJournee || [];
  const profsAntiTrousList = config.profsRegrouperHeuresAntiTrous || [];

  if (profsEviter1hList.length > 0 || profsAntiTrousList.length > 0) {
    const profsEviter1hSet = new Set(profsEviter1hList);
    const profsAntiTrousSet = new Set(profsAntiTrousList);

    for (let pIdx = 0; pIdx < teachers.length; pIdx++) {
      const prof = teachers[pIdx];
      const checkEviter1h = profsEviter1hSet.has(prof.id);
      const checkAntiTrous = profsAntiTrousSet.has(prof.id);
      if (!checkEviter1h && !checkAntiTrous) continue;

      // Unités associées à cet enseignant
      const profUnitIndices: number[] = [];
      for (let uIdx = 0; uIdx < unites.length; uIdx++) {
        if (unites[uIdx].teacherId === prof.id) {
          profUnitIndices.push(uIdx);
        }
      }
      if (profUnitIndices.length === 0) continue;

      // Pour chaque créneau s, les variables associées à ce prof : sum_{u of prof} x[u, s]
      const profXTermsForSlot = (s: number): string[] => {
        const terms: string[] = [];
        for (const uIdx of profUnitIndices) {
          const vs = validSlotsPerUnit.get(uIdx) || [];
          if (vs.includes(s)) {
            terms.push(xVarName(uIdx, s));
          }
        }
        return terms;
      };

      for (let j = 0; j < semaine.jours.length; j++) {
        const totalSlotsOnDay = semaine.creneauxParJour[j] || 7;
        const daySlotIndices: number[] = [];
        for (let s = 0; s < totalSlots; s++) {
          if (getSlotCoordinates(s, semaine).jourIndex === j) {
            daySlotIndices.push(s);
          }
        }

        // (5.A) Éviter 1h isolée en demi-journée (Matin et Après-midi)
        // Formulation Goal Programming avec variable de pénalité slack pour garantir la faisabilité
        // tout en éliminant impérativement les venues pour 1h isolée
        if (checkEviter1h) {
          const matinSlots = daySlotIndices.filter((s) => getSlotCoordinates(s, semaine).rangHeure < 4);
          const apremSlots =
            totalSlotsOnDay > 4
              ? daySlotIndices.filter((s) => getSlotCoordinates(s, semaine).rangHeure >= 4)
              : [];

          const halfDays = [
            { id: 'matin', slots: matinSlots },
            { id: 'aprem', slots: apremSlots },
          ].filter((hd) => hd.slots.length > 0);

          for (const hd of halfDays) {
            const allTerms: string[] = [];
            for (const s of hd.slots) {
              allTerms.push(...profXTermsForSlot(s));
            }

            if (allTerms.length === 1) {
              // Si 1 seule heure possible dans la demi-journée, pénalité forte de 4000
              const slack = `slack_1h_p${pIdx}_j${j}_${hd.id}`;
              allGenerals.push(slack);
              bounds.push(`0 <= ${slack} <= 1`);
              objTerms.push(`4000 ${slack}`);
              constraints.push(`no_single_1h_p${pIdx}_j${j}_${hd.id}: ${allTerms[0]} - ${slack} <= 0`);
            } else if (allTerms.length >= 2) {
              const yVar = `y_p${pIdx}_j${j}_${hd.id}`;
              allBinaries.push(yVar);

              // yVar = 1 si au moins un créneau est occupé dans la demi-journée
              constraints.push(
                `min2h_upper_p${pIdx}_j${j}_${hd.id}: ${allTerms.join(' + ')} - ${hd.slots.length} ${yVar} <= 0`
              );

              // Minimum 2h si présent : sum - 2 yVar + slack >= 0
              // Slack a un coût très dissuasif de 4000 (1500 en mode relâché) pour interdire 1h isolée
              const slack = `slack_1h_p${pIdx}_j${j}_${hd.id}`;
              allGenerals.push(slack);
              bounds.push(`0 <= ${slack} <= 1`);
              const penalty1h = config.relaxedMode ? 3500 : 16000;
              objTerms.push(`${penalty1h} ${slack}`);
              constraints.push(
                `min2h_lower_p${pIdx}_j${j}_${hd.id}: ${allTerms.join(' + ')} - 2 ${yVar} + ${slack} >= 0`
              );
            }
          }
        }

        // (5.B) Regrouper les heures au plus et éviter les trous le même jour
        if (checkAntiTrous && daySlotIndices.length >= 2) {
          const activeSlots = daySlotIndices.filter((s) => profXTermsForSlot(s).length > 0);
          if (activeSlots.length >= 2) {
            for (let i = 0; i < activeSlots.length; i++) {
              for (let k = i + 1; k < activeSlots.length; k++) {
                const s1 = activeSlots[i];
                const s2 = activeSlots[k];
                const r1 = getSlotCoordinates(s1, semaine).rangHeure;
                const r2 = getSlotCoordinates(s2, semaine).rangHeure;
                if (r2 - r1 <= 1) continue; // Pas de trou si créneaux consécutifs

                const terms1 = profXTermsForSlot(s1);
                const terms2 = profXTermsForSlot(s2);
                if (terms1.length === 0 || terms2.length === 0) continue;

                // Pour chaque créneau mid situé entre s1 et s2 sur la même journée
                for (let mid = s1 + 1; mid < s2; mid++) {
                  if (getSlotCoordinates(mid, semaine).jourIndex !== j) continue;

                  const termsMid = profXTermsForSlot(mid);
                  const trouVar = `trou_p${pIdx}_j${j}_s${s1}_${mid}_${s2}`;
                  allBinaries.push(trouVar);
                  const penaltyTrou = config.relaxedMode ? 2500 : 12000;
                  objTerms.push(`${penaltyTrou} ${trouVar}`);

                  const posPart = [...terms1, ...terms2].join(' + ');
                  if (termsMid.length > 0) {
                    const negPart = termsMid.map((t) => `- ${t}`).join(' ');
                    constraints.push(`anti_trou_p${pIdx}_j${j}_${s1}_${mid}_${s2}: ${posPart} ${negPart} - ${trouVar} <= 1`);
                  } else {
                    // Si aucune unité n'est possible à mid, mid est FORCÉMENT un créneau creux si s1 et s2 sont affectés
                    constraints.push(`anti_trou_p${pIdx}_j${j}_${s1}_${mid}_${s2}: ${posPart} - ${trouVar} <= 1`);
                  }
                }
              }
            }
          }
        }

        // (5.C) Rassembler les cours sur un minimum de jours (Minimiser les jours de déplacement)
        const allDayTerms: string[] = [];
        for (const s of daySlotIndices) {
          allDayTerms.push(...profXTermsForSlot(s));
        }
        if (allDayTerms.length > 0) {
          const dayActiveVar = `dayact_p${pIdx}_j${j}`;
          allBinaries.push(dayActiveVar);
          const dayCost = config.relaxedMode ? 250 : 500;
          objTerms.push(`${dayCost} ${dayActiveVar}`);
          constraints.push(
            `prof_day_act_p${pIdx}_j${j}: ${allDayTerms.join(' + ')} - ${daySlotIndices.length} ${dayActiveVar} <= 0`
          );
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
