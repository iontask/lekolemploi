/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, Loader2, RotateCcw } from 'lucide-react';

interface ResetConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (resetMapping: boolean) => Promise<void>;
  projectName?: string;
}

export const ResetConfirmModal: React.FC<ResetConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  projectName,
}) => {
  const [resetMapping, setResetMapping] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      await onConfirm(resetMapping);
      onClose();
    } catch (err) {
      console.error('Erreur lors de la réinitialisation:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 id="reset-modal-title" className="text-lg font-bold text-slate-900">
                  Réinitialiser les données
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Remise à zéro de l'espace de travail
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 text-sm text-slate-600 space-y-2">
            <p>
              Êtes-vous certain de vouloir réinitialiser l'application ? Cette action est{' '}
              <strong className="text-slate-900">irréversible</strong>.
            </p>
            {projectName && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <span className="text-slate-500">Projet actif : </span>
                <span className="font-semibold text-slate-800">{projectName}</span>
              </div>
            )}
            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside bg-rose-50/60 p-3 rounded-lg border border-rose-100">
              <li>Suppression des enseignants, classes et unités chargées</li>
              <li>Suppression de l'emploi du temps généré et des scénarios</li>
              <li>Effacement des données locales enregistrées (IndexedDB)</li>
            </ul>

            <label className="flex items-center gap-2 pt-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={resetMapping}
                onChange={(e) => setResetMapping(e.target.checked)}
                className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span>Réinitialiser aussi le paramétrage de mappage Excel aux valeurs par défaut</span>
            </label>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors shadow-xs"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Réinitialisation en cours...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Oui, tout réinitialiser</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
