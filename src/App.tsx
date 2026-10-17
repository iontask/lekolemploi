/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ImportDataset, MappingConfig, Unite } from './types';
import {
  DEFAULT_MAPPING_CONFIG,
  clearAllData,
  getActiveDataset,
  getSavedMappingConfig,
  saveActiveDataset,
  saveMappingConfig,
} from './services/db';
import { parseExcelWorkbook } from './services/excelParser';
import { buildOfficialSampleDataset, SamplePreset } from './services/sampleData';
import { TopBar } from './components/TopBar';
import { ImportZone } from './components/ImportZone';
import { ControlDashboard } from './components/ControlDashboard';
import { MappingModal } from './components/MappingModal';
import { GenerationModal } from './components/GenerationModal';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { ResetConfirmModal } from './components/ResetConfirmModal';
import { Planning, RulesOptions } from './rules/types';
import { SolverConfig, SolverResult } from './solver/types';
import { ScheduleScenario } from './types/scenarios';
import { exportProjectToJson } from './utils/projectJsonIO';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function App() {
  const [config, setConfig] = useState<MappingConfig>(DEFAULT_MAPPING_CONFIG);
  const [dataset, setDataset] = useState<ImportDataset | null>(null);
  const [activeView, setActiveView] = useState<
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
  >('dashboard');
  const [isMappingOpen, setIsMappingOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isGenerationOpen, setIsGenerationOpen] = useState(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isRelaxedModeForGen, setIsRelaxedModeForGen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastUploadedBuffer, setLastUploadedBuffer] = useState<{ buffer: ArrayBuffer; name: string } | null>(null);

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Initialisation : lecture IndexedDB
  useEffect(() => {
    async function init() {
      try {
        const savedConfig = await getSavedMappingConfig();
        setConfig(savedConfig);

        const savedDataset = await getActiveDataset();
        if (savedDataset) {
          setDataset(savedDataset);
          setLastSavedAt(new Date(savedDataset.importedAt || Date.now()));
        }
      } catch (err) {
        console.error('Erreur initialisation IndexedDB:', err);
      }
    }
    init();
  }, []);

  // Sauvegarde automatique avec indicateur
  const persistDataset = async (updatedDataset: ImportDataset) => {
    setIsSaving(true);
    try {
      await saveActiveDataset(updatedDataset);
      setDataset(updatedDataset);
      setLastSavedAt(new Date());
    } catch (err: any) {
      console.error('Erreur lors de la sauvegarde automatique:', err);
      addToast('Erreur lors de la sauvegarde automatique.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Gestion du fichier Excel déposé ou sélectionné
  const handleFileLoaded = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      setLastUploadedBuffer({ buffer, name: file.name });

      const { dataset: parsedDataset } = await parseExcelWorkbook(buffer, file.name, config);
      await persistDataset(parsedDataset);
      setIsImportOpen(false);
      setActiveView('dashboard');
      addToast(`Fichier « ${file.name} » importé avec succès.`, 'success');
    } catch (err: any) {
      console.error('Erreur de parsing Excel:', err);
      setError(err?.message || "Impossible d'analyser le fichier Excel. Vérifiez le format et la structure.");
      addToast(err?.message || 'Erreur lors de l\'import Excel.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Chargement direct d'un preset d'exemple (aSc Timetables ou Référence)
  const handleLoadSamplePreset = async (preset: SamplePreset) => {
    setIsLoading(true);
    setError(null);
    try {
      const loadedDataset = preset.load();
      await persistDataset(loadedDataset);
      setIsImportOpen(false);
      if (preset.hasPlanning && loadedDataset.planning && loadedDataset.planning.length > 0) {
        setActiveView('timetable');
        addToast(
          `« ${preset.name} » chargé (${loadedDataset.planning.length}h placées). Vous pouvez ajuster via le bac et le drag & drop.`,
          'success'
        );
      } else {
        setActiveView('dashboard');
        addToast(`« ${preset.name} » chargé avec succès. Prêt pour la génération.`, 'success');
      }
    } catch (err: any) {
      console.error('Erreur lors du chargement de l\'exemple:', err);
      setError("Erreur lors de l'initialisation de l'exemple.");
      addToast('Erreur lors du chargement de l\'exemple.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Chargement direct du jeu de test officiel (28 profs, 12 classes, 360h)
  const handleLoadOfficialDemo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const demoDataset = buildOfficialSampleDataset(true);
      await persistDataset(demoDataset);
      setIsImportOpen(false);
      setActiveView('timetable');
      addToast('Jeu de référence officiel (360 h) chargé avec succès.', 'success');
    } catch (err: any) {
      console.error('Erreur lors du chargement des données de test:', err);
      setError("Erreur lors de l'initialisation du jeu de données de test.");
      addToast('Erreur lors du chargement du jeu de test.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Sauvegarde d'un nouveau mappage
  const handleSaveMapping = async (newConfig: MappingConfig) => {
    setConfig(newConfig);
    await saveMappingConfig(newConfig);
    addToast('Configuration du mappage enregistrée.', 'success');

    if (lastUploadedBuffer) {
      try {
        setIsLoading(true);
        const { dataset: reParsed } = await parseExcelWorkbook(
          lastUploadedBuffer.buffer,
          lastUploadedBuffer.name,
          newConfig
        );
        await persistDataset(reParsed);
        addToast('Données réanalysées avec le nouveau mappage.', 'info');
      } catch (err: any) {
        console.error('Erreur re-parsing avec nouveau mappage:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Application du planning généré par le solveur
  const handleApplyPlanning = async (newPlanning: Planning, result: SolverResult, appliedConfig?: SolverConfig) => {
    if (!dataset) return;
    const updatedDataset: ImportDataset = {
      ...dataset,
      planning: newPlanning,
      solverResult: result,
      constraints: appliedConfig ? { ...(dataset.constraints || {}), ...appliedConfig } : dataset.constraints,
    };
    await persistDataset(updatedDataset);
    setActiveView('timetable');
    addToast(`Emploi du temps appliqué : ${newPlanning.length} heures placées.`, 'success');
  };

  // Mise à jour en direct du planning (suite à glisser-déposer ou annuler/rétablir)
  const handleUpdatePlanning = async (newPlanning: Planning) => {
    if (!dataset) return;
    const updatedDataset: ImportDataset = {
      ...dataset,
      planning: newPlanning,
    };
    await persistDataset(updatedDataset);
  };

  const [lockedAssignmentsForGen, setLockedAssignmentsForGen] = useState<Planning>([]);

  const handleOpenGeneratorWithLocks = (locked: Planning) => {
    setLockedAssignmentsForGen(locked);
    setIsRelaxedModeForGen(false);
    setIsGenerationOpen(true);
  };

  const handleSaveConstraints = async (newConstraints: RulesOptions, updatedUnites?: Unite[]) => {
    if (!dataset) return;
    const updatedDataset: ImportDataset = {
      ...dataset,
      constraints: newConstraints,
      ...(updatedUnites ? { unites: updatedUnites } : {}),
    };
    await persistDataset(updatedDataset);
    addToast('Contraintes enregistrées avec succès.', 'success');
  };

  const handleUpdateScenarios = async (newScenarios: ScheduleScenario[]) => {
    if (!dataset) return;
    const updatedDataset: ImportDataset = {
      ...dataset,
      scenarios: newScenarios,
    };
    await persistDataset(updatedDataset);
  };

  const handleApplyScenario = async (sc: ScheduleScenario) => {
    if (!dataset) return;
    const updatedDataset: ImportDataset = {
      ...dataset,
      planning: sc.planning,
      solverResult: sc.solverResult || dataset.solverResult,
    };
    await persistDataset(updatedDataset);
    setActiveView('timetable');
    addToast(`Scénario « ${sc.name} » appliqué à l'emploi du temps.`, 'success');
  };

  // Ouverture du modal de confirmation de réinitialisation
  const handleOpenResetConfirm = () => {
    setIsResetConfirmOpen(true);
  };

  // Réinitialisation complète sécurisée via le modal
  const handleConfirmReset = async (resetMapping: boolean) => {
    try {
      setIsLoading(true);
      await clearAllData();
      if (resetMapping) {
        setConfig(DEFAULT_MAPPING_CONFIG);
        await saveMappingConfig(DEFAULT_MAPPING_CONFIG);
      }
      setDataset(null);
      setLastUploadedBuffer(null);
      setError(null);
      setLastSavedAt(null);
      setLockedAssignmentsForGen([]);
      setActiveView('dashboard');
      setIsImportOpen(false);
      addToast('Toutes les données ont été réinitialisées avec succès.', 'info');
    } catch (err: any) {
      console.error('Erreur lors de la réinitialisation:', err);
      addToast('Erreur lors de la réinitialisation des données.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Bar responsive avec multi-projets et auto-save */}
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenMapping={() => setIsMappingOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenProjects={() => setIsProjectManagerOpen(true)}
        onExportJson={() => dataset && exportProjectToJson(dataset)}
        onSelectSamplePreset={handleLoadSamplePreset}
        projectName={dataset?.fileName}
        isSaving={isSaving}
        lastSavedAt={lastSavedAt}
        onOpenGenerator={() => {
          setLockedAssignmentsForGen([]);
          setIsRelaxedModeForGen(false);
          setIsGenerationOpen(true);
        }}
        hasDataset={dataset !== null}
        hasPlanning={Boolean(dataset?.planning && dataset.planning.length > 0)}
        onReset={handleOpenResetConfirm}
      />

      {/* Contenu principal */}
      <main className="flex-1">
        {!dataset || isImportOpen ? (
          <div className="py-6">
            {isImportOpen && dataset && (
              <div className="max-w-4xl mx-auto px-4 mb-4 flex justify-end">
                <button
                  onClick={() => setIsImportOpen(false)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  ← Revenir au tableau de bord actuel
                </button>
              </div>
            )}
            <ImportZone
              onFileLoaded={handleFileLoaded}
              onLoadOfficialDemo={handleLoadOfficialDemo}
              onSelectSamplePreset={handleLoadSamplePreset}
              onOpenMapping={() => setIsMappingOpen(true)}
              config={config}
              isLoading={isLoading}
              error={error}
            />
          </div>
        ) : (
          <ControlDashboard
            dataset={dataset}
            activeTab={activeView}
            onSelectTab={setActiveView}
            onOpenMapping={() => setIsMappingOpen(true)}
            onOpenGenerator={(relaxed) => {
              setLockedAssignmentsForGen([]);
              setIsRelaxedModeForGen(Boolean(relaxed));
              setIsGenerationOpen(true);
            }}
            onOpenGeneratorWithLocks={handleOpenGeneratorWithLocks}
            onUpdatePlanning={handleUpdatePlanning}
            onSaveConstraints={handleSaveConstraints}
            onUpdateScenarios={handleUpdateScenarios}
            onApplyScenario={handleApplyScenario}
          />
        )}
      </main>

      {/* Modal de configuration du Mappage */}
      <MappingModal
        isOpen={isMappingOpen}
        onClose={() => setIsMappingOpen(false)}
        config={config}
        onSave={handleSaveMapping}
      />

      {/* Modal de Gestion de Projets & JSON Import/Export */}
      <ProjectManagerModal
        isOpen={isProjectManagerOpen}
        onClose={() => setIsProjectManagerOpen(false)}
        activeDataset={dataset}
        onSelectProject={(newProj) => {
          setDataset(newProj);
          setLastSavedAt(new Date());
          if (newProj.planning && newProj.planning.length > 0) {
            setActiveView('timetable');
          } else {
            setActiveView('dashboard');
          }
        }}
        onOpenExcelImport={() => setIsImportOpen(true)}
        onShowToast={addToast}
      />

      {/* Modal de Génération d'Emploi du Temps */}
      {dataset && (
        <GenerationModal
          isOpen={isGenerationOpen}
          onClose={() => setIsGenerationOpen(false)}
          dataset={dataset}
          onApplyPlanning={handleApplyPlanning}
          lockedAssignments={lockedAssignmentsForGen}
          initialKeepLocked={lockedAssignmentsForGen.length > 0}
          initialRelaxedMode={isRelaxedModeForGen}
        />
      )}

      {/* Modal de Confirmation de Réinitialisation */}
      <ResetConfirmModal
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        onConfirm={handleConfirmReset}
        projectName={dataset?.fileName}
      />

      {/* Système de notifications Toast propre */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-xl border shadow-lg backdrop-blur-xs text-xs font-medium animate-in slide-in-from-bottom-2 duration-150 ${
              toast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900'
                : toast.type === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-900'
                : 'bg-white/95 border-slate-200 text-slate-800'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            )}
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Pied de page sobre */}
      <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            <span>Générateur d'emplois du temps</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>Solveur 2 phases (HiGHS MIP & Web Worker) · Vues aSc Horaires & Exports ExcelJS</span>
          </div>
          <div>
            <span>Moteur 100% navigateur (IndexedDB)</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span className="font-mono">12 classes · 28 enseignants · 360 h</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
