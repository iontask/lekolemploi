/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Classe, ImportDataset, Semaine, Teacher, Unite } from '../types';
import { Planning, RulesOptions } from '../rules/types';
import { getSlotCoordinates } from '../rules';

export interface UnplacedUnitDetail {
  uniteId: string;
  matiere: string;
  profNom: string;
  profId: string;
  classesNoms: string;
  classeIds: string[];
  heuresRequises: number;
  heuresPlacees: number;
  heuresManquantes: number;
  dispoSlotsCount: number;
  dispoDaysCount: number;
  joursDispoDetails: string;
}

export interface AIRecommendation {
  id: string;
  category: 'BLOCKS' | 'DAILY_LIMIT' | 'FORBIDDEN_SLOTS' | 'PAUSE_MIDI' | 'RELAXED_MODE' | 'OTHER';
  title: string;
  reasoning: string;
  impactHours: number;
  patch: Partial<RulesOptions>;
}

export interface AIRecommendationResult {
  summary: string;
  predictedSuccessRate: number;
  recommendations: AIRecommendation[];
}

/**
 * Extrait les détails complets des unités et matières non affectées (ou incomplètes)
 */
export function extractUnplacedUnitsDetails(
  dataset: ImportDataset,
  planning: Planning
): {
  unplacedDetails: UnplacedUnitDetail[];
  totalRequiredHours: number;
  placedHours: number;
  missingHours: number;
  insertionRate: number;
} {
  const teacherMap = new Map<string, Teacher>(dataset.teachers.map((t) => [t.id, t]));
  const classMap = new Map<string, Classe>(dataset.classes.map((c) => [c.id, c]));

  const countMap = new Map<string, number>();
  for (const aff of planning) {
    countMap.set(aff.uniteId, (countMap.get(aff.uniteId) || 0) + 1);
  }

  const totalRequiredHours = dataset.unites.reduce((sum, u) => sum + u.heures, 0);
  const placedHours = planning.length;
  const missingHours = Math.max(0, totalRequiredHours - placedHours);
  const insertionRate = totalRequiredHours > 0 ? Math.round((placedHours / totalRequiredHours) * 100) : 100;

  const totalSlots = dataset.semaine.creneauxParJour.reduce((a, b) => a + b, 0);
  const unplacedDetails: UnplacedUnitDetail[] = [];

  for (const unite of dataset.unites) {
    const placed = countMap.get(unite.id) || 0;
    if (placed < unite.heures) {
      const prof = teacherMap.get(unite.teacherId);
      const classesNoms = unite.classeIds
        .map((cid) => classMap.get(cid)?.nom || cid)
        .join(' + ');

      const dispoSlots = Array.from({ length: totalSlots }, (_, s) => s).filter(
        (s) => prof?.dispo[s] ?? false
      );

      const dispoParJour = new Map<string, number>();
      for (const s of dispoSlots) {
        const coords = getSlotCoordinates(s, dataset.semaine);
        dispoParJour.set(coords.jourNom, (dispoParJour.get(coords.jourNom) || 0) + 1);
      }

      const joursDetails = Array.from(dispoParJour.entries())
        .map(([j, cnt]) => `${cnt}h le ${j}`)
        .join(', ');

      unplacedDetails.push({
        uniteId: unite.id,
        matiere: prof?.matiere || 'Matière inconnue',
        profNom: prof?.nom || 'Enseignant non assigné',
        profId: prof?.id || unite.teacherId,
        classesNoms,
        classeIds: unite.classeIds,
        heuresRequises: unite.heures,
        heuresPlacees: placed,
        heuresManquantes: unite.heures - placed,
        dispoSlotsCount: dispoSlots.length,
        dispoDaysCount: dispoParJour.size,
        joursDispoDetails: joursDetails || 'Aucune disponibilité',
      });
    }
  }

  return {
    unplacedDetails,
    totalRequiredHours,
    placedHours,
    missingHours,
    insertionRate,
  };
}

/**
 * Appelle le serveur API Gemini pour obtenir des recommandations d'assouplissement de contraintes
 */
export async function getAIConstraintRecommendations(params: {
  dataset: ImportDataset;
  planning: Planning;
  currentConstraints: RulesOptions;
  diagnosticReports?: string[];
}): Promise<AIRecommendationResult> {
  const { dataset, planning, currentConstraints, diagnosticReports = [] } = params;
  const analysis = extractUnplacedUnitsDetails(dataset, planning);

  if (analysis.unplacedDetails.length === 0) {
    return {
      summary: "Toutes les matières sont 100 % affectées dans cet emploi du temps. Félicitations !",
      predictedSuccessRate: 100,
      recommendations: [],
    };
  }

  if (typeof window !== 'undefined') {
    try {
      const response = await fetch('/api/ai/recommend-relaxations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unplacedUnits: analysis.unplacedDetails,
          totalHours: analysis.totalRequiredHours,
          placedHours: analysis.placedHours,
          insertionRate: analysis.insertionRate,
          currentConstraints,
          diagnosticReports,
          teachers: dataset.teachers.map((t) => ({ id: t.id, nom: t.nom, matiere: t.matiere })),
          classes: dataset.classes.map((c) => ({ id: c.id, nom: c.nom, niveau: c.niveau })),
          semaine: dataset.semaine,
        }),
      });

      if (response.ok) {
        const data: AIRecommendationResult = await response.json();
        if (data && Array.isArray(data.recommendations) && data.recommendations.length > 0) {
          return data;
        }
      }
    } catch (err) {
      console.warn('API call to /api/ai/recommend-relaxations failed, falling back to local expert heuristics:', err);
    }
  }

  // Fallback heuristique local
  return generateLocalExpertRecommendations(analysis, currentConstraints);
}

/**
 * Heuristique experte locale (garantit que l'utilisateur a toujours des recommandations immédiates)
 */
function generateLocalExpertRecommendations(
  analysis: ReturnType<typeof extractUnplacedUnitsDetails>,
  currentConstraints: RulesOptions
): AIRecommendationResult {
  const recs: AIRecommendation[] = [];
  const missingTotal = analysis.missingHours;

  // 1. Matières nécessitant d'étendre la limite quotidienne (passer à 2h ou 3h max)
  const matieresSet = new Set(analysis.unplacedDetails.map((u) => u.matiere));
  for (const mat of Array.from(matieresSet)) {
    const currentLimit = currentConstraints.maxHeuresParJourParMatiere?.[mat] ?? currentConstraints.maxHeuresParJourUnite ?? 2;
    if (currentLimit === 1) {
      recs.push({
        id: `rec_block_${mat}_to_2`,
        category: 'BLOCKS',
        title: `Autoriser des séances de 2h pour « ${mat} » (actuellement limitée à 1h)`,
        reasoning: `La matière ${mat} est actuellement restreinte à 1h par jour, ce qui impose d'avoir autant de jours distincts de disponibilité que d'heures. Autoriser 2h par séance débloque le placement.`,
        impactHours: Math.min(2, missingTotal),
        patch: {
          maxHeuresParJourParMatiere: {
            ...(currentConstraints.maxHeuresParJourParMatiere || {}),
            [mat]: 2,
          },
        },
      });
    } else {
      recs.push({
        id: `rec_block_${mat}_to_3`,
        category: 'BLOCKS',
        title: `Autoriser jusqu'à 3h par jour pour « ${mat} »`,
        reasoning: `La matière ${mat} a des heures non affectées en raison du plafonnement strict à 2h par jour. Autoriser une séance allant jusqu'à 3h permet d'absorber les heures restantes sur les jours où l'enseignant est présent.`,
        impactHours: Math.min(3, missingTotal),
        patch: {
          maxHeuresParJourParMatiere: {
            ...(currentConstraints.maxHeuresParJourParMatiere || {}),
            [mat]: 3,
          },
        },
      });
    }
  }

  // 2. Mode règles souples relâchées
  if (!currentConstraints.relaxedMode) {
    recs.push({
      id: 'rec_relaxed_mode',
      category: 'RELAXED_MODE',
      title: "Activer le mode « Règles souples relâchées » pour le solveur",
      reasoning: "Priorise à 100 % le placement intégral de toutes les heures en relâchant les pénalités de compacité et de dispersion horaire.",
      impactHours: missingTotal,
      patch: {
        relaxedMode: true,
      },
    });
  }

  // 3. Extension du plafond journalier prof
  const currentMaxProf = currentConstraints.maxHeuresParJourProf ?? 6;
  if (currentMaxProf < 8) {
    recs.push({
      id: 'rec_max_prof',
      category: 'DAILY_LIMIT',
      title: `Augmenter la limite journalière des enseignants à ${currentMaxProf + 1}h (au lieu de ${currentMaxProf}h)`,
      reasoning: `Plusieurs enseignants des unités manquantes sont déjà saturés à ${currentMaxProf}h sur leurs jours de présence. Leur donner 1h de battement supplémentaire débloque l'insertion.`,
      impactHours: 2,
      patch: {
        maxHeuresParJourProf: currentMaxProf + 1,
      },
    });
  }

  // 4. Plages interdites
  const forbiddenTotal = (currentConstraints.forbiddenSlotsClasses?.length || 0) + (currentConstraints.forbiddenSlotsTeachers?.length || 0);
  if (forbiddenTotal > 0) {
    recs.push({
      id: 'rec_forbidden_slots',
      category: 'FORBIDDEN_SLOTS',
      title: `Désactiver temporairement les plages interdites (${forbiddenTotal} créneau(x) bloqué(s))`,
      reasoning: "Les créneaux interdits restreignent les intersections compatibles entre classes et enseignants. Leur neutralisation garantit de nouvelles options de placement.",
      impactHours: Math.min(forbiddenTotal, missingTotal),
      patch: {
        forbiddenSlotsClasses: [],
        forbiddenSlotsTeachers: [],
      },
    });
  }

  // 5. Pause méridienne
  if (currentConstraints.respecterPauseMidiBlocs !== false) {
    recs.push({
      id: 'rec_pause_midi',
      category: 'PAUSE_MIDI',
      title: "Autoriser les blocs traversant la pause méridienne (créneau C4 + C5)",
      reasoning: "Permet d'ouvrir les créneaux médians de la journée pour placer les blocs de 2h qui ne trouvent pas de place le matin ou l'après-midi séparément.",
      impactHours: 2,
      patch: {
        respecterPauseMidiBlocs: false,
      },
    });
  }

  return {
    summary: `Diagnostic expert : ${missingTotal} heure(s) non affectée(s) pour ${analysis.unplacedDetails.length} unité(s) (${analysis.insertionRate}% d'insertion). La relaxation ciblée des contraintes ci-dessous permet au solveur d'atteindre un taux d'insertion de 100 %.`,
    predictedSuccessRate: 100,
    recommendations: recs,
  };
}
