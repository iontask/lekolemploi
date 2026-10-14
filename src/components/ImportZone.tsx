/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  Sparkles,
  AlertCircle,
  FileCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { MappingConfig } from '../types';
import { generateAndDownloadExcel } from '../services/excelGenerator';

interface ImportZoneProps {
  onFileLoaded: (file: File) => Promise<void>;
  onLoadOfficialDemo: () => void;
  onOpenMapping: () => void;
  config: MappingConfig;
  isLoading: boolean;
  error: string | null;
}

export const ImportZone: React.FC<ImportZoneProps> = ({
  onFileLoaded,
  onLoadOfficialDemo,
  onOpenMapping,
  config,
  isLoading,
  error,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx')) {
        await onFileLoaded(file);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await onFileLoaded(file);
    }
  };

  const creneaux = config?.semaine?.creneauxParJour || [7, 7, 7, 7, 4];
  const totalSlots = creneaux.reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8 px-4 sm:px-6">
      {/* En-tête de section */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Import du fichier Excel & Modèle de données
        </h1>
        <p className="text-sm text-slate-600 max-w-2xl mx-auto">
          Lecture directe dans le navigateur via ExcelJS avec extraction des couleurs de cellules,
          détection des cours communs fusionnés et calcul des marges de disponibilité.
        </p>
      </div>

      {/* Alerte d'erreur si présente */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Erreur lors de l'analyse du fichier Excel</p>
            <p className="text-rose-700 text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* Zone de téléversement Drag & Drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'border-indigo-600 bg-indigo-50/50'
            : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/50'
        } ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="max-w-md mx-auto space-y-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 shadow-xs">
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
            ) : (
              <UploadCloud className="w-7 h-7" />
            )}
          </div>

          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-900">
              {isLoading
                ? 'Analyse du classeur ExcelJS en cours...'
                : 'Glissez-déposez votre fichier .xlsx ici'}
            </p>
            <p className="text-xs text-slate-500">
              ou cliquez pour parcourir les fichiers de votre ordinateur
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs text-slate-500">
            <span>Feuille unique</span>
            <span aria-hidden="true">·</span>
            <span>Classes : col. {config?.colClassesStart || 'AK'} à {config?.colClassesEnd || 'AV'}</span>
            <span aria-hidden="true">·</span>
            <span>Dispos : {totalSlots} créneaux (col. {config?.colCreneauxStart || 'E'} à {config?.colCreneauxEnd || 'AJ'})</span>
          </div>
        </div>
      </div>

      {/* Actions rapides : Démo officielle & Modèles téléchargeables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Carte Démonstration officielle */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">
                Jeu de test officiel (Exemple réel)
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Charge instantanément la configuration complète avec <strong>28 enseignants</strong>,{' '}
              <strong>12 classes</strong> (1APIC-1 à 2BACSE), <strong>360 heures</strong> exactes et
              cours communs fusionnés.
            </p>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLoadOfficialDemo();
              }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs"
            >
              <span>Charger les données de test (360 h)</span>
            </button>
          </div>
        </div>

        {/* Carte Modèles Excel à télécharger */}
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-900">
              Modèles Excel téléchargeables (.xlsx)
            </span>
            <p className="text-xs text-slate-600 leading-relaxed">
              Fichiers pré-formatés générés avec ExcelJS, avec structure de fusion sur 1BACSEF + 1BACSEG.
            </p>
          </div>

          <div className="pt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => generateAndDownloadExcel({ format: 'color', includeSampleData: true })}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-center"
              title="Télécharger le modèle avec remplissage jaune (dispo) et rouge (indispo)"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Format Couleurs</span>
            </button>

            <button
              onClick={() => generateAndDownloadExcel({ format: 'numeric', includeSampleData: true })}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-center"
              title="Télécharger le modèle avec 1 (disponible) et 0 (indisponible)"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Format 1 / 0</span>
            </button>
          </div>
        </div>
      </div>

      {/* Guide des spécifications du fichier source */}
      <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
            Spécifications du format attendu
          </span>
          <button
            onClick={onOpenMapping}
            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900 font-medium"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Modifier le mappage</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="font-semibold text-slate-900 mb-1">En-tête des classes</p>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Ligne {config.headerRowClasses}, colonnes {config.colClassesStart} à {config.colClassesEnd}.
              Normalisation automatique (1APIC-1, 1APIC-2, etc.).
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="font-semibold text-slate-900 mb-1">Enseignants</p>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Lignes {config.teacherStartRow} à {config.teacherEndRow}.
              Col {config.colNum}=N°, {config.colMatiere}=Matière, {config.colNom}=Nom, {config.colPrenom}=Prénom.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="font-semibold text-slate-900 mb-1">32 Créneaux</p>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Col {config.colCreneauxStart} à {config.colCreneauxEnd}. Lun-Jeu (7 créneaux), Ven (4 créneaux).
              Jaune = Dispo, Rouge = Indispo.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="font-semibold text-slate-900 mb-1">Cours communs</p>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Cellule fusionnée sur 2 classes : même enseignant, même créneau, compté une seule fois pour le prof.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
