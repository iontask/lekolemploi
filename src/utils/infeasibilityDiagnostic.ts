/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, Teacher, Unite } from '../types';
import {
  DEFAULT_RULES_OPTIONS,
  findMatchingBlockRule,
  getSlotCoordinates,
  isBlockSubject,
} from '../rules';
import { RulesOptions, ScheduleData } from '../rules/types';
import { InfeasibilityDiagnostic, PartialLevelWarning } from '../types/scenarios';

/**
 * Normalise le niveau scolaire d'une classe (ex: '2BAC', '1BAC', 'TCS', '1APIC', etc.)
 */
export function extractClassLevel(classe: Classe): string {
  if (classe.niveau && classe.niveau.trim()) {
    return classe.niveau.trim().toUpperCase();
  }
  const nom = classe.nom.trim().toUpperCase();
  if (nom.includes('2BAC') || nom.includes('2-BAC') || nom.includes('2 BAC')) return '2BAC';
  if (nom.includes('1BAC') || nom.includes('1-BAC') || nom.includes('1 BAC')) return '1BAC';
  if (nom.includes('TCS') || nom.includes('TC')) return 'TCS';
  if (nom.includes('3APIC') || nom.includes('3AC')) return '3APIC';
  if (nom.includes('2APIC') || nom.includes('2AC')) return '2APIC';
  if (nom.includes('1APIC') || nom.includes('1AC')) return '1APIC';
  return nom.split(/[-_ ]/)[0] || 'GÉNÉRAL';
}

/**
 * 4. Avertissement non bloquant si un prof enseigne un niveau partiellement.
 */
export function checkPartialLevelTeaching(
  teachers: Teacher[],
  classes: Classe[],
  unites: Unite[]
): PartialLevelWarning[] {
  const warnings: PartialLevelWarning[] = [];
  const classMap = new Map<string, Classe>(classes.map((c) => [c.id, c]));

  // Regrouper toutes les classes par niveau
  const classesParNiveau = new Map<string, Classe[]>();
  for (const c of classes) {
    const lvl = extractClassLevel(c);
    const list = classesParNiveau.get(lvl) || [];
    list.push(c);
    classesParNiveau.set(lvl, list);
  }

  for (const prof of teachers) {
    const profUnites = unites.filter((u) => u.teacherId === prof.id);
    if (profUnites.length === 0) continue;

    // Récupérer les classes enseignées par ce professeur et leurs niveaux
    const classesEnseigneesIds = new Set<string>();
    let totalHeuresProf = 0;

    for (const u of profUnites) {
      totalHeuresProf += u.heures;
      for (const cid of u.classeIds) {
        classesEnseigneesIds.add(cid);
      }
    }

    // Par niveau dans lequel le professeur intervient
    const niveauxIntervention = new Map<string, { classes: Classe[]; heures: number }>();
    for (const u of profUnites) {
      for (const cid of u.classeIds) {
        const cls = classMap.get(cid);
        if (!cls) continue;
        const lvl = extractClassLevel(cls);
        const item = niveauxIntervention.get(lvl) || { classes: [], heures: 0 };
        if (!item.classes.some((c) => c.id === cls.id)) {
          item.classes.push(cls);
        }
        item.heures += u.heures;
        niveauxIntervention.set(lvl, item);
      }
    }

    // Vérifier si le niveau est enseigné partiellement
    for (const [lvl, info] of niveauxIntervention.entries()) {
      const toutesClassesDuNiveau = classesParNiveau.get(lvl) || [];
      if (toutesClassesDuNiveau.length > 1 && info.classes.length < toutesClassesDuNiveau.length) {
        const classesNoms = info.classes.map((c) => c.nom);
        const totalNoms = toutesClassesDuNiveau.map((c) => c.nom);
        warnings.push({
          teacherId: prof.id,
          teacherNom: prof.nom,
          matiere: prof.matiere,
          niveau: lvl,
          classesEnseignees: classesNoms,
          totalClassesNiveau: toutesClassesDuNiveau.length,
          totalClassesNoms: totalNoms,
          heuresEnseignees: info.heures,
          isPartial: true,
          message: `${prof.nom} (${prof.matiere}) enseigne partiellement le niveau ${lvl} : ${classesNoms.join(', ')} sur ${totalNoms.length} classes du niveau (${classesNoms.length}/${totalNoms.length}).`,
        });
      }
    }
  }

  return warnings;
}

/**
 * 2. Diagnostic d'infaisabilité instantané avant de lancer le solveur.
 */
export function runInstantDiagnostics(
  data: ScheduleData,
  userOptions?: RulesOptions
): InfeasibilityDiagnostic {
  const options = { ...DEFAULT_RULES_OPTIONS, ...userOptions };
  const totalSlotsSemaine = data.semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const profsOverloaded: InfeasibilityDiagnostic['profsOverloaded'] = [];
  const classesOverloaded: InfeasibilityDiagnostic['classesOverloaded'] = [];
  const profsTight: InfeasibilityDiagnostic['profsTight'] = [];
  const profsExceedCeiling: InfeasibilityDiagnostic['profsExceedCeiling'] = [];
  const detailedReports: string[] = [];
  const recommendedRelaxations: string[] = [];

  // 1. Contrôle par Enseignant : Heures > dispos, marge 0 ou 1h, et plafond horaire
  for (const prof of data.teachers) {
    const profUnites = data.unites.filter((u) => u.teacherId === prof.id);
    const totalHeures = profUnites.reduce((acc, u) => acc + u.heures, 0);

    // Calculer les disponibilités réelles (en tenant compte des plages interdites par prof si configurées)
    let dispoCount = 0;
    for (let s = 0; s < totalSlotsSemaine; s++) {
      const isDispo = prof.dispo[s] ?? false;
      const isForbidden = options.forbiddenSlotsTeachers?.some(
        (f) => f.teacherId === prof.id && f.slot === s
      );
      if (isDispo && !isForbidden) {
        dispoCount++;
      }
    }

    const marge = dispoCount - totalHeures;

    // Heures > dispos (BLOQUANT)
    if (totalHeures > dispoCount) {
      profsOverloaded.push({
        teacherId: prof.id,
        teacherNom: prof.nom,
        matiere: prof.matiere,
        totalHeures,
        dispos: dispoCount,
        diff: totalHeures - dispoCount,
        message: `${prof.nom} (${prof.matiere}) a ${totalHeures} h de cours prévues pour seulement ${dispoCount} créneaux disponibles (déficit de ${totalHeures - dispoCount} h).`,
      });
      detailedReports.push(
        `🔴 ${prof.nom} : ${totalHeures} h requises > ${dispoCount} créneaux dispo. Solution mathématiquement impossible sans élargir ses disponibilités ou réduire sa charge.`
      );
    } else if (marge <= 1 && totalHeures > 0) {
      // Marge 0 ou 1 h (TIGHT / Goulot d'étranglement)
      profsTight.push({
        teacherId: prof.id,
        teacherNom: prof.nom,
        matiere: prof.matiere,
        totalHeures,
        dispos: dispoCount,
        marge,
        message: `${prof.nom} (${prof.matiere}) est sous forte tension : ${totalHeures} h à caser sur ${dispoCount} créneaux dispo (marge = ${marge} h).`,
      });
      detailedReports.push(
        `⚠️ ${prof.nom} : marge ultra-serrée (${marge} h restante(s)). Risque élevé de blocage si des classes ont des conflits horaires.`
      );
    }

    // Plafond horaire (défaut 24 h)
    const plafond = options.plafondHoraireProf ?? 24;
    if (totalHeures > plafond) {
      profsExceedCeiling.push({
        teacherId: prof.id,
        teacherNom: prof.nom,
        matiere: prof.matiere,
        totalHeures,
        plafond,
        diff: totalHeures - plafond,
        message: `${prof.nom} dépasse le plafond horaire statutaire de ${plafond} h avec ${totalHeures} h de charge (+${totalHeures - plafond} h d'heures supplémentaires).`,
      });
    }
  }

  // 2. Contrôle par Classe : Capacité hebdomadaire et créneaux réservés
  for (const cls of data.classes) {
    // Calculer le total d'heures assignées à cette classe
    const unitesDeLaClasse = data.unites.filter((u) => u.classeIds.includes(cls.id));
    const totalHeures = unitesDeLaClasse.reduce((acc, u) => acc + u.heures, 0);

    // Créneaux réservés ou interdits pour cette classe
    const reservedCount =
      options.reservedSlots?.filter((r) => r.classeId === cls.id).length || 0;
    const forbiddenCount =
      options.forbiddenSlotsClasses?.filter((f) => f.classeId === cls.id).length || 0;
    const capaciteUtile = totalSlotsSemaine - reservedCount - forbiddenCount;

    if (totalHeures > capaciteUtile) {
      classesOverloaded.push({
        classeId: cls.id,
        classeNom: cls.nom,
        totalHeures,
        capacity: capaciteUtile,
        diff: totalHeures - capaciteUtile,
        message: `La classe ${cls.nom} a ${totalHeures} h d'enseignement requises pour une capacité utile de ${capaciteUtile} créneaux (dépassement de ${totalHeures - capaciteUtile} h).`,
      });
      detailedReports.push(
        `🔴 Classe ${cls.nom} en surcharge : ${totalHeures} h > ${capaciteUtile} créneaux utiles (${reservedCount} réservé(s), ${forbiddenCount} interdit(s)).`
      );
    }
  }

  // 3. Avertissements non bloquants niveau partiel
  const partialLevelWarnings = checkPartialLevelTeaching(
    data.teachers,
    data.classes,
    data.unites
  );

  // Évaluation de la sévérité globale
  let severity: InfeasibilityDiagnostic['severity'] = 'OK';
  let summaryLabel = 'Faisabilité validée : aucune contrainte dure bloquante identifiée.';
  let canSolve = true;

  if (profsOverloaded.length > 0 || classesOverloaded.length > 0) {
    severity = 'CRITICAL';
    canSolve = false;
    summaryLabel = `Infaisabilité certaine : ${profsOverloaded.length} prof(s) en surcharge et/ou ${classesOverloaded.length} classe(s) en dépassement.`;
    recommendedRelaxations.push(
      "Élargir les disponibilités horaires des enseignants en surcharge ou réduire leur quota d'heures."
    );
    if (classesOverloaded.length > 0) {
      recommendedRelaxations.push(
        'Libérer certains créneaux réservés ou interdits pour les classes concernées.'
      );
    }
  } else if (profsTight.length > 0 || profsExceedCeiling.length > 0) {
    severity = 'TIGHT';
    canSolve = true;
    summaryLabel = `Faisabilité serrée : ${profsTight.length} enseignant(s) avec une marge de 0 ou 1 h.`;
    recommendedRelaxations.push(
      'Si le solveur bute, autoriser le relâchement des règles souples (séparation des blocs 2h, pénalités assouplies).'
    );
  }

  return {
    canSolve,
    severity,
    summaryLabel,
    profsOverloaded,
    classesOverloaded,
    profsTight,
    profsExceedCeiling,
    partialLevelWarnings,
    detailedReports,
    recommendedRelaxations,
  };
}

/**
 * Génère une explication lisible et humaine lorsqu'un solveur ne parvient pas à tout placer
 * (ex: « Aghdif : 7 h de PC en 2BACSPF pour 11 créneaux dispo, 4 h obligatoires le lundi »)
 */
export function buildInfeasibilityReport(
  data: ScheduleData,
  unplacedUnits: Unite[],
  options: RulesOptions = DEFAULT_RULES_OPTIONS
): string[] {
  const reports: string[] = [];
  const teacherMap = new Map<string, Teacher>(data.teachers.map((t) => [t.id, t]));
  const classMap = new Map<string, Classe>(data.classes.map((c) => [c.id, c]));

  for (const unite of unplacedUnits) {
    const prof = teacherMap.get(unite.teacherId);
    if (!prof) continue;

    const classesNoms = unite.classeIds
      .map((cid) => classMap.get(cid)?.nom || cid)
      .join(' + ');

    // Calculer les disponibilités du prof
    const totalSlots = data.semaine.creneauxParJour.reduce((a, b) => a + b, 0);
    const dispoSlots = Array.from({ length: totalSlots }, (_, i) => i).filter(
      (s) => prof.dispo[s] ?? false
    );

    // Vérifier les jours de disponibilité
    const dispoParJour = new Map<string, number>();
    for (const s of dispoSlots) {
      const coords = getSlotCoordinates(s, data.semaine);
      dispoParJour.set(coords.jourNom, (dispoParJour.get(coords.jourNom) || 0) + 1);
    }

    const joursDetails = Array.from(dispoParJour.entries())
      .map(([jour, count]) => `${count} h le ${jour}`)
      .join(', ');

    const classesNiveaux = unite.classeIds
      .map((cid) => {
        const c = data.classes.find((cls) => cls.id === cid);
        return c?.niveau || '';
      })
      .filter(Boolean)
      .join(' / ');
    const matchingRule = findMatchingBlockRule(
      prof.matiere,
      classesNiveaux,
      unite.heures,
      options.subjectBlockRules,
      unite.classeIds[0]
    );
    const estBloc = isBlockSubject(prof.matiere, options.matieresABlocs || ['Arabe', 'Anglais']);
    const blocInfo =
      matchingRule && matchingRule.possibilites.length > 0
        ? `, blocs configurés : ${matchingRule.possibilites.map((p) => p.join('h+')).join(' | ')} (max 3h)`
        : estBloc
        ? ', contrainte de blocs 2h consécutives active'
        : '';

    reports.push(
      `« ${prof.nom} : ${unite.heures} h de ${prof.matiere} en ${classesNoms} pour ${dispoSlots.length} créneaux dispo (${joursDetails})${blocInfo} »`
    );
  }

  return reports;
}
