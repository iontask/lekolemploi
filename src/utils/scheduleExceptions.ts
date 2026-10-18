/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, ImportDataset, Teacher, Unite } from '../types';
import { getSlotCoordinates } from '../rules';
import { Affectation, Planning } from '../rules/types';

export interface ScheduleException {
  id: string;
  type: 'EXCES_2H_JOUR' | 'HEURES_COUPEES' | 'TROU_CLASSE' | 'TROU_PROF';
  severity: 'warning' | 'info';
  titre: string;
  description: string;
  jourNom: string;
  jourIndex: number;
  entiteNom: string; // Nom de la classe ou du prof
  matiere?: string;
  creneaux?: number[];
  uniteId?: string;
  teacherId?: string;
  classeIds?: string[];
}

export interface ExceptionsSummary {
  totalExceptions: number;
  exces2hJour: ScheduleException[];
  heuresCoupees: ScheduleException[];
  trousClasses: ScheduleException[];
  trousProfs: ScheduleException[];
  creneauxLibresTotal: number;
}

/**
 * Analyse et extrait toutes les exceptions d'un planning généré :
 * - Dépassements de 2 h/jour par unité
 * - Heures coupées (non consécutives pour une même unité sur une journée)
 * - Créneaux libres / trous intercalés (pour classes et professeurs)
 */
export function analyzeScheduleExceptions(
  dataset: ImportDataset,
  planning: Planning
): ExceptionsSummary {
  const { teachers, classes, unites, semaine } = dataset;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
  const classMap = new Map<string, Classe>(classes.map((c) => [c.id, c]));
  const uniteMap = new Map<string, Unite>(unites.map((u) => [u.id, u]));

  const exces2hJour: ScheduleException[] = [];
  const heuresCoupees: ScheduleException[] = [];
  const trousClasses: ScheduleException[] = [];
  const trousProfs: ScheduleException[] = [];

  // 1. Dépassements de 2h/jour et Heures coupées par unité
  const affsParUnite = new Map<string, number[]>();
  for (const aff of planning) {
    const list = affsParUnite.get(aff.uniteId) || [];
    list.push(aff.slot);
    affsParUnite.set(aff.uniteId, list);
  }

  for (const [uniteId, slots] of affsParUnite.entries()) {
    const unite = uniteMap.get(uniteId);
    if (!unite) continue;
    const prof = teacherMap.get(unite.teacherId);
    const classesNoms = unite.classeIds
      .map((cid) => classMap.get(cid)?.nom || cid)
      .join(' + ');

    // Groupement par jour
    const slotsParJour = new Map<number, number[]>();
    for (const slot of slots) {
      const coords = getSlotCoordinates(slot, semaine);
      const list = slotsParJour.get(coords.jourIndex) || [];
      list.push(slot);
      slotsParJour.set(coords.jourIndex, list);
    }

    for (const [jourIndex, slotsJour] of slotsParJour.entries()) {
      const jourNom = semaine.jours[jourIndex] || `Jour ${jourIndex + 1}`;
      slotsJour.sort((a, b) => a - b);

      // (A) Dépassement de 2h/jour
      if (slotsJour.length > 2) {
        exces2hJour.push({
          id: `exc_${uniteId}_j${jourIndex}`,
          type: 'EXCES_2H_JOUR',
          severity: 'warning',
          titre: `Dépassement de 2 h/jour (${slotsJour.length} h)`,
          description: `${prof?.nom || 'Prof'} (${prof?.matiere}) avec ${classesNoms} totalise ${slotsJour.length} heures le ${jourNom}.`,
          jourNom,
          jourIndex,
          entiteNom: `${prof?.nom} (${classesNoms})`,
          matiere: prof?.matiere,
          creneaux: slotsJour,
          uniteId,
          teacherId: unite.teacherId,
          classeIds: unite.classeIds,
        });
      }

      // (B) Heures coupées (non consécutives sur la même journée)
      if (slotsJour.length >= 2) {
        let isConsecutive = true;
        for (let i = 0; i < slotsJour.length - 1; i++) {
          if (slotsJour[i + 1] !== slotsJour[i] + 1) {
            isConsecutive = false;
            break;
          }
        }

        if (!isConsecutive) {
          const creneauxNums = slotsJour.map(
            (s) => getSlotCoordinates(s, semaine).creneauNumero
          );
          heuresCoupees.push({
            id: `coup_${uniteId}_j${jourIndex}`,
            type: 'HEURES_COUPEES',
            severity: 'warning',
            titre: `Séance coupée le ${jourNom}`,
            description: `Les heures de ${prof?.matiere} (${classesNoms}) sont scindées (créneaux C${creneauxNums.join(', C')}).`,
            jourNom,
            jourIndex,
            entiteNom: `${prof?.nom} (${classesNoms})`,
            matiere: prof?.matiere,
            creneaux: slotsJour,
            uniteId,
            teacherId: unite.teacherId,
            classeIds: unite.classeIds,
          });
        }
      }
    }
  }

  // 2. Trous dans l'emploi du temps des classes (heures creuses intercalées)
  for (const cls of classes) {
    const clsSlots = planning
      .filter((a) => {
        const u = uniteMap.get(a.uniteId);
        return u && u.classeIds.includes(cls.id);
      })
      .map((a) => a.slot);

    for (let j = 0; j < semaine.jours.length; j++) {
      const jourNom = semaine.jours[j];
      const daySlotsCount = semaine.creneauxParJour[j];
      const startOfDay = semaine.creneauxParJour
        .slice(0, j)
        .reduce((a, b) => a + b, 0);

      // Créneaux occupés pour ce jour
      const occupiedInDay = clsSlots
        .filter((s) => s >= startOfDay && s < startOfDay + daySlotsCount)
        .map((s) => s - startOfDay)
        .sort((a, b) => a - b);

      if (occupiedInDay.length >= 2) {
        const minSlot = occupiedInDay[0];
        const maxSlot = occupiedInDay[occupiedInDay.length - 1];
        const trous: number[] = [];

        for (let s = minSlot + 1; s < maxSlot; s++) {
          if (!occupiedInDay.includes(s)) {
            trous.push(s + 1); // 1-indexé pour l'affichage (C2, etc.)
          }
        }

        if (trous.length > 0) {
          trousClasses.push({
            id: `trou_cls_${cls.id}_j${j}`,
            type: 'TROU_CLASSE',
            severity: 'info',
            titre: `Heure(s) creuse(s) pour la classe ${cls.nom}`,
            description: `Interruption de cours le ${jourNom} au(x) créneau(x) C${trous.join(', C')}.`,
            jourNom,
            jourIndex: j,
            entiteNom: cls.nom,
          });
        }
      }
    }
  }

  // 3. Trous dans l'emploi du temps des professeurs (heures creuses intercalées)
  for (const prof of teachers) {
    const profSlots = planning
      .filter((a) => {
        const u = uniteMap.get(a.uniteId);
        return u && u.teacherId === prof.id;
      })
      .map((a) => a.slot);

    for (let j = 0; j < semaine.jours.length; j++) {
      const jourNom = semaine.jours[j];
      const daySlotsCount = semaine.creneauxParJour[j];
      const startOfDay = semaine.creneauxParJour
        .slice(0, j)
        .reduce((a, b) => a + b, 0);

      const occupiedInDay = profSlots
        .filter((s) => s >= startOfDay && s < startOfDay + daySlotsCount)
        .map((s) => s - startOfDay)
        .sort((a, b) => a - b);

      if (occupiedInDay.length >= 2) {
        const minSlot = occupiedInDay[0];
        const maxSlot = occupiedInDay[occupiedInDay.length - 1];
        const trous: number[] = [];

        for (let s = minSlot + 1; s < maxSlot; s++) {
          if (!occupiedInDay.includes(s)) {
            trous.push(s + 1);
          }
        }

        if (trous.length > 0) {
          trousProfs.push({
            id: `trou_prof_${prof.id}_j${j}`,
            type: 'TROU_PROF',
            severity: 'info',
            titre: `Heure creuse pour ${prof.nom}`,
            description: `Période d'attente le ${jourNom} au(x) créneau(x) C${trous.join(', C')}.`,
            jourNom,
            jourIndex: j,
            entiteNom: prof.nom,
            matiere: prof.matiere,
          });
        }
      }
    }
  }

  const totalExceptions =
    exces2hJour.length + heuresCoupees.length + trousClasses.length + trousProfs.length;

  return {
    totalExceptions,
    exces2hJour,
    heuresCoupees,
    trousClasses,
    trousProfs,
    creneauxLibresTotal: totalSlots * classes.length - planning.length,
  };
}
