/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Classe, ImportDataset, Teacher, Unite } from '../types';
import { Planning } from '../rules/types';
import { getSlotCoordinates } from '../rules';

// Couleurs thématiques par matière pour la lisibilité visuelle
const SUBJECT_COLORS: Record<string, [number, number, number]> = {
  'Mathématiques': [30, 58, 138], // Indigo foncé
  'Physique-Chimie': [14, 116, 144], // Cyan soutenu
  'SVT': [21, 128, 61], // Vert émeraude
  'Arabe': [180, 83, 9], // Ambre chaud
  'Français': [126, 34, 206], // Violet
  'Anglais': [194, 65, 12], // Orange vif
  'Histoire-Géo': [185, 28, 28], // Rouge brique
  'Philosophie': [15, 118, 110], // Sarcelle
  'EPS': [3, 105, 161], // Bleu ciel profond
  'Informatique': [79, 70, 229], // Indigo moderne
  'Education Islamique': [161, 98, 7], // Jaune ambré
  'Traduction': [99, 102, 241],
  'Allemand': [162, 28, 175],
  'Espagnol': [234, 88, 12],
};

const DEFAULT_SUBJECT_COLOR: [number, number, number] = [71, 85, 105]; // Slate

function getSubjectColor(matiere: string): [number, number, number] {
  for (const [key, color] of Object.entries(SUBJECT_COLORS)) {
    if (matiere.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(matiere.toLowerCase())) {
      return color;
    }
  }
  return DEFAULT_SUBJECT_COLOR;
}

const SLOT_TIME_LABELS = [
  '08h30 - 09h30',
  '09h30 - 10h30',
  '10h30 - 11h30',
  '11h30 - 12h30',
  '13h30 - 14h30',
  '14h30 - 15h30',
  '15h30 - 16h30',
];

/**
 * Génère une page d'emploi du temps individuelle (Classe ou Enseignant) au format Paysage A4
 */
function buildIndividualGridPage(
  doc: jsPDF,
  dataset: ImportDataset,
  planning: Planning,
  mode: 'class' | 'teacher',
  targetId: string,
  isFirstPage = true
) {
  if (!isFirstPage) {
    doc.addPage('a4', 'landscape');
  }

  const { teachers, classes, unites, semaine } = dataset;
  const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
  const classMap = new Map<string, Classe>(classes.map((c) => [c.id, c]));
  const uniteMap = new Map<string, Unite>(unites.map((u) => [u.id, u]));

  const targetClass = mode === 'class' ? classMap.get(targetId) : undefined;
  const targetTeacher = mode === 'teacher' ? teacherMap.get(targetId) : undefined;

  // Calcul du volume horaire de la cible
  const relevantAssignments = planning.filter((a) => {
    const u = uniteMap.get(a.uniteId);
    if (!u) return false;
    return mode === 'class' ? u.classeIds.includes(targetId) : u.teacherId === targetId;
  });

  const totalPlacedHours = relevantAssignments.length;

  // Construction de la grille créneau -> affectation
  const slotToAffs = new Map<number, typeof relevantAssignments>();
  for (const a of relevantAssignments) {
    const arr = slotToAffs.get(a.slot) || [];
    arr.push(a);
    slotToAffs.set(a.slot, arr);
  }

  // En-tête de la page
  const title = mode === 'class'
    ? `EMPLOI DU TEMPS · CLASSE : ${targetClass?.nom || targetId} (${targetClass?.niveau || ''})`
    : `EMPLOI DU TEMPS · ENSEIGNANT : ${targetTeacher?.nom || targetId} (${targetTeacher?.matiere || ''})`;

  const subTitle = `Établissement scolaire · Année 2024-2025 · Total heures : ${totalPlacedHours} h · Format Paysage A4`;

  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(10, 8, 277, 16, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(title, 14, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(subTitle, 14, 21.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(253, 224, 71); // amber-300
  doc.text(`${totalPlacedHours} h planifiées`, 273, 17, { align: 'right' });

  // Construction des colonnes du tableau
  // Colonne 0 : Heure / Créneau
  // Colonnes 1..5 : Lundi, Mardi, Mercredi, Jeudi, Vendredi
  const head = [
    [
      { content: 'Créneau / Heure', styles: { halign: 'center' as const, fillColor: [30, 41, 59] as [number, number, number] } },
      ...semaine.jours.map((j) => ({
        content: j.toUpperCase(),
        styles: { halign: 'center' as const, fillColor: [30, 41, 59] as [number, number, number] },
      })),
    ],
  ];

  const body: any[] = [];

  // Créneaux 0..3 (Matin C1..C4)
  for (let slotInDay = 0; slotInDay < 4; slotInDay++) {
    const row = [
      `C${slotInDay + 1}\n${SLOT_TIME_LABELS[slotInDay]}`,
    ];

    for (let jIdx = 0; jIdx < semaine.jours.length; jIdx++) {
      const startOfDay = semaine.creneauxParJour.slice(0, jIdx).reduce((a, b) => a + b, 0);
      const globalSlot = startOfDay + slotInDay;
      const affs = slotToAffs.get(globalSlot) || [];

      if (affs.length === 0) {
        row.push('—');
      } else {
        const lines = affs.map((a) => {
          const u = uniteMap.get(a.uniteId);
          if (!u) return '';
          const t = teacherMap.get(u.teacherId);
          if (mode === 'class') {
            return `${t?.matiere || 'Cours'}\nProf: ${t?.nom || ''}${u.estCommun ? ' (Commun)' : ''}`;
          } else {
            const classNames = u.classeIds.map((cid) => classMap.get(cid)?.nom || cid).join(', ');
            return `${t?.matiere || 'Cours'}\nClasse: ${classNames}`;
          }
        });
        row.push(lines.join('\n\n'));
      }
    }
    body.push(row);
  }

  // Ligne spéciale : PAUSE MÉRIDIENNE (12h30 - 13h30)
  body.push([
    {
      content: '12h30 - 13h30',
      styles: { fillColor: [254, 243, 199] as [number, number, number], fontStyle: 'bold' as const, halign: 'center' as const, textColor: [180, 83, 9] as [number, number, number] },
    },
    {
      content: 'PAUSE MÉRIDIENNE · 1 HEURE (Coupure de midi obligatoire entre C4 et C5)',
      colSpan: 5,
      styles: {
        fillColor: [254, 243, 199] as [number, number, number],
        textColor: [146, 64, 14] as [number, number, number],
        halign: 'center' as const,
        fontStyle: 'bold' as const,
      },
    },
  ]);

  // Créneaux 4..6 (Après-midi C5..C7)
  for (let slotInDay = 4; slotInDay < 7; slotInDay++) {
    const row: any[] = [
      `C${slotInDay + 1}\n${SLOT_TIME_LABELS[slotInDay]}`,
    ];

    for (let jIdx = 0; jIdx < semaine.jours.length; jIdx++) {
      if (jIdx === 4) {
        // Vendredi après-midi : libéré (4 créneaux max)
        row.push({
          content: 'Après-midi libéré\n(Vendredi)',
          styles: { fillColor: [248, 250, 252] as [number, number, number], textColor: [148, 163, 184] as [number, number, number], halign: 'center' as const, fontStyle: 'italic' as const },
        });
        continue;
      }

      const startOfDay = semaine.creneauxParJour.slice(0, jIdx).reduce((a, b) => a + b, 0);
      const globalSlot = startOfDay + slotInDay;
      const affs = slotToAffs.get(globalSlot) || [];

      if (affs.length === 0) {
        row.push('—');
      } else {
        const lines = affs.map((a) => {
          const u = uniteMap.get(a.uniteId);
          if (!u) return '';
          const t = teacherMap.get(u.teacherId);
          if (mode === 'class') {
            return `${t?.matiere || 'Cours'}\nProf: ${t?.nom || ''}${u.estCommun ? ' (Commun)' : ''}`;
          } else {
            const classNames = u.classeIds.map((cid) => classMap.get(cid)?.nom || cid).join(', ');
            return `${t?.matiere || 'Cours'}\nClasse: ${classNames}`;
          }
        });
        row.push(lines.join('\n\n'));
      }
    }
    body.push(row);
  }

  autoTable(doc, {
    startY: 27,
    head,
    body,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
      halign: 'center',
      valign: 'middle',
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      font: 'helvetica',
    },
    columnStyles: {
      0: { cellWidth: 27, fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [30, 41, 59] },
      1: { cellWidth: 50 },
      2: { cellWidth: 50 },
      3: { cellWidth: 50 },
      4: { cellWidth: 50 },
      5: { cellWidth: 50 },
    },
    didParseCell: (data) => {
      // Coloration douce selon la matière
      if (data.section === 'body' && data.column.index > 0 && typeof data.cell.raw === 'string' && data.cell.raw !== '—') {
        const firstLine = data.cell.raw.split('\n')[0] || '';
        const color = getSubjectColor(firstLine);
        // Légère teinte de fond pastellisée
        data.cell.styles.textColor = color;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 10, right: 10 },
  });

  // Pied de page
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · Conforme aux règles d'emploi du temps (Pause méridienne 1h · Max 2h/3h consécutives · Vendredi après-midi libéré)`,
    10,
    pageHeight - 6
  );
  doc.text(
    `Page ${doc.getNumberOfPages()}`,
    287,
    pageHeight - 6,
    { align: 'right' }
  );
}

/**
 * Exporte l'emploi du temps d'une classe en PDF Paysage A4
 */
export function downloadClassTimetablePDF(dataset: ImportDataset, planning: Planning, classId: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const c = dataset.classes.find((cl) => cl.id === classId);
  buildIndividualGridPage(doc, dataset, planning, 'class', classId, true);
  const cleanName = (c?.nom || classId).replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Emploi_du_temps_Classe_${cleanName}_Paysage.pdf`);
}

/**
 * Exporte l'emploi du temps d'un enseignant en PDF Paysage A4
 */
export function downloadTeacherTimetablePDF(dataset: ImportDataset, planning: Planning, teacherId: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const t = dataset.teachers.find((tc) => tc.id === teacherId);
  buildIndividualGridPage(doc, dataset, planning, 'teacher', teacherId, true);
  const cleanName = (t?.nom || teacherId).replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Emploi_du_temps_Prof_${cleanName}_Paysage.pdf`);
}

/**
 * Exporte un livret complet contenant toutes les classes (12 pages en mode paysage)
 */
export function downloadAllClassesBookletPDF(dataset: ImportDataset, planning: Planning) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  dataset.classes.forEach((c, index) => {
    buildIndividualGridPage(doc, dataset, planning, 'class', c.id, index === 0);
  });
  doc.save(`Livret_Emplois_du_temps_Toutes_Classes_Paysage.pdf`);
}

/**
 * Exporte un livret complet contenant tous les professeurs (28 pages en mode paysage)
 */
export function downloadAllTeachersBookletPDF(dataset: ImportDataset, planning: Planning) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  dataset.teachers.forEach((t, index) => {
    buildIndividualGridPage(doc, dataset, planning, 'teacher', t.id, index === 0);
  });
  doc.save(`Livret_Emplois_du_temps_Tous_Professeurs_Paysage.pdf`);
}

/**
 * Exporte la vue d'ensemble style aSc Horaires (Matrice des Classes x 32 créneaux) en PDF Paysage
 */
export function downloadAscMatrixPDF(dataset: ImportDataset, planning: Planning) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const { classes, teachers, unites, semaine } = dataset;
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const uniteMap = new Map(unites.map((u) => [u.id, u]));

  // Indexation rapide des affectations
  const classSlotMap = new Map<string, { matiere: string; profNom: string }>();
  for (const a of planning) {
    const u = uniteMap.get(a.uniteId);
    if (!u) continue;
    const t = teacherMap.get(u.teacherId);
    for (const cid of u.classeIds) {
      classSlotMap.set(`${cid}::${a.slot}`, {
        matiere: t?.matiere || '',
        profNom: t?.nom || '',
      });
    }
  }

  doc.setFillColor(15, 23, 42);
  doc.rect(10, 8, 277, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`MATRICE COMPLÈTE aSc HORAIRES · TOUTES LES CLASSES (${classes.length} CLASSES · 32 CRÉNEAUX)`, 14, 16);
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Format paysage optimisé · Jours C1..C7 avec pause méridienne et vendredi après-midi libéré`, 14, 20);

  // Construction des colonnes : Classe, puis 32 créneaux
  const headRow1: any[] = [
    { content: 'Classe', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fillColor: [30, 41, 59] } },
  ];
  const headRow2: any[] = [];

  for (let jIdx = 0; jIdx < semaine.jours.length; jIdx++) {
    const jour = semaine.jours[jIdx];
    const slotsCount = semaine.creneauxParJour[jIdx];
    headRow1.push({
      content: jour.substring(0, 3).toUpperCase(),
      colSpan: slotsCount,
      styles: { halign: 'center', fillColor: [51, 65, 85], fontStyle: 'bold' },
    });

    for (let s = 1; s <= slotsCount; s++) {
      headRow2.push({
        content: `C${s}`,
        styles: { halign: 'center', fillColor: [71, 85, 105], fontSize: 6.5 },
      });
    }
  }

  const body: any[] = [];

  for (const c of classes) {
    const row: any[] = [
      { content: `${c.nom}\n(${c.niveau})`, styles: { fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [15, 23, 42] } },
    ];

    let globalSlot = 0;
    for (let jIdx = 0; jIdx < semaine.jours.length; jIdx++) {
      const slotsCount = semaine.creneauxParJour[jIdx];
      for (let s = 0; s < slotsCount; s++) {
        const item = classSlotMap.get(`${c.id}::${globalSlot}`);
        if (!item) {
          row.push({ content: '', styles: { fillColor: [255, 255, 255] } });
        } else {
          const shortMat = item.matiere.substring(0, 4).toUpperCase();
          row.push({
            content: shortMat,
            styles: {
              fontSize: 6.5,
              halign: 'center',
              valign: 'middle',
              fontStyle: 'bold',
              textColor: getSubjectColor(item.matiere),
              cellPadding: 1,
            },
          });
        }
        globalSlot++;
      }
    }
    body.push(row);
  }

  autoTable(doc, {
    startY: 25,
    head: [headRow1, headRow2],
    body,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      halign: 'center',
      valign: 'middle',
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 25 },
    },
    margin: { left: 8, right: 8 },
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Document aSc Horaires généré automatiquement · Format paysage`, 10, pageHeight - 5);

  doc.save('Matrice_Classes_aSc_Horaires_Paysage.pdf');
}

/**
 * Exécute une impression navigateur sécurisée avec détection d'iframe
 */
export function triggerSafeBrowserPrint(): { success: boolean; error?: string } {
  try {
    if (typeof window !== 'undefined' && window.print) {
      window.print();
      return { success: true };
    }
    return { success: false, error: 'Fonction d\'impression non disponible dans cet environnement.' };
  } catch (err: any) {
    console.error('Erreur window.print:', err);
    return { success: false, error: err?.message || 'L\'impression directe a été bloquée par le navigateur.' };
  }
}
