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
} from './types';

export * from './types';

export const DEFAULT_RULES_OPTIONS: Required<RulesOptions> = {
  matieresABlocs: ['Arabe', 'Anglais'],
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
};

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
    rangHeure: 0,
    rangJour: lastDayIdx,
  };
}

/**
 * Vérifie si une matière donnée fait partie des matières à blocs
 */
export function isBlockSubject(matiere: string, matieresABlocs: string[]): boolean {
  if (!matiere) return false;
  const target = matiere.trim().toLowerCase();
  return matieresABlocs.some((b) => {
    const pattern = b.trim().toLowerCase();
    return target === pattern || target.includes(pattern);
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
    if (!prof || !isBlockSubject(prof.matiere, options.matieresABlocs)) {
      continue;
    }

    const placedSlots = affsParUnite.get(unite.id) || [];
    if (placedSlots.length === 0) continue;

    const classesNoms = unite.classeIds
      .map((cid) => classMap.get(cid)?.nom || cid)
      .join(' + ');

    // Répartition des créneaux par jour
    const slotsParJour = new Map<number, number[]>();
    for (const slot of placedSlots) {
      const coords = getSlotCoordinates(slot, data.semaine);
      const list = slotsParJour.get(coords.jourIndex) || [];
      list.push(slot);
      slotsParJour.set(coords.jourIndex, list);
    }

    let joursAvecUneHeure = 0;

    for (const [jourIndex, slotsJour] of slotsParJour.entries()) {
      const jourNom = data.semaine.jours[jourIndex] || `Jour ${jourIndex + 1}`;
      slotsJour.sort((a, b) => a - b);

      // (5.A) Jamais plus de 2h par jour
      if (slotsJour.length > 2) {
        violations.push({
          type: 'BLOC_EXCES_JOUR',
          severite: 'DURE',
          message: `L'unité de ${prof.matiere} (${classesNoms}) a ${slotsJour.length} heures le ${jourNom}, dépasse la limite maximale de 2 h par jour pour une matière à blocs.`,
          uniteId: unite.id,
          profId: prof.id,
          profNom: prof.nom,
          jourNom,
        });
      }

      // (5.B) Si 2h le même jour : elles doivent être strictement consécutives
      if (slotsJour.length === 2) {
        if (slotsJour[1] !== slotsJour[0] + 1) {
          violations.push({
            type: 'BLOC_NON_CONSECUTIF',
            severite: 'DURE',
            message: `Les 2 heures de ${prof.matiere} (${classesNoms}) le ${jourNom} doivent être consécutives (créneaux non adjacents placés : ${slotsJour[0]} et ${slotsJour[1]}).`,
            uniteId: unite.id,
            profId: prof.id,
            profNom: prof.nom,
            jourNom,
          });
        }
      }

      // Comptage des séances isolées de 1h
      if (slotsJour.length === 1) {
        joursAvecUneHeure++;
      }
    }

    // (5.C) Une heure isolée seulement si la charge de l'unité est impaire
    const chargeEstImpaire = unite.heures % 2 !== 0;

    if (!chargeEstImpaire && joursAvecUneHeure > 0) {
      violations.push({
        type: 'BLOC_HEURE_ISOLEE_INVALIDE',
        severite: 'DURE',
        message: `L'unité de ${prof.matiere} (${classesNoms}) a une charge paire (${unite.heures} h) : elle ne doit comporter que des blocs de 2 h consécutives (${joursAvecUneHeure} séance(s) isolée(s) de 1 h détectée(s)).`,
        uniteId: unite.id,
        profId: prof.id,
        profNom: prof.nom,
      });
    } else if (chargeEstImpaire && joursAvecUneHeure > 1) {
      violations.push({
        type: 'BLOC_HEURE_ISOLEE_INVALIDE',
        severite: 'DURE',
        message: `L'unité de ${prof.matiere} (${classesNoms}) a une charge impaire (${unite.heures} h) : une seule séance d'une heure isolée est permise (${joursAvecUneHeure} séances de 1 h détectées).`,
        uniteId: unite.id,
        profId: prof.id,
        profNom: prof.nom,
      });
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

  for (const [uniteId, slots] of affsParUnite.entries()) {
    const slotsParJour = new Map<number, number[]>();
    for (const slot of slots) {
      const coords = getSlotCoordinates(slot, data.semaine);
      const list = slotsParJour.get(coords.jourIndex) || [];
      list.push(slot);
      slotsParJour.set(coords.jourIndex, list);
    }

    for (const [jourIndex, slotsJour] of slotsParJour.entries()) {
      const h = slotsJour.length;

      // Règle souple 1 : max 2h par jour et par unité (pénalité 100 par heure en excès)
      if (h > options.maxHeuresParJourUnite) {
        const exces = h - options.maxHeuresParJourUnite;
        penalitesExcesJour += exces * options.penaliteHeureExcParJour;
      }

      // Règle souple 2 : heures d'une unité le même jour non consécutives (pénalité 15)
      if (h >= 2) {
        slotsJour.sort((a, b) => a - b);
        let estConsecutif = true;
        for (let i = 0; i < slotsJour.length - 1; i++) {
          if (slotsJour[i + 1] !== slotsJour[i] + 1) {
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

  // Calcul du nombre de violations dures
  const violations = verify(planning, data, options);
  const nombreViolationsDures = violations.filter((v) => v.severite === 'DURE').length;

  const total =
    penalitesExcesJour +
    penalitesNonConsecutif +
    coutCompacite +
    nombreViolationsDures * 10000;

  return {
    total: Math.round(total * 100) / 100,
    penalitesExcesJour,
    penalitesNonConsecutif,
    coutCompacite,
    nombreViolationsDures,
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

  // 6. Contraintes spécifiques aux matières à blocs (Arabe, Anglais, etc.)
  if (teacher && isBlockSubject(teacher.matiere, options.matieresABlocs)) {
    // Récupérer les créneaux déjà placés pour cette unité le même jour
    const slotsMemeJour = planning
      .filter((a) => a.uniteId === unite.id)
      .map((a) => a.slot)
      .filter((s) => getSlotCoordinates(s, data.semaine).jourIndex === coords.jourIndex);

    // 6.A : Jamais plus de 2h par jour
    if (slotsMemeJour.length >= 2) {
      raisons.push(
        `La matière à blocs (${teacher.matiere}) ne peut pas dépasser 2 heures par jour (déjà ${slotsMemeJour.length} h le ${coords.jourNom}).`
      );
    } else if (slotsMemeJour.length === 1) {
      // 6.B : Si 1h déjà présente ce jour, la 2ème heure DOIT être consécutive
      const existant = slotsMemeJour[0];
      const estAdjacent = slot === existant - 1 || slot === existant + 1;
      if (!estAdjacent) {
        raisons.push(
          `Pour la matière à blocs (${teacher.matiere}), les 2 heures le ${coords.jourNom} doivent être consécutives (actuel: créneau ${existant}).`
        );
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
