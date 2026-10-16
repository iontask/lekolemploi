/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  FolderOpen,
  Plus,
  Upload,
  Download,
  Copy,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  FileSpreadsheet,
  X,
  Edit2,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { ImportDataset } from '../types';
import {
  deleteDataset,
  duplicateDataset,
  getAllDatasets,
  renameDataset,
  saveActiveDataset,
  setActiveDatasetId,
} from '../services/db';
import { exportProjectToJson, parseProjectFromJson } from '../utils/projectJsonIO';
import { buildOfficialSampleDataset, SamplePreset } from '../services/sampleData';
import { SampleDatasetsDropdown } from './SampleDatasetsDropdown';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeDataset: ImportDataset | null;
  onSelectProject: (dataset: ImportDataset) => void;
  onOpenExcelImport: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  activeDataset,
  onSelectProject,
  onOpenExcelImport,
  onShowToast,
}) => {
  const [projects, setProjects] = useState<ImportDataset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const list = await getAllDatasets();
      // Trier par date d'import décroissante
      list.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
      setProjects(list);
    } catch (err) {
      console.error('Erreur chargement projets:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = async (project: ImportDataset) => {
    try {
      await setActiveDatasetId(project.id);
      onSelectProject(project);
      onShowToast(`Projet « ${project.fileName} » activé.`, 'success');
      onClose();
    } catch (err: any) {
      onShowToast(err?.message || 'Erreur lors de l\'activation du projet.', 'error');
    }
  };

  const handleDuplicate = async (project: ImportDataset) => {
    try {
      const cloned = await duplicateDataset(project.id);
      await loadProjects();
      onShowToast(`Copie créée : « ${cloned.fileName} »`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Erreur lors de la duplication.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDataset(id);
      setConfirmDeleteId(null);
      await loadProjects();
      onShowToast('Projet supprimé.', 'info');
      if (activeDataset?.id === id) {
        const remaining = await getAllDatasets();
        if (remaining.length > 0) {
          onSelectProject(remaining[0]);
        }
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Erreur lors de la suppression.', 'error');
    }
  };

  const handleStartRename = (project: ImportDataset) => {
    setEditingId(project.id);
    setEditingName(project.fileName || 'Projet sans titre');
  };

  const handleSaveRename = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await renameDataset(id, editingName.trim());
      setEditingId(null);
      await loadProjects();
      if (activeDataset?.id === id) {
        onSelectProject({ ...activeDataset, fileName: editingName.trim() });
      }
      onShowToast('Nom du projet modifié.', 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Erreur lors du renommage.', 'error');
    }
  };

  const handleCreateDemo = async () => {
    try {
      const demo = buildOfficialSampleDataset();
      demo.fileName = `Lycée_Pilote_360h_${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      await saveActiveDataset(demo);
      await loadProjects();
      onSelectProject(demo);
      onShowToast('Nouveau projet de référence 360 h créé et activé.', 'success');
      onClose();
    } catch (err: any) {
      onShowToast(err?.message || 'Erreur lors de la création du projet démo.', 'error');
    }
  };

  const handleLoadPreset = async (preset: SamplePreset) => {
    try {
      const ds = preset.load();
      await saveActiveDataset(ds);
      await loadProjects();
      onSelectProject(ds);
      onShowToast(`Projet « ${ds.fileName} » chargé avec succès.`, 'success');
      onClose();
    } catch (err: any) {
      onShowToast(err?.message || 'Erreur lors du chargement de l\'exemple.', 'error');
    }
  };

  const handleJsonUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      const imported = await parseProjectFromJson(file);
      await saveActiveDataset(imported);
      await loadProjects();
      onSelectProject(imported);
      onShowToast(`Projet « ${imported.fileName} » importé avec succès.`, 'success');
      onClose();
    } catch (err: any) {
      onShowToast(err?.message || 'Erreur lors de l\'import JSON.', 'error');
    } finally {
      setIsLoading(false);
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shadow-xs">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                Gestion des projets
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {projects.length}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Basculez entre vos emplois du temps, dupliquez, importez ou exportez au format JSON
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Dropdown Exemples aSc Timetables & Référence */}
            <SampleDatasetsDropdown
              variant="navbar"
              onSelectPreset={handleLoadPreset}
              isLoading={isLoading}
            />

            <button
              onClick={handleCreateDemo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs hover:shadow transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Nouveau projet 360 h
            </button>

            <button
              onClick={() => jsonFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              Importer JSON
            </button>
            <input
              ref={jsonFileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleJsonUpload}
            />

            <button
              onClick={() => {
                onClose();
                onOpenExcelImport();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Importer Excel (.xlsx)
            </button>
          </div>

          {activeDataset && (
            <button
              onClick={() => exportProjectToJson(activeDataset)}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
              title="Télécharger le projet actif en JSON"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Exporter projet actif en JSON
            </button>
          )}
        </div>

        {/* Liste des projets */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/50">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-medium">Chargement des projets...</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white p-8">
              <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">Aucun projet enregistré</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
                Créez le projet officiel de référence ou importez vos données pour commencer la planification.
              </p>
              <button
                onClick={handleCreateDemo}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                Charger le jeu de test 360 h
              </button>
            </div>
          ) : (
            projects.map((proj) => {
              const isActive = activeDataset?.id === proj.id;
              const totalHours = proj.unites?.reduce((s, u) => s + u.heures, 0) || 0;
              const placedHours = proj.planning?.length || 0;
              const percentPlaced = totalHours > 0 ? Math.round((placedHours / totalHours) * 100) : 0;
              const isEditing = editingId === proj.id;

              return (
                <div
                  key={proj.id}
                  className={`p-4 rounded-xl border transition-all bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    isActive
                      ? 'border-indigo-400 ring-2 ring-indigo-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  {/* Info principale */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(proj.id)}
                            autoFocus
                            className="px-2.5 py-1 text-sm font-semibold rounded border border-indigo-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-100"
                          />
                          <button
                            onClick={() => handleSaveRename(proj.id)}
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50"
                            title="Confirmer"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded text-slate-400 hover:bg-slate-100"
                            title="Annuler"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900 truncate">
                            {proj.fileName || 'Projet sans titre'}
                          </h3>
                          <button
                            onClick={() => handleStartRename(proj)}
                            className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 transition-colors"
                            title="Renommer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Actif
                        </span>
                      )}
                    </div>

                    {/* Stats et métadonnées */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        <strong>{proj.classes?.length || 0}</strong> classes
                      </span>
                      <span>·</span>
                      <span>
                        <strong>{proj.teachers?.length || 0}</strong> enseignants
                      </span>
                      <span>·</span>
                      <span>
                        <strong>{totalHours}</strong> h totales
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3 h-3" />
                        {new Date(proj.importedAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Barre de progression des heures placées */}
                    <div className="mt-2 flex items-center gap-2 max-w-xs">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            percentPlaced === 100
                              ? 'bg-emerald-500'
                              : percentPlaced > 0
                              ? 'bg-indigo-500'
                              : 'bg-slate-300'
                          }`}
                          style={{ width: `${percentPlaced}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-slate-500">
                        {placedHours} / {totalHours} h ({percentPlaced}%)
                      </span>
                    </div>
                  </div>

                  {/* Actions boutons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    {!isActive && (
                      <button
                        onClick={() => handleSelect(proj)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                      >
                        Ouvrir
                      </button>
                    )}

                    <button
                      onClick={() => handleDuplicate(proj)}
                      className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors"
                      title="Dupliquer le projet"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => exportProjectToJson(proj)}
                      className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors"
                      title="Exporter en JSON"
                    >
                      <Download className="w-4 h-4" />
                    </button>

                    {confirmDeleteId === proj.id ? (
                      <div className="flex items-center gap-1 pl-1 border-l border-slate-200">
                        <button
                          onClick={() => handleDelete(proj.id)}
                          className="px-2 py-1 text-[11px] font-bold rounded bg-rose-600 text-white hover:bg-rose-700"
                        >
                          Confirmer
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 rounded"
                        >
                          Non
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(proj.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Supprimer le projet"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
          <span>
            Données sauvegardées localement dans votre navigateur (IndexedDB)
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
