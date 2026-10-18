/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Printer,
  FileDown,
  Layers,
  GraduationCap,
  Users,
  Table,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Compass,
  Sparkles,
} from 'lucide-react';
import { ImportDataset } from '../types';
import { Planning } from '../rules/types';
import {
  downloadAllClassesBookletPDF,
  downloadAllTeachersBookletPDF,
  downloadAscMatrixPDF,
  downloadClassTimetablePDF,
  downloadTeacherTimetablePDF,
  triggerSafeBrowserPrint,
} from '../services/pdfExportService';

interface PrintPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: ImportDataset;
  planning: Planning;
  activeSubView: 'individual' | 'subject' | 'asc' | 'teachers_matrix' | 'exceptions';
  activeClassId?: string;
  activeTeacherId?: string;
  activeMode?: 'class' | 'teacher';
}

export const PrintPdfModal: React.FC<PrintPdfModalProps> = ({
  isOpen,
  onClose,
  dataset,
  planning,
  activeSubView,
  activeClassId,
  activeTeacherId,
  activeMode = 'class',
}) => {
  const { classes, teachers } = dataset;

  const [selectedClassId, setSelectedClassId] = useState<string>(
    activeClassId || classes[0]?.id || ''
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(
    activeTeacherId || teachers[0]?.id || ''
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    text: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);

  if (!isOpen) return null;

  const currentClass = classes.find((c) => c.id === selectedClassId) || classes[0];
  const currentTeacher = teachers.find((t) => t.id === selectedTeacherId) || teachers[0];

  const handleDownloadCurrentClassPDF = () => {
    try {
      setIsGenerating(true);
      setFeedbackMessage(null);
      downloadClassTimetablePDF(dataset, planning, selectedClassId);
      setFeedbackMessage({
        text: `PDF généré en format Paysage pour la classe ${currentClass?.nom || ''}.`,
        type: 'success',
      });
    } catch (err: any) {
      setFeedbackMessage({
        text: err?.message || 'Erreur lors de la génération du PDF.',
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadCurrentTeacherPDF = () => {
    try {
      setIsGenerating(true);
      setFeedbackMessage(null);
      downloadTeacherTimetablePDF(dataset, planning, selectedTeacherId);
      setFeedbackMessage({
        text: `PDF généré en format Paysage pour le professeur ${currentTeacher?.nom || ''}.`,
        type: 'success',
      });
    } catch (err: any) {
      setFeedbackMessage({
        text: err?.message || 'Erreur lors de la génération du PDF.',
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAllClassesBooklet = () => {
    try {
      setIsGenerating(true);
      setFeedbackMessage(null);
      downloadAllClassesBookletPDF(dataset, planning);
      setFeedbackMessage({
        text: `Livret PDF complet généré (${classes.length} classes, format Paysage).`,
        type: 'success',
      });
    } catch (err: any) {
      setFeedbackMessage({
        text: err?.message || 'Erreur lors de la génération du livret classes.',
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAllTeachersBooklet = () => {
    try {
      setIsGenerating(true);
      setFeedbackMessage(null);
      downloadAllTeachersBookletPDF(dataset, planning);
      setFeedbackMessage({
        text: `Livret PDF complet généré (${teachers.length} professeurs, format Paysage).`,
        type: 'success',
      });
    } catch (err: any) {
      setFeedbackMessage({
        text: err?.message || 'Erreur lors de la génération du livret profs.',
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAscMatrix = () => {
    try {
      setIsGenerating(true);
      setFeedbackMessage(null);
      downloadAscMatrixPDF(dataset, planning);
      setFeedbackMessage({
        text: 'Matrice aSc Horaires générée avec succès en format Paysage.',
        type: 'success',
      });
    } catch (err: any) {
      setFeedbackMessage({
        text: err?.message || 'Erreur lors de la génération de la matrice aSc.',
        type: 'error',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBrowserPrint = () => {
    const res = triggerSafeBrowserPrint();
    if (!res.success) {
      setFeedbackMessage({
        text: 'L\'impression directe via le navigateur n\'a pas pu s\'ouvrir (restriction d\'iframe). Utilisez le bouton « Télécharger PDF (Paysage) » pour obtenir le fichier PDF instantanément !',
        type: 'info',
      });
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* En-tête */}
        <div className="bg-slate-900 text-white p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-white/10 text-amber-300">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Impression & Export PDF (Format Paysage)
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-400 text-slate-950 uppercase">
                  Paysage A4
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Générez des PDF nets en orientation paysage pour une lisibilité maximale des créneaux
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message de notification */}
        {feedbackMessage && (
          <div
            className={`p-3 text-xs flex items-center gap-2 border-b ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : feedbackMessage.type === 'error'
                ? 'bg-rose-50 text-rose-900 border-rose-200'
                : 'bg-indigo-50 text-indigo-900 border-indigo-200'
            }`}
          >
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{feedbackMessage.text}</span>
          </div>
        )}

        {/* Corps des options */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Section 1 : PDF de la vue individuelle */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-indigo-600" />
                1. Emploi du temps individuel (Format Paysage A4)
              </span>
              <span className="text-[11px] text-slate-500">Matières en couleur & pause méridienne</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Classe */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Choisir une Classe :
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md font-mono font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom} ({c.niveau})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleDownloadCurrentClassPDF}
                  disabled={isGenerating}
                  className="w-full mt-2 inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Télécharger PDF Classe (Paysage)</span>
                </button>
              </div>

              {/* Professeur */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-2">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Choisir un Enseignant :
                </label>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded-md font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nom} ({t.matiere})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleDownloadCurrentTeacherPDF}
                  disabled={isGenerating}
                  className="w-full mt-2 inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Télécharger PDF Prof (Paysage)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 2 : Livrets complets (Toutes les classes ou Tous les profs) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              2. Livrets complets multi-pages (Format Paysage A4)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleDownloadAllClassesBooklet}
                disabled={isGenerating}
                className="p-3.5 text-left rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all group flex flex-col justify-between disabled:opacity-50"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                      Livret Toutes les Classes
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                      {classes.length} pages
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Un document unique contenant toutes les classes (1 page par classe en orientation paysage).
                  </p>
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Télécharger le livret classes (PDF)</span>
                </div>
              </button>

              <button
                onClick={handleDownloadAllTeachersBooklet}
                disabled={isGenerating}
                className="p-3.5 text-left rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all group flex flex-col justify-between disabled:opacity-50"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-900">
                      Livret Tous les Professeurs
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold">
                      {teachers.length} pages
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Un document unique contenant tous les emplois du temps des 28 enseignants en paysage.
                  </p>
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Télécharger le livret profs (PDF)</span>
                </div>
              </button>
            </div>
          </div>

          {/* Section 3 : Matrice aSc Horaires & Impression Navigateur */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
              <Table className="w-4 h-4 text-purple-600" />
              3. Matrice globale & Impression directe navigateur
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleDownloadAscMatrix}
                disabled={isGenerating}
                className="p-3 text-left rounded-lg border border-slate-200 bg-white hover:bg-purple-50 hover:border-purple-300 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-purple-900">
                    Matrice aSc Horaires (PDF)
                  </span>
                  <Table className="w-4 h-4 text-purple-600" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Tableau synthétique 12 classes × 32 créneaux en vue panoramique paysage.
                </p>
              </button>

              <button
                onClick={handleBrowserPrint}
                className="p-3 text-left rounded-lg border border-slate-200 bg-white hover:bg-slate-100 hover:border-slate-300 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Boîte d'impression Navigateur
                  </span>
                  <Printer className="w-4 h-4 text-slate-700" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ouvre la commande d'impression native configurée en A4 Paysage sans en-tête ni fioritures.
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Pied de page modal */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Tous les documents PDF sont générés vectoriellement en mode Paysage A4.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
