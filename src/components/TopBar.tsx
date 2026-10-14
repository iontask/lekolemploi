/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Calendar,
  SlidersHorizontal,
  UploadCloud,
  RefreshCw,
  FolderOpen,
  Download,
  Check,
  Loader2,
  Menu,
  X,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface TopBarProps {
  activeView:
    | 'dashboard'
    | 'timetable'
    | 'constraints'
    | 'diagnostic'
    | 'scenarios'
    | 'teachers'
    | 'classes'
    | 'units'
    | 'rules'
    | 'raw';
  onSelectView: (
    view:
      | 'dashboard'
      | 'timetable'
      | 'constraints'
      | 'diagnostic'
      | 'scenarios'
      | 'teachers'
      | 'classes'
      | 'units'
      | 'rules'
      | 'raw'
  ) => void;
  onOpenMapping: () => void;
  onOpenImport: () => void;
  onOpenGenerator: () => void;
  onOpenProjects: () => void;
  onExportJson?: () => void;
  projectName?: string;
  isSaving?: boolean;
  lastSavedAt?: Date | null;
  hasDataset: boolean;
  hasPlanning: boolean;
  onReset: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeView,
  onSelectView,
  onOpenMapping,
  onOpenImport,
  onOpenGenerator,
  onOpenProjects,
  onExportJson,
  projectName,
  isSaving,
  lastSavedAt,
  hasDataset,
  hasPlanning,
  onReset,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Vue d\'ensemble' },
    ...(hasPlanning ? [{ id: 'timetable', label: 'Emploi du temps' }] : []),
    { id: 'constraints', label: 'Contraintes' },
    { id: 'diagnostic', label: 'Diagnostic' },
    { id: 'scenarios', label: 'Scénarios' },
    { id: 'teachers', label: 'Enseignants' },
    { id: 'classes', label: 'Classes' },
    { id: 'units', label: 'Unités' },
    { id: 'rules', label: 'Règles' },
    { id: 'raw', label: 'Modèle & JSON' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Logo & Sélecteur de projet */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-xs">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900 hidden sm:inline whitespace-nowrap">
                Générateur d'emplois du temps
              </span>

              {/* Bouton Projets */}
              <button
                onClick={onOpenProjects}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors shadow-2xs max-w-[170px]"
                title="Gérer les projets (enregistrer, dupliquer, importer)"
              >
                <FolderOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">{projectName || 'Projets'}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>
            </div>
          </div>

          {/* Navigation bureau */}
          {hasDataset && (
            <nav className="hidden xl:flex items-center gap-3 text-xs font-medium text-slate-600 overflow-x-auto">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id as any)}
                  className={`whitespace-nowrap transition-colors py-1 ${
                    activeView === item.id
                      ? 'text-slate-900 font-semibold border-b-2 border-slate-900 -mb-[2px]'
                      : 'hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}

          {/* Indicateur de sauvegarde automatique & Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Badge sauvegarde auto */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {isSaving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span title={lastSavedAt ? `Dernière sauvegarde : ${lastSavedAt.toLocaleTimeString()}` : ''}>
                    Sauvegarde auto
                  </span>
                </>
              )}
            </div>

            {hasDataset && onExportJson && (
              <button
                onClick={onExportJson}
                className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                title="Exporter le projet actif au format JSON"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Exporter JSON</span>
              </button>
            )}

            <button
              onClick={onOpenMapping}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              title="Configurer les colonnes et couleurs"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mappage</span>
            </button>

            {hasDataset ? (
              <>
                <button
                  onClick={onOpenGenerator}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs whitespace-nowrap"
                  title="Générer l'emploi du temps (Phase A + Phase B HiGHS)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Générer</span>
                </button>
                <button
                  onClick={onReset}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
                  title="Réinitialiser les données"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={onOpenImport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs whitespace-nowrap"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Importer Excel</span>
              </button>
            )}

            {/* Mobile menu toggle */}
            {hasDataset && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 text-slate-600 hover:text-slate-900 xl:hidden rounded-lg hover:bg-slate-100"
                title="Menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )}
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && hasDataset && (
          <div className="xl:hidden py-3 border-t border-slate-100 bg-white grid grid-cols-2 sm:grid-cols-3 gap-1 animate-in slide-in-from-top duration-150">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelectView(item.id as any);
                  setMobileMenuOpen(false);
                }}
                className={`text-left px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                  activeView === item.id
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
            {onExportJson && (
              <button
                onClick={() => {
                  onExportJson();
                  setMobileMenuOpen(false);
                }}
                className="text-left px-3 py-2 text-xs font-medium rounded-md text-slate-600 hover:bg-slate-100 flex items-center gap-1.5 col-span-2 sm:col-span-1"
              >
                <Download className="w-3.5 h-3.5" />
                Exporter JSON
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
