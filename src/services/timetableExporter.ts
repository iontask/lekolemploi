/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import ExcelJS from 'exceljs';
import { Classe, ImportDataset, Teacher, Unite } from '../types';
import { getSlotCoordinates } from '../rules';
import { Affectation, Planning } from '../rules/types';
import { analyzeScheduleExceptions } from '../utils/scheduleExceptions';
import { getSubjectAbbreviation, getSubjectMeta } from '../utils/subjectFormatters';

/**
 * Exporte l'emploi du temps complet sous forme de classeur Excel multi-onglets (.xlsx) avec ExcelJS :
 * - Onglet 1 : Récapitulatif & Exceptions (dépassements 2h, heures coupées, créneaux libres)
 * - Onglet 2 : Vue_Ensemble_Classes (style aSc Horaires avec abréviations et cellules fusionnées)
 * - Onglet 3 : Vue_Ensemble_Profs (28 profs x 32 créneaux, indispos en rouge clair, ligne profs en cours)
 * - Onglets 4..15 : Fiches individuelles par classe (12 classes)
 * - Onglets 16..43 : Fiches individuelles par enseignant (28 profs)
 */
export async function exportTimetableMultiSheetsExcel(
  dataset: ImportDataset,
  planning: Planning
): Promise<void> {
  const { teachers, classes, unites, semaine, fileName } = dataset;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
  const classMap = new Map<string, Classe>(classes.map((c) => [c.id, c]));
  const uniteMap = new Map<string, Unite>(unites.map((u) => [u.id, u]));

  // Indexation des créneaux affectés
  const slotToAffs = new Map<number, Affectation[]>();
  for (const aff of planning) {
    const list = slotToAffs.get(aff.slot) || [];
    list.push(aff);
    slotToAffs.set(aff.slot, list);
  }

  const exceptions = analyzeScheduleExceptions(dataset, planning);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Générateur d'emplois du temps";
  workbook.lastModifiedBy = "Générateur d'emplois du temps";
  workbook.created = new Date();
  workbook.modified = new Date();

  const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  };

  const unavailableFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFE2E2' }, // Rouge clair pour indisponibilités
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

  // =========================================================================
  // ONGLET 1 : RÉCAPITULATIF & EXCEPTIONS
  // =========================================================================
  const wsRecap = workbook.addWorksheet('Récapitulatif_Exceptions', {
    views: [{ showGridLines: true }],
  });

  wsRecap.getColumn(1).width = 24;
  wsRecap.getColumn(2).width = 30;
  wsRecap.getColumn(3).width = 18;
  wsRecap.getColumn(4).width = 45;
  wsRecap.getColumn(5).width = 35;

  // Titre
  wsRecap.mergeCells('A1:E1');
  const r1 = wsRecap.getCell('A1');
  r1.value = 'RÉCAPITULATIF DE L\'EMPLOI DU TEMPS & AUDIT DES EXCEPTIONS';
  r1.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  r1.fill = headerDayFill;
  r1.alignment = { horizontal: 'center', vertical: 'middle' };
  wsRecap.getRow(1).height = 32;

  // Métadonnées
  wsRecap.getCell('A3').value = 'Date d\'export :';
  wsRecap.getCell('B3').value = new Date().toLocaleString('fr-FR');
  wsRecap.getCell('A4').value = 'Total Enseignants :';
  wsRecap.getCell('B4').value = `${teachers.length} enseignants`;
  wsRecap.getCell('A5').value = 'Total Classes :';
  wsRecap.getCell('B5').value = `${classes.length} classes`;
  wsRecap.getCell('A6').value = 'Total Heures :';
  wsRecap.getCell('B6').value = `${planning.length} h / sem`;
  wsRecap.getCell('A7').value = 'Créneaux libres totaux :';
  wsRecap.getCell('B7').value = `${exceptions.creneauxLibresTotal} créneaux`;
  wsRecap.getCell('A8').value = 'Option Reverse Dépassement :';
  wsRecap.getCell('B8').value = dataset.constraints?.interdireTousDepassements
    ? 'Interdiction stricte globale activée'
    : dataset.constraints?.disabledOverages && dataset.constraints.disabledOverages.length > 0
    ? `${dataset.constraints.disabledOverages.length} dépassement(s) neutralisé(s)`
    : 'Règle souple par défaut (désactivable en cochant dans l\'app)';

  for (let r = 3; r <= 8; r++) {
    wsRecap.getCell(`A${r}`).font = { bold: true, color: { argb: 'FF334155' } };
  }

  // Tableau des exceptions
  wsRecap.getCell('A10').value = 'Type d\'exception';
  wsRecap.getCell('B10').value = 'Entité (Classe / Prof)';
  wsRecap.getCell('C10').value = 'Jour';
  wsRecap.getCell('D10').value = 'Description détaillée';
  wsRecap.getCell('E10').value = 'Option Reverse Dépassement';

  for (let c = 1; c <= 5; c++) {
    const cell = wsRecap.getRow(10).getCell(c);
    cell.fill = headerColFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle' };
  }
  wsRecap.getRow(10).height = 24;

  let recapRowIndex = 11;
  const allExceptions = [
    ...exceptions.exces2hJour,
    ...exceptions.heuresCoupees,
    ...exceptions.trousClasses,
    ...exceptions.trousProfs,
  ];

  if (allExceptions.length === 0) {
    wsRecap.mergeCells(`A${recapRowIndex}:E${recapRowIndex}`);
    const cell = wsRecap.getCell(`A${recapRowIndex}`);
    cell.value = 'Aucune exception détectée : l\'emploi du temps est parfaitement compact et régulier !';
    cell.font = { italic: true, color: { argb: 'FF16A34A' } };
    cell.alignment = { horizontal: 'center' };
    recapRowIndex++;
  } else {
    for (const exc of allExceptions) {
      const row = wsRecap.getRow(recapRowIndex);
      row.getCell(1).value = exc.titre;
      row.getCell(2).value = exc.entiteNom;
      row.getCell(3).value = exc.jourNom;
      row.getCell(4).value = exc.description;

      if (exc.type === 'EXCES_2H_JOUR') {
        const isAlreadyDisabled =
          dataset.constraints?.interdireTousDepassements ||
          (dataset.constraints?.disabledOverages &&
            dataset.constraints.disabledOverages.includes(exc.id));
        row.getCell(5).value = isAlreadyDisabled
          ? '🛡️ Neutralisé (Contrainte dure solveur active)'
          : 'Désactivable dans l\'application (Reverse Dépassement)';
        row.getCell(5).font = {
          color: { argb: isAlreadyDisabled ? 'FF7E22CE' : 'FF4338CA' },
          bold: Boolean(isAlreadyDisabled),
        };
      } else {
        row.getCell(5).value = '—';
      }

      for (let c = 1; c <= 5; c++) {
        row.getCell(c).border = borderThin;
        row.getCell(c).alignment = { vertical: 'middle' };
      }

      if (exc.severity === 'warning') {
        row.getCell(1).font = { bold: true, color: { argb: 'FFDC2626' } };
      }
      recapRowIndex++;
    }
  }

  // =========================================================================
  // ONGLET 2 : VUE D'ENSEMBLE DES CLASSES (STYLE aSc HORAIRES)
  // =========================================================================
  const wsAsc = workbook.addWorksheet('Vue_Ensemble_Classes', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 1, ySplit: 2 }],
  });

  wsAsc.getColumn(1).width = 14;
  for (let c = 2; c <= totalSlots + 1; c++) {
    wsAsc.getColumn(c).width = 9.5;
  }

  // En-tête des jours
  wsAsc.getCell(1, 1).value = 'CLASSES';
  wsAsc.getCell(1, 1).fill = headerDayFill;
  wsAsc.getCell(1, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsAsc.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' };

  let currentCol = 2;
  for (let j = 0; j < semaine.jours.length; j++) {
    const daySlots = semaine.creneauxParJour[j];
    const endCol = currentCol + daySlots - 1;

    wsAsc.mergeCells(1, currentCol, 1, endCol);
    const dayCell = wsAsc.getCell(1, currentCol);
    dayCell.value = semaine.jours[j].toUpperCase();
    dayCell.fill = headerDayFill;
    dayCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dayCell.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let s = 0; s < daySlots; s++) {
      const slotCell = wsAsc.getCell(2, currentCol + s);
      slotCell.value = `C${s + 1}`;
      slotCell.fill = headerColFill;
      slotCell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      slotCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    currentCol += daySlots;
  }
  wsAsc.getRow(1).height = 24;
  wsAsc.getRow(2).height = 20;

  // Lignes des classes
  let classRowIdx = 3;
  for (const cls of classes) {
    const row = wsAsc.getRow(classRowIdx);
    row.height = 28;

    row.getCell(1).value = cls.nom;
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(1).border = borderThin;

    // Détection des créneaux de cette classe
    let sIdx = 0;
    while (sIdx < totalSlots) {
      const aff = slotToAffs.get(sIdx)?.find((a) => {
        const u = uniteMap.get(a.uniteId);
        return u && u.classeIds.includes(cls.id);
      });

      if (!aff) {
        const cell = row.getCell(sIdx + 2);
        cell.border = borderThin;
        sIdx++;
        continue;
      }

      const unite = uniteMap.get(aff.uniteId)!;
      const prof = teacherMap.get(unite.teacherId);
      const subjectCode = getSubjectAbbreviation(prof?.matiere || '');
      const meta = getSubjectMeta(prof?.matiere || '');

      const coords = getSlotCoordinates(sIdx, semaine);

      // Vérifier si les créneaux suivants du MÊME JOUR ont le MÊME PROF pour fusionner
      let span = 1;
      while (sIdx + span < totalSlots) {
        const nextCoords = getSlotCoordinates(sIdx + span, semaine);
        if (nextCoords.jourIndex !== coords.jourIndex) break; // Ne pas fusionner sur 2 jours

        const nextAff = slotToAffs.get(sIdx + span)?.find((a) => {
          const u = uniteMap.get(a.uniteId);
          return u && u.classeIds.includes(cls.id) && u.teacherId === unite.teacherId;
        });

        if (nextAff) {
          span++;
        } else {
          break;
        }
      }

      const startColExcel = sIdx + 2;
      const endColExcel = sIdx + 1 + span;

      if (span > 1) {
        wsAsc.mergeCells(classRowIdx, startColExcel, classRowIdx, endColExcel);
      }

      const masterCell = wsAsc.getCell(classRowIdx, startColExcel);
      masterCell.value = `${subjectCode}\n${prof?.nom ? prof.nom.slice(0, 10) : ''}`;
      masterCell.font = { bold: true, size: 8, color: { argb: meta.textHex } };
      masterCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      masterCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: meta.bgHex },
      };

      for (let c = startColExcel; c <= endColExcel; c++) {
        row.getCell(c).border = borderThin;
      }

      sIdx += span;
    }

    classRowIdx++;
  }

  // =========================================================================
  // ONGLET 3 : VUE D'ENSEMBLE DES PROFS
  // =========================================================================
  const wsProfs = workbook.addWorksheet('Vue_Ensemble_Profs', {
    views: [{ showGridLines: true, state: 'frozen', xSplit: 2, ySplit: 2 }],
  });

  wsProfs.getColumn(1).width = 18;
  wsProfs.getColumn(2).width = 16;
  for (let c = 3; c <= totalSlots + 2; c++) {
    wsProfs.getColumn(c).width = 9.5;
  }

  // En-tête des jours
  wsProfs.getCell(1, 1).value = 'ENSEIGNANT';
  wsProfs.getCell(1, 2).value = 'MATIÈRE';
  wsProfs.getCell(1, 1).fill = headerDayFill;
  wsProfs.getCell(1, 2).fill = headerDayFill;
  wsProfs.getCell(1, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  wsProfs.getCell(1, 2).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  currentCol = 3;
  for (let j = 0; j < semaine.jours.length; j++) {
    const daySlots = semaine.creneauxParJour[j];
    const endCol = currentCol + daySlots - 1;

    wsProfs.mergeCells(1, currentCol, 1, endCol);
    const dayCell = wsProfs.getCell(1, currentCol);
    dayCell.value = semaine.jours[j].toUpperCase();
    dayCell.fill = headerDayFill;
    dayCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dayCell.alignment = { horizontal: 'center', vertical: 'middle' };

    for (let s = 0; s < daySlots; s++) {
      const slotCell = wsProfs.getCell(2, currentCol + s);
      slotCell.value = `C${s + 1}`;
      slotCell.fill = headerColFill;
      slotCell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      slotCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    currentCol += daySlots;
  }
  wsProfs.getRow(1).height = 24;
  wsProfs.getRow(2).height = 20;

  // Lignes des profs
  let teacherRowIdx = 3;
  const activeProfsCountPerSlot = new Array(totalSlots).fill(0);

  for (const prof of teachers) {
    const row = wsProfs.getRow(teacherRowIdx);
    row.height = 24;

    row.getCell(1).value = prof.nom;
    row.getCell(1).font = { bold: true, size: 9 };
    row.getCell(1).alignment = { vertical: 'middle' };
    row.getCell(1).border = borderThin;

    row.getCell(2).value = prof.matiere;
    row.getCell(2).font = { size: 9, color: { argb: 'FF475569' } };
    row.getCell(2).alignment = { vertical: 'middle' };
    row.getCell(2).border = borderThin;

    for (let s = 0; s < totalSlots; s++) {
      const colExcel = s + 3;
      const cell = row.getCell(colExcel);
      cell.border = borderThin;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };

      const isDispo = prof.dispo[s];
      if (!isDispo) {
        cell.fill = unavailableFill;
      }

      // Cours affecté ?
      const aff = slotToAffs.get(s)?.find((a) => {
        const u = uniteMap.get(a.uniteId);
        return u && u.teacherId === prof.id;
      });

      if (aff) {
        activeProfsCountPerSlot[s]++;
        const unite = uniteMap.get(aff.uniteId)!;
        const involvedClasses = classes.filter((c) => unite.classeIds.includes(c.id));
        const classLabel = involvedClasses.map((c) => c.nom).join('+');
        const meta = getSubjectMeta(prof.matiere);

        cell.value = classLabel;
        cell.font = { bold: true, size: 8, color: { argb: meta.textHex } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: meta.bgHex },
        };
      }
    }

    teacherRowIdx++;
  }

  // Ligne récapitulative « Profs en cours » en bas
  const bottomRow = wsProfs.getRow(teacherRowIdx);
  bottomRow.height = 26;
  bottomRow.getCell(1).value = 'PROFS EN COURS';
  bottomRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
  bottomRow.getCell(1).fill = headerColFill;
  bottomRow.getCell(2).value = 'TOTAL SIMULTANÉ';
  bottomRow.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
  bottomRow.getCell(2).fill = headerColFill;

  for (let s = 0; s < totalSlots; s++) {
    const colExcel = s + 3;
    const cell = bottomRow.getCell(colExcel);
    cell.value = activeProfsCountPerSlot[s];
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = headerColFill;
    cell.border = borderThin;
  }

  // =========================================================================
  // ONGLETS INDIVIDUELS : 1 ONGLET PAR CLASSE (12 CLASSES)
  // =========================================================================
  for (const cls of classes) {
    const sheetName = `Cls_${cls.nom.replace(/[^a-zA-Z0-9_-]/g, '')}`.slice(0, 31);
    const wsCls = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    wsCls.getColumn(1).width = 12;
    for (let c = 2; c <= 8; c++) wsCls.getColumn(c).width = 16;

    // Titre
    wsCls.mergeCells('A1:H1');
    const titleCell = wsCls.getCell('A1');
    titleCell.value = `EMPLOI DU TEMPS · CLASSE ${cls.nom} (${cls.niveau})`;
    titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = headerDayFill;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsCls.getRow(1).height = 28;

    // En-têtes créneaux C1..C7
    wsCls.getCell(2, 1).value = 'JOUR';
    wsCls.getCell(2, 1).fill = headerColFill;
    wsCls.getCell(2, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (let c = 1; c <= 7; c++) {
      const cell = wsCls.getCell(2, c + 1);
      cell.value = `Créneau ${c}`;
      cell.fill = headerColFill;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    }
    wsCls.getRow(2).height = 22;

    // Remplissage jour par jour
    for (let j = 0; j < semaine.jours.length; j++) {
      const rowIdx = 3 + j;
      const row = wsCls.getRow(rowIdx);
      row.height = 36;

      row.getCell(1).value = semaine.jours[j];
      row.getCell(1).font = { bold: true };
      row.getCell(1).border = borderThin;
      row.getCell(1).alignment = { vertical: 'middle' };

      const daySlots = semaine.creneauxParJour[j];
      const startOfDay = semaine.creneauxParJour.slice(0, j).reduce((a, b) => a + b, 0);

      for (let s = 0; s < 7; s++) {
        const cell = row.getCell(s + 2);
        cell.border = borderThin;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        if (s >= daySlots) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          continue;
        }

        const globalSlot = startOfDay + s;
        const aff = slotToAffs.get(globalSlot)?.find((a) => {
          const u = uniteMap.get(a.uniteId);
          return u && u.classeIds.includes(cls.id);
        });

        if (aff) {
          const u = uniteMap.get(aff.uniteId)!;
          const prof = teacherMap.get(u.teacherId);
          const meta = getSubjectMeta(prof?.matiere || '');

          cell.value = `${prof?.matiere || ''}\n${prof?.nom || ''}${u.estCommun ? ' (commun)' : ''}`;
          cell.font = { bold: true, size: 8, color: { argb: meta.textHex } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: meta.bgHex } };
        }
      }
    }
  }

  // =========================================================================
  // ONGLETS INDIVIDUELS : 1 ONGLET PAR PROFESSEUR (28 PROFS)
  // =========================================================================
  for (const prof of teachers) {
    const safeName = prof.nom.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24);
    const sheetName = `Prf_${safeName}`.slice(0, 31);
    const wsProf = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    wsProf.getColumn(1).width = 12;
    for (let c = 2; c <= 8; c++) wsProf.getColumn(c).width = 16;

    // Titre
    wsProf.mergeCells('A1:H1');
    const titleCell = wsProf.getCell('A1');
    titleCell.value = `EMPLOI DU TEMPS · ${prof.nom} (${prof.matiere})`;
    titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = headerDayFill;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    wsProf.getRow(1).height = 28;

    // En-têtes créneaux C1..C7
    wsProf.getCell(2, 1).value = 'JOUR';
    wsProf.getCell(2, 1).fill = headerColFill;
    wsProf.getCell(2, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    for (let c = 1; c <= 7; c++) {
      const cell = wsProf.getCell(2, c + 1);
      cell.value = `Créneau ${c}`;
      cell.fill = headerColFill;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center' };
    }
    wsProf.getRow(2).height = 22;

    for (let j = 0; j < semaine.jours.length; j++) {
      const rowIdx = 3 + j;
      const row = wsProf.getRow(rowIdx);
      row.height = 36;

      row.getCell(1).value = semaine.jours[j];
      row.getCell(1).font = { bold: true };
      row.getCell(1).border = borderThin;
      row.getCell(1).alignment = { vertical: 'middle' };

      const daySlots = semaine.creneauxParJour[j];
      const startOfDay = semaine.creneauxParJour.slice(0, j).reduce((a, b) => a + b, 0);

      for (let s = 0; s < 7; s++) {
        const cell = row.getCell(s + 2);
        cell.border = borderThin;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        if (s >= daySlots) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          continue;
        }

        const globalSlot = startOfDay + s;
        const isDispo = prof.dispo[globalSlot];
        if (!isDispo) {
          cell.fill = unavailableFill;
          cell.value = 'Indisponible';
          cell.font = { size: 8, italic: true, color: { argb: 'FF991B1B' } };
          continue;
        }

        const aff = slotToAffs.get(globalSlot)?.find((a) => {
          const u = uniteMap.get(a.uniteId);
          return u && u.teacherId === prof.id;
        });

        if (aff) {
          const u = uniteMap.get(aff.uniteId)!;
          const involvedClasses = classes.filter((c) => u.classeIds.includes(c.id));
          const meta = getSubjectMeta(prof.matiere);

          cell.value = `Classe ${involvedClasses.map((c) => c.nom).join(' + ')}`;
          cell.font = { bold: true, size: 9, color: { argb: meta.textHex } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: meta.bgHex } };
        }
      }
    }
  }

  // Déclencher le téléchargement
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Emploi_du_Temps_Complet_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
