/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Calendar,
  SlidersHorizontal,
  UploadCloud,
  RefreshCw,
  FolderOpen,
  Download,
  Check,
  Loader2,
  ChevronDown,
  Sparkles,
  LayoutDashboard,
  Sliders,
  Activity,
  GitBranch,
  Users,
  GraduationCap,
  BookOpen,
  ShieldCheck,
  FileCode,
} from 'lucide-react';

import { SampleDatasetsDropdown } from './SampleDatasetsDropdown';
import { SamplePreset } from '../services/sampleData';

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
  onSelectSamplePreset?: (preset: SamplePreset) => void;
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
  onSelectSamplePreset,
  projectName,
  isSaving,
  lastSavedAt,
  hasDataset,
  hasPlanning,
  onReset,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Vue d\'ensemble', icon: LayoutDashboard },
    ...(hasPlanning
      ? [{ id: 'timetable', label: 'Emploi du temps', icon: Calendar, badge: 'Grille & Bac' }]
      : []),
    { id: 'constraints', label: 'Contraintes', icon: Sliders },
    { id: 'diagnostic', label: 'Diagnostic', icon: Activity },
    { id: 'scenarios', label: 'Scénarios', icon: GitBranch },
    { id: 'teachers', label: 'Enseignants', icon: Users },
    { id: 'classes', label: 'Classes', icon: GraduationCap },
    { id: 'units', label: 'Unités', icon: BookOpen },
    { id: 'rules', label: 'Règles', icon: ShieldCheck },
    { id: 'raw', label: 'Modèle & JSON', icon: FileCode },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-2xs print:hidden">
      {/* Ligne 1 : Logo, Projets, Exemples aSc, Sauvegarde & Actions globales */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 sm:gap-4 h-14">
          {/* Côté Gauche : Logo, Titre, Sélecteur de projet & Dropdown Exemples aSc */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-xs shrink-0">
              <Calendar className="w-4 h-4 text-indigo-300" />
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="text-sm font-bold tracking-tight text-slate-900 hidden md:inline truncate">
                Générateur d'emplois du temps
              </span>

              {/* Bouton Projets */}
              <button
                onClick={onOpenProjects}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-colors shadow-2xs shrink-0 max-w-[150px] sm:max-w-[200px]"
                title="Gérer les projets (enregistrer, dupliquer, importer)"
              >
                <FolderOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">{projectName || 'Projets'}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {/* Dropdown d'exemples d'emplois du temps (aSc Timetables & Référence) */}
              {onSelectSamplePreset && (
                <SampleDatasetsDropdown
                  variant="navbar"
                  align="left"
                  onSelectPreset={onSelectSamplePreset}
                />
              )}
            </div>
          </div>

          {/* Côté Droit : Auto-save & Actions rapides */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Badge sauvegarde auto */}
            <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {isSaving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span title={lastSavedAt ? `Dernière sauvegarde : ${lastSavedAt.toLocaleTimeString()}` : ''}>
                    Auto-save
                  </span>
                </>
              )}
            </div>

            {hasDataset && onExportJson && (
              <button
                onClick={onExportJson}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                title="Exporter le projet actif au format JSON"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden md:inline">Exporter</span>
              </button>
            )}

            <button
              onClick={onOpenMapping}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
              title="Configurer les colonnes et couleurs de matière"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Mappage</span>
            </button>

            {hasDataset ? (
              <>
                <button
                  onClick={onOpenGenerator}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs whitespace-nowrap"
                  title="Générer l'emploi du temps (Phase A + Phase B HiGHS)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Générer</span>
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex items-center gap-1 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Réinitialiser toutes les données"
                  aria-label="Réinitialiser les données"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline text-[11px] font-medium text-slate-500 hover:text-rose-600">Réinitialiser</span>
                </button>
              </>
            ) : (
              <button
                onClick={onOpenImport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-xs whitespace-nowrap"
              >
                <UploadCloud className="w-4 h-4 text-indigo-300" />
                <span>Importer Excel</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ligne 2 : Navigation d'onglets principale - JAMAIS MASQUÉE */}
      {hasDataset && (
        <div className="bg-slate-50/90 border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <nav
              className="flex items-center gap-1 py-1.5 overflow-x-auto scrollbar-none"
              aria-label="Navigation des vues de l'emploi du temps"
            >
              {navItems.map((item) => {
                const isActive = activeView === item.id;
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectView(item.id as any)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                      isActive
                        ? 'bg-slate-900 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    {IconComponent && (
                      <IconComponent
                        className={`w-3.5 h-3.5 ${
                          isActive ? 'text-amber-400' : 'text-slate-500'
                        }`}
                      />
                    )}
                    <span>{item.label}</span>
                    {item.badge && (
                      <span
                        className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
};
