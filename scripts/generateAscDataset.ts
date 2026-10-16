/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { Classe, ImportDataset, Teacher, Unite } from '../src/types';
import { Planning, Affectation } from '../src/rules/types';
import { generateAuditReport } from '../src/services/excelParser';
import { verify, score } from '../src/rules';
import { DEFAULT_MAPPING_CONFIG } from '../src/services/db';

const semaine = {
  jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
  creneauxParJour: [7, 7, 7, 7, 4], // 32 créneaux d'enseignement
};

// 12 Classes officielles Minha Escola (aSc Timetables)
const classes: Classe[] = [
  { id: 'c_1ac1', nom: '1AC 1', niveau: '1AC (1ère Collège)' },
  { id: 'c_1ac2', nom: '1AC 2', niveau: '1AC (1ère Collège)' },
  { id: 'c_2ac1', nom: '2AC 1', niveau: '2AC (2ème Collège)' },
  { id: 'c_2ac2', nom: '2AC 2', niveau: '2AC (2ème Collège)' },
  { id: 'c_3ac1', nom: '3AC 1', niveau: '3AC (3ème Collège)' },
  { id: 'c_3ac2', nom: '3AC 2', niveau: '3AC (3ème Collège)' },
  { id: 'c_tc1', nom: 'TC1', niveau: 'TC (Tronc Commun 1)' },
  { id: 'c_tc2', nom: 'TC2', niveau: 'TC (Tronc Commun 2)' },
  { id: 'c_1bac_pc', nom: '1 BAC PC', niveau: '1 BAC (Sciences Ex / PC)' },
  { id: 'c_1bac_eco', nom: '1 BAC ECO', niveau: '1 BAC (Sciences Éco)' },
  { id: 'c_2bac_pc', nom: '2 BAC PC', niveau: '2 BAC (Sciences Physiques)' },
  { id: 'c_2bac_eco', nom: '2 Bac Eco', niveau: '2 BAC (Sciences Éco)' },
];

const classMap = new Map(classes.map((c) => [c.nom, c.id]));

// Mapping de créneau aSc vers slot global de l'applet (0..31)
// Dans aSc : Lundi..Jeudi col 1..4 (matin), 5 (pause), 6..8 (après-midi)
// Vendredi : col 1..4 (matin)
function ascSlot(day: number, col: number): number {
  const dayStart = [0, 7, 14, 21, 28][day];
  let localSlot = 0;
  if (col >= 1 && col <= 4) {
    localSlot = col - 1;
  } else if (col >= 6 && col <= 8) {
    localSlot = col - 2; // Col 6 -> 4, Col 7 -> 5, Col 8 -> 6
  } else {
    throw new Error(`Créneau aSc invalide : jour ${day}, col ${col}`);
  }
  return dayStart + localSlot;
}

// 29 Enseignants officiels avec leurs matières
const rawTeachers = [
  { id: 't_rachid', nom: 'prof RACHID RA', matiere: 'Mathématiques' },
  { id: 't_fouzia', nom: 'prof FOUZIA KHALOUFI', matiere: 'Français' },
  { id: 't_omar', nom: 'prof OMAR', matiere: 'Mathématiques' },
  { id: 't_tawan', nom: 'prof TAWAN MOHAMED', matiere: 'Éducation Islamique' },
  { id: 't_houssine_ang', nom: 'prof Houssine ANGL', matiere: 'Anglais' },
  { id: 't_houssin_ar', nom: 'prof HOUSSIN ARABE', matiere: 'Arabe' },
  { id: 't_ikbal', nom: 'prof IKBAL franç', matiere: 'Français' },
  { id: 't_sanaa', nom: 'prof sanaa PC', matiere: 'Physique-Chimie' },
  { id: 't_mounaim', nom: 'prof MOUNAIM SVT', matiere: 'SVT' },
  { id: 't_ayoub', nom: 'prof AYOUB EI', matiere: 'Éducation Islamique' },
  { id: 't_karim', nom: 'prof karim MATH', matiere: 'Mathématiques' },
  { id: 't_abdelhadi', nom: 'prof.ABDEL HADI ANGLAIS', matiere: 'Anglais' },
  { id: 't_elregi', nom: 'prof El regi HI-Gé', matiere: 'Histoire-Géographie' },
  { id: 't_elyousfi', nom: 'prof El yousfi arab', matiere: 'Arabe' },
  { id: 't_philo', nom: 'prof PHILO', matiere: 'Philosophie' },
  { id: 't_esp', nom: 'prof ESP', matiere: 'EPS' },
  { id: 't_hedadi', nom: 'prof HEDADI HI-Gé', matiere: 'Histoire-Géographie' },
  { id: 't_bentaib', nom: 'prof Ben taib svt SVT', matiere: 'SVT' },
  { id: 't_youssef', nom: 'prof youssef franç', matiere: 'Français' },
  { id: 't_najib', nom: 'prof najib pc', matiere: 'Physique-Chimie' },
  { id: 't_abdelmoutaleb', nom: 'prof abdelmoutaleb compt', matiere: 'Comptabilité' },
  { id: 't_amine_eco', nom: 'prof amine eco', matiere: 'Économie' },
  { id: 't_amine_orga', nom: 'prof amine orga', matiere: 'Organisation' },
  { id: 't_alanzoli', nom: 'prof AL ANZOLI hi-gé', matiere: 'Histoire-Géographie' },
  { id: 't_ismail', nom: 'prof ismail svt', matiere: 'SVT' },
  { id: 't_mousaid', nom: 'prof mousaid arabe', matiere: 'Arabe' },
  { id: 't_nadia', nom: 'PROF NADIA COM', matiere: 'Communication' },
  { id: 't_hachim', nom: 'prof hachim pc', matiere: 'Physique-Chimie' },
  { id: 't_divers', nom: 'xx divers', matiere: 'Divers' },
];

// Liste brute de toutes les affectations déduites fidèlement de l'emploi du temps aSc Timetables
interface RawAff {
  teacherId: string;
  classeNames: string[]; // 1 classe ou plusieurs si cours commun (ex: 1 BAC PC + 1 BAC ECO)
  day: number; // 0: Lun, 1: Mar, 2: Mer, 3: Jeu, 4: Ven
  cols: number[]; // colonnes aSc (1..4, 6..8)
}

const rawAssignments: RawAff[] = [
  // 1. prof RACHID RA (Maths: 3AC 1, 3AC 2, TC1, TC2) -> 20h
  { teacherId: 't_rachid', classeNames: ['3AC 1'], day: 0, cols: [3, 4] },
  { teacherId: 't_rachid', classeNames: ['TC2'], day: 0, cols: [6] },
  { teacherId: 't_rachid', classeNames: ['TC2'], day: 1, cols: [1, 2] },
  { teacherId: 't_rachid', classeNames: ['3AC 1'], day: 1, cols: [3, 4] },
  { teacherId: 't_rachid', classeNames: ['TC1'], day: 1, cols: [6] },
  { teacherId: 't_rachid', classeNames: ['3AC 2'], day: 1, cols: [7, 8] },
  { teacherId: 't_rachid', classeNames: ['TC2'], day: 2, cols: [1, 2] },
  { teacherId: 't_rachid', classeNames: ['TC1'], day: 2, cols: [3, 4] },
  { teacherId: 't_rachid', classeNames: ['3AC 1'], day: 2, cols: [7] },
  { teacherId: 't_rachid', classeNames: ['3AC 2'], day: 2, cols: [8] },
  { teacherId: 't_rachid', classeNames: ['TC1'], day: 3, cols: [1, 2] },
  { teacherId: 't_rachid', classeNames: ['3AC 2'], day: 4, cols: [1, 2] },

  // 2. prof FOUZIA KHALOUFI (Français: 1AC 1, 1AC 2, 2AC 1, 2AC 2) -> 24h
  { teacherId: 't_fouzia', classeNames: ['1AC 2'], day: 0, cols: [2] },
  { teacherId: 't_fouzia', classeNames: ['1AC 1'], day: 0, cols: [3, 4] },
  { teacherId: 't_fouzia', classeNames: ['2AC 2'], day: 0, cols: [6] },
  { teacherId: 't_fouzia', classeNames: ['2AC 1'], day: 0, cols: [7, 8] },
  { teacherId: 't_fouzia', classeNames: ['1AC 2'], day: 1, cols: [1, 2] },
  { teacherId: 't_fouzia', classeNames: ['2AC 2'], day: 1, cols: [3, 4] },
  { teacherId: 't_fouzia', classeNames: ['2AC 2'], day: 1, cols: [6] },
  { teacherId: 't_fouzia', classeNames: ['2AC 1'], day: 1, cols: [7] },
  { teacherId: 't_fouzia', classeNames: ['1AC 1'], day: 1, cols: [8] },
  { teacherId: 't_fouzia', classeNames: ['2AC 1'], day: 2, cols: [1, 2] },
  { teacherId: 't_fouzia', classeNames: ['1AC 1'], day: 3, cols: [3, 4] },
  { teacherId: 't_fouzia', classeNames: ['2AC 1'], day: 3, cols: [6] },
  { teacherId: 't_fouzia', classeNames: ['1AC 2'], day: 3, cols: [7] },
  { teacherId: 't_fouzia', classeNames: ['1AC 1'], day: 3, cols: [8] },
  { teacherId: 't_fouzia', classeNames: ['1AC 2'], day: 4, cols: [1, 2] },
  { teacherId: 't_fouzia', classeNames: ['2AC 2'], day: 4, cols: [3, 4] },

  // 3. prof OMAR (Mathématiques: 1AC 1, 1AC 2, 2AC 1, 2AC 2) -> 24h
  { teacherId: 't_omar', classeNames: ['1AC 2'], day: 0, cols: [1] },
  { teacherId: 't_omar', classeNames: ['2AC 2'], day: 0, cols: [2] },
  { teacherId: 't_omar', classeNames: ['2AC 1'], day: 0, cols: [3] },
  { teacherId: 't_omar', classeNames: ['1AC 2'], day: 0, cols: [6] },
  { teacherId: 't_omar', classeNames: ['1AC 1'], day: 0, cols: [7, 8] },
  { teacherId: 't_omar', classeNames: ['1AC 2'], day: 2, cols: [1, 2] },
  { teacherId: 't_omar', classeNames: ['2AC 2'], day: 2, cols: [3, 4] },
  { teacherId: 't_omar', classeNames: ['1AC 1'], day: 2, cols: [6, 7] },
  { teacherId: 't_omar', classeNames: ['2AC 1'], day: 2, cols: [8] },
  { teacherId: 't_omar', classeNames: ['1AC 2'], day: 3, cols: [1, 2] },
  { teacherId: 't_omar', classeNames: ['2AC 1'], day: 3, cols: [3, 4] },
  { teacherId: 't_omar', classeNames: ['2AC 2'], day: 3, cols: [6, 7, 8] },
  { teacherId: 't_omar', classeNames: ['2AC 1'], day: 4, cols: [1, 2] },
  { teacherId: 't_omar', classeNames: ['1AC 1'], day: 4, cols: [3, 4] },

  // 4. prof TAWAN MOHAMED (Éducation Islamique: 1AC 1, 1AC 2, 2AC 1, 2AC 2, TC1, TC2) -> 12h
  { teacherId: 't_tawan', classeNames: ['2AC 1'], day: 0, cols: [1, 2] },
  { teacherId: 't_tawan', classeNames: ['2AC 2'], day: 0, cols: [3, 4] },
  { teacherId: 't_tawan', classeNames: ['1AC 1'], day: 2, cols: [1, 2] },
  { teacherId: 't_tawan', classeNames: ['1AC 2'], day: 2, cols: [3, 4] },
  { teacherId: 't_tawan', classeNames: ['TC2'], day: 2, cols: [7, 8] },
  { teacherId: 't_tawan', classeNames: ['TC1'], day: 4, cols: [3, 4] },

  // 5. prof Houssine ANGL (Anglais Lycée: TC1, TC2, 1 BAC PC, 1 BAC ECO, 2 BAC PC, 2 Bac Eco) -> 24h
  { teacherId: 't_houssine_ang', classeNames: ['2 Bac Eco'], day: 0, cols: [1, 2] },
  { teacherId: 't_houssine_ang', classeNames: ['1 BAC ECO'], day: 0, cols: [3, 4] },
  { teacherId: 't_houssine_ang', classeNames: ['1 BAC ECO'], day: 1, cols: [1] },
  { teacherId: 't_houssine_ang', classeNames: ['TC1'], day: 1, cols: [3, 4] },
  { teacherId: 't_houssine_ang', classeNames: ['1 BAC PC'], day: 1, cols: [6] },
  { teacherId: 't_houssine_ang', classeNames: ['2 BAC PC'], day: 1, cols: [7, 8] },
  { teacherId: 't_houssine_ang', classeNames: ['2 Bac Eco'], day: 2, cols: [2, 3, 4] },
  { teacherId: 't_houssine_ang', classeNames: ['TC2'], day: 3, cols: [1, 2] },
  { teacherId: 't_houssine_ang', classeNames: ['1 BAC PC'], day: 3, cols: [3, 4] },
  { teacherId: 't_houssine_ang', classeNames: ['TC1'], day: 3, cols: [7, 8] },
  { teacherId: 't_houssine_ang', classeNames: ['2 BAC PC'], day: 4, cols: [1, 2] },
  { teacherId: 't_houssine_ang', classeNames: ['TC2'], day: 4, cols: [3, 4] },

  // 6. prof HOUSSIN ARABE (Arabe Collège: 1AC 1, 1AC 2, 2AC 1, 2AC 2, 3AC 1, 3AC 2) -> 24h
  { teacherId: 't_houssin_ar', classeNames: ['1AC 1'], day: 0, cols: [1, 2] },
  { teacherId: 't_houssin_ar', classeNames: ['2AC 1'], day: 0, cols: [4] },
  { teacherId: 't_houssin_ar', classeNames: ['3AC 1'], day: 0, cols: [6] },
  { teacherId: 't_houssin_ar', classeNames: ['1AC 2'], day: 0, cols: [7, 8] },
  { teacherId: 't_houssin_ar', classeNames: ['3AC 2'], day: 1, cols: [3, 4] },
  { teacherId: 't_houssin_ar', classeNames: ['2AC 1'], day: 1, cols: [6] },
  { teacherId: 't_houssin_ar', classeNames: ['2AC 2'], day: 1, cols: [7, 8] },
  { teacherId: 't_houssin_ar', classeNames: ['3AC 1'], day: 2, cols: [3, 4] },
  { teacherId: 't_houssin_ar', classeNames: ['3AC 2'], day: 2, cols: [6] },
  { teacherId: 't_houssin_ar', classeNames: ['2AC 2'], day: 3, cols: [1, 2] },
  { teacherId: 't_houssin_ar', classeNames: ['3AC 1'], day: 3, cols: [3] },
  { teacherId: 't_houssin_ar', classeNames: ['3AC 2'], day: 3, cols: [6] },
  { teacherId: 't_houssin_ar', classeNames: ['2AC 1'], day: 3, cols: [7, 8] },
  { teacherId: 't_houssin_ar', classeNames: ['1AC 1'], day: 4, cols: [1, 2] },
  { teacherId: 't_houssin_ar', classeNames: ['1AC 2'], day: 4, cols: [3, 4] },

  // 7. prof IKBAL franç (Français: 3AC 1, 3AC 2, TC1, TC2) -> 20h
  { teacherId: 't_ikbal', classeNames: ['TC2'], day: 0, cols: [1, 2] },
  { teacherId: 't_ikbal', classeNames: ['TC1'], day: 0, cols: [6] },
  { teacherId: 't_ikbal', classeNames: ['3AC 1'], day: 0, cols: [7, 8] },
  { teacherId: 't_ikbal', classeNames: ['3AC 1'], day: 1, cols: [1] },
  { teacherId: 't_ikbal', classeNames: ['3AC 2'], day: 1, cols: [2] },
  { teacherId: 't_ikbal', classeNames: ['TC2'], day: 1, cols: [6] },
  { teacherId: 't_ikbal', classeNames: ['TC1'], day: 1, cols: [7, 8] },
  { teacherId: 't_ikbal', classeNames: ['3AC 2'], day: 3, cols: [1, 2] },
  { teacherId: 't_ikbal', classeNames: ['TC2'], day: 3, cols: [3, 4] },
  { teacherId: 't_ikbal', classeNames: ['3AC 1'], day: 3, cols: [7, 8] },
  { teacherId: 't_ikbal', classeNames: ['TC1'], day: 4, cols: [1, 2] },
  { teacherId: 't_ikbal', classeNames: ['3AC 2'], day: 4, cols: [3, 4] },

  // 8. prof sanaa PC (Physique-Chimie: 2AC 1, 2AC 2, 3AC 1, 3AC 2, TC1, TC2) -> 22h
  { teacherId: 't_sanaa', classeNames: ['2AC 2'], day: 0, cols: [1] },
  { teacherId: 't_sanaa', classeNames: ['TC1'], day: 0, cols: [3, 4] },
  { teacherId: 't_sanaa', classeNames: ['2AC 1'], day: 0, cols: [6] },
  { teacherId: 't_sanaa', classeNames: ['3AC 2'], day: 0, cols: [7, 8] },
  { teacherId: 't_sanaa', classeNames: ['3AC 1'], day: 1, cols: [6] },
  { teacherId: 't_sanaa', classeNames: ['TC2'], day: 1, cols: [7, 8] },
  { teacherId: 't_sanaa', classeNames: ['3AC 2'], day: 2, cols: [1] },
  { teacherId: 't_sanaa', classeNames: ['2AC 1'], day: 2, cols: [3, 4] },
  { teacherId: 't_sanaa', classeNames: ['TC1'], day: 2, cols: [6] },
  { teacherId: 't_sanaa', classeNames: ['2AC 2'], day: 2, cols: [7] },
  { teacherId: 't_sanaa', classeNames: ['3AC 1'], day: 2, cols: [8] },
  { teacherId: 't_sanaa', classeNames: ['TC1'], day: 3, cols: [4] },
  { teacherId: 't_sanaa', classeNames: ['TC2'], day: 3, cols: [6] },
  { teacherId: 't_sanaa', classeNames: ['3AC 2'], day: 3, cols: [7] },
  { teacherId: 't_sanaa', classeNames: ['2AC 2'], day: 4, cols: [1] },
  { teacherId: 't_sanaa', classeNames: ['TC2'], day: 4, cols: [2] },
  { teacherId: 't_sanaa', classeNames: ['3AC 1'], day: 4, cols: [3, 4] },

  // 9. prof MOUNAIM SVT (SVT Collège: 1AC 1, 1AC 2, 2AC 1, 2AC 2, 3AC 1, 3AC 2) -> 18h
  { teacherId: 't_mounaim', classeNames: ['3AC 2'], day: 0, cols: [1, 2] },
  { teacherId: 't_mounaim', classeNames: ['1AC 2'], day: 0, cols: [3, 4] },
  { teacherId: 't_mounaim', classeNames: ['2AC 2'], day: 1, cols: [1, 2] },
  { teacherId: 't_mounaim', classeNames: ['2AC 1'], day: 1, cols: [3, 4] },
  { teacherId: 't_mounaim', classeNames: ['3AC 1'], day: 2, cols: [1, 2] },
  { teacherId: 't_mounaim', classeNames: ['1AC 1'], day: 2, cols: [3] },
  { teacherId: 't_mounaim', classeNames: ['2AC 1'], day: 2, cols: [6] },
  { teacherId: 't_mounaim', classeNames: ['3AC 2'], day: 2, cols: [7] },
  { teacherId: 't_mounaim', classeNames: ['2AC 2'], day: 2, cols: [8] },
  { teacherId: 't_mounaim', classeNames: ['1AC 1'], day: 3, cols: [1, 2] },
  { teacherId: 't_mounaim', classeNames: ['1AC 2'], day: 3, cols: [3] },
  { teacherId: 't_mounaim', classeNames: ['3AC 1'], day: 3, cols: [4] },

  // 10. prof AYOUB EI (Éducation Islamique: 3AC 1, 3AC 2, 1 BAC PC) -> 10h
  { teacherId: 't_ayoub', classeNames: ['3AC 1'], day: 0, cols: [1, 2] },
  { teacherId: 't_ayoub', classeNames: ['3AC 2'], day: 0, cols: [3, 4] },
  { teacherId: 't_ayoub', classeNames: ['3AC 2'], day: 1, cols: [6] },
  { teacherId: 't_ayoub', classeNames: ['1 BAC PC'], day: 1, cols: [7, 8] },
  { teacherId: 't_ayoub', classeNames: ['3AC 1'], day: 2, cols: [6] },
  { teacherId: 't_ayoub', classeNames: ['1 BAC PC'], day: 2, cols: [7, 8] },

  // 11. prof karim MATH (Maths Lycée: 1 BAC PC, 1 BAC ECO, 2 BAC PC, 2 Bac Eco) -> 19h
  { teacherId: 't_karim', classeNames: ['1 BAC PC'], day: 0, cols: [6] },
  { teacherId: 't_karim', classeNames: ['2 BAC PC'], day: 0, cols: [7] },
  { teacherId: 't_karim', classeNames: ['2 BAC PC'], day: 1, cols: [1, 2] },
  { teacherId: 't_karim', classeNames: ['1 BAC PC'], day: 1, cols: [3, 4] },
  { teacherId: 't_karim', classeNames: ['2 BAC PC'], day: 2, cols: [1, 2] },
  { teacherId: 't_karim', classeNames: ['1 BAC PC'], day: 2, cols: [3] },
  { teacherId: 't_karim', classeNames: ['1 BAC ECO'], day: 2, cols: [4] },
  { teacherId: 't_karim', classeNames: ['2 Bac Eco'], day: 2, cols: [7, 8] },
  { teacherId: 't_karim', classeNames: ['2 BAC PC'], day: 3, cols: [1, 2] },
  { teacherId: 't_karim', classeNames: ['2 Bac Eco'], day: 3, cols: [3, 4] },
  { teacherId: 't_karim', classeNames: ['1 BAC ECO'], day: 4, cols: [1, 2] },
  { teacherId: 't_karim', classeNames: ['2 Bac Eco'], day: 4, cols: [3] },

  // 12. prof.ABDEL HADI ANGLAIS (Anglais Collège: 1AC 1..3AC 2) -> 24h
  { teacherId: 't_abdelhadi', classeNames: ['3AC 2'], day: 0, cols: [6] },
  { teacherId: 't_abdelhadi', classeNames: ['2AC 2'], day: 0, cols: [7, 8] },
  { teacherId: 't_abdelhadi', classeNames: ['2AC 1'], day: 1, cols: [1, 2] },
  { teacherId: 't_abdelhadi', classeNames: ['1AC 1'], day: 1, cols: [3, 4] },
  { teacherId: 't_abdelhadi', classeNames: ['1AC 2'], day: 1, cols: [6, 7] },
  { teacherId: 't_abdelhadi', classeNames: ['3AC 1'], day: 1, cols: [7, 8] },
  { teacherId: 't_abdelhadi', classeNames: ['2AC 2'], day: 2, cols: [1, 2] },
  { teacherId: 't_abdelhadi', classeNames: ['3AC 2'], day: 2, cols: [3, 4] },
  { teacherId: 't_abdelhadi', classeNames: ['1AC 2'], day: 2, cols: [6, 7] },
  { teacherId: 't_abdelhadi', classeNames: ['1AC 1'], day: 3, cols: [6, 7] },
  { teacherId: 't_abdelhadi', classeNames: ['3AC 2'], day: 3, cols: [8] },
  { teacherId: 't_abdelhadi', classeNames: ['3AC 1'], day: 4, cols: [1, 2] },
  { teacherId: 't_abdelhadi', classeNames: ['2AC 1'], day: 4, cols: [3, 4] },

  // 13. prof El regi HI-Gé (Histoire-Géo Lycée: TC1, TC2, 1 BAC PC, 1 BAC ECO) -> 14h (avec cours communs)
  { teacherId: 't_elregi', classeNames: ['1 BAC PC', '1 BAC ECO'], day: 0, cols: [1, 2] }, // Cours commun 1 BAC
  { teacherId: 't_elregi', classeNames: ['TC1'], day: 0, cols: [7] },
  { teacherId: 't_elregi', classeNames: ['TC2'], day: 0, cols: [8] },
  { teacherId: 't_elregi', classeNames: ['TC1'], day: 2, cols: [1, 2] },
  { teacherId: 't_elregi', classeNames: ['TC2'], day: 2, cols: [3, 4] },
  { teacherId: 't_elregi', classeNames: ['1 BAC PC', '1 BAC ECO'], day: 2, cols: [6] }, // Cours commun 1 BAC

  // 14. prof El yousfi arab (Arabe Lycée: 1 BAC PC) -> 4h
  { teacherId: 't_elyousfi', classeNames: ['1 BAC PC'], day: 0, cols: [7, 8] },
  { teacherId: 't_elyousfi', classeNames: ['1 BAC PC'], day: 3, cols: [1, 2] },

  // 15. prof PHILO (Philosophie: TC1, TC2, 1 BAC PC, 1 BAC ECO, 2 BAC PC, 2 Bac Eco) -> 11h
  { teacherId: 't_philo', classeNames: ['2 Bac Eco'], day: 0, cols: [3, 4] },
  { teacherId: 't_philo', classeNames: ['2 BAC PC'], day: 0, cols: [6] },
  { teacherId: 't_philo', classeNames: ['1 BAC ECO'], day: 1, cols: [6] },
  { teacherId: 't_philo', classeNames: ['2 Bac Eco'], day: 1, cols: [8] },
  { teacherId: 't_philo', classeNames: ['1 BAC PC'], day: 2, cols: [4] },
  { teacherId: 't_philo', classeNames: ['2 BAC PC'], day: 2, cols: [7, 8] },
  { teacherId: 't_philo', classeNames: ['TC1'], day: 3, cols: [6] },
  { teacherId: 't_philo', classeNames: ['TC2'], day: 3, cols: [7] },
  { teacherId: 't_philo', classeNames: ['2 BAC PC'], day: 3, cols: [8] },

  // 16. prof ESP (EPS Collège & Tronc Commun) -> 8h
  { teacherId: 't_esp', classeNames: ['3AC 2'], day: 2, cols: [2] },
  { teacherId: 't_esp', classeNames: ['1AC 1'], day: 2, cols: [4] },
  { teacherId: 't_esp', classeNames: ['2AC 2'], day: 2, cols: [6] },
  { teacherId: 't_esp', classeNames: ['2AC 1'], day: 2, cols: [7] },
  { teacherId: 't_esp', classeNames: ['TC1'], day: 3, cols: [3] },
  { teacherId: 't_esp', classeNames: ['1AC 2'], day: 3, cols: [4] },
  { teacherId: 't_esp', classeNames: ['3AC 1'], day: 3, cols: [6] },
  { teacherId: 't_esp', classeNames: ['TC2'], day: 3, cols: [8] },

  // 17. prof HEDADI HI-Gé (Histoire-Géo Collège 1AC & 2AC) -> 8h
  { teacherId: 't_hedadi', classeNames: ['1AC 1'], day: 1, cols: [1, 2] },
  { teacherId: 't_hedadi', classeNames: ['1AC 2'], day: 1, cols: [3, 4] },
  { teacherId: 't_hedadi', classeNames: ['2AC 1'], day: 3, cols: [1, 2] },
  { teacherId: 't_hedadi', classeNames: ['2AC 2'], day: 3, cols: [3, 4] },

  // 18. prof Ben taib svt SVT (SVT 1 BAC PC & 2 BAC PC) -> 9h
  { teacherId: 't_bentaib', classeNames: ['2 BAC PC'], day: 2, cols: [3, 4] },
  { teacherId: 't_bentaib', classeNames: ['2 BAC PC'], day: 3, cols: [3, 4] },
  { teacherId: 't_bentaib', classeNames: ['1 BAC PC'], day: 3, cols: [6] },
  { teacherId: 't_bentaib', classeNames: ['1 BAC PC'], day: 4, cols: [1, 2] },
  { teacherId: 't_bentaib', classeNames: ['2 BAC PC'], day: 4, cols: [3, 4] },

  // 19. prof youssef franç (Français Lycée: 1 BAC PC + 1 BAC ECO, 2 BAC PC, 2 Bac Eco) -> 14h (avec cours communs)
  { teacherId: 't_youssef', classeNames: ['2 Bac Eco'], day: 0, cols: [6] },
  { teacherId: 't_youssef', classeNames: ['2 BAC PC'], day: 0, cols: [8] },
  { teacherId: 't_youssef', classeNames: ['1 BAC PC', '1 BAC ECO'], day: 2, cols: [1, 2] }, // Cours commun FR 1 BAC
  { teacherId: 't_youssef', classeNames: ['1 BAC PC', '1 BAC ECO'], day: 3, cols: [7, 8] }, // Cours commun FR 1 BAC
  { teacherId: 't_youssef', classeNames: ['1 BAC PC', '1 BAC ECO'], day: 4, cols: [3, 4] }, // Cours commun FR 1 BAC

  // 20. prof najib pc (Physique-Chimie: 1 BAC PC & 2 BAC PC) -> 10h
  { teacherId: 't_najib', classeNames: ['2 BAC PC'], day: 0, cols: [1, 2] },
  { teacherId: 't_najib', classeNames: ['1 BAC PC'], day: 0, cols: [3, 4] },
  { teacherId: 't_najib', classeNames: ['1 BAC PC'], day: 1, cols: [1, 2] },
  { teacherId: 't_najib', classeNames: ['2 BAC PC'], day: 1, cols: [3, 4] },
  { teacherId: 't_najib', classeNames: ['2 BAC PC'], day: 1, cols: [6] },
  { teacherId: 't_najib', classeNames: ['2 BAC PC'], day: 2, cols: [6] },

  // 21. prof abdelmoutaleb compt (Comptabilité: 1 BAC ECO & 2 Bac Eco) -> 7h
  { teacherId: 't_abdelmoutaleb', classeNames: ['2 Bac Eco'], day: 1, cols: [1, 2] },
  { teacherId: 't_abdelmoutaleb', classeNames: ['1 BAC ECO'], day: 1, cols: [3, 4] }, // cols 3..4
  { teacherId: 't_abdelmoutaleb', classeNames: ['2 Bac Eco'], day: 4, cols: [1, 2] },

  // 22. prof amine eco (Économie: 1 BAC ECO & 2 Bac Eco) -> 8h
  { teacherId: 't_amine_eco', classeNames: ['1 BAC ECO'], day: 0, cols: [6] },
  { teacherId: 't_amine_eco', classeNames: ['2 Bac Eco'], day: 0, cols: [7, 8] },
  { teacherId: 't_amine_eco', classeNames: ['2 Bac Eco'], day: 1, cols: [6, 7] },
  { teacherId: 't_amine_eco', classeNames: ['1 BAC ECO'], day: 3, cols: [6] },
  { teacherId: 't_amine_eco', classeNames: ['2 Bac Eco'], day: 3, cols: [7, 8] },

  // 23. prof amine orga (Organisation: 1 BAC ECO & 2 Bac Eco) -> 7h
  { teacherId: 't_amine_orga', classeNames: ['2 Bac Eco'], day: 1, cols: [3, 4] },
  { teacherId: 't_amine_orga', classeNames: ['2 Bac Eco'], day: 2, cols: [1] },
  { teacherId: 't_amine_orga', classeNames: ['2 Bac Eco'], day: 3, cols: [1, 2] },
  { teacherId: 't_amine_orga', classeNames: ['1 BAC ECO'], day: 3, cols: [3, 4] },

  // 24. prof AL ANZOLI hi-gé (Histoire-Géo 3AC 1 & 3AC 2) -> 6h
  { teacherId: 't_alanzoli', classeNames: ['3AC 2'], day: 1, cols: [1] },
  { teacherId: 't_alanzoli', classeNames: ['3AC 1'], day: 1, cols: [2] },
  { teacherId: 't_alanzoli', classeNames: ['3AC 1'], day: 3, cols: [1, 2] },
  { teacherId: 't_alanzoli', classeNames: ['3AC 2'], day: 3, cols: [3, 4] },

  // 25. prof ismail svt (SVT TC1 & TC2) -> 6h
  { teacherId: 't_ismail', classeNames: ['TC1'], day: 0, cols: [8] },
  { teacherId: 't_ismail', classeNames: ['TC2'], day: 0, cols: [7] },
  { teacherId: 't_ismail', classeNames: ['TC1'], day: 1, cols: [1, 2] },
  { teacherId: 't_ismail', classeNames: ['TC2'], day: 1, cols: [3, 4] },

  // 26. prof mousaid arabe (Arabe TC1 & TC2) -> 6h
  { teacherId: 't_mousaid', classeNames: ['TC1'], day: 0, cols: [1, 2] },
  { teacherId: 't_mousaid', classeNames: ['TC2'], day: 0, cols: [3, 4] },
  { teacherId: 't_mousaid', classeNames: ['TC2'], day: 2, cols: [6] },
  { teacherId: 't_mousaid', classeNames: ['TC1'], day: 2, cols: [7] },

  // 27. PROF NADIA COM (Communication & Contrôle) -> 9h
  { teacherId: 't_nadia', classeNames: ['1AC 1'], day: 1, cols: [7] },
  { teacherId: 't_nadia', classeNames: ['2AC 1'], day: 1, cols: [8] },
  { teacherId: 't_nadia', classeNames: ['1 BAC ECO'], day: 2, cols: [3] },
  { teacherId: 't_nadia', classeNames: ['2 Bac Eco'], day: 2, cols: [6] },
  { teacherId: 't_nadia', classeNames: ['TC1'], day: 2, cols: [8] },
  { teacherId: 't_nadia', classeNames: ['1AC 2'], day: 3, cols: [8] },
  { teacherId: 't_nadia', classeNames: ['2 BAC PC'], day: 3, cols: [7] },
  { teacherId: 't_nadia', classeNames: ['TC2'], day: 4, cols: [1] },
  { teacherId: 't_nadia', classeNames: ['2AC 2'], day: 4, cols: [2] },

  // 28. prof hachim pc (Physique-Chimie 1AC 1 & 1AC 2) -> 6h
  { teacherId: 't_hachim', classeNames: ['1AC 1'], day: 0, cols: [6] },
  { teacherId: 't_hachim', classeNames: ['1AC 1'], day: 1, cols: [6] },
  { teacherId: 't_hachim', classeNames: ['1AC 2'], day: 1, cols: [8] },
  { teacherId: 't_hachim', classeNames: ['1AC 1'], day: 2, cols: [8] },
  { teacherId: 't_hachim', classeNames: ['1AC 2'], day: 3, cols: [6] },
  { teacherId: 't_hachim', classeNames: ['1AC 2'], day: 4, cols: [2] }, // col 2 (FR is col 1)

  // 29. xx divers (Arabe & Éducation Islamique pour 1 BAC ECO, 2 BAC PC, 2 Bac Eco) -> 12h
  { teacherId: 't_divers', classeNames: ['2 BAC PC'], day: 0, cols: [3] }, // AR 1h
  { teacherId: 't_divers', classeNames: ['1 BAC ECO'], day: 0, cols: [7, 8] }, // AR 2h
  { teacherId: 't_divers', classeNames: ['1 BAC ECO'], day: 1, cols: [7, 8] }, // EI 2h
  { teacherId: 't_divers', classeNames: ['1 BAC ECO'], day: 2, cols: [7, 8] }, // EI 2h
  { teacherId: 't_divers', classeNames: ['1 BAC ECO'], day: 3, cols: [1, 2] }, // AR 2h
  { teacherId: 't_divers', classeNames: ['2 Bac Eco'], day: 3, cols: [6] }, // AR 1h
  { teacherId: 't_divers', classeNames: ['2 Bac Eco'], day: 4, cols: [4] }, // MAT/EI 1h
];

// Construire les unités et le planning
const unitMap = new Map<string, Unite>();
const planning: Planning = [];

for (const aff of rawAssignments) {
  const cIds = aff.classeNames.map((name) => {
    const id = classMap.get(name);
    if (!id) throw new Error(`Classe inconnue : ${name}`);
    return id;
  });

  const uKey = `${aff.teacherId}__${cIds.sort().join('_')}`;
  let unite = unitMap.get(uKey);
  if (!unite) {
    unite = {
      id: `u_${uKey}`,
      teacherId: aff.teacherId,
      classeIds: cIds,
      heures: 0,
      estCommun: cIds.length > 1,
    };
    unitMap.set(uKey, unite);
  }

  for (const col of aff.cols) {
    const slot = ascSlot(aff.day, col);
    unite.heures += 1;
    planning.push({
      uniteId: unite.id,
      slot,
    });
  }
}

const unites = Array.from(unitMap.values());

// Calculer les disponibilités réelles des enseignants (32 créneaux)
const teacherOccupiedSlots = new Map<string, Set<number>>();
for (const p of planning) {
  const u = unites.find((un) => un.id === p.uniteId);
  if (u) {
    const set = teacherOccupiedSlots.get(u.teacherId) || new Set<number>();
    set.add(p.slot);
    teacherOccupiedSlots.set(u.teacherId, set);
  }
}

const teachers: Teacher[] = rawTeachers.map((rt, idx) => {
  const occupied = teacherOccupiedSlots.get(rt.id) || new Set<number>();
  // L'enseignant est disponible sur ses créneaux de cours + marge d'ouverture
  const dispo = Array.from({ length: 32 }, (_, s) => {
    if (occupied.has(s)) return true;
    // Laisser disponible la majorité des créneaux de la semaine
    return (s + idx) % 5 !== 0;
  });

  return {
    id: rt.id,
    num: idx + 1,
    nom: rt.nom,
    matiere: rt.matiere,
    dispo,
  };
});

const report = generateAuditReport(teachers, classes, unites, semaine);

const dataset: ImportDataset = {
  id: 'ds_asc_minha_escola',
  fileName: 'Emploi_du_Temps_aSc_MinhaEscola_384h.xlsx',
  importedAt: new Date().toISOString(),
  config: DEFAULT_MAPPING_CONFIG,
  semaine,
  teachers,
  classes,
  unites,
  planning,
  report,
  constraints: {
    toutesMatieresABlocs: false,
    matieresABlocs: ['Arabe', 'Anglais'],
    prefererBlocs2hMemeJour: true,
    maxHeuresParJourUnite: 2,
    maxHeuresParJourProf: 6,
    maxHeuresParJourClasse: 6,
    respecterPauseMidiBlocs: true,
  },
};

// Validation formelle
const violations = verify(planning, dataset, dataset.constraints);
const hardViolations = violations.filter((v) => v.severite === 'DURE');
const scoreRes = score(planning, dataset, dataset.constraints);

console.log('=== VÉRIFICATION DU JEU DE DONNÉES aSc Timetables ===');
console.log(`Classes: ${classes.length}`);
console.log(`Enseignants: ${teachers.length}`);
console.log(`Unités d'enseignement: ${unites.length}`);
console.log(`Heures totales planifiées: ${planning.length}`);
console.log(`Violations dures: ${hardViolations.length}`);
if (hardViolations.length > 0) {
  console.log('Détail violations dures:', hardViolations);
}
console.log(`Score global: ${scoreRes.total}`);

const outputPath = resolve(process.cwd(), 'src/data/ascTimetableMinhaEscola.json');
writeFileSync(outputPath, JSON.stringify({ dataset, planning }, null, 2), 'utf-8');
console.log(`Fichier JSON généré avec succès : ${outputPath}`);
