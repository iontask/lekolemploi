/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Check, RotateCcw, Plus, Trash2, HelpCircle } from 'lucide-react';
import { MappingConfig, Semaine } from '../types';
import { DEFAULT_MAPPING_CONFIG } from '../services/db';

interface MappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: MappingConfig;
  onSave: (newConfig: MappingConfig) => void;
}

export const MappingModal: React.FC<MappingModalProps> = ({
  isOpen,
  onClose,
  config,
  onSave,
}) => {
  const [draft, setDraft] = useState<MappingConfig>(() => ({ ...(config || DEFAULT_MAPPING_CONFIG) }));

  React.useEffect(() => {
    if (config) {
      setDraft({ ...config });
    }
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleDayChange = (index: number, field: 'name' | 'count', value: any) => {
    const newJours = [...draft.semaine.jours];
    const newCounts = [...draft.semaine.creneauxParJour];

    if (field === 'name') {
      newJours[index] = String(value);
    } else {
      newCounts[index] = Math.max(1, parseInt(value) || 1);
    }

    setDraft({
      ...draft,
      semaine: {
        jours: newJours,
        creneauxParJour: newCounts,
      },
    });
  };

  const handleAddDay = () => {
    setDraft({
      ...draft,
      semaine: {
        jours: [...draft.semaine.jours, 'Samedi'],
        creneauxParJour: [...draft.semaine.creneauxParJour, 4],
      },
    });
  };

  const handleRemoveDay = (index: number) => {
    if (draft.semaine.jours.length <= 1) return;
    const newJours = draft.semaine.jours.filter((_, i) => i !== index);
    const newCounts = draft.semaine.creneauxParJour.filter((_, i) => i !== index);
    setDraft({
      ...draft,
      semaine: {
        jours: newJours,
        creneauxParJour: newCounts,
      },
    });
  };

  const totalSlots = draft.semaine.creneauxParJour.reduce((a, b) => a + b, 0);

  const handleReset = () => {
    setDraft({ ...DEFAULT_MAPPING_CONFIG });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
        {/* En-tête modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Paramètres de mappage du fichier Excel
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ajustez l'emplacement des colonnes, la structure hebdomadaire et les règles de lecture des cellules.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps formulaire */}
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-6 flex-1">
          {/* Section 1 : Lignes */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">
              1. Lignes du classeur
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ligne d'en-tête des classes
                </label>
                <input
                  type="number"
                  min="1"
                  value={draft.headerRowClasses}
                  onChange={(e) =>
                    setDraft({ ...draft, headerRowClasses: parseInt(e.target.value) || 2 })
                  }
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <span className="text-[11px] text-slate-500">Défaut : 2</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ligne début enseignants
                </label>
                <input
                  type="number"
                  min="1"
                  value={draft.teacherStartRow}
                  onChange={(e) =>
                    setDraft({ ...draft, teacherStartRow: parseInt(e.target.value) || 3 })
                  }
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <span className="text-[11px] text-slate-500">Défaut : 3</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Ligne fin enseignants
                </label>
                <input
                  type="number"
                  min="1"
                  value={draft.teacherEndRow}
                  onChange={(e) =>
                    setDraft({ ...draft, teacherEndRow: parseInt(e.target.value) || 30 })
                  }
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <span className="text-[11px] text-slate-500">Défaut : 30 (28 profs)</span>
              </div>
            </div>
          </div>

          {/* Section 2 : Colonnes Enseignants */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">
              2. Colonnes d'identification des enseignants
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Col. N°</label>
                <input
                  type="text"
                  value={draft.colNum}
                  onChange={(e) => setDraft({ ...draft, colNum: e.target.value.toUpperCase() })}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono text-center uppercase"
                />
                <span className="text-[11px] text-slate-500">Défaut : A</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Col. Matière</label>
                <input
                  type="text"
                  value={draft.colMatiere}
                  onChange={(e) => setDraft({ ...draft, colMatiere: e.target.value.toUpperCase() })}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono text-center uppercase"
                />
                <span className="text-[11px] text-slate-500">Défaut : B</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Col. Nom</label>
                <input
                  type="text"
                  value={draft.colNom}
                  onChange={(e) => setDraft({ ...draft, colNom: e.target.value.toUpperCase() })}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono text-center uppercase"
                />
                <span className="text-[11px] text-slate-500">Défaut : C</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Col. Prénom</label>
                <input
                  type="text"
                  value={draft.colPrenom}
                  onChange={(e) => setDraft({ ...draft, colPrenom: e.target.value.toUpperCase() })}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono text-center uppercase"
                />
                <span className="text-[11px] text-slate-500">Défaut : D</span>
              </div>
            </div>
          </div>

          {/* Section 3 : Plages de colonnes Créneaux et Classes */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">
              3. Plages de colonnes
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs font-medium text-slate-800 block mb-2">
                  Créneaux de la semaine (Disponibilités)
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[11px] text-slate-500 mb-0.5">Colonne début</label>
                    <input
                      type="text"
                      value={draft.colCreneauxStart}
                      onChange={(e) =>
                        setDraft({ ...draft, colCreneauxStart: e.target.value.toUpperCase() })
                      }
                      className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-md font-mono text-center uppercase"
                    />
                  </div>
                  <span className="text-slate-400 self-center mt-3">à</span>
                  <div className="flex-1">
                    <label className="block text-[11px] text-slate-500 mb-0.5">Colonne fin</label>
                    <input
                      type="text"
                      value={draft.colCreneauxEnd}
                      onChange={(e) =>
                        setDraft({ ...draft, colCreneauxEnd: e.target.value.toUpperCase() })
                      }
                      className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-md font-mono text-center uppercase"
                    />
                  </div>
                </div>
                <span className="text-[11px] text-slate-500 mt-1.5 block">
                  Défaut : E à AJ (32 colonnes)
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-xs font-medium text-slate-800 block mb-2">
                  Classes d'élèves (Volumes horaires)
                </span>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[11px] text-slate-500 mb-0.5">Colonne début</label>
                    <input
                      type="text"
                      value={draft.colClassesStart}
                      onChange={(e) =>
                        setDraft({ ...draft, colClassesStart: e.target.value.toUpperCase() })
                      }
                      className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-md font-mono text-center uppercase"
                    />
                  </div>
                  <span className="text-slate-400 self-center mt-3">à</span>
                  <div className="flex-1">
                    <label className="block text-[11px] text-slate-500 mb-0.5">Colonne fin</label>
                    <input
                      type="text"
                      value={draft.colClassesEnd}
                      onChange={(e) =>
                        setDraft({ ...draft, colClassesEnd: e.target.value.toUpperCase() })
                      }
                      className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-md font-mono text-center uppercase"
                    />
                  </div>
                </div>
                <span className="text-[11px] text-slate-500 mt-1.5 block">
                  Défaut : AK à AV (12 classes)
                </span>
              </div>
            </div>
          </div>

          {/* Section 4 : Structure hebdomadaire configurable */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                  4. Structure de la semaine
                </h3>
                <span className="text-xs text-slate-500">
                  Total configuré : {totalSlots} créneaux
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddDay}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter un jour</span>
              </button>
            </div>

            <div className="space-y-2">
              {draft.semaine.jours.map((jour, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <span className="text-xs font-mono text-slate-400 w-5 text-center">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={jour}
                    onChange={(e) => handleDayChange(idx, 'name', e.target.value)}
                    className="flex-1 text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                    placeholder="Nom du jour"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-600">Créneaux :</span>
                    <input
                      type="number"
                      min="1"
                      max="14"
                      value={draft.semaine.creneauxParJour[idx]}
                      onChange={(e) => handleDayChange(idx, 'count', e.target.value)}
                      className="w-16 text-xs px-2 py-1.5 border border-slate-300 rounded-md bg-white text-center font-mono focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                  {draft.semaine.jours.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDay(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Supprimer ce jour"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 5 : Couleurs et lecture des disponibilités */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">
              5. Détection des disponibilités
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 rounded bg-yellow-300 border border-yellow-400" />
                  <span className="text-xs font-medium text-slate-800">
                    Couleur Disponible (Jaune)
                  </span>
                </div>
                <input
                  type="text"
                  value={draft.colorAvailableHex}
                  onChange={(e) =>
                    setDraft({ ...draft, colorAvailableHex: e.target.value.toUpperCase() })
                  }
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md font-mono uppercase bg-white"
                  placeholder="FFFFFF00"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Code ARGB ou Hex (défaut : FFFFFF00)
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 rounded bg-red-500 border border-red-600" />
                  <span className="text-xs font-medium text-slate-800">
                    Couleur Indisponible (Rouge)
                  </span>
                </div>
                <input
                  type="text"
                  value={draft.colorUnavailableHex}
                  onChange={(e) =>
                    setDraft({ ...draft, colorUnavailableHex: e.target.value.toUpperCase() })
                  }
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-md font-mono uppercase bg-white"
                  placeholder="FFFF0000"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Code ARGB ou Hex (défaut : FFFF0000)
                </span>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2.5 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                id="detectNumericFallback"
                checked={draft.detectNumericFallback}
                onChange={(e) => setDraft({ ...draft, detectNumericFallback: e.target.checked })}
                className="mt-0.5 rounded text-slate-900 focus:ring-slate-900 border-slate-300"
              />
              <label htmlFor="detectNumericFallback" className="text-xs text-slate-700 cursor-pointer">
                <strong className="font-medium text-slate-900">
                  Détection numérique d'appoint (1 = dispo, 0 = indispo)
                </strong>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Prend également en compte les cellules contenant les chiffres 1 ou 0 même si aucune couleur n'est appliquée.
                </p>
              </label>
            </div>
          </div>
        </form>

        {/* Pied de page modal */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Réinitialiser</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Enregistrer le mappage</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
