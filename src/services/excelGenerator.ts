/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ExcelJS from 'exceljs';
import { MappingConfig } from '../types';
import { colLetterToNumber, colNumberToLetter } from './excelParser';
import { OFFICIAL_CLASSES, RAW_TEACHER_SEEDS } from './sampleData';

export interface GenerateOptions {
  format: 'color' | 'numeric';
  includeSampleData?: boolean;
  config?: MappingConfig;
}

/**
 * Génère un fichier Excel .xlsx au format attendu avec ExcelJS et déclenche le téléchargement
 */
export async function generateAndDownloadExcel(options: GenerateOptions): Promise<void> {
  const { format, includeSampleData = true } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Générateur d'emplois du temps";
  workbook.lastModifiedBy = "Générateur d'emplois du temps";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Emploi_du_Temps', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 4, ySplit: 2 }],
  });

  // Palette de styles
  const yellowFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' },
  };

  const redFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFF0000' },
  };

  const headerDayFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate 800
  };

  const headerColFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF334155' }, // Slate 700
  };

  const classHeaderFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' }, // Teal 700
  };

  const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  // --- LIGNE 1 : En-têtes des jours (Col E à AJ) et En-têtes généraux ---
  const row1 = worksheet.getRow(1);
  row1.height = 26;

  row1.getCell(1).value = 'IDENTIFICATION ENSEIGNANTS';
  worksheet.mergeCells('A1:D1');
  const a1 = row1.getCell(1);
  a1.fill = headerDayFill;
  a1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  a1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Créneaux de la semaine : Lun (7), Mar (7), Mer (7), Jeu (7), Ven (4) = 32 créneaux
  const daysDefinition = [
    { name: 'LUNDI (7 créneaux)', count: 7, startCol: 5 },
    { name: 'MARDI (7 créneaux)', count: 7, startCol: 12 },
    { name: 'MERCREDI (7 créneaux)', count: 7, startCol: 19 },
    { name: 'JEUDI (7 créneaux)', count: 7, startCol: 26 },
    { name: 'VENDREDI (4 créneaux)', count: 4, startCol: 33 },
  ];

  daysDefinition.forEach((day) => {
    const startLetter = colNumberToLetter(day.startCol);
    const endLetter = colNumberToLetter(day.startCol + day.count - 1);
    worksheet.mergeCells(`${startLetter}1:${endLetter}1`);
    const cell = row1.getCell(day.startCol);
    cell.value = day.name;
    cell.fill = headerDayFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // En-tête Classes (AK à AV)
  worksheet.mergeCells('AK1:AV1');
  const ak1 = row1.getCell(37);
  ak1.value = 'VOLUMES HORAIRES HEBDOMADAIRES PAR CLASSE (AK à AV)';
  ak1.fill = classHeaderFill;
  ak1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  ak1.alignment = { horizontal: 'center', vertical: 'middle' };

  // --- LIGNE 2 : En-têtes de colonnes détaillées ---
  const row2 = worksheet.getRow(2);
  row2.height = 24;

  row2.getCell(1).value = 'N°';
  row2.getCell(2).value = 'Matière';
  row2.getCell(3).value = 'Nom';
  row2.getCell(4).value = 'Prénom';

  for (let i = 1; i <= 4; i++) {
    const c = row2.getCell(i);
    c.fill = headerColFill;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Créneaux de 1 à 32
  let slotIndex = 1;
  daysDefinition.forEach((day) => {
    for (let s = 1; s <= day.count; s++) {
      const colIdx = day.startCol + s - 1;
      const cell = row2.getCell(colIdx);
      cell.value = `C${s}`;
      cell.fill = headerColFill;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 8 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      slotIndex++;
    }
  });

  // Noms des 12 classes (Colonnes AK à AV, index 37 à 48)
  OFFICIAL_CLASSES.forEach((cls, idx) => {
    const colIdx = 37 + idx;
    const cell = row2.getCell(colIdx);
    cell.value = cls.nom;
    cell.fill = classHeaderFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // --- LIGNES 3 À 30 : Données des 28 Enseignants ---
  const teacherRowsCount = includeSampleData ? RAW_TEACHER_SEEDS.length : 28;

  for (let i = 0; i < teacherRowsCount; i++) {
    const rowIndex = 3 + i;
    const row = worksheet.getRow(rowIndex);
    row.height = 22;

    const seed = includeSampleData ? RAW_TEACHER_SEEDS[i] : null;

    // Col A: N°
    const cNum = row.getCell(1);
    cNum.value = seed ? seed.num : i + 1;
    cNum.alignment = { horizontal: 'center', vertical: 'middle' };
    cNum.border = borderThin;

    // Col B: Matière
    const cMat = row.getCell(2);
    cMat.value = seed ? seed.matiere : '';
    cMat.alignment = { horizontal: 'left', vertical: 'middle' };
    cMat.border = borderThin;

    // Col C: Nom
    const cNom = row.getCell(3);
    cNom.value = seed ? seed.nom : '';
    cNom.alignment = { horizontal: 'left', vertical: 'middle' };
    cNom.border = borderThin;

    // Col D: Prénom
    const cPrenom = row.getCell(4);
    cPrenom.value = seed ? seed.prenom : '';
    cPrenom.alignment = { horizontal: 'left', vertical: 'middle' };
    cPrenom.border = borderThin;

    // Colonnes E à AJ : Disponibilités (32 colonnes, index 5 à 36)
    for (let c = 5; c <= 36; c++) {
      const cell = row.getCell(c);
      cell.border = borderThin;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };

      if (seed) {
        const slotIdx = c - 5;
        const isAvailable = seed.dispoPattern.includes(slotIdx);

        if (format === 'color') {
          cell.fill = isAvailable ? yellowFill : redFill;
          cell.value = ''; // Couleur seule
        } else {
          // Format numérique 1 / 0
          cell.value = isAvailable ? 1 : 0;
          cell.font = {
            size: 9,
            bold: isAvailable,
            color: { argb: isAvailable ? 'FF16A34A' : 'FF94A3B8' },
          };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isAvailable ? 'FFF0FDF4' : 'FFF8FAFC' },
          };
        }
      } else {
        // Gabarit vide
        if (format === 'numeric') {
          cell.value = 1;
        } else {
          cell.fill = yellowFill;
        }
      }
    }

    // Colonnes AK à AV : Classes (index 37 à 48)
    for (let c = 37; c <= 48; c++) {
      const cell = row.getCell(c);
      cell.border = borderThin;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // Remplir les affectations si données fournies
    if (seed) {
      seed.assignments.forEach((asg) => {
        if (Array.isArray(asg.classes)) {
          // Cours commun fusionné ! (ex: 1BACSEF + 1BACSEG)
          const startCol = 37 + asg.classes[0];
          const endCol = 37 + asg.classes[1];
          const startLetter = colNumberToLetter(startCol);
          const endLetter = colNumberToLetter(endCol);

          worksheet.mergeCells(`${startLetter}${rowIndex}:${endLetter}${rowIndex}`);
          const master = row.getCell(startCol);
          master.value = asg.heures;
          master.font = { bold: true, color: { argb: 'FF0F766E' } };
          master.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFCCFBF1' }, // Teal pastel pour mettre en valeur les cours communs
          };
          master.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          // Cours normal simple
          const targetCol = 37 + asg.classes;
          const cell = row.getCell(targetCol);
          cell.value = asg.heures;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
    }
  }

  // Largeurs de colonnes ajustées
  worksheet.getColumn(1).width = 6; // N°
  worksheet.getColumn(2).width = 18; // Matière
  worksheet.getColumn(3).width = 18; // Nom
  worksheet.getColumn(4).width = 14; // Prénom

  // Créneaux
  for (let c = 5; c <= 36; c++) {
    worksheet.getColumn(c).width = 4.2;
  }

  // Classes
  for (let c = 37; c <= 48; c++) {
    worksheet.getColumn(c).width = 10;
  }

  // Sauvegarder dans un buffer et déclencher le téléchargement
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = includeSampleData
    ? `Emploi_du_Temps_Modele_${format === 'color' ? 'Couleurs_Jaune_Rouge' : 'Numerique_1_0'}.xlsx`
    : `Gabarit_Vierge_Emploi_du_Temps_${format === 'color' ? 'Couleurs' : 'Numerique'}.xlsx`;

  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
