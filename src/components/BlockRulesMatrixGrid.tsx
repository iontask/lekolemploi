/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  SlidersHorizontal,
  Sparkles,
  Save,
  Check,
  CheckSquare,
  Square,
  Search,
  Filter,
  RotateCcw,
  Layers,
  BookOpen,
  GraduationCap,
  Info,
  CheckCircle2,
  AlertCircle,
  Zap,
  School,
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Classe, ImportDataset, Teacher, Unite } from '../types';
import { SubjectLevelBlockRule } from '../rules/types';
import { generatePossibleBlockPartitions } from '../rules';
import { getSubjectAbbreviation, getSubjectMeta } from '../utils/subjectFormatters';

export interface BlockRulesMatrixGridProps {
  dataset: ImportDataset;
  rules: SubjectLevelBlockRule[];
  onChangeRules: (newRules: SubjectLevelBlockRule[]) => void;
  onSave?: (newRules: SubjectLevelBlockRule[]) => void;
  isSaving?: boolean;
  initialSearch?: string;
}

export interface GridSubjectRow {
  key: string; // ex: 'Mathématiques::2BAC::7'
  matiere: string;
  niveau: string;
  heuresHebdo: number;
  classes: string[]; // Noms des classes
  classeIds: string[];
  totalClassesCount: number;
  allPartitions: number[][]; // Toutes les partitions mathématiques (max 3h)
  selectedPartitions: number[][]; // Partitions actuellement autorisées
  actif: boolean;
  ruleId?: string; // id de la règle existante si déjà enregistrée
  isClassSpecific?: boolean;
  specificClasseId?: string;
  specificClasseNom?: string;
}

/** Formate une partition : [3, 2, 2] -> "3h + 2h + 2h" */
export function formatPartition(p: number[]): string {
  return p.map((h) => `${h}h`).join(' + ');
}

/** Vérifie l'égalité stricte entre 2 partitions ordonnées */
export function arePartitionsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

/** Vérifie si une liste de possibilités contient déjà une partition */
export function containsPartition(possibilities: number[][], part: number[]): boolean {
  return possibilities.some((p) => arePartitionsEqual(p, part));
}

/** Partition standard 2h (ex: 7h -> [2, 2, 2, 1], 4h -> [2, 2], 5h -> [2, 2, 1]) */
export function getStandard2hPartition(hours: number): number[] {
  const res: number[] = [];
  let rem = hours;
  while (rem >= 2) {
    res.push(2);
    rem -= 2;
  }
  if (rem === 1) {
    res.push(1);
  }
  return res;
}

/** Trie les partitions de manière naturelle pour les enseignants (plus compactes d'abord) */
export function sortPartitionsForEducation(parts: number[][]): number[][] {
  return [...parts].sort((a, b) => {
    // 1. Moins de séances par semaine (longueur plus courte = blocs plus longs)
    if (a.length !== b.length) return a.length - b.length;
    // 2. Plus grand bloc en premier
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return b[i] - a[i];
    }
    return 0;
  });
}

export const BlockRulesMatrixGrid: React.FC<BlockRulesMatrixGridProps> = ({
  dataset,
  rules = [],
  onChangeRules,
  onSave,
  isSaving = false,
  initialSearch = '',
}) => {
  const { teachers, classes, unites } = dataset;

  const teacherMap = useMemo(() => new Map<string, Teacher>(teachers.map((t) => [t.id, t])), [teachers]);
  const classMap = useMemo(() => new Map<string, Classe>(classes.map((c) => [c.id, c])), [classes]);

  // Tous les niveaux disponibles
  const allLevels = useMemo(
    () => Array.from(new Set(classes.map((c) => c.niveau).filter(Boolean))).sort(),
    [classes]
  );

  // Toutes les matières du projet
  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    for (const u of unites) {
      const t = teacherMap.get(u.teacherId);
      if (t?.matiere) set.add(t.matiere);
    }
    for (const t of teachers) {
      if (t.matiere) set.add(t.matiere);
    }
    return Array.from(set).sort();
  }, [unites, teachers, teacherMap]);

  // Extraction de toutes les combinaisons réelles du projet (Matière, Niveau, Heures)
  const baseCombinations = useMemo(() => {
    const comboMap = new Map<
      string,
      {
        matiere: string;
        niveau: string;
        heures: number;
        classes: string[];
        classeIds: string[];
      }
    >();

    for (const u of unites) {
      const t = teacherMap.get(u.teacherId);
      if (!t || !t.matiere) continue;

      const classesForUnite = u.classeIds.map((cid) => classMap.get(cid)).filter(Boolean) as Classe[];
      const niveauxSet = new Set(classesForUnite.map((c) => c.niveau).filter(Boolean));
      const niveau = niveauxSet.size > 0 ? Array.from(niveauxSet).sort().join(' / ') : 'Tous';
      const key = `${t.matiere}::__::${niveau}::__::${u.heures}`;

      const cNoms = u.classeIds.map((cid) => classMap.get(cid)?.nom || cid);
      const existing = comboMap.get(key);
      if (existing) {
        for (const cNom of cNoms) {
          if (!existing.classes.includes(cNom)) existing.classes.push(cNom);
        }
        for (const cid of u.classeIds) {
          if (!existing.classeIds.includes(cid)) existing.classeIds.push(cid);
        }
      } else {
        comboMap.set(key, {
          matiere: t.matiere,
          niveau,
          heures: u.heures,
          classes: [...cNoms],
          classeIds: [...u.classeIds],
        });
      }
    }

    // Si des matières de teachers n'ont pas encore d'unité assignée, les intégrer avec niveau 'Tous' et 4h par défaut
    for (const t of teachers) {
      if (!t.matiere) continue;
      const hasUnite = unites.some((u) => u.teacherId === t.id);
      if (!hasUnite) {
        const key = `${t.matiere}::__::Tous::__::4`;
        if (!comboMap.has(key)) {
          comboMap.set(key, {
            matiere: t.matiere,
            niveau: 'Tous',
            heures: 4,
            classes: ['Toutes les classes'],
            classeIds: [],
          });
        }
      }
    }

    return Array.from(comboMap.values()).sort(
      (a, b) => a.niveau.localeCompare(b.niveau) || a.matiere.localeCompare(b.matiere) || b.heures - a.heures
    );
  }, [unites, teachers, teacherMap, classMap]);

  // État local des lignes de la grille
  const [gridRows, setGridRows] = useState<GridSubjectRow[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Filtres
  const [searchMatiere, setSearchMatiere] = useState<string>(initialSearch);
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<string>('ALL');
  const [filterOnlyWith3h, setFilterOnlyWith3h] = useState<boolean>(false);

  // Accordéon pour ajout d'une règle spécifique par classe
  const [isClassCustomModalOpen, setIsClassCustomModalOpen] = useState<boolean>(false);
  const [customClassMatiere, setCustomClassMatiere] = useState<string>(allSubjects[0] || 'Mathématiques');
  const [customClassId, setCustomClassId] = useState<string>(classes[0]?.id || '');
  const [customClassHours, setCustomClassHours] = useState<number>(7);
  const [customClassPossibilities, setCustomClassPossibilities] = useState<number[][]>([
    [2, 2, 2, 1],
    [3, 3, 1],
    [3, 2, 2],
  ]);

  // Synchronisation avec initialSearch si mis à jour depuis le parent
  useEffect(() => {
    if (initialSearch) {
      setSearchMatiere(initialSearch);
    }
  }, [initialSearch]);

  // Synchronisation initiale et lors des changements de dataset/rules
  useEffect(() => {
    const rows: GridSubjectRow[] = [];

    // 1. Pour chaque combinaison réelle du projet
    for (const combo of baseCombinations) {
      const allParts = sortPartitionsForEducation(generatePossibleBlockPartitions(combo.heures, 3));

      // Vérifier si une règle existe déjà dans rules pour ce couple
      const existingRule = rules.find((r) => {
        if (r.classeId && r.classeId !== '*' && r.classeId !== 'toutes') return false;
        const matMatches = r.matiere === '*' || r.matiere.toLowerCase() === combo.matiere.toLowerCase();
        const nivMatches = r.niveau === '*' || r.niveau.toLowerCase() === combo.niveau.toLowerCase();
        return matMatches && nivMatches && r.heuresHebdo === combo.heures;
      });

      let selectedParts: number[][];
      let actif = true;
      let ruleId: string | undefined = undefined;

      if (existingRule) {
        selectedParts =
          existingRule.possibilites.length > 0
            ? existingRule.possibilites
            : [getStandard2hPartition(combo.heures)];
        actif = existingRule.actif !== false;
        ruleId = existingRule.id;
      } else {
        // Par défaut : partition standard 2h
        const std = getStandard2hPartition(combo.heures);
        selectedParts = [std];
        // Si la matière a 7h (ex: Maths 2BAC), on peut également pré-cocher les combinaisons pédagogiques courantes
        if (combo.heures === 7) {
          selectedParts = [
            [2, 2, 2, 1],
            [3, 3, 1],
            [3, 2, 2],
          ];
        }
      }

      rows.push({
        key: `${combo.matiere}::${combo.niveau}::${combo.heures}`,
        matiere: combo.matiere,
        niveau: combo.niveau,
        heuresHebdo: combo.heures,
        classes: combo.classes,
        classeIds: combo.classeIds,
        totalClassesCount: combo.classes.length,
        allPartitions: allParts,
        selectedPartitions: selectedParts,
        actif,
        ruleId,
      });
    }

    // 2. Ajouter les règles spécifiques à des classes déjà enregistrées
    for (const r of rules) {
      if (r.classeId && r.classeId !== '*' && r.classeId !== 'toutes') {
        const cls = classMap.get(r.classeId);
        const allParts = sortPartitionsForEducation(generatePossibleBlockPartitions(r.heuresHebdo, 3));
        rows.push({
          key: `class_spec_${r.id}`,
          matiere: r.matiere,
          niveau: r.niveau || cls?.niveau || 'Classe',
          heuresHebdo: r.heuresHebdo,
          classes: [cls?.nom || r.classeNom || r.classeId],
          classeIds: [r.classeId],
          totalClassesCount: 1,
          allPartitions: allParts,
          selectedPartitions: r.possibilites,
          actif: r.actif !== false,
          ruleId: r.id,
          isClassSpecific: true,
          specificClasseId: r.classeId,
          specificClasseNom: cls?.nom || r.classeNom || r.classeId,
        });
      } else {
        // S'il existe une règle générique enregistrée qui n'a pas matché avec baseCombinations
        const alreadyCovered = rows.some((row) => row.ruleId === r.id);
        if (!alreadyCovered && r.matiere) {
          const allParts = sortPartitionsForEducation(generatePossibleBlockPartitions(r.heuresHebdo || 4, 3));
          rows.push({
            key: `custom_rule_${r.id}`,
            matiere: r.matiere,
            niveau: r.niveau || 'Tous',
            heuresHebdo: r.heuresHebdo || 4,
            classes: r.classeNom ? [r.classeNom] : ['Toutes les classes'],
            classeIds: r.classeId ? [r.classeId] : [],
            totalClassesCount: 1,
            allPartitions: allParts,
            selectedPartitions: r.possibilites || [getStandard2hPartition(r.heuresHebdo || 4)],
            actif: r.actif !== false,
            ruleId: r.id,
            isClassSpecific: false,
          });
        }
      }
    }

    setGridRows(rows);
    setHasUnsavedChanges(false);
  }, [baseCombinations, rules, classMap]);

  // Convertit les lignes de la grille en SubjectLevelBlockRule[] complet
  const convertGridToRules = (rowsToConvert: GridSubjectRow[]): SubjectLevelBlockRule[] => {
    return rowsToConvert.map((row) => {
      const stableId =
        row.ruleId ||
        `rule_${row.matiere.replace(/\s+/g, '_')}_${row.niveau.replace(/\s+/g, '_')}_${row.heuresHebdo}h_${Math.random()
          .toString(36)
          .substring(2, 7)}`;
      return {
        id: stableId,
        matiere: row.matiere,
        niveau: row.isClassSpecific ? row.niveau : row.niveau,
        classeId: row.isClassSpecific ? row.specificClasseId : undefined,
        classeNom: row.isClassSpecific ? row.specificClasseNom : undefined,
        heuresHebdo: row.heuresHebdo,
        possibilites:
          row.selectedPartitions.length > 0
            ? row.selectedPartitions
            : [getStandard2hPartition(row.heuresHebdo)],
        maxHeuresParJour: Math.min(
          3,
          Math.max(
            1,
            ...(row.selectedPartitions.length > 0
              ? row.selectedPartitions.map((p) => Math.max(...p))
              : [2])
          )
        ) as 1 | 2 | 3,
        actif: row.actif,
        description: `Règle de découpage pour ${row.matiere} (${row.niveau}) : ${row.selectedPartitions
          .map((p) => p.join('+'))
          .join(' | ')}`,
      };
    });
  };

  // Basculer une possibilité pour une ligne précise
  const handleTogglePartition = (rowKey: string, partition: number[]) => {
    setGridRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row;

        const isAlreadySelected = containsPartition(row.selectedPartitions, partition);
        let nextSelected: number[][];

        if (isAlreadySelected) {
          // On évite de vider complètement (au moins 1 option obligatoire)
          if (row.selectedPartitions.length <= 1) {
            return row;
          }
          nextSelected = row.selectedPartitions.filter((p) => !arePartitionsEqual(p, partition));
        } else {
          nextSelected = [...row.selectedPartitions, partition];
        }

        return {
          ...row,
          selectedPartitions: nextSelected,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // Basculer l'état actif/inactif d'une ligne
  const handleToggleRowActive = (rowKey: string) => {
    setGridRows((prev) =>
      prev.map((row) => (row.key === rowKey ? { ...row, actif: !row.actif } : row))
    );
    setHasUnsavedChanges(true);
  };

  // Supprimer une règle spécifique classe
  const handleDeleteRow = (rowKey: string) => {
    setGridRows((prev) => prev.filter((r) => r.key !== rowKey));
    setHasUnsavedChanges(true);
  };

  // Préréglage d'une ligne précise : "Standard 2h uniquement"
  const handleSetRowStandard2h = (rowKey: string) => {
    setGridRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row;
        const parts2h = row.allPartitions.filter((p) => Math.max(...p) <= 2);
        const chosen = parts2h.length > 0 ? parts2h : [getStandard2hPartition(row.heuresHebdo)];
        return {
          ...row,
          selectedPartitions: chosen,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // Préréglage d'une ligne précise : "Activer les options de 3h"
  const handleSetRowInclude3h = (rowKey: string) => {
    setGridRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row;
        const partsWith3h = row.allPartitions.filter((p) => Math.max(...p) === 3).slice(0, 2);
        const std = getStandard2hPartition(row.heuresHebdo);
        const merged: number[][] = [];
        merged.push(std);
        for (const p of partsWith3h) {
          if (!containsPartition(merged, p)) merged.push(p);
        }

        return {
          ...row,
          selectedPartitions: merged,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // Préréglage d'une ligne précise : "Tout autoriser"
  const handleSetRowAll = (rowKey: string) => {
    setGridRows((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row;
        return {
          ...row,
          selectedPartitions: [...row.allPartitions],
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // =========================================================================
  // ACTIONS DE MODIFICATION RAPIDE DE L'ENSEMBLE (BULK ACTIONS)
  // =========================================================================

  // 1. Découpage standard 2h partout
  const handleBulkApplyStandard2h = () => {
    setGridRows((prev) =>
      prev.map((row) => {
        const parts2h = row.allPartitions.filter((p) => Math.max(...p) <= 2);
        return {
          ...row,
          selectedPartitions: parts2h.length > 0 ? parts2h.slice(0, 2) : [getStandard2hPartition(row.heuresHebdo)],
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // 2. Autoriser les blocs de 3h partout où c'est possible (heures >= 3)
  const handleBulkEnable3hBlocks = () => {
    setGridRows((prev) =>
      prev.map((row) => {
        if (row.heuresHebdo < 3) return row;
        const partsWith3h = row.allPartitions.filter((p) => Math.max(...p) === 3).slice(0, 2);
        const std = getStandard2hPartition(row.heuresHebdo);
        const combined: number[][] = [];
        combined.push(std);
        for (const p of partsWith3h) {
          if (!containsPartition(combined, p)) combined.push(p);
        }
        return {
          ...row,
          selectedPartitions: combined,
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  // 3. Action rapide sur le niveau actuellement filtré (ex: 2BAC)
  const handleApplyToCurrentLevel = (enable3h: boolean) => {
    if (selectedLevelFilter === 'ALL') return;
    setGridRows((prev) =>
      prev.map((row) => {
        if (row.niveau.toLowerCase() !== selectedLevelFilter.toLowerCase()) return row;
        if (enable3h && row.heuresHebdo >= 3) {
          const partsWith3h = row.allPartitions.filter((p) => Math.max(...p) === 3).slice(0, 2);
          const std = getStandard2hPartition(row.heuresHebdo);
          const combined: number[][] = [std];
          for (const p of partsWith3h) {
            if (!containsPartition(combined, p)) combined.push(p);
          }
          return { ...row, selectedPartitions: combined };
        } else {
          const parts2h = row.allPartitions.filter((p) => Math.max(...p) <= 2);
          return {
            ...row,
            selectedPartitions: parts2h.length > 0 ? parts2h.slice(0, 2) : [getStandard2hPartition(row.heuresHebdo)],
          };
        }
      })
    );
    setHasUnsavedChanges(true);
  };

  // 4. Tout autoriser partout
  const handleBulkSelectAllPossibilities = () => {
    setGridRows((prev) =>
      prev.map((row) => ({
        ...row,
        selectedPartitions: [...row.allPartitions],
      }))
    );
    setHasUnsavedChanges(true);
  };

  // 5. Réinitialisation
  const handleResetToProjectDefaults = () => {
    const rows: GridSubjectRow[] = baseCombinations.map((combo) => {
      const allParts = sortPartitionsForEducation(generatePossibleBlockPartitions(combo.heures, 3));
      let selected: number[][];
      if (combo.heures === 7) {
        selected = [
          [2, 2, 2, 1],
          [3, 3, 1],
          [3, 2, 2],
        ];
      } else {
        selected = [getStandard2hPartition(combo.heures)];
      }
      return {
        key: `${combo.matiere}::${combo.niveau}::${combo.heures}`,
        matiere: combo.matiere,
        niveau: combo.niveau,
        heuresHebdo: combo.heures,
        classes: combo.classes,
        classeIds: combo.classeIds,
        totalClassesCount: combo.classes.length,
        allPartitions: allParts,
        selectedPartitions: selected,
        actif: true,
      };
    });
    setGridRows(rows);
    setHasUnsavedChanges(true);
  };

  // =========================================================================
  // AJOUT D'UNE RÈGLE SPÉCIFIQUE PAR CLASSE
  // =========================================================================
  const handleAddClassSpecificRule = () => {
    if (!customClassId || !customClassMatiere || customClassPossibilities.length === 0) return;
    const cls = classMap.get(customClassId);
    const newRuleId = `rule_class_${customClassId}_${Date.now()}`;
    const allParts = sortPartitionsForEducation(generatePossibleBlockPartitions(customClassHours, 3));

    const newRow: GridSubjectRow = {
      key: `class_spec_${newRuleId}`,
      matiere: customClassMatiere,
      niveau: cls?.niveau || 'Classe',
      heuresHebdo: customClassHours,
      classes: [cls?.nom || customClassId],
      classeIds: [customClassId],
      totalClassesCount: 1,
      allPartitions: allParts,
      selectedPartitions: customClassPossibilities,
      actif: true,
      ruleId: newRuleId,
      isClassSpecific: true,
      specificClasseId: customClassId,
      specificClasseNom: cls?.nom || customClassId,
    };

    setGridRows((prev) => [newRow, ...prev]);
    setIsClassCustomModalOpen(false);
    setHasUnsavedChanges(true);
  };

  // =========================================================================
  // SAUVEGARDE GLOBALE
  // =========================================================================
  const handleSaveAll = () => {
    const updatedRules = convertGridToRules(gridRows);

    // Maintient les ruleIds stables
    setGridRows((prev) =>
      prev.map((r, idx) => ({
        ...r,
        ruleId: updatedRules[idx]?.id || r.ruleId,
      }))
    );

    onChangeRules(updatedRules);
    if (onSave) {
      onSave(updatedRules);
    }
    setHasUnsavedChanges(false);
    setSaveSuccessMessage(
      `Configuration des blocs enregistrée avec succès : ${updatedRules.length} règles sauvegardées.`
    );
    setTimeout(() => setSaveSuccessMessage(null), 4000);
  };

  // Lignes filtrées
  const filteredRows = useMemo(() => {
    return gridRows.filter((row) => {
      if (selectedLevelFilter !== 'ALL' && row.niveau.toLowerCase() !== selectedLevelFilter.toLowerCase()) {
        return false;
      }
      if (searchMatiere.trim()) {
        const q = searchMatiere.toLowerCase().trim();
        const matchesName = row.matiere.toLowerCase().includes(q);
        const matchesLevel = row.niveau.toLowerCase().includes(q);
        const matchesClasses = row.classes.some((c) => c.toLowerCase().includes(q));
        if (!matchesName && !matchesLevel && !matchesClasses) return false;
      }
      if (filterOnlyWith3h) {
        const has3hSelected = row.selectedPartitions.some((p) => Math.max(...p) === 3);
        if (!has3hSelected) return false;
      }
      return true;
    });
  }, [gridRows, selectedLevelFilter, searchMatiere, filterOnlyWith3h]);

  // Statistiques en direct
  const stats = useMemo(() => {
    const totalCombinations = gridRows.length;
    const totalActiveRules = gridRows.filter((r) => r.actif).length;
    const with3hAllowed = gridRows.filter((r) => r.selectedPartitions.some((p) => Math.max(...p) === 3)).length;
    const totalPossibilitiesCount = gridRows.reduce((acc, r) => acc + r.selectedPartitions.length, 0);
    return {
      totalCombinations,
      totalActiveRules,
      with3hAllowed,
      totalPossibilitiesCount,
    };
  }, [gridRows]);

  return (
    <div className="space-y-4">
      {/* Bannière de notifications de sauvegarde */}
      {saveSuccessMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-2xl text-xs flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            </div>
            <span className="font-bold text-emerald-900">{saveSuccessMessage}</span>
          </div>
          <button
            onClick={() => setSaveSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 rounded-md hover:bg-emerald-100/50"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Alerte si modifications non enregistrées */}
      {hasUnsavedChanges && (
        <div className="p-3 bg-amber-50 border border-amber-300 text-amber-950 rounded-2xl text-xs flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping inline-block" />
            <span className="font-semibold text-amber-900">
              Des modifications ont été apportées à la grille des blocs. Pensez à sauvegarder ci-dessous pour les appliquer au solveur.
            </span>
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition-colors shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Sauvegarder maintenant</span>
          </button>
        </div>
      )}

      {/* En-tête et barre d'actions rapides groupées (Bulk Modification) */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                Grille globale de configuration des blocs possibles
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                {stats.totalCombinations} matière(s) par niveau
              </span>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                Max 3h par bloc
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Toutes les matières sont regroupées ci-dessous avec leurs niveaux respectifs. Cochez ou décochez directement devant chaque matière ses combinaisons de blocs autorisées pour l'emploi du temps.
            </p>
          </div>

          {/* Boutons d'action droite : Règle classe & Sauvegarder */}
          <div className="flex items-center gap-2 self-start lg:self-auto shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setIsClassCustomModalOpen(!isClassCustomModalOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl shadow-2xs transition-colors"
              title="Ajouter une combinaison spécifique pour une classe particulière"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Règle par classe</span>
              {isClassCustomModalOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl shadow-xs transition-all ${
                hasUnsavedChanges
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 ring-2 ring-indigo-400/40'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>
                {isSaving
                  ? 'Enregistrement...'
                  : hasUnsavedChanges
                  ? 'Sauvegarder les modifications'
                  : 'Sauvegarder la configuration'}
              </span>
            </button>
          </div>
        </div>

        {/* Modal / Panneau déroulant : Ajouter une règle spécifique par classe */}
        {isClassCustomModalOpen && (
          <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <School className="w-4 h-4 text-indigo-600" />
                Définir une règle de découpage personnalisée pour une classe unique
              </span>
              <button
                type="button"
                onClick={() => setIsClassCustomModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Matière</label>
                <select
                  value={customClassMatiere}
                  onChange={(e) => setCustomClassMatiere(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                >
                  {allSubjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Classe ciblée</label>
                <select
                  value={customClassId}
                  onChange={(e) => setCustomClassId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom} ({c.niveau})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Heures hebdomadaires</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={customClassHours}
                  onChange={(e) => {
                    const h = parseInt(e.target.value) || 1;
                    setCustomClassHours(h);
                    setCustomClassPossibilities(sortPartitionsForEducation(generatePossibleBlockPartitions(h, 3)).slice(0, 3));
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">
                La règle sera ajoutée comme ligne personnalisée dans la grille ci-dessous.
              </span>
              <button
                type="button"
                onClick={handleAddClassSpecificRule}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter cette règle à la grille</span>
              </button>
            </div>
          </div>
        )}

        {/* Boutons d'actions en masse (Modification rapide de l'ensemble) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-200/80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Modification rapide globale :
            </span>

            <button
              type="button"
              onClick={handleBulkApplyStandard2h}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-2xs transition-colors"
              title="Restreint toutes les matières à des blocs de 2h maximum (ex: 4h = 2h+2h, 7h = 2h+2h+2h+1h)"
            >
              <span>Découpage standard (2h max partout)</span>
            </button>

            <button
              type="button"
              onClick={handleBulkEnable3hBlocks}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg shadow-2xs transition-colors"
              title="Autorise les blocs de 3h consécutives pour les matières ayant 3h ou plus (ex: Maths 2BAC 3h+3h+1h)"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>Autoriser les blocs de 3h partout</span>
            </button>

            <button
              type="button"
              onClick={handleBulkSelectAllPossibilities}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
              title="Autorise toutes les combinaisons mathématiquement possibles pour un maximum de souplesse au solveur"
            >
              <span>Tout autoriser</span>
            </button>

            <button
              type="button"
              onClick={handleResetToProjectDefaults}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
              title="Réinitialiser les combinaisons aux valeurs initiales du projet"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Réinitialiser</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-600 font-medium">
            <strong>{stats.with3hAllowed}</strong> matière(s) avec 3h autorisées · <strong>{stats.totalPossibilitiesCount}</strong> combinaisons actives
          </div>
        </div>

        {/* Filtres de recherche et de niveaux */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Recherche textuelle */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Rechercher par matière ou classe..."
              value={searchMatiere}
              onChange={(e) => setSearchMatiere(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchMatiere && (
              <button
                type="button"
                onClick={() => setSearchMatiere('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Onglets / Sélecteur de niveaux & Action ciblée par niveau */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedLevelFilter('ALL')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                selectedLevelFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Tous ({gridRows.length})
            </button>
            {allLevels.map((lvl) => {
              const count = gridRows.filter((r) => r.niveau.toLowerCase() === lvl.toLowerCase()).length;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevelFilter(lvl)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    selectedLevelFilter === lvl
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {lvl} ({count})
                </button>
              );
            })}

            {/* Si un niveau précis est sélectionné, bouton d'action rapide pour ce niveau */}
            {selectedLevelFilter !== 'ALL' && (
              <div className="flex items-center gap-1 ml-1 pl-1 border-l border-slate-200">
                <button
                  type="button"
                  onClick={() => handleApplyToCurrentLevel(true)}
                  className="px-2 py-0.5 text-[11px] font-bold text-purple-800 bg-purple-50 hover:bg-purple-100 rounded border border-purple-200"
                  title={`Autoriser les séances de 3h pour toutes les matières de ${selectedLevelFilter}`}
                >
                  +3h ({selectedLevelFilter})
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyToCurrentLevel(false)}
                  className="px-2 py-0.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 rounded border border-slate-200"
                  title={`Restreindre au standard 2h pour ${selectedLevelFilter}`}
                >
                  Standard 2h ({selectedLevelFilter})
                </button>
              </div>
            )}

            <label className="flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer ml-2">
              <input
                type="checkbox"
                checked={filterOnlyWith3h}
                onChange={(e) => setFilterOnlyWith3h(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
              />
              <span>Séances de 3h actives uniquement</span>
            </label>
          </div>
        </div>
      </div>

      {/* TABLEAU / GRILLE DES MATIÈRES & COMBINAISONS POSSIBLES */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider w-48">
                  Matière
                </th>
                <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider w-36">
                  Niveau & Classes
                </th>
                <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider w-24 text-center">
                  Volume Hebdo
                </th>
                <th className="py-3 px-4 font-bold text-xs uppercase tracking-wider">
                  Combinaisons de blocs possibles (Cochez pour autoriser au solveur)
                </th>
                <th className="py-3 px-3 font-bold text-xs uppercase tracking-wider w-28 text-center">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                    Aucune matière ne correspond aux critères de filtre.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const meta = getSubjectMeta(row.matiere);
                  const abbr = getSubjectAbbreviation(row.matiere);
                  const standard2h = getStandard2hPartition(row.heuresHebdo);

                  return (
                    <tr
                      key={row.key}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        !row.actif ? 'opacity-50 bg-slate-50/50' : ''
                      }`}
                    >
                      {/* 1. Matière */}
                      <td className="py-3 px-4 align-top">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                              meta?.badgeClass || 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {abbr}
                          </span>
                          <div>
                            <span className="font-bold text-slate-900 block leading-tight">
                              {row.matiere}
                            </span>
                            {row.isClassSpecific ? (
                              <span className="text-[10px] text-amber-800 font-semibold flex items-center gap-1 mt-0.5">
                                <School className="w-3 h-3 text-amber-600" />
                                Règle classe : {row.specificClasseNom}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* 2. Niveau & Classes */}
                      <td className="py-3 px-4 align-top">
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 font-bold text-xs border border-purple-200">
                            <GraduationCap className="w-3.5 h-3.5 text-purple-600" />
                            {row.niveau}
                          </span>
                          <p
                            className="text-[11px] text-slate-500 truncate max-w-[180px]"
                            title={row.classes.join(', ')}
                          >
                            {row.classes.join(', ')}
                          </p>
                        </div>
                      </td>

                      {/* 3. Volume Horaire */}
                      <td className="py-3 px-4 align-top text-center">
                        <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-900 font-mono font-bold text-xs border border-slate-200">
                          {row.heuresHebdo} h / sem
                        </span>
                      </td>

                      {/* 4. Combinaisons possibles (DEVANT CHAQUE MATIÈRE PAR NIVEAU) */}
                      <td className="py-3 px-4 align-top">
                        <div className="space-y-2">
                          {/* Badges interactifs cliquables pour chaque combinaison */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {row.allPartitions.map((part, pIdx) => {
                              const isSelected = containsPartition(row.selectedPartitions, part);
                              const has3h = Math.max(...part) === 3;
                              const isStandard = arePartitionsEqual(part, standard2h);
                              const isOnlyOneSelected = isSelected && row.selectedPartitions.length === 1;

                              return (
                                <button
                                  key={pIdx}
                                  type="button"
                                  onClick={() => handleTogglePartition(row.key, part)}
                                  disabled={!row.actif}
                                  title={
                                    isOnlyOneSelected
                                      ? 'Au moins une combinaison doit rester autorisée'
                                      : isSelected
                                      ? 'Cliquer pour désactiver cette combinaison'
                                      : 'Cliquer pour autoriser cette combinaison'
                                  }
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                                    isSelected
                                      ? has3h
                                        ? 'bg-purple-50 text-purple-950 border-purple-300 shadow-2xs hover:bg-purple-100 ring-1 ring-purple-300/40'
                                        : 'bg-indigo-50 text-indigo-950 border-indigo-300 shadow-2xs hover:bg-indigo-100 ring-1 ring-indigo-300/40'
                                      : 'bg-white text-slate-400 border-slate-200 hover:text-slate-700 hover:border-slate-300'
                                  }`}
                                >
                                  {isSelected ? (
                                    <CheckSquare
                                      className={`w-3.5 h-3.5 shrink-0 ${
                                        has3h ? 'text-purple-600' : 'text-indigo-600'
                                      }`}
                                    />
                                  ) : (
                                    <Square className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                                  )}
                                  <span>{formatPartition(part)}</span>
                                  {has3h && isSelected && (
                                    <span className="text-[9px] font-sans font-bold bg-purple-200 text-purple-900 px-1 py-0.2 rounded">
                                      Option 3h
                                    </span>
                                  )}
                                  {isStandard && isSelected && (
                                    <span className="text-[9px] font-sans font-bold bg-indigo-100 text-indigo-800 px-1 py-0.2 rounded">
                                      Standard
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {/* Actions rapides par ligne */}
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-0.5">
                            <span className="font-semibold text-slate-700">
                              {row.selectedPartitions.length} / {row.allPartitions.length} autorisée(s) :
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSetRowStandard2h(row.key)}
                              className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                            >
                              Standard 2h
                            </button>
                            <span>·</span>
                            {row.heuresHebdo >= 3 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSetRowInclude3h(row.key)}
                                  className="text-purple-700 hover:text-purple-900 font-medium hover:underline"
                                >
                                  + Options 3h
                                </button>
                                <span>·</span>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSetRowAll(row.key)}
                              className="text-slate-600 hover:text-slate-900 font-medium hover:underline"
                            >
                              Tout cocher
                            </button>
                            {row.isClassSpecific && (
                              <>
                                <span>·</span>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRow(row.key)}
                                  className="text-rose-600 hover:text-rose-800 font-medium flex items-center gap-1"
                                  title="Supprimer cette règle spécifique de classe"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Supprimer règle</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 5. Statut et Toggle actif */}
                      <td className="py-3 px-3 align-top text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={row.actif}
                              onChange={() => handleToggleRowActive(row.key)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600" />
                          </label>
                          <span
                            className={`text-[10px] font-bold ${
                              row.actif ? 'text-indigo-700' : 'text-slate-400'
                            }`}
                          >
                            {row.actif ? 'Active' : 'En pause'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pied de tableau avec bouton de sauvegarde récapitulatif */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            <span>
              Total : <strong>{filteredRows.length}</strong> ligne(s) affichée(s) sur {gridRows.length} combinaisons réelles du projet.
            </span>
            {hasUnsavedChanges && (
              <span className="text-amber-700 font-bold ml-2">
                ⚠️ N'oubliez pas d'enregistrer vos modifications.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-xs transition-colors ${
                hasUnsavedChanges
                  ? 'bg-indigo-600 hover:bg-indigo-700 ring-2 ring-indigo-400/40 shadow-indigo-200'
                  : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>
                {hasUnsavedChanges
                  ? 'Sauvegarder les modifications des blocs'
                  : 'Sauvegarder la configuration des blocs'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
