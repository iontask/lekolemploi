/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  Inbox,
  ArrowRight,
  Layers,
  GraduationCap,
  Users,
  Clock,
  Sliders,
} from 'lucide-react';
import { SAMPLE_PRESETS, SamplePreset } from '../services/sampleData';

interface SampleDatasetsDropdownProps {
  onSelectPreset: (preset: SamplePreset) => void;
  isLoading?: boolean;
  variant?: 'navbar' | 'prominent' | 'card';
  align?: 'left' | 'right';
  className?: string;
}

export const SampleDatasetsDropdown: React.FC<SampleDatasetsDropdownProps> = ({
  onSelectPreset,
  isLoading = false,
  variant = 'navbar',
  align = 'left',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermer le dropdown en cliquant à l'extérieur
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Fermeture sur touche Échap
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (preset: SamplePreset) => {
    setIsOpen(false);
    onSelectPreset(preset);
  };

  const ascPresets = SAMPLE_PRESETS.filter((p) => p.category === 'asc');
  const officialPresets = SAMPLE_PRESETS.filter((p) => p.category === 'official');

  return (
    <div className={`relative inline-block text-left ${className}`} ref={containerRef}>
      {/* Bouton déclencheur selon le variant */}
      {variant === 'navbar' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all shadow-2xs ${
            isOpen
              ? 'bg-indigo-50 border-indigo-400 text-indigo-900 ring-2 ring-indigo-200'
              : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700 hover:border-slate-400'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Charger un exemple d'emploi du temps (aSc Timetables ou Officiel)"
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="hidden sm:inline">Exemples aSc & Démos</span>
          <span className="sm:hidden">Exemples</span>
          <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full border border-emerald-300">
            aSc
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-indigo-600' : ''
            }`}
          />
        </button>
      ) : variant === 'prominent' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className={`inline-flex items-center justify-between gap-3 px-4 py-2.5 text-xs font-semibold rounded-xl border transition-all shadow-xs ${
            isOpen
              ? 'bg-indigo-600 text-white border-indigo-600 ring-4 ring-indigo-100'
              : 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-haspopup="true"
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Charger un exemple d'emploi du temps</span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-white/80 shrink-0 transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="w-full inline-flex items-center justify-between gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 hover:bg-indigo-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            Sélectionner un exemple dans la liste
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-indigo-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}

      {/* Menu déroulant Popover */}
      {isOpen && (
        <div
          className={`absolute ${
            align === 'left' ? 'left-0' : 'right-0'
          } mt-2 w-[340px] sm:w-[420px] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white shadow-2xl border border-slate-200 py-3 z-50 animate-in fade-in zoom-in-95 duration-100 max-h-[85vh] overflow-y-auto`}
          role="menu"
        >
          {/* En-tête du menu */}
          <div className="px-4 pb-2.5 mb-2 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                Emplois du temps exemples
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {SAMPLE_PRESETS.length} configurations
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-snug">
              Chargez directement une sortie réelle <strong>aSc Timetables</strong> ou un modèle de test pour visualiser, tester le bac et réajuster en drag & drop.
            </p>
          </div>

          {/* Groupe 1 : Outputs aSc Timetables */}
          <div className="px-3 mb-3">
            <div className="px-2 py-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Sorties logicielles aSc Timetables
              </span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                Minha Escola
              </span>
            </div>

            <div className="space-y-1.5 mt-1">
              {ascPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelect(preset)}
                  className="w-full text-left p-2.5 rounded-xl border border-emerald-100/80 bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-300 transition-all group flex flex-col gap-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                        {preset.hasPlanning ? (
                          <Inbox className="w-3.5 h-3.5" />
                        ) : (
                          <Sliders className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                        {preset.name}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${preset.badgeStyle}`}
                    >
                      {preset.badge}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-snug pl-8">
                    {preset.description}
                  </p>

                  <div className="flex items-center justify-between pl-8 pt-1 text-[10px] text-slate-500 border-t border-emerald-100/50">
                    <div className="flex items-center gap-3">
                      <span><strong>{preset.classesCount}</strong> classes</span>
                      <span>·</span>
                      <span><strong>{preset.teachersCount}</strong> profs</span>
                      <span>·</span>
                      <span><strong>{preset.totalHours}</strong> h</span>
                      {preset.unassignedHours > 0 && preset.hasPlanning && (
                        <>
                          <span>·</span>
                          <span className="text-amber-700 font-semibold flex items-center gap-0.5">
                            <Inbox className="w-2.5 h-2.5" />
                            {preset.unassignedHours}h au bac
                          </span>
                        </>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold group-hover:translate-x-0.5 transition-transform">
                      Charger <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Groupe 2 : Modèle de référence officiel */}
          <div className="px-3">
            <div className="px-2 py-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                Modèle Officiel Éducation Nationale
              </span>
              <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                360 heures
              </span>
            </div>

            <div className="space-y-1.5 mt-1">
              {officialPresets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelect(preset)}
                  className="w-full text-left p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-indigo-50/60 hover:border-indigo-300 transition-all group flex flex-col gap-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                        {preset.hasPlanning ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Calendar className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-900">
                        {preset.name}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${preset.badgeStyle}`}
                    >
                      {preset.badge}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-snug pl-8">
                    {preset.description}
                  </p>

                  <div className="flex items-center justify-between pl-8 pt-1 text-[10px] text-slate-500 border-t border-slate-200/60">
                    <div className="flex items-center gap-3">
                      <span><strong>{preset.classesCount}</strong> classes</span>
                      <span>·</span>
                      <span><strong>{preset.teachersCount}</strong> profs</span>
                      <span>·</span>
                      <span><strong>{preset.totalHours}</strong> h</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-indigo-600 font-bold group-hover:translate-x-0.5 transition-transform">
                      Charger <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Pied de menu */}
          <div className="px-4 pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Possibilité de modifier avec le bac et drag & drop</span>
            <span className="text-indigo-600 font-medium">Export Excel & JSON</span>
          </div>
        </div>
      )}
    </div>
  );
};
