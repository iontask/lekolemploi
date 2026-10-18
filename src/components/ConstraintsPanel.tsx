/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Sliders,
  Clock,
  Layers,
  Shield,
  Ban,
  CalendarCheck2,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  BookOpen,
  GraduationCap,
  Sparkles,
  Check,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Search,
  School,
} from 'lucide-react';
import { Classe, ImportDataset, Teacher, Unite } from '../types';
import {
  DEFAULT_RULES_OPTIONS,
  generatePossibleBlockPartitions,
  getSlotCoordinates,
} from '../rules';
import {
  ForbiddenSlotPerClass,
  ForbiddenSlotPerTeacher,
  ReservedSlotPerClass,
  RulesOptions,
  SubjectLevelBlockRule,
} from '../rules/types';
import { SubjectHourlyConstraintsManager } from './SubjectHourlyConstraintsManager';
import { BlockRulesMatrixGrid } from './BlockRulesMatrixGrid';

interface ConstraintsPanelProps {
  dataset: ImportDataset;
  currentConstraints?: RulesOptions;
  onSaveConstraints: (newConstraints: RulesOptions, updatedUnites?: Unite[]) => void;
}

export const ConstraintsPanel: React.FC<ConstraintsPanelProps> = ({
  dataset,
  currentConstraints,
  onSaveConstraints,
}) => {
  const { teachers, classes, semaine } = dataset;
  const totalSlots = semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  // État local des contraintes
  const [options, setOptions] = useState<RulesOptions>({
    ...DEFAULT_RULES_OPTIONS,
    ...(dataset.constraints || {}),
    ...(currentConstraints || {}),
  });

  const [unitesList, setUnitesList] = useState<Unite[]>(dataset.unites);

  React.useEffect(() => {
    setUnitesList(dataset.unites);
  }, [dataset.unites]);

  const handleUpdateUnitHours = (uniteId: string, newHours: number) => {
    setUnitesList((prev) =>
      prev.map((u) => (u.id === uniteId ? { ...u, heures: newHours } : u))
    );
  };

  const handleUpdateLevelHours = (niveau: string, matiere: string, newHours: number) => {
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const classMap = new Map(classes.map((c) => [c.id, c]));
    setUnitesList((prev) =>
      prev.map((u) => {
        const t = teacherMap.get(u.teacherId);
        if (!t || t.matiere !== matiere) return u;
        const inLevel = u.classeIds.some((cid) => classMap.get(cid)?.niveau === niveau);
        return inLevel ? { ...u, heures: newHours } : u;
      })
    );
  };

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Gestion des matières à blocs
  const [newBlockSubject, setNewBlockSubject] = useState('');
  const allAvailableSubjects = Array.from(new Set(teachers.map((t) => t.matiere))).sort();

  const handleAddBlockSubject = (subj: string) => {
    const trimmed = subj.trim();
    if (!trimmed) return;
    const currentList = options.matieresABlocs || ['Arabe', 'Anglais'];
    if (!currentList.includes(trimmed)) {
      setOptions({
        ...options,
        matieresABlocs: [...currentList, trimmed],
      });
    }
    setNewBlockSubject('');
  };

  const handleRemoveBlockSubject = (subj: string) => {
    const currentList = options.matieresABlocs || ['Arabe', 'Anglais'];
    setOptions({
      ...options,
      matieresABlocs: currentList.filter((s) => s !== subj),
    });
  };

  // --- GRILLE DE FLEXIBILITÉ DE LA RÈGLE 2H PAR JOUR (1h, 2h ou 3h par matière) ---
  const [subjectDailyFilter, setSubjectDailyFilter] = useState('');

  const handleSetSubjectDailyLimit = (matiere: string, limit: 1 | 2 | 3) => {
    const currentLimits = options.maxHeuresParJourParMatiere || {};
    setOptions({
      ...options,
      maxHeuresParJourParMatiere: {
        ...currentLimits,
        [matiere]: limit,
      },
    });
  };

  const handleSetAllSubjectsDailyLimit = (limit: 1 | 2 | 3) => {
    const newLimits: Record<string, 1 | 2 | 3> = {};
    for (const s of allAvailableSubjects) {
      newLimits[s] = limit;
    }
    setOptions({
      ...options,
      maxHeuresParJourParMatiere: newLimits,
    });
  };

  const subjectMetadata = React.useMemo(() => {
    const meta = new Map<string, { teachers: string[]; classes: string[]; totalHours: number }>();
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const classMap = new Map(classes.map((c) => [c.id, c]));

    for (const s of allAvailableSubjects) {
      meta.set(s, { teachers: [], classes: [], totalHours: 0 });
    }

    for (const u of dataset.unites) {
      const t = teacherMap.get(u.teacherId);
      if (!t) continue;
      const m = meta.get(t.matiere);
      if (m) {
        if (!m.teachers.includes(t.nom)) m.teachers.push(t.nom);
        m.totalHours += u.heures;
        for (const cid of u.classeIds) {
          const c = classMap.get(cid);
          if (c && !m.classes.includes(c.nom)) m.classes.push(c.nom);
        }
      }
    }

    return meta;
  }, [allAvailableSubjects, dataset.unites, teachers, classes]);

  const filteredSubjects = React.useMemo(() => {
    if (!subjectDailyFilter.trim()) return allAvailableSubjects;
    const term = subjectDailyFilter.toLowerCase().trim();
    return allAvailableSubjects.filter((s) => s.toLowerCase().includes(term));
  }, [allAvailableSubjects, subjectDailyFilter]);

  // --- GESTION DES BLOCS PAR MATIÈRE / NIVEAU (Découpage horaire, max 3h) ---
  const allLevels = React.useMemo(
    () => Array.from(new Set(classes.map((c) => c.niveau).filter(Boolean))).sort(),
    [classes]
  );

  // Détection des combinaisons réelles du projet (Matière + Niveau + Volume)
  const projectCombinations = React.useMemo(() => {
    const classMap = new Map<string, Classe>(classes.map((c) => [c.id, c]));
    const teacherMap = new Map<string, Teacher>(teachers.map((t) => [t.id, t]));
    const combos: { matiere: string; niveau: string; heures: number; count: number }[] = [];

    for (const u of dataset.unites) {
      const t = teacherMap.get(u.teacherId);
      if (!t) continue;
      const c = classMap.get(u.classeIds[0]);
      const niveau = c?.niveau || 'Tous';
      const existing = combos.find(
        (cb) => cb.matiere === t.matiere && cb.niveau === niveau && cb.heures === u.heures
      );
      if (existing) {
        existing.count++;
      } else {
        combos.push({ matiere: t.matiere, niveau, heures: u.heures, count: 1 });
      }
    }
    return combos.sort((a, b) => b.heures - a.heures || a.matiere.localeCompare(b.matiere));
  }, [dataset.unites, teachers, classes]);

  // Navigation et focus vers la grille des blocs
  const [focusedBlockSubject, setFocusedBlockSubject] = useState<string | undefined>(undefined);

  const handleNavigateToBlockRule = (
    matiere: string,
    niveau: string,
    classeId?: string,
    hours?: number
  ) => {
    setFocusedBlockSubject(matiere);
    const el = document.getElementById('section-block-rules');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // Basculer l'état actif / inactif d'une règle
  const handleToggleRuleActive = (ruleId: string) => {
    const current = options.subjectBlockRules || [];
    setOptions({
      ...options,
      subjectBlockRules: current.map((r) =>
        r.id === ruleId ? { ...r, actif: r.actif === false ? true : false } : r
      ),
    });
  };


  // Gestion des créneaux réservés par classe (ex: 3h de contrôles en 2 Bac)
  const [selectedReservedClass, setSelectedReservedClass] = useState<string>(classes[0]?.id || '');
  const [reservedLabel, setReservedLabel] = useState('Contrôles continus / Devoirs');
  const [reservedSlotsToAdd, setReservedSlotsToAdd] = useState<number[]>([]);

  const toggleReservedSlot = (slot: number) => {
    if (reservedSlotsToAdd.includes(slot)) {
      setReservedSlotsToAdd(reservedSlotsToAdd.filter((s) => s !== slot));
    } else {
      setReservedSlotsToAdd([...reservedSlotsToAdd, slot]);
    }
  };

  const handleAddReservedReservation = () => {
    if (!selectedReservedClass || reservedSlotsToAdd.length === 0) return;
    const currentReserved = options.reservedSlots || [];
    const newItems: ReservedSlotPerClass[] = reservedSlotsToAdd.map((slot) => ({
      classeId: selectedReservedClass,
      slot,
      label: reservedLabel || 'Contrôle réservé',
    }));

    // Éviter les doublons
    const filtered = currentReserved.filter(
      (r) => !(r.classeId === selectedReservedClass && reservedSlotsToAdd.includes(r.slot))
    );

    setOptions({
      ...options,
      reservedSlots: [...filtered, ...newItems],
    });
    setReservedSlotsToAdd([]);
  };

  const handleRemoveReservedSlot = (classeId: string, slot: number) => {
    const currentReserved = options.reservedSlots || [];
    setOptions({
      ...options,
      reservedSlots: currentReserved.filter((r) => !(r.classeId === classeId && r.slot === slot)),
    });
  };

  // Gestion des plages interdites par classe ou prof
  const [forbiddenEntityMode, setForbiddenEntityMode] = useState<'classe' | 'teacher'>('classe');
  const [selectedForbiddenClassId, setSelectedForbiddenClassId] = useState<string>(classes[0]?.id || '');
  const [selectedForbiddenTeacherId, setSelectedForbiddenTeacherId] = useState<string>(teachers[0]?.id || '');

  const toggleForbiddenSlot = (slot: number) => {
    if (forbiddenEntityMode === 'classe') {
      const current = options.forbiddenSlotsClasses || [];
      const exists = current.some((f) => f.classeId === selectedForbiddenClassId && f.slot === slot);
      if (exists) {
        setOptions({
          ...options,
          forbiddenSlotsClasses: current.filter(
            (f) => !(f.classeId === selectedForbiddenClassId && f.slot === slot)
          ),
        });
      } else {
        const toAdd: ForbiddenSlotPerClass = {
          classeId: selectedForbiddenClassId,
          slot,
          reason: 'Plage interdite définie par l\'établissement',
        };
        setOptions({
          ...options,
          forbiddenSlotsClasses: [...current, toAdd],
        });
      }
    } else {
      const current = options.forbiddenSlotsTeachers || [];
      const exists = current.some((f) => f.teacherId === selectedForbiddenTeacherId && f.slot === slot);
      if (exists) {
        setOptions({
          ...options,
          forbiddenSlotsTeachers: current.filter(
            (f) => !(f.teacherId === selectedForbiddenTeacherId && f.slot === slot)
          ),
        });
      } else {
        const toAdd: ForbiddenSlotPerTeacher = {
          teacherId: selectedForbiddenTeacherId,
          slot,
          reason: 'Indisponibilité ou convenance personnelle',
        };
        setOptions({
          ...options,
          forbiddenSlotsTeachers: [...current, toAdd],
        });
      }
    }
  };

  const handleSave = () => {
    onSaveConstraints(options, unitesList);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleResetToDefault = () => {
    setOptions({ ...DEFAULT_RULES_OPTIONS });
    setUnitesList(dataset.unites);
    setShowResetConfirm(false);
  };

  // Vérifier si un créneau est interdit pour l'entité active
  const isSlotForbiddenActive = (slot: number) => {
    if (forbiddenEntityMode === 'classe') {
      return (options.forbiddenSlotsClasses || []).some(
        (f) => f.classeId === selectedForbiddenClassId && f.slot === slot
      );
    } else {
      return (options.forbiddenSlotsTeachers || []).some(
        (f) => f.teacherId === selectedForbiddenTeacherId && f.slot === slot
      );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-white rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-slate-800" />
            <h1 className="text-base font-bold text-slate-900">
              Panneau de configuration des contraintes (Étape 6)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Personnalisez les matières à blocs, les plafonds horaires, les pénalités souples, les créneaux réservés par classe et les plages interdites.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {savedSuccess && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Contraintes enregistrées !
            </span>
          )}
          {showResetConfirm ? (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
              <span className="text-xs text-amber-900 font-medium">Rétablir défauts ?</span>
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-2 py-0.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors"
              >
                Oui
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-1.5 py-0.5 text-xs text-slate-500 hover:text-slate-700"
              >
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
              title="Rétablir les contraintes par défaut"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Réinitialiser</span>
            </button>
          )}
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Enregistrer les contraintes</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1 : RÈGLE DES BLOCS CONSÉCUTIFS & GRILLE DE FLEXIBILITÉ PAR MATIÈRE */}
        <div className="col-span-1 lg:col-span-2 p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  1. Règle des blocs consécutifs & Limite par séance / jour par matière
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gestion des séances consécutives et personnalisation de la limite maximale par jour / séance pour chaque matière (1h, 2h ou 3h).
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-100 transition-colors self-start sm:self-auto">
              <input
                type="checkbox"
                checked={options.toutesMatieresABlocs ?? true}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    toutesMatieresABlocs: e.target.checked,
                  })
                }
                className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
              />
              <span>Toutes les matières à blocs (Recommandé)</span>
            </label>
          </div>

          <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-indigo-600" />
              <span>Spécifications officielles appliquées :</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600">
              <li><strong>Volumes pairs</strong> (ex: 4h) : divisés en blocs de 2h consécutives sur des jours différents.</li>
              <li><strong>Volumes impairs</strong> (ex: 7h) : blocs de 2h consécutives (3 jours x 2h) et le reste (1h) un autre jour.</li>
              <li><strong>Aucun trou</strong> ne peut scinder un bloc de 2h.</li>
              <li><strong>Pause méridienne de 1h</strong> après 4h : interdiction de franchir la pause (créneaux C4 + C5 interdits ensemble).</li>
              <li>
                <strong>Règle de référence : Maximum 2h par jour pour une même matière dans une classe</strong>
                <span className="text-indigo-700 font-semibold ml-1.5">
                  → Rendue flexible ci-dessous : cochez la possibilité souhaitée pour chaque matière (1h, 2h ou 3h).
                </span>
              </li>
            </ul>
          </div>

          {/* GESTION COMPLÈTE DES CONTRAINTES HORAIRES DES MATIÈRES (GLOBAL, PAR NIVEAU ET PAR CLASSE) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="mb-3">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                Contraintes horaires des matières par Niveau et par Classe
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ajustez le volume horaire hebdomadaire et le plafond journalier (1h, 2h ou 3h par jour/séance) globalement, par niveau scolaire, ou individuellement pour chaque classe avec héritage clair.
              </p>
            </div>

            <SubjectHourlyConstraintsManager
              teachers={teachers}
              classes={classes}
              unites={unitesList}
              options={options}
              onChangeOptions={setOptions}
              onUpdateUnitHours={handleUpdateUnitHours}
              onUpdateLevelHours={handleUpdateLevelHours}
              onConfigureBlockRule={handleNavigateToBlockRule}
            />
          </div>
        </div>
        {/* SECTION 2 : CONFIGURATION DES BLOCS POSSIBLES (GRILLE GLOBALE PAR MATIÈRE & NIVEAU) */}
        <div id="section-block-rules" className="col-span-1 lg:col-span-2">
          <BlockRulesMatrixGrid
            dataset={dataset}
            rules={options.subjectBlockRules || []}
            initialSearch={focusedBlockSubject}
            onChangeRules={(newRules) => {
              setOptions((prev) => ({
                ...prev,
                subjectBlockRules: newRules,
              }));
            }}
            onSave={(newRules) => {
              const updated = {
                ...options,
                subjectBlockRules: newRules,
              };
              setOptions(updated);
              onSaveConstraints(updated, unitesList);
              setSavedSuccess(true);
              setTimeout(() => setSavedSuccess(false), 3500);
            }}
          />
        </div>

        {/* SECTION 3 : PLAFONDS & MAX D'HEURES PAR JOUR */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Clock className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">3. Plafonds & Volumes journaliers</h2>
          </div>

          <div className="space-y-3.5">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-slate-800">
                  Plafond horaire hebdomadaire par enseignant
                </label>
                <span className="text-xs font-mono font-bold text-slate-900">
                  {options.plafondHoraireProf ?? 24} h / semaine
                </span>
              </div>
              <input
                type="number"
                min="10"
                max="36"
                value={options.plafondHoraireProf ?? 24}
                onChange={(e) =>
                  setOptions({ ...options, plafondHoraireProf: parseInt(e.target.value) || 24 })
                }
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Défaut : 24 h. Alerte si la charge contractuelle d'un enseignant dépasse ce quota.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Max h / jour (Matière à bloc)
                </label>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={options.maxHeuresParJourUnite ?? 2}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      maxHeuresParJourUnite: parseInt(e.target.value) || 2,
                    })
                  }
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Max h / jour (Prof / Classe)
                </label>
                <input
                  type="number"
                  min="4"
                  max="8"
                  value={options.maxHeuresParJourProf ?? 6}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      maxHeuresParJourProf: parseInt(e.target.value) || 6,
                    })
                  }
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 4 : PÉNALITÉS ET RÈGLES SOUPLES */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Shield className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-bold text-slate-900">4. Pondération des pénalités souples</h2>
          </div>
          <p className="text-xs text-slate-600">
            Ajustez le coût des infractions aux règles de confort pédagogique pour orienter le solveur HiGHS :
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <label className="text-xs font-semibold text-slate-800 block mb-1">
                Dépassement &gt; 2h par jour
              </label>
              <input
                type="number"
                min="0"
                max="1000"
                step="10"
                value={options.penaliteHeureExcParJour ?? 100}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    penaliteHeureExcParJour: parseInt(e.target.value) || 100,
                  })
                }
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Défaut: 100 pts / h</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <label className="text-xs font-semibold text-slate-800 block mb-1">
                Heures non consécutives le même jour
              </label>
              <input
                type="number"
                min="0"
                max="500"
                step="5"
                value={options.penaliteNonConsecutiveMemeJour ?? 15}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    penaliteNonConsecutiveMemeJour: parseInt(e.target.value) || 15,
                  })
                }
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Défaut: 15 pts / occurrence</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <label className="text-xs font-semibold text-slate-800 block mb-1">
                Coût compacité (rang d'heure)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={options.coutRangHeure ?? 1.0}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    coutRangHeure: parseFloat(e.target.value) || 1.0,
                  })
                }
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Défaut: 1.0</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <label className="text-xs font-semibold text-slate-800 block mb-1">
                Coût compacité (rang de jour)
              </label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={options.coutRangJour ?? 0.3}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    coutRangJour: parseFloat(e.target.value) || 0.3,
                  })
                }
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-mono"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Défaut: 0.3</span>
            </div>
          </div>
        </div>

        {/* SECTION 5 : CRÉNEAUX RÉSERVÉS PAR CLASSE */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <CalendarCheck2 className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-bold text-slate-900">
              5. Créneaux réservés par classe (ex: 3h de contrôles en 2 Bac)
            </h2>
          </div>
          <p className="text-xs text-slate-600">
            Bloquez des créneaux pour des évaluations, contrôles continus ou devoirs surveillés. Aucun cours ordinaire ne pourra y être programmé.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Classe ciblée</label>
              <select
                value={selectedReservedClass}
                onChange={(e) => setSelectedReservedClass(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white font-medium"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom} ({c.niveau})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">Libellé du créneau</label>
              <input
                type="text"
                value={reservedLabel}
                onChange={(e) => setReservedLabel(e.target.value)}
                placeholder="Ex: Contrôle 2 Bac"
                className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-700 block mb-1.5">
              Sélectionnez les créneaux à sanctuariser ({reservedSlotsToAdd.length} sélectionné(s)) :
            </label>
            <div className="grid grid-cols-5 gap-1.5 text-[11px]">
              {semaine.jours.map((jour, jIdx) => {
                const count = semaine.creneauxParJour[jIdx];
                const baseSlot = semaine.creneauxParJour.slice(0, jIdx).reduce((a, b) => a + b, 0);
                return (
                  <div key={jour} className="space-y-1">
                    <span className="font-bold text-slate-700 block text-center truncate">{jour}</span>
                    {Array.from({ length: count }, (_, cIdx) => {
                      const slot = baseSlot + cIdx;
                      const isSelected = reservedSlotsToAdd.includes(slot);
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => toggleReservedSlot(slot)}
                          className={`w-full py-1 text-center rounded text-[10px] font-mono font-medium border transition-colors ${
                            isSelected
                              ? 'bg-sky-600 text-white border-sky-700 shadow-2xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          C{cIdx + 1}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                disabled={reservedSlotsToAdd.length === 0}
                onClick={handleAddReservedReservation}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter la réservation</span>
              </button>
            </div>
          </div>

          {/* Liste des réservations existantes */}
          {(options.reservedSlots || []).length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5 max-h-40 overflow-y-auto">
              <span className="text-[11px] font-semibold text-slate-600 block">Créneaux déjà réservés :</span>
              {(options.reservedSlots || []).map((r) => {
                const cls = classes.find((c) => c.id === r.classeId);
                const coords = getSlotCoordinates(r.slot, semaine);
                return (
                  <div
                    key={`${r.classeId}_${r.slot}`}
                    className="flex items-center justify-between text-xs p-2 bg-sky-50 border border-sky-100 rounded-lg text-sky-950"
                  >
                    <span>
                      <strong>{cls?.nom || r.classeId}</strong> : {r.label} ({coords.jourNom} créneau {coords.creneauNumero})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveReservedSlot(r.classeId, r.slot)}
                      className="text-rose-600 hover:text-rose-800 p-0.5"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 6 : PLAGES INTERDITES INTERACTIVES (CLASSES OU PROFS) */}
      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-600" />
            <h2 className="text-sm font-bold text-slate-900">
              6. Plages interdites personnalisées (par classe ou par prof)
            </h2>
          </div>

          {/* Bascule Classe / Prof */}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setForbiddenEntityMode('classe')}
              className={`px-3 py-1 rounded-md transition-colors ${
                forbiddenEntityMode === 'classe'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Par Classe ({classes.length})
            </button>
            <button
              type="button"
              onClick={() => setForbiddenEntityMode('teacher')}
              className={`px-3 py-1 rounded-md transition-colors ${
                forbiddenEntityMode === 'teacher'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Par Enseignant ({teachers.length})
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-600">
            Cliquez sur un créneau pour le basculer entre <strong>Autorisé</strong> (vert) et <strong>Interdit</strong> (rouge).
          </p>

          <div className="w-full sm:w-72">
            {forbiddenEntityMode === 'classe' ? (
              <select
                value={selectedForbiddenClassId}
                onChange={(e) => setSelectedForbiddenClassId(e.target.value)}
                className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-medium"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Classe {c.nom} ({c.niveau})
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedForbiddenTeacherId}
                onChange={(e) => setSelectedForbiddenTeacherId(e.target.value)}
                className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded-lg bg-white font-medium"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nom} ({t.matiere})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Grille hebdomadaire cliquable */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 pt-2">
          {semaine.jours.map((jour, jIdx) => {
            const count = semaine.creneauxParJour[jIdx];
            const baseSlot = semaine.creneauxParJour.slice(0, jIdx).reduce((a, b) => a + b, 0);

            return (
              <div key={jour} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                <span className="text-xs font-bold text-slate-800 block text-center border-b border-slate-200 pb-1">
                  {jour}
                </span>

                <div className="space-y-1">
                  {Array.from({ length: count }, (_, cIdx) => {
                    const slot = baseSlot + cIdx;
                    const isForbidden = isSlotForbiddenActive(slot);

                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => toggleForbiddenSlot(slot)}
                        className={`w-full py-1.5 px-2 rounded-md text-xs font-mono font-medium flex items-center justify-between border transition-all ${
                          isForbidden
                            ? 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        <span>Créneau {cIdx + 1}</span>
                        <span className={`text-[10px] font-bold ${isForbidden ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {isForbidden ? 'INTERDIT' : 'LIBRE'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
