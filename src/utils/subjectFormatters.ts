/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SubjectMeta {
  code: string;
  label: string;
  badgeClass: string;
  bgHex: string; // Pour ExcelJS ARGB (ex: FFDBEAFE)
  borderHex: string;
  textHex: string;
}

export const SUBJECT_DEFINITIONS: Record<string, SubjectMeta> = {
  MAT: {
    code: 'MAT',
    label: 'Mathématiques',
    badgeClass: 'bg-blue-100 text-blue-900 border-blue-300',
    bgHex: 'FFDBEAFE',
    borderHex: 'FF93C5FD',
    textHex: 'FF1E3A8A',
  },
  PC: {
    code: 'PC',
    label: 'Physique-Chimie',
    badgeClass: 'bg-purple-100 text-purple-900 border-purple-300',
    bgHex: 'FFF3E8FF',
    borderHex: 'FFD8B4FE',
    textHex: 'FF581C87',
  },
  SVT: {
    code: 'SVT',
    label: 'Sciences de la Vie et de la Terre',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    bgHex: 'FFD1FAE5',
    borderHex: 'FF6EE7B7',
    textHex: 'FF064E3B',
  },
  FR: {
    code: 'FR',
    label: 'Français',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    bgHex: 'FFFEF3C7',
    borderHex: 'FFFCD34D',
    textHex: 'FF78350F',
  },
  AR: {
    code: 'AR',
    label: 'Arabe',
    badgeClass: 'bg-teal-100 text-teal-900 border-teal-300',
    bgHex: 'FFCCFBF1',
    borderHex: 'FF5EEAD4',
    textHex: 'FF134E4A',
  },
  ANG: {
    code: 'ANG',
    label: 'Anglais',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-300',
    bgHex: 'FFE0F2FE',
    borderHex: 'FF7DD3FC',
    textHex: 'FF0C4A6E',
  },
  HG: {
    code: 'HG',
    label: 'Histoire-Géographie',
    badgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
    bgHex: 'FFFFEDD5',
    borderHex: 'FFFDBA74',
    textHex: 'FF7C2D12',
  },
  EI: {
    code: 'EI',
    label: 'Éducation Islamique',
    badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-300',
    bgHex: 'FFCFFAFE',
    borderHex: 'FF67E8F9',
    textHex: 'FF164E63',
  },
  PHI: {
    code: 'PHI',
    label: 'Philosophie',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
    bgHex: 'FFFFE4E6',
    borderHex: 'FFFFA1A8',
    textHex: 'FF881337',
  },
  INF: {
    code: 'INF',
    label: 'Informatique',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
    bgHex: 'FFE0E7FF',
    borderHex: 'FFA5B4FC',
    textHex: 'FF312E81',
  },
  EPS: {
    code: 'EPS',
    label: 'Éducation Physique et Sportive',
    badgeClass: 'bg-lime-100 text-lime-900 border-lime-300',
    bgHex: 'FFECFCCB',
    borderHex: 'FFBEF264',
    textHex: 'FF365314',
  },
  com: {
    code: 'com',
    label: 'Commerce',
    badgeClass: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300',
    bgHex: 'FFFAE8FF',
    borderHex: 'FFF0ABFC',
    textHex: 'FF701A75',
  },
  Compt: {
    code: 'Compt',
    label: 'Comptabilité',
    badgeClass: 'bg-slate-100 text-slate-900 border-slate-300',
    bgHex: 'FFF1F5F9',
    borderHex: 'FFCBD5E1',
    textHex: 'FF0F172A',
  },
  Eco: {
    code: 'Eco',
    label: 'Économie',
    badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-300',
    bgHex: 'FFFEF9C3',
    borderHex: 'FFFDE047',
    textHex: 'FF713F12',
  },
  Orga: {
    code: 'Orga',
    label: 'Organisation d\'entreprise',
    badgeClass: 'bg-zinc-100 text-zinc-900 border-zinc-300',
    bgHex: 'FFF4F4F5',
    borderHex: 'FFD4D4D8',
    textHex: 'FF18181B',
  },
};

/**
 * Normalise et retourne l'abréviation officielle aSc Horaires pour une matière donnée
 */
export function getSubjectAbbreviation(rawSubject: string): string {
  if (!rawSubject) return 'DIV';
  const clean = rawSubject.trim().toLowerCase();

  if (clean.includes('arab')) return 'AR';
  if (clean.includes('fran')) return 'FR';
  if (clean.includes('angla')) return 'ANG';
  if (clean.includes('math')) return 'MAT';
  if (clean.includes('hist') || clean.includes('géo') || clean.includes('geo')) return 'HG';
  if (clean.includes('phys') || clean.includes('chim')) return 'PC';
  if (clean.includes('svt') || clean.includes('vie')) return 'SVT';
  if (clean.includes('islam') || clean.includes('éduc. islamique') || clean.includes('educ')) return 'EI';
  if (clean.includes('phil')) return 'PHI';
  if (clean.includes('info')) return 'INF';
  if (clean.includes('eps') || clean.includes('sport')) return 'EPS';
  if (clean.includes('comm') || clean.includes('com.')) return 'com';
  if (clean.includes('compt')) return 'Compt';
  if (clean.includes('eco') || clean.includes('éco')) return 'Eco';
  if (clean.includes('orga')) return 'Orga';

  // Fallback propre
  return rawSubject.slice(0, 4).toUpperCase();
}

/**
 * Retourne les métadonnées de style (couleur, code, libellé) d'une matière
 */
export function getSubjectMeta(rawSubject: string): SubjectMeta {
  const code = getSubjectAbbreviation(rawSubject);
  const found = SUBJECT_DEFINITIONS[code];
  if (found) return found;

  return {
    code,
    label: rawSubject || code,
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
    bgHex: 'FFF8FAFC',
    borderHex: 'FFE2E8F0',
    textHex: 'FF334155',
  };
}
