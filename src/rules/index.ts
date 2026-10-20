/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, Semaine, Teacher, Unite } from '../types';
import {
  Affectation,
  CanPlaceResult,
  Planning,
  RuleViolation,
  RulesOptions,
  ScheduleData,
  ScoreBreakdown,
  SubjectLevelBlockRule,
} from './types';

export * from './types';

export const DEFAULT_RULES_OPTIONS: Required<RulesOptions> = {
  toutesMatieresABlocs: true,
  respecterPauseMidiBlocs: true,
  matieresABlocs: ['Arabe', 'Anglais'],
  prefererBlocs2hMemeJour: true,
  maxHeuresParJourUnite: 2,
  maxHeuresParJourProf: 6,
  maxHeuresParJourClasse: 6,
  plafondHoraireProf: 24,
  penaliteHeureExcParJour: 100,
  penaliteNonConsecutiveMemeJour: 15,
  coutRangHeure: 1.0,
  coutRangJour: 0.3,
  reservedSlots: [],
  forbiddenSlotsClasses: [],
  forbiddenSlotsTeachers: [],
  subjectBlockRules: [],
  maxHeuresParJourParMatiere: {},
  maxHeuresParJourParMatiereNiveau: {},
  maxHeuresParJourParMatiereClasse: {},
  relaxedMode: false,
  disabledOverages: [],
  interdireTousDepassements: false,
  profsEviter1hDemiJournee: [],
  profsRegrouperHeuresAntiTrous: [],
};

/** Plages horaires standard de 1h chacune (7 créneaux lundi-jeudi, 4 créneaux vendredi) */
export const STANDARD_HOURS_LABELS = [
  '08h30 - 09h30',
  '09h30 - 10h30',
  '10h30 - 11h30',
  '11h30 - 12h30',
  '13h30 - 14h30',
  '14h30 - 15h30',
  '15h30 - 16h30',
];

export const LUNCH_PAUSE_LABEL = 'Pause méridienne (1h) · 12h30 - 13h30';

export function getSlotTimeRange(creneauIndex: number): string {
  return STANDARD_HOURS_LABELS[creneauIndex] || `C${creneauIndex + 1} (1h)`;
}

/**
 * Détermine le jour et le créneau horaire dans la journée pour un indice de slot global (0..N-1)
 */
export function getSlotCoordinates(
  slot: number,
  semaine: Semaine
): {
  jourIndex: number;
  jourNom: string;
  creneauIndex: number;
  creneauNumero: number;
  creneauHoraire: string;
  rangHeure: number;
  rangJour: number;
} {
  let accum = 0;
  for (let j = 0; j < semaine.jours.length; j++) {
    const count = semaine.creneauxParJour[j];
    if (slot < accum + count) {
      const creneauIndex = slot - accum;
      return {
        jourIndex: j,
        jourNom: semaine.jours[j],
        creneauIndex,
        creneauNumero: creneauIndex + 1,
        creneauHoraire: getSlotTimeRange(creneauIndex),
        rangHeure: creneauIndex, // 0..count-1
        rangJour: j, // 0..jours.length-1
      };
    }
    accum += count;
  }

  // Hors plage : repli sur le dernier jour
  const lastDayIdx = Math.max(0, semaine.jours.length - 1);
  return {
    jourIndex: lastDayIdx,
    jourNom: semaine.jours[lastDayIdx] || 'Inconnu',
    creneauIndex: 0,
    creneauNumero: 1,
    creneauHoraire: getSlotTimeRange(0),
    rangHeure: 0,
    rangJour: lastDayIdx,
  };
}

/**
 * Vérifie si une matière donnée est soumise à la règle des blocs de 2h consécutives.
 * Par défaut (toutesMatieresABlocs = true), la règle s'applique à TOUTES les matières.
 */
export function isBlockSubject(
  matiere: string,
  matieresABlocs?: string[],
  toutesMatieresABlocs: boolean = true
): boolean {
  if (toutesMatieresABlocs) return true;
  if (!matiere || !matieresABlocs || matieresABlocs.length === 0) return false;
  const target = matiere.trim().toLowerCase();
  return matieresABlocs.some((b) => {
    const pattern = b.trim().toLowerCase();
    return target === pattern || target.includes(pattern);
  });
}

/**
 * Vérifie si deux créneaux du même jour forment un bloc de 2h consécutives valide :
 * - Même jour
 * - Strictement adjacents (pas de trou entre les deux)
 * - Ne chevauchant PAS la pause méridienne de 1h (dans les journées de 7h, pause après le créneau 4, entre C4 et C5)
 */
export function areSlotsConsecutiveWithoutPause(
  slotA: number,
  slotB: number,
  semaine: Semaine,
  respecterPause: boolean = true
): boolean {
  const cA = getSlotCoordinates(slotA, semaine);
  const cB = getSlotCoordinates(slotB, semaine);
  if (cA.jourIndex !== cB.jourIndex) return false;

  const minNum = Math.min(cA.creneauNumero, cB.creneauNumero);
  const maxNum = Math.max(cA.creneauNumero, cB.creneauNumero);

  // Doivent être immédiatement adjacents (ex: C1 et C2, C2 et C3, etc.)
  if (maxNum !== minNum + 1) return false;

  // Si la journée compte 7 créneaux, une pause de 1h sépare le créneau 4 du créneau 5.
  // La journée est divisée en 2 grands blocs (4h puis pause de 1h puis 3h).
  // Un bloc de 2h ne peut donc pas être à cheval sur C4 et C5.
  if (respecterPause) {
    const daySlots = semaine.creneauxParJour[cA.jourIndex];
    if (daySlots === 7 && minNum === 4 && maxNum === 5) {
      return false;
    }
  }

  return true;
}

/**
 * Vérifie si une liste de créneaux placés sur un même jour forme un bloc consécutif valide :
 * - Même jour
 * - Taille comprise entre 1 et 3h (maximum absolu 3h)
 * - Strictement adjacents (sans trou)
 * - Ne chevauchant pas la pause méridienne (entre C4 et C5 sur journée de 7h)
 */
export function areSlotsConsecutiveBlockWithoutPause(
  slots: number[],
  semaine: Semaine,
  respecterPause: boolean = true
): boolean {
  if (slots.length <= 1) return true;
  if (slots.length > 3) return false; // Le maximum est toujours 3h

  const sorted = [...slots].sort((a, b) => a - b);
  const coords = sorted.map((s) => getSlotCoordinates(s, semaine));
  const firstDay = coords[0].jourIndex;
  if (!coords.every((c) => c.jourIndex === firstDay)) return false;

  for (let i = 0; i < coords.length - 1; i++) {
    const cCurr = coords[i];
    const cNext = coords[i + 1];
    if (cNext.creneauNumero !== cCurr.creneauNumero + 1) return false;
    if (respecterPause) {
      const daySlots = semaine.creneauxParJour[firstDay];
      if (daySlots === 7 && cCurr.creneauNumero === 4 && cNext.creneauNumero === 5) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Génère toutes les possibilités de découpage en blocs d'un volume horaire hebdomadaire
 * sous la contrainte que chaque bloc soit d'au maximum 3h (ex: pour 7h -> [3,3,1], [3,2,2], [2,2,2,1]...)
 */
export function generatePossibleBlockPartitions(
  totalHours: number,
  maxBlockSize: number = 3
): number[][] {
  const effectiveMax = Math.min(3, Math.max(1, maxBlockSize));
  const results: number[][] = [];

  function backtrack(rem: number, maxAllowed: number, current: number[]) {
    if (rem === 0) {
      results.push([...current]);
      return;
    }
    const limit = Math.min(rem, maxAllowed);
    for (let part = limit; part >= 1; part--) {
      current.push(part);
      backtrack(rem - part, part, current);
      current.pop();
    }
  }

  backtrack(totalHours, effectiveMax, []);
  return results;
}

/**
 * Recherche une règle de blocs personnalisée correspondant à une matière et un niveau/classe donnés
 */
/**
 * Résout la limite journalière (1h, 2h ou 3h) d'une matière selon la hiérarchie :
 * 1. Spécifique par Classe (clé: `${classeId}::${matiere}`)
 * 2. Spécifique par Niveau (clé: `${niveau}::${matiere}`)
 * 3. Spécifique par Matière (global)
 * 4. Plafond journalier par défaut
 */
export function getSubjectDailyLimit(
  matiere: string,
  classeIds?: string[],
  niveaux?: string[],
  options?: RulesOptions
): 1 | 2 | 3 {
  if (!options) return 2;
  const mat = (matiere || '').trim();

  // 1. Spécifique par classe
  if (options.maxHeuresParJourParMatiereClasse && classeIds && classeIds.length > 0) {
    for (const cid of classeIds) {
      const key = `${cid}::${mat}`;
      if (options.maxHeuresParJourParMatiereClasse[key] !== undefined) {
        return options.maxHeuresParJourParMatiereClasse[key];
      }
    }
  }

  // 2. Spécifique par niveau
  if (options.maxHeuresParJourParMatiereNiveau && niveaux && niveaux.length > 0) {
    for (const niv of niveaux) {
      const key = `${niv}::${mat}`;
      if (options.maxHeuresParJourParMatiereNiveau[key] !== undefined) {
        return options.maxHeuresParJourParMatiereNiveau[key];
      }
    }
  }

  // 3. Spécifique par matière global
  if (options.maxHeuresParJourParMatiere && options.maxHeuresParJourParMatiere[mat] !== undefined) {
    return options.maxHeuresParJourParMatiere[mat];
  }

  // 4. Défaut
  const defaultUnite = options.maxHeuresParJourUnite;
  if (defaultUnite === 1 || defaultUnite === 2 || defaultUnite === 3) {
    return defaultUnite as 1 | 2 | 3;
  }
  return 2;
}

/**
 * Vérifie si un dépassement de 2h/jour est désactivé (Reverse Dépassement actif)
 * pour une unité d'enseignement donnée et un jour précis.
 */
export function isOverageDisabledForUnit(
  uniteId: string,
  jourIndex: number,
  options?: RulesOptions
): boolean {
  if (!options) return false;
  if (options.interdireTousDepassements) return true;
  if (!options.disabledOverages || options.disabledOverages.length === 0) return false;

  const keyExact = `exc_${uniteId}_j${jourIndex}`;
  const keyShort = `${uniteId}_j${jourIndex}`;
  const keyUnit = uniteId;

  return (
    options.disabledOverages.includes(keyExact) ||
    options.disabledOverages.includes(keyShort) ||
    options.disabledOverages.includes(keyUnit) ||
    options.disabledOverages.includes('all')
  );
}

/**
 * Recherche une règle de blocs personnalisée correspondant à une matière et un niveau/classe donnés
 * Priorité accordée à une règle spécifique à la classe, puis au niveau
 */
export function findMatchingBlockRule(
  matiere: string,
  niveauOuClasse: string,
  heures: number,
  rules?: SubjectLevelBlockRule[],
  classeId?: string
): SubjectLevelBlockRule | undefined {
  if (!rules || rules.length === 0) return undefined;
  const matNorm = (matiere || '').trim().toLowerCase();
  const nivNorm = (niveauOuClasse || '').trim().toLowerCase();

  // 1. Priorité règle spécifique par classe
  if (classeId) {
    const classRule = rules.find((r) => {
      if (r.actif === false) return false;
      if (!r.classeId || r.classeId === '*' || r.classeId === 'toutes') return false;
      if (r.classeId !== classeId) return false;
      if (r.heuresHebdo && r.heuresHebdo !== heures) return false;
      const ruleMat = (r.matiere || '').trim().toLowerCase();
      return (
        ruleMat === '*' ||
        ruleMat === 'toutes' ||
        matNorm.includes(ruleMat) ||
        ruleMat.includes(matNorm)
      );
    });
    if (classRule) return classRule;
  }

  // 2. Règle par niveau ou générale
  return rules.find((r) => {
    if (r.actif === false) return false;
    // Si la règle est restreinte à une autre classe précise, l'ignorer
    if (r.classeId && r.classeId !== '*' && r.classeId !== 'toutes' && classeId && r.classeId !== classeId) {
      return false;
    }
    if (r.heuresHebdo && r.heuresHebdo !== heures) return false;

    const ruleMat = (r.matiere || '').trim().toLowerCase();
    const matMatches =
      ruleMat === '*' ||
      ruleMat === 'toutes' ||
      matNorm.includes(ruleMat) ||
      ruleMat.includes(matNorm);
    if (!matMatches) return false;

    const ruleNiv = (r.niveau || '').trim().toLowerCase();
    const nivMatches =
      ruleNiv === '*' ||
      ruleNiv === 'tous' ||
      nivNorm.includes(ruleNiv) ||
      ruleNiv.includes(nivNorm);
    return nivMatches;
  });
}

/**
 * Vérifie un emploi du temps contre l'ensemble des règles dures et souples.
 * Renvoie la liste détaillée de toutes les violations avec message explicite en français.
 */
export function verify(
  planning: Planning,
  data: ScheduleData,
  userOptions?: RulesOptions
): RuleViolation[] {
  const options = { ...DEFAULT_RULES_OPTIONS, ...userOptions };
  const violations: RuleViolation[] = [];

  const teacherMap = new Map<string, Teacher>(data.teachers.map((t) => [t.id, t]));
  const classMap = new Map<string, Classe>(data.classes.map((c) => [c.id, c]));
  const uniteMap = new Map<string, Unite>(data.unites.map((u) => [u.id, u]));

  // Indexation des affectations par créneau pour les vérifications de conflits
  const affectationsParSlot = new Map<number, Affectation[]>();
  for (const aff of planning) {
    const list = affectationsParSlot.get(aff.slot) || [];
    list.push(aff);
    affectationsParSlot.set(aff.slot, list);
  }

  // --- RÈGLE DURE (1) : Toutes les heures de chaque unité sont placées ---
  const countParUnite = new Map<string, number>();
  for (const aff of planning) {
    countParUnite.set(aff.uniteId, (countParUnite.get(aff.uniteId) || 0) + 1);
  }

  for (const unite of data.unites) {
    const count = countParUnite.get(unite.id) || 0;
    const prof = teacherMap.get(unite.teacherId);
    const classesNoms = unite.classeIds
      .map((cid) => classMap.get(cid)?.nom || cid)
      .join(' + ');

    if (count < unite.heures) {
      violations.push({
        type: 'HEURES_NON_PLACEES',
        severite: 'DURE',
        message: `Il manque ${unite.heures - count} heure(s) pour l'unité ${classesNoms} (${prof?.nom ?? unite.teacherId}, ${prof?.matiere ?? ''}) : ${count}/${unite.heures} heure(s) placée(s).`,
        uniteId: unite.id,
        profId: unite.teacherId,
        profNom: prof?.nom,
      });
    } else if (count > unite.heures) {
      violations.push({
        type: 'HEURES_SURNUMERAIRES',
        severite: 'DURE',
        message: `Trop d'heures placées pour l'unité ${classesNoms} (${prof?.nom ?? unite.teacherId}) : ${count} heure(s) placée(s) pour un quota prévu de ${unite.heures} h.`,
        uniteId: unite.id,
        profId: unite.teacherId,
        profNom: prof?.nom,
      });
    }
  }

  // --- RÈGLE DURE (2) : Un prof au plus une unité par créneau ---
  // --- RÈGLE DURE (3) : Une classe au plus une unité par créneau ---
  // --- RÈGLE DURE (4) : Aucun cours sur un créneau où le prof est indisponible ---
  for (const [slot, affs] of affectationsParSlot.entries()) {
    const coords = getSlotCoordinates(slot, data.semaine);

    // Conflit Enseignant sur ce créneau
    const profAffectations = new Map<string, Affectation[]>();
    for (const aff of affs) {
      const unite = uniteMap.get(aff.uniteId);
      if (!unite) continue;
      const list = profAffectations.get(unite.teacherId) || [];
      list.push(aff);
      profAffectations.set(unite.teacherId, list);
    }

    for (const [teacherId, tAffs] of profAffectations.entries()) {
      if (tAffs.length > 1) {
        const prof = teacherMap.get(teacherId);
        violations.push({
          type: 'PROF_CONFLIT',
          severite: 'DURE',
          message: `L'enseignant ${prof?.nom || teacherId} a ${tAffs.length} cours simultanés sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero}).`,
          profId: teacherId,
          profNom: prof?.nom,
          slot,
          jourNom: coords.jourNom,
          creneauNumero: coords.creneauNumero,
        });
      }
    }

    // Conflit Classe sur ce créneau (une unité commune occupe toutes ses classes)
    const classeOccurrences = new Map<string, Affectation[]>();
    for (const aff of affs) {
      const unite = uniteMap.get(aff.uniteId);
      if (!unite) continue;
      for (const cid of unite.classeIds) {
        const list = classeOccurrences.get(cid) || [];
        list.push(aff);
        classeOccurrences.set(cid, list);
      }
    }

    for (const [classeId, cAffs] of classeOccurrences.entries()) {
      if (cAffs.length > 1) {
        const cls = classMap.get(classeId);
        violations.push({
          type: 'CLASSE_CONFLIT',
          severite: 'DURE',
          message: `La classe ${cls?.nom || classeId} a ${cAffs.length} cours simultanés sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero}).`,
          classeId,
          classeNom: cls?.nom,
          slot,
          jourNom: coords.jourNom,
          creneauNumero: coords.creneauNumero,
        });
      }
    }

    // Disponibilité Enseignant
    for (const aff of affs) {
      const unite = uniteMap.get(aff.uniteId);
      if (!unite) continue;
      const prof = teacherMap.get(unite.teacherId);
      if (prof) {
        const isDispo = prof.dispo[slot] ?? false;
        if (!isDispo) {
          violations.push({
            type: 'PROF_INDISPONIBLE',
            severite: 'DURE',
            message: `L'enseignant ${prof.nom} est indisponible sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero}).`,
            uniteId: unite.id,
            profId: prof.id,
            profNom: prof.nom,
            slot,
            jourNom: coords.jourNom,
            creneauNumero: coords.creneauNumero,
          });
        }
      }
    }

    // Créneaux réservés par classe (RÈGLE DURE)
    if (options.reservedSlots && options.reservedSlots.length > 0) {
      for (const aff of affs) {
        const unite = uniteMap.get(aff.uniteId);
        if (!unite) continue;
        for (const cid of unite.classeIds) {
          const reserved = options.reservedSlots.find(
            (r) => r.classeId === cid && r.slot === slot
          );
          if (reserved) {
            const cls = classMap.get(cid);
            violations.push({
              type: 'CRENEAU_RESERVE_VIOLATION',
              severite: 'DURE',
              message: `Le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero}) est réservé pour « ${reserved.label} » (${cls?.nom || cid}).`,
              uniteId: unite.id,
              classeId: cid,
              classeNom: cls?.nom,
              slot,
              jourNom: coords.jourNom,
              creneauNumero: coords.creneauNumero,
            });
          }
        }
      }
    }

    // Plages interdites par classe (RÈGLE DURE)
    if (options.forbiddenSlotsClasses && options.forbiddenSlotsClasses.length > 0) {
      for (const aff of affs) {
        const unite = uniteMap.get(aff.uniteId);
        if (!unite) continue;
        for (const cid of unite.classeIds) {
          const forbidden = options.forbiddenSlotsClasses.find(
            (f) => f.classeId === cid && f.slot === slot
          );
          if (forbidden) {
            const cls = classMap.get(cid);
            violations.push({
              type: 'PLAGE_INTERDITE_CLASSE',
              severite: 'DURE',
              message: `Plage interdite pour la classe ${cls?.nom || cid} sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero})${forbidden.reason ? ` : ${forbidden.reason}` : ''}.`,
              uniteId: unite.id,
              classeId: cid,
              classeNom: cls?.nom,
              slot,
              jourNom: coords.jourNom,
              creneauNumero: coords.creneauNumero,
            });
          }
        }
      }
    }

    // Plages interdites par prof (RÈGLE DURE)
    if (options.forbiddenSlotsTeachers && options.forbiddenSlotsTeachers.length > 0) {
      for (const aff of affs) {
        const unite = uniteMap.get(aff.uniteId);
        if (!unite) continue;
        const forbidden = options.forbiddenSlotsTeachers.find(
          (f) => f.teacherId === unite.teacherId && f.slot === slot
        );
        if (forbidden) {
          const prof = teacherMap.get(unite.teacherId);
          violations.push({
            type: 'PLAGE_INTERDITE_PROF',
            severite: 'DURE',
            message: `Plage interdite pour l'enseignant ${prof?.nom || unite.teacherId} sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero})${forbidden.reason ? ` : ${forbidden.reason}` : ''}.`,
            uniteId: unite.id,
            profId: unite.teacherId,
            profNom: prof?.nom,
            slot,
            jourNom: coords.jourNom,
            creneauNumero: coords.creneauNumero,
          });
        }
      }
    }
  }

  // --- RÈGLE SOUPLE : Plafond horaire par prof (défaut 24 h) ---
  if (options.plafondHoraireProf && options.plafondHoraireProf > 0) {
    for (const prof of data.teachers) {
      const profUnites = data.unites.filter((u) => u.teacherId === prof.id);
      const totalCharge = profUnites.reduce((acc, u) => acc + u.heures, 0);
      if (totalCharge > options.plafondHoraireProf) {
        violations.push({
          type: 'PLAFOND_PROF_DEPASSE',
          severite: 'SOUPLE',
          message: `L'enseignant ${prof.nom} dépasse le plafond horaire (${totalCharge} h prévues pour un plafond de ${options.plafondHoraireProf} h).`,
          profId: prof.id,
          profNom: prof.nom,
        });
      }
    }
  }

  // --- RÈGLE DURE (5) : Matières « à blocs » (Arabe et Anglais par défaut) ---
  // Règles :
  // - Heures forment des blocs de 2h consécutives le même jour
  // - Jamais plus de 2h par jour
  // - Une heure isolée (1h) seulement si la charge est impaire, un autre jour
  const affsParUnite = new Map<string, number[]>();
  for (const aff of planning) {
    const list = affsParUnite.get(aff.uniteId) || [];
    list.push(aff.slot);
    affsParUnite.set(aff.uniteId, list);
  }

  for (const unite of data.unites) {
    const prof = teacherMap.get(unite.teacherId);
    if (!prof || !isBlockSubject(prof.matiere, options.matieresABlocs, options.toutesMatieresABlocs !== false)) {
      continue;
    }

    const placedSlots = affsParUnite.get(unite.id) || [];
    if (placedSlots.length === 0) continue;

    const classesNoms = unite.classeIds
      .map((cid) => classMap.get(cid)?.nom || cid)
      .join(' + ');

    const classesNiveaux = unite.classeIds
      .map((cid) => classMap.get(cid)?.niveau || '')
      .filter(Boolean)
      .join(' / ');

    const matchingRule = findMatchingBlockRule(
      prof.matiere,
      classesNiveaux,
      unite.heures,
      options.subjectBlockRules,
      unite.classeIds[0]
    );

    // Répartition des créneaux par jour
    const slotsParJour = new Map<number, number[]>();
    for (const slot of placedSlots) {
      const coords = getSlotCoordinates(slot, data.semaine);
      const list = slotsParJour.get(coords.jourIndex) || [];
      list.push(slot);
      slotsParJour.set(coords.jourIndex, list);
    }

    if (matchingRule && matchingRule.possibilites.length > 0) {
      // --- MODÈLE CONFIGURÉ PAR MATIÈRE / NIVEAU (Possibilités de blocs, max 3h) ---
      const maxBlockAllowed = Math.min(
        3,
        Math.max(1, ...matchingRule.possibilites.map((p) => Math.max(...p)))
      );

      for (const [jourIndex, slotsJour] of slotsParJour.entries()) {
        const jourNom = data.semaine.jours[jourIndex] || `Jour ${jourIndex + 1}`;
        slotsJour.sort((a, b) => a - b);

        if (slotsJour.length > maxBlockAllowed) {
          violations.push({
            type: 'BLOC_EXCES_JOUR',
            severite: 'DURE',
            message: `L'unité de ${prof.matiere} (${classesNoms}) a ${slotsJour.length} heures le ${jourNom}, dépasse le maximum autorisé (${maxBlockAllowed} h par jour pour ce découpage).`,
            uniteId: unite.id,
            profId: prof.id,
            profNom: prof.nom,
            jourNom,
          });
        }

        if (slotsJour.length >= 2) {
          if (
            !areSlotsConsecutiveBlockWithoutPause(
              slotsJour,
              data.semaine,
              options.respecterPauseMidiBlocs !== false
            )
          ) {
            violations.push({
              type: 'BLOC_NON_CONSECUTIF',
              severite: options.relaxedMode ? 'SOUPLE' : 'DURE',
              message: `Les ${slotsJour.length} heures de ${prof.matiere} (${classesNoms}) le ${jourNom} doivent être consécutives sans trou et sans franchir la pause méridienne.`,
              uniteId: unite.id,
              profId: prof.id,
              profNom: prof.nom,
              jourNom,
            });
          }
        }
      }

      // Vérification de la conformité du découpage global lorsque toutes les heures sont placées
      if (placedSlots.length === unite.heures) {
        const actualBlocks = Array.from(slotsParJour.values())
          .map((s) => s.length)
          .sort((a, b) => b - a);

        const matchesPossibility = matchingRule.possibilites.some((pos) => {
          const sortedPos = [...pos].sort((a, b) => b - a);
          if (sortedPos.length !== actualBlocks.length) return false;
          return sortedPos.every((val, idx) => val === actualBlocks[idx]);
        });

        if (!matchesPossibility) {
          const possibleStrs = matchingRule.possibilites
            .map((p) => p.join('h + ') + 'h')
            .join(' OU ');
          violations.push({
            type: 'BLOC_REPARTITION_NON_CONFORME',
            severite: options.relaxedMode ? 'SOUPLE' : 'DURE',
            message: `La répartition des séances de ${prof.matiere} (${classesNoms}) en [${actualBlocks.join('h + ')}h] ne correspond à aucune des possibilités de blocs paramétrées (${possibleStrs}).`,
            uniteId: unite.id,
            profId: prof.id,
            profNom: prof.nom,
          });
        }
      }
    } else {
      // --- MODÈLE STANDARD (Flexible : 1h, 2h ou 3h selon la grille par matière/niveau/classe) ---
      const classesNiveauxList = unite.classeIds
        .map((cid) => classMap.get(cid)?.niveau)
        .filter(Boolean) as string[];
      const subjectLimit: number = getSubjectDailyLimit(
        prof.matiere,
        unite.classeIds,
        classesNiveauxList,
        options
      );
      let joursAvecUneHeure = 0;

      for (const [jourIndex, slotsJour] of slotsParJour.entries()) {
        const jourNom = data.semaine.jours[jourIndex] || `Jour ${jourIndex + 1}`;
        slotsJour.sort((a, b) => a - b);

        // (5.A) Dépassement de la limite maximale par jour pour cette matière
        const isOverDisabled = isOverageDisabledForUnit(unite.id, jourIndex, options);
        const effectiveLimit = isOverDisabled ? Math.min(2, subjectLimit) : subjectLimit;
        if (slotsJour.length > (options.relaxedMode && !isOverDisabled ? Math.max(effectiveLimit, 3) : effectiveLimit)) {
          violations.push({
            type: 'BLOC_EXCES_JOUR',
            severite: 'DURE',
            message: `L'unité de ${prof.matiere} (${classesNoms}) a ${slotsJour.length} heures le ${jourNom}, dépasse la limite maximale de ${effectiveLimit} h par jour${isOverDisabled ? ' (Reverse Dépassement actif)' : ''}.`,
            uniteId: unite.id,
            profId: prof.id,
            profNom: prof.nom,
            jourNom,
          });
        }

        // (5.B) Si 2h ou 3h le même jour : elles doivent être strictement consécutives sans trou et sans chevaucher la pause
        if (slotsJour.length >= 2) {
          if (
            !areSlotsConsecutiveBlockWithoutPause(
              slotsJour,
              data.semaine,
              options.respecterPauseMidiBlocs !== false
            )
          ) {
            const isPauseCross = slotsJour.some((s, idx) => {
              if (idx === 0) return false;
              const prevCoords = getSlotCoordinates(slotsJour[idx - 1], data.semaine);
              const currCoords = getSlotCoordinates(s, data.semaine);
              return prevCoords.creneauNumero === 4 && currCoords.creneauNumero === 5;
            });
            violations.push({
              type: 'BLOC_NON_CONSECUTIF',
              severite: options.relaxedMode ? 'SOUPLE' : 'DURE',
              message: isPauseCross
                ? `Les ${slotsJour.length} heures de ${prof.matiere} (${classesNoms}) le ${jourNom} chevauchent la pause méridienne de 1h (C4 et C5) : la journée de 7h est divisée en 2 grands blocs (4h puis 1h de pause puis 3h).`
                : `Les ${slotsJour.length} heures de ${prof.matiere} (${classesNoms}) le ${jourNom} doivent être consécutives sans trou.`,
              uniteId: unite.id,
              profId: prof.id,
              profNom: prof.nom,
              jourNom,
            });
          }
        }

        if (slotsJour.length === 1) {
          joursAvecUneHeure++;
        }
      }

      // (5.C) Pour les matières en mode 2h standard : vérification de la parité des heures isolées
      if (subjectLimit === 2 && placedSlots.length === unite.heures) {
        const chargeEstImpaire = unite.heures % 2 !== 0;

        if (!chargeEstImpaire && joursAvecUneHeure > 0) {
          violations.push({
            type: 'BLOC_HEURE_ISOLEE_INVALIDE',
            severite: options.relaxedMode ? 'SOUPLE' : 'DURE',
            message: `L'unité de ${prof.matiere} (${classesNoms}) a une charge paire (${unite.heures} h) : elle ne doit comporter que des blocs de 2 h consécutives (${joursAvecUneHeure} séance(s) isolée(s) de 1 h détectée(s)).`,
            uniteId: unite.id,
            profId: prof.id,
            profNom: prof.nom,
          });
        } else if (chargeEstImpaire && joursAvecUneHeure > 1) {
          violations.push({
            type: 'BLOC_HEURE_ISOLEE_INVALIDE',
            severite: options.relaxedMode ? 'SOUPLE' : 'DURE',
            message: `L'unité de ${prof.matiere} (${classesNoms}) a une charge impaire (${unite.heures} h) : une seule séance d'une heure isolée est permise (${joursAvecUneHeure} séances de 1 h détectées).`,
            uniteId: unite.id,
            profId: prof.id,
            profNom: prof.nom,
          });
        }
      }
    }
  }

  // 6. Contraintes spécifiques enseignants : Éviter 1h en demi-journée & Regroupement / Anti-trous
  const eviter1hSet = new Set(options.profsEviter1hDemiJournee || []);
  const antiTrousSet = new Set(options.profsRegrouperHeuresAntiTrous || []);

  if (eviter1hSet.size > 0 || antiTrousSet.size > 0) {
    for (const prof of data.teachers) {
      const checkEviter1h = eviter1hSet.has(prof.id);
      const checkAntiTrous = antiTrousSet.has(prof.id);
      if (!checkEviter1h && !checkAntiTrous) continue;

      const profSlots = planning
        .filter((a) => {
          const u = uniteMap.get(a.uniteId);
          return u?.teacherId === prof.id;
        })
        .map((a) => a.slot);

      if (profSlots.length === 0) continue;

      for (let j = 0; j < data.semaine.jours.length; j++) {
        const jourNom = data.semaine.jours[j] || `Jour ${j + 1}`;
        const daySlots = profSlots.filter((s) => getSlotCoordinates(s, data.semaine).jourIndex === j);
        if (daySlots.length === 0) continue;

        // (6.A) Éviter de faire venir le professeur pour 1h seulement en demi-journée
        if (checkEviter1h) {
          const totalSlotsOnDay = data.semaine.creneauxParJour[j] || 7;
          // Demi-journée Matin : créneaux de rang 0 à 3 (C1 à C4)
          const matinSlots = daySlots.filter((s) => getSlotCoordinates(s, data.semaine).rangHeure < 4);
          if (matinSlots.length === 1) {
            const coords = getSlotCoordinates(matinSlots[0], data.semaine);
            violations.push({
              type: 'PROF_ISOLE_DEMI_JOURNEE',
              severite: 'SOUPLE',
              message: `L'enseignant(e) ${prof.nom} ne vient que pour 1 heure le ${jourNom} matin (C${coords.creneauNumero}), ce qui enfreint la contrainte d'éviter les déplacements pour 1h en demi-journée.`,
              profId: prof.id,
              profNom: prof.nom,
              jourNom,
            });
          }

          // Demi-journée Après-midi : créneaux de rang 4+ (C5 à C7, si la journée a plus de 4 créneaux)
          if (totalSlotsOnDay > 4) {
            const apresMidiSlots = daySlots.filter((s) => getSlotCoordinates(s, data.semaine).rangHeure >= 4);
            if (apresMidiSlots.length === 1) {
              const coords = getSlotCoordinates(apresMidiSlots[0], data.semaine);
              violations.push({
                type: 'PROF_ISOLE_DEMI_JOURNEE',
                severite: 'SOUPLE',
                message: `L'enseignant(e) ${prof.nom} ne vient que pour 1 heure le ${jourNom} après-midi (C${coords.creneauNumero}), ce qui enfreint la contrainte d'éviter les déplacements pour 1h en demi-journée.`,
                profId: prof.id,
                profNom: prof.nom,
                jourNom,
              });
            }
          }
        }

        // (6.B) Regrouper au plus les heures et éviter les trous / créneaux creux
        if (checkAntiTrous && daySlots.length >= 2) {
          const rangs = daySlots.map((s) => getSlotCoordinates(s, data.semaine).rangHeure).sort((a, b) => a - b);
          const minRang = rangs[0];
          const maxRang = rangs[rangs.length - 1];
          const trous: number[] = [];
          for (let r = minRang + 1; r < maxRang; r++) {
            if (!rangs.includes(r)) {
              trous.push(r + 1);
            }
          }
          if (trous.length > 0) {
            violations.push({
              type: 'PROF_TROU_JOURNEE',
              severite: 'SOUPLE',
              message: `L'enseignant(e) ${prof.nom} a ${trous.length} créneau(x) creux d'attente (trou) le ${jourNom} (C${trous.join(', C')}), les heures ne sont pas regroupées au maximum.`,
              profId: prof.id,
              profNom: prof.nom,
              jourNom,
            });
          }
        }
      }
    }
  }

  return violations;
}

/**
 * Calcule le score d'un emploi du temps selon les règles souples :
 * - max 2 h par jour et par unité (pénalité 100 par heure en excès)
 * - heures d'une unité le même jour non consécutives (pénalité 15)
 * - compacité (coût 1 par rang d'heure dans la journée plus 0,3 par rang de jour)
 */
export function score(
  planning: Planning,
  data: ScheduleData,
  userOptions?: RulesOptions
): ScoreBreakdown {
  const options = { ...DEFAULT_RULES_OPTIONS, ...userOptions };

  let penalitesExcesJour = 0;
  let penalitesNonConsecutif = 0;
  let coutCompacite = 0;

  // 1. Distribution par unité et par jour
  const affsParUnite = new Map<string, number[]>();
  for (const aff of planning) {
    const list = affsParUnite.get(aff.uniteId) || [];
    list.push(aff.slot);
    affsParUnite.set(aff.uniteId, list);
  }

  const uniteMap = new Map(data.unites.map((u) => [u.id, u]));
  const teacherMap = new Map(data.teachers.map((t) => [t.id, t]));
  const classMap = new Map(data.classes.map((c) => [c.id, c]));

  for (const [uniteId, slots] of affsParUnite.entries()) {
    const unite = uniteMap.get(uniteId);
    const teacher = unite ? teacherMap.get(unite.teacherId) : undefined;
    const classesNiveauxList = unite
      ? (unite.classeIds.map((cid) => classMap.get(cid)?.niveau).filter(Boolean) as string[])
      : [];
    const subjectLimit: number = getSubjectDailyLimit(
      teacher?.matiere || '',
      unite?.classeIds,
      classesNiveauxList,
      options
    );

    const slotsParJour = new Map<number, number[]>();
    for (const slot of slots) {
      const coords = getSlotCoordinates(slot, data.semaine);
      const list = slotsParJour.get(coords.jourIndex) || [];
      list.push(slot);
      slotsParJour.set(coords.jourIndex, list);
    }

    for (const [jourIndex, slotsJour] of slotsParJour.entries()) {
      const h = slotsJour.length;

      // Règle souple 1 : max par jour et par unité (pénalité 100 par heure en excès au-delà de subjectLimit)
      if (h > subjectLimit) {
        const exces = h - subjectLimit;
        penalitesExcesJour += exces * options.penaliteHeureExcParJour;
      }

      // Règle souple 2 : heures d'une unité le même jour non consécutives (pénalité 15)
      if (h >= 2) {
        slotsJour.sort((a, b) => a - b);
        let estConsecutif = true;
        for (let i = 0; i < slotsJour.length - 1; i++) {
          if (!areSlotsConsecutiveWithoutPause(slotsJour[i], slotsJour[i + 1], data.semaine, options.respecterPauseMidiBlocs !== false)) {
            estConsecutif = false;
            break;
          }
        }
        if (!estConsecutif) {
          penalitesNonConsecutif += options.penaliteNonConsecutiveMemeJour;
        }
      }
    }
  }

  // 2. Compacité : coût 1 par rang d'heure dans la journée + 0,3 par rang de jour
  for (const aff of planning) {
    const coords = getSlotCoordinates(aff.slot, data.semaine);
    coutCompacite +=
      coords.rangHeure * options.coutRangHeure + coords.rangJour * options.coutRangJour;
  }

  // Arrondi compacité à 2 décimales pour propreté
  coutCompacite = Math.round(coutCompacite * 100) / 100;

  // Calcul du nombre de violations dures et pénalités souples enseignants
  const violations = verify(planning, data, options);
  const nombreViolationsDures = violations.filter((v) => v.severite === 'DURE').length;
  const profsIsoleesCount = violations.filter((v) => v.type === 'PROF_ISOLE_DEMI_JOURNEE').length;
  const profsTrousCount = violations.filter((v) => v.type === 'PROF_TROU_JOURNEE').length;
  const penalitesProfIsoleDemiJournee = profsIsoleesCount * 1200;
  const penalitesProfTrous = profsTrousCount * 1000;

  const total =
    penalitesExcesJour +
    penalitesNonConsecutif +
    coutCompacite +
    penalitesProfIsoleDemiJournee +
    penalitesProfTrous +
    nombreViolationsDures * 10000;

  return {
    total: Math.round(total * 100) / 100,
    penalitesExcesJour,
    penalitesNonConsecutif,
    coutCompacite,
    nombreViolationsDures,
    penalitesProfIsoleDemiJournee,
    penalitesProfTrous,
  };
}

/**
 * Détermine si une unité peut être placée sur un créneau donné sans violer
 * les contraintes dures du planning.
 * Renvoie { ok: boolean, raisons: string[] }.
 */
export function canPlace(
  planning: Planning,
  unite: Unite,
  slot: number,
  data: ScheduleData,
  userOptions?: RulesOptions
): CanPlaceResult {
  const options = { ...DEFAULT_RULES_OPTIONS, ...userOptions };
  const raisons: string[] = [];

  const totalSlots = data.semaine.creneauxParJour.reduce((a, b) => a + b, 0);
  if (slot < 0 || slot >= totalSlots) {
    raisons.push(`Créneau ${slot} invalide (doit être entre 0 et ${totalSlots - 1}).`);
    return { ok: false, raisons };
  }

  const coords = getSlotCoordinates(slot, data.semaine);
  const teacher = data.teachers.find((t) => t.id === unite.teacherId);
  const classMap = new Map<string, Classe>(data.classes.map((c) => [c.id, c]));

  // 1. Quota d'heures de l'unité déjà atteint
  const currentCount = planning.filter((a) => a.uniteId === unite.id).length;
  if (currentCount >= unite.heures) {
    raisons.push(
      `Toutes les heures de cette unité sont déjà placées (${currentCount}/${unite.heures} h).`
    );
  }

  // 2. Déjà affecté exactement sur ce créneau
  const dejaSurSlot = planning.some((a) => a.uniteId === unite.id && a.slot === slot);
  if (dejaSurSlot) {
    raisons.push(`Cette unité est déjà affectée sur le créneau ${slot}.`);
  }

  // 3. Disponibilité du professeur
  if (teacher) {
    const isDispo = teacher.dispo[slot] ?? false;
    if (!isDispo) {
      raisons.push(
        `L'enseignant ${teacher.nom} est indisponible sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero}).`
      );
    }
  }

  // 4. Conflit Enseignant : le professeur a-t-il déjà un cours sur ce créneau ?
  const autreAffProf = planning.find((a) => {
    if (a.slot !== slot) return false;
    const u = data.unites.find((unt) => unt.id === a.uniteId);
    return u && u.teacherId === unite.teacherId;
  });

  if (autreAffProf) {
    raisons.push(
      `L'enseignant ${teacher?.nom || unite.teacherId} a déjà un cours sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero}).`
    );
  }

  // 5. Conflit Classe : une des classes de l'unité a-t-elle déjà un cours sur ce créneau ?
  for (const cid of unite.classeIds) {
    const autreAffClasse = planning.find((a) => {
      if (a.slot !== slot) return false;
      const u = data.unites.find((unt) => unt.id === a.uniteId);
      return u && u.classeIds.includes(cid);
    });

    if (autreAffClasse) {
      const cls = classMap.get(cid);
      raisons.push(
        `La classe ${cls?.nom || cid} a déjà un cours sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero}).`
      );
    }
  }

  // 6. Contraintes spécifiques aux blocs (matière/niveau ou blocs standards de 2h)
  if (teacher) {
    const classesNiveaux = unite.classeIds
      .map((cid) => classMap.get(cid)?.niveau || '')
      .filter(Boolean)
      .join(' / ');

    const matchingRule = findMatchingBlockRule(
      teacher.matiere,
      classesNiveaux,
      unite.heures,
      options.subjectBlockRules,
      unite.classeIds[0]
    );

    const slotsMemeJour = planning
      .filter((a) => a.uniteId === unite.id)
      .map((a) => a.slot)
      .filter((s) => getSlotCoordinates(s, data.semaine).jourIndex === coords.jourIndex);

    const isOverDisabled = isOverageDisabledForUnit(unite.id, coords.jourIndex, options);
    if (isOverDisabled && slotsMemeJour.length >= 2) {
      raisons.push(
        `Reverse Dépassement actif : dépassement de 2h strictement interdit pour cette matière le ${coords.jourNom}.`
      );
    }

    if (matchingRule && matchingRule.possibilites.length > 0) {
      // Règle personnalisée de découpage en blocs (max 3h)
      const maxBlock = Math.min(
        3,
        Math.max(1, ...matchingRule.possibilites.map((p) => Math.max(...p)))
      );

      if (slotsMemeJour.length >= maxBlock) {
        raisons.push(
          `La matière (${teacher.matiere}) ne peut pas dépasser ${maxBlock} heures par jour (déjà ${slotsMemeJour.length} h le ${coords.jourNom}).`
        );
      } else if (slotsMemeJour.length >= 1 && !options.relaxedMode) {
        const candidateSlots = [...slotsMemeJour, slot];
        if (
          !areSlotsConsecutiveBlockWithoutPause(
            candidateSlots,
            data.semaine,
            options.respecterPauseMidiBlocs !== false
          )
        ) {
          raisons.push(
            `Pour la matière (${teacher.matiere}), les séances le ${coords.jourNom} doivent former un bloc consécutif (max 3h) sans trou et sans franchir la pause méridienne.`
          );
        }
      }
    } else if (
      isBlockSubject(
        teacher.matiere,
        options.matieresABlocs,
        options.toutesMatieresABlocs !== false
      ) ||
      (options.maxHeuresParJourParMatiere && options.maxHeuresParJourParMatiere[teacher.matiere] !== undefined) ||
      options.maxHeuresParJourParMatiereNiveau ||
      options.maxHeuresParJourParMatiereClasse
    ) {
      const classesNiveauxList = unite.classeIds
        .map((cid) => classMap.get(cid)?.niveau)
        .filter(Boolean) as string[];
      const subjectLimit = getSubjectDailyLimit(
        teacher.matiere,
        unite.classeIds,
        classesNiveauxList,
        options
      );

      if (subjectLimit === 1) {
        // Limite stricte à 1h par jour
        if (slotsMemeJour.length >= 1) {
          raisons.push(
            `La matière (${teacher.matiere}) est configurée avec un maximum de 1h par séance/jour (déjà ${slotsMemeJour.length} h le ${coords.jourNom}).`
          );
        }
      } else if (subjectLimit === 3) {
        // Limite étendue jusqu'à 3h par jour
        if (slotsMemeJour.length >= (options.relaxedMode ? 4 : 3)) {
          raisons.push(
            `La matière (${teacher.matiere}) ne peut pas dépasser 3 heures par jour (déjà ${slotsMemeJour.length} h le ${coords.jourNom}).`
          );
        } else if (slotsMemeJour.length >= 1 && !options.relaxedMode) {
          const candidateSlots = [...slotsMemeJour, slot];
          if (
            !areSlotsConsecutiveBlockWithoutPause(
              candidateSlots,
              data.semaine,
              options.respecterPauseMidiBlocs !== false
            )
          ) {
            raisons.push(
              `Pour la matière (${teacher.matiere}), les séances le ${coords.jourNom} doivent former un bloc consécutif (max 3h) sans trou et sans franchir la pause méridienne.`
            );
          }
        }
      } else {
        // 6.A : Standard 2h par jour
        if (slotsMemeJour.length >= (options.relaxedMode ? 3 : 2)) {
          raisons.push(
            `La matière (${teacher.matiere}) ne peut pas dépasser 2 heures par jour (déjà ${slotsMemeJour.length} h le ${coords.jourNom}).`
          );
        } else if (slotsMemeJour.length === 1 && !options.relaxedMode) {
          // 6.B : Si 1h déjà présente ce jour, la 2ème heure DOIT former un bloc consécutif sans trou et sans pause
          const existant = slotsMemeJour[0];
          if (
            !areSlotsConsecutiveWithoutPause(
              existant,
              slot,
              data.semaine,
              options.respecterPauseMidiBlocs !== false
            )
          ) {
            const cEx = getSlotCoordinates(existant, data.semaine);
            const isPauseCross =
              (cEx.creneauNumero === 4 && coords.creneauNumero === 5) ||
              (cEx.creneauNumero === 5 && coords.creneauNumero === 4);
            raisons.push(
              isPauseCross
                ? `Impossible de former un bloc de 2h à cheval sur la pause méridienne de 1h (entre C4 et C5).`
                : `Pour la matière (${teacher.matiere}), les 2 heures le ${coords.jourNom} doivent être consécutives sans trou (actuel: C${cEx.creneauNumero}).`
            );
          }
        }
      }
    }
  }

  // 7. Créneaux réservés par classe (ex: 3 h de contrôles en 2 Bac)
  if (options.reservedSlots && options.reservedSlots.length > 0) {
    for (const cid of unite.classeIds) {
      const reserved = options.reservedSlots.find(
        (r) => r.classeId === cid && r.slot === slot
      );
      if (reserved) {
        const cls = classMap.get(cid);
        raisons.push(
          `Le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero}) est réservé pour « ${reserved.label} » (${cls?.nom || cid}).`
        );
      }
    }
  }

  // 8. Plages interdites par classe
  if (options.forbiddenSlotsClasses && options.forbiddenSlotsClasses.length > 0) {
    for (const cid of unite.classeIds) {
      const forbidden = options.forbiddenSlotsClasses.find(
        (f) => f.classeId === cid && f.slot === slot
      );
      if (forbidden) {
        const cls = classMap.get(cid);
        raisons.push(
          `Plage interdite pour la classe ${cls?.nom || cid} sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero})${forbidden.reason ? ` : ${forbidden.reason}` : ''}.`
        );
      }
    }
  }

  // 9. Plages interdites par enseignant
  if (options.forbiddenSlotsTeachers && options.forbiddenSlotsTeachers.length > 0) {
    const forbidden = options.forbiddenSlotsTeachers.find(
      (f) => f.teacherId === unite.teacherId && f.slot === slot
    );
    if (forbidden) {
      raisons.push(
        `Plage interdite pour l'enseignant ${teacher?.nom || unite.teacherId} sur le créneau ${slot} (${coords.jourNom} créneau ${coords.creneauNumero})${forbidden.reason ? ` : ${forbidden.reason}` : ''}.`
      );
    }
  }

  return {
    ok: raisons.length === 0,
    raisons,
  };
}
