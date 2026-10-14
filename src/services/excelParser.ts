/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ExcelJS from 'exceljs';
import {
  AuditReport,
  Classe,
  ClasseStats,
  ImportDataset,
  MappingConfig,
  Teacher,
  TeacherStats,
  Unite,
} from '../types';

/**
 * Convertit une lettre de colonne Excel en index basé sur 1 (A -> 1, Z -> 26, AA -> 27, AK -> 37)
 */
export function colLetterToNumber(col: string): number {
  const clean = col.trim().toUpperCase();
  let result = 0;
  for (let i = 0; i < clean.length; i++) {
    result = result * 26 + (clean.charCodeAt(i) - 64);
  }
  return result;
}

/**
 * Convertit un index basé sur 1 en lettre de colonne Excel (1 -> A, 37 -> AK, 48 -> AV)
 */
export function colNumberToLetter(num: number): string {
  let s = '';
  let n = num;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    s = String.fromCharCode(65 + remainder) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Normalise un nom de classe (espaces, tirets, majuscules)
 * ex: " 1 apic - 1 " -> "1APIC-1", "tcsf_1" -> "TCSF-1", "1 bac sef" -> "1BACSEF"
 */
export function normalizeClassName(raw: string): string {
  if (!raw) return '';
  let str = String(raw).trim().toUpperCase();
  // Remplacer séparateurs multiples
  str = str.replace(/[\t\r\n]+/g, ' ');
  // Supprimer les espaces autour des tirets
  str = str.replace(/\s*-\s*/g, '-');
  str = str.replace(/\s*_\s*/g, '-');
  // Supprimer espaces internes courants ex "1 APIC" -> "1APIC", "TCSF 1" -> "TCSF-1"
  str = str.replace(/\b1\s+APIC/g, '1APIC');
  str = str.replace(/\b2\s+APIC/g, '2APIC');
  str = str.replace(/\b3\s+APIC/g, '3APIC');
  str = str.replace(/\b1\s+BAC/g, '1BAC');
  str = str.replace(/\b2\s+BAC/g, '2BAC');
  str = str.replace(/\bTC\s+SF/g, 'TCSF');
  // Remplacer espaces restants par tirets si séparateur de groupe
  str = str.replace(/\s+/g, '-');
  return str;
}

/**
 * Déduit le niveau scolaire à partir du nom normalisé de la classe
 */
export function detectNiveau(nom: string): string {
  const upper = nom.toUpperCase();
  if (upper.startsWith('1APIC')) return '1APIC (1ère Collège)';
  if (upper.startsWith('2APIC')) return '2APIC (2ème Collège)';
  if (upper.startsWith('3APIC')) return '3APIC (3ème Collège)';
  if (upper.startsWith('TCSF') || upper.startsWith('TC')) return 'TCSF (Tronc Commun)';
  if (upper.startsWith('1BAC')) return '1BAC (1ère Bac)';
  if (upper.startsWith('2BAC')) return '2BAC (2ème Bac)';
  const parts = nom.split('-');
  return parts[0] || nom;
}

/**
 * Analyse la couleur de remplissage d'une cellule pour déterminer la disponibilité
 */
export function parseAvailabilityColor(
  cell: ExcelJS.Cell,
  config: MappingConfig
): boolean {
  // 1. Détection via valeur numérique si activée
  if (config.detectNumericFallback && cell.value !== null && cell.value !== undefined) {
    const valStr = String(cell.value).trim().toLowerCase();
    if (valStr === '1' || valStr === 'd' || valStr === 'oui' || valStr === 'vrai' || valStr === 'true') {
      return true;
    }
    if (valStr === '0' || valStr === 'i' || valStr === 'non' || valStr === 'faux' || valStr === 'false') {
      return false;
    }
  }

  // 2. Détection via couleur de remplissage ExcelJS
  const fill = cell.fill;
  if (!fill || fill.type !== 'pattern') {
    // Si aucune couleur de fond, vérifier si valeur '1' ou par défaut indisponible
    return false;
  }

  const fg = fill.fgColor;
  if (!fg) return false;

  let hex = '';
  if (fg.argb) {
    hex = fg.argb.toUpperCase();
  }

  // Si couleur configurée présente
  const targetDispo = config.colorAvailableHex.toUpperCase().replace(/^#/, '');
  const targetIndispo = config.colorUnavailableHex.toUpperCase().replace(/^#/, '');

  if (hex) {
    // Correspondance exacte ou partielle
    if (hex.endsWith(targetDispo) || targetDispo.endsWith(hex) || hex === targetDispo) {
      return true;
    }
    if (hex.endsWith(targetIndispo) || targetIndispo.endsWith(hex) || hex === targetIndispo) {
      return false;
    }

    // Heuristique de teinte jaune (ex: FFFFFF00, FFFFE0, etc.)
    // En ARGB: AA RR GG BB
    // Jaune typique : R élevé, G élevé, B bas
    if (hex.length >= 6) {
      const rgb = hex.slice(-6);
      const r = parseInt(rgb.substring(0, 2), 16) || 0;
      const g = parseInt(rgb.substring(2, 4), 16) || 0;
      const b = parseInt(rgb.substring(4, 6), 16) || 0;

      // Jaune : fort rouge et vert, faible bleu
      if (r > 180 && g > 180 && b < 100) {
        return true;
      }
      // Rouge : fort rouge, faible vert et bleu
      if (r > 180 && g < 100 && b < 100) {
        return false;
      }
    }
  }

  return false;
}

/**
 * Parse un ArrayBuffer ou Uint8Array de fichier .xlsx via ExcelJS
 */
export async function parseExcelWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
  userConfig: MappingConfig
): Promise<{ dataset: ImportDataset; sheetNames: string[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  if (sheetNames.length === 0) {
    throw new Error('Le classeur Excel ne contient aucune feuille.');
  }

  // Sélection de la feuille : feuille configurée ou première feuille
  let worksheet = userConfig.sheetName
    ? workbook.getWorksheet(userConfig.sheetName)
    : workbook.worksheets[0];

  if (!worksheet) {
    worksheet = workbook.worksheets[0];
  }

  const colClassesStartNum = colLetterToNumber(userConfig.colClassesStart);
  const colClassesEndNum = colLetterToNumber(userConfig.colClassesEnd);
  const colCreneauxStartNum = colLetterToNumber(userConfig.colCreneauxStart);
  const colCreneauxEndNum = colLetterToNumber(userConfig.colCreneauxEnd);

  const totalCreneauxAttendus = userConfig.semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  // 1. Extraction des classes depuis la ligne d'en-tête (Ligne 2 par défaut)
  const classes: Classe[] = [];
  const headerRow = worksheet.getRow(userConfig.headerRowClasses);

  for (let c = colClassesStartNum; c <= colClassesEndNum; c++) {
    const cell = headerRow.getCell(c);
    const rawVal = cell.value ? String(cell.value) : '';
    const nom = normalizeClassName(rawVal) || `CLASSE-${colNumberToLetter(c)}`;
    const niveau = detectNiveau(nom);
    const id = `cls_${c}_${nom.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    classes.push({
      id,
      nom,
      niveau,
      colIndex: c,
    });
  }

  // 2. Indexation des cellules fusionnées (Merges) sur la feuille
  // ExcelJS expose worksheet.model.merges qui liste ['AK3:AL3', ...]
  interface MergeRange {
    top: number;
    left: number;
    bottom: number;
    right: number;
    masterAddress: string;
  }
  const mergeRanges: MergeRange[] = [];

  const rawMerges: string[] = (worksheet.model as any)?.merges || [];
  for (const rangeStr of rawMerges) {
    const parts = rangeStr.split(':');
    if (parts.length === 2) {
      const startCell = worksheet.getCell(parts[0]);
      const endCell = worksheet.getCell(parts[1]);
      mergeRanges.push({
        top: Number(startCell.row),
        left: Number(startCell.col),
        bottom: Number(endCell.row),
        right: Number(endCell.col),
        masterAddress: parts[0],
      });
    }
  }

  // 3. Extraction des enseignants (Lignes 3 à 30 par défaut)
  const teachers: Teacher[] = [];
  const unites: Unite[] = [];

  const colNumIdx = colLetterToNumber(userConfig.colNum);
  const colMatiereIdx = colLetterToNumber(userConfig.colMatiere);
  const colNomIdx = colLetterToNumber(userConfig.colNom);
  const colPrenomIdx = colLetterToNumber(userConfig.colPrenom);

  for (let r = userConfig.teacherStartRow; r <= userConfig.teacherEndRow; r++) {
    const row = worksheet.getRow(r);

    const rawNum = row.getCell(colNumIdx).value;
    const rawMatiere = row.getCell(colMatiereIdx).value;
    const rawNom = row.getCell(colNomIdx).value;
    const rawPrenom = row.getCell(colPrenomIdx).value;

    const nom = rawNom ? String(rawNom).trim() : `Enseignant ${r}`;
    const prenom = rawPrenom ? String(rawPrenom).trim() : '';
    const matiere = rawMatiere ? String(rawMatiere).trim() : 'Général';
    const num = rawNum !== null && rawNum !== undefined ? String(rawNum).trim() : String(r - userConfig.teacherStartRow + 1);

    const teacherId = `tch_${r}_${num}_${nom.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    // Extraction des disponibilités (colonnes E à AJ)
    const dispo: boolean[] = [];
    for (let c = colCreneauxStartNum; c <= colCreneauxEndNum; c++) {
      const cell = row.getCell(c);
      const isAvailable = parseAvailabilityColor(cell, userConfig);
      dispo.push(isAvailable);
    }

    // Compléter ou ajuster au nombre total de créneaux si différent
    while (dispo.length < totalCreneauxAttendus) {
      dispo.push(false);
    }

    teachers.push({
      id: teacherId,
      num,
      nom: prenom ? `${nom} ${prenom}` : nom,
      prenom,
      matiere,
      dispo: dispo.slice(0, totalCreneauxAttendus),
    });

    // Extraction des heures et unités d'enseignement (colonnes AK à AV)
    // Attention aux cellules fusionnées sur plusieurs colonnes de classes !
    const processedCols = new Set<number>();

    for (let c = colClassesStartNum; c <= colClassesEndNum; c++) {
      if (processedCols.has(c)) continue;

      const cell = row.getCell(c);

      // Vérifier si cette cellule fait partie d'une fusion
      // Rechercher dans mergeRanges ou via cell.isMerged
      const merge = mergeRanges.find(
        (m) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right
      );

      if (merge && merge.right > merge.left) {
        // Cellule fusionnée horizontalement sur plusieurs colonnes !
        // Identifier toutes les classes incluses dans cette fusion
        const involvedClasses: Classe[] = [];
        for (let colMerged = merge.left; colMerged <= merge.right; colMerged++) {
          if (colMerged >= colClassesStartNum && colMerged <= colClassesEndNum) {
            const cls = classes.find((cl) => cl.colIndex === colMerged);
            if (cls) involvedClasses.push(cls);
            processedCols.add(colMerged);
          }
        }

        // Lire la valeur depuis la cellule maîtresse
        const masterCell = worksheet.getCell(merge.masterAddress);
        const heuresVal = Number(masterCell.value) || 0;

        if (heuresVal > 0 && involvedClasses.length > 0) {
          const isCommun = involvedClasses.length > 1;
          unites.push({
            id: `unt_${r}_${merge.masterAddress}_${isCommun ? 'commun' : 'simple'}`,
            teacherId,
            classeIds: involvedClasses.map((cl) => cl.id),
            heures: heuresVal,
            estCommun: isCommun,
          });
        }
      } else {
        // Cellule non fusionnée ou fusion mono-colonne
        processedCols.add(c);
        const heuresVal = Number(cell.value) || 0;
        if (heuresVal > 0) {
          const cls = classes.find((cl) => cl.colIndex === c);
          if (cls) {
            unites.push({
              id: `unt_${r}_c${c}_simple`,
              teacherId,
              classeIds: [cls.id],
              heures: heuresVal,
              estCommun: false,
            });
          }
        }
      }
    }
  }

  // 4. Calcul de l'audit et des statistiques
  const report = generateAuditReport(teachers, classes, unites, userConfig.semaine);

  const dataset: ImportDataset = {
    id: `ds_${Date.now()}`,
    importedAt: new Date().toISOString(),
    fileName,
    semaine: userConfig.semaine,
    config: userConfig,
    teachers,
    classes,
    unites,
    report,
  };

  return { dataset, sheetNames };
}

/**
 * Calcule les statistiques d'audit pour les enseignants et les classes
 */
export function generateAuditReport(
  teachers: Teacher[],
  classes: Classe[],
  unites: Unite[],
  semaine: ImportDataset['semaine']
): AuditReport {
  const totalCreneauxSemaine = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  // Stats enseignants
  const teacherStatsList: TeacherStats[] = teachers.map((t) => {
    // Les heures comptent UNE SEULE FOIS pour l'enseignant même si unité commune
    const profUnites = unites.filter((u) => u.teacherId === t.id);
    const totalHeures = profUnites.reduce((sum, u) => sum + u.heures, 0);
    const creneauxDispo = t.dispo.filter(Boolean).length;
    const marge = creneauxDispo - totalHeures;

    return {
      teacher: t,
      totalHeures,
      creneauxDispo,
      marge,
      unitesCount: profUnites.length,
      hasOverload: marge < 0,
      isTight: marge >= 0 && marge <= 1,
    };
  });

  // Stats classes
  const classeStatsList: ClasseStats[] = classes.map((c) => {
    // Les heures de cours commun comptent dans la charge de chaque classe participante
    const classeUnites = unites.filter((u) => u.classeIds.includes(c.id));
    const totalHeures = classeUnites.reduce((sum, u) => sum + u.heures, 0);
    const heuresCommunes = classeUnites
      .filter((u) => u.estCommun)
      .reduce((sum, u) => sum + u.heures, 0);

    return {
      classe: c,
      totalHeures,
      heuresCommunes,
      unitesCount: classeUnites.length,
      isOverCapacity: totalHeures > totalCreneauxSemaine,
    };
  });

  const profsEnSurcharge = teacherStatsList.filter((s) => s.hasOverload);
  const profsTension = teacherStatsList.filter((s) => s.isTight);
  const profsSansHeures = teacherStatsList.filter((s) => s.totalHeures === 0);
  const classesEnDepassement = classeStatsList.filter((s) => s.isOverCapacity);

  const avertissements: string[] = [];

  if (profsEnSurcharge.length > 0) {
    profsEnSurcharge.forEach((p) => {
      avertissements.push(
        `Alerte surcharge : ${p.teacher.nom} (${p.teacher.matiere}) a ${p.totalHeures} h d'enseignement pour seulement ${p.creneauxDispo} créneaux disponibles (marge : ${p.marge} h).`
      );
    });
  }

  if (classesEnDepassement.length > 0) {
    classesEnDepassement.forEach((c) => {
      avertissements.push(
        `Capacité dépassée : La classe ${c.classe.nom} totalise ${c.totalHeures} h, ce qui excède les ${totalCreneauxSemaine} créneaux de la semaine.`
      );
    });
  }

  if (profsSansHeures.length > 0) {
    profsSansHeures.forEach((p) => {
      avertissements.push(
        `Information : ${p.teacher.nom} n'a aucune heure d'enseignement assignée.`
      );
    });
  }

  const totalHeures = unites.reduce((sum, u) => sum + u.heures, 0);
  const unitesCommunes = unites.filter((u) => u.estCommun);

  return {
    totalProfs: teachers.length,
    totalClasses: classes.length,
    totalHeures,
    totalUnites: unites.length,
    totalUnitesCommunes: unitesCommunes.length,
    totalCreneauxSemaine,
    profsEnSurcharge,
    profsTension,
    profsSansHeures,
    classesEnDepassement,
    avertissements,
  };
}
