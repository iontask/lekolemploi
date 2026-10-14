/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImportDataset, MappingConfig } from '../types';

const DB_NAME = 'EdT_Database';
const DB_VERSION = 1;

export const DEFAULT_MAPPING_CONFIG: MappingConfig = {
  headerRowClasses: 2,
  teacherStartRow: 3,
  teacherEndRow: 30,
  colNum: 'A',
  colMatiere: 'B',
  colNom: 'C',
  colPrenom: 'D',
  colCreneauxStart: 'E',
  colCreneauxEnd: 'AJ',
  colClassesStart: 'AK',
  colClassesEnd: 'AV',
  semaine: {
    jours: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'],
    creneauxParJour: [7, 7, 7, 7, 4],
  },
  colorAvailableHex: 'FFFFFF00', // Jaune
  colorUnavailableHex: 'FFFF0000', // Rouge
  detectNumericFallback: true,
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('datasets')) {
        db.createObjectStore('datasets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveActiveDataset(dataset: ImportDataset): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'config'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const configStore = tx.objectStore('config');

    datasetsStore.put(dataset);
    configStore.put({ key: 'active_dataset_id', value: dataset.id });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getActiveDataset(): Promise<ImportDataset | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'config'], 'readonly');
    const configStore = tx.objectStore('config');
    const configReq = configStore.get('active_dataset_id');

    configReq.onsuccess = () => {
      const activeId = configReq.result?.value;
      if (!activeId) {
        // Fallback to latest dataset if any
        const datasetsStore = tx.objectStore('datasets');
        const allReq = datasetsStore.getAll();
        allReq.onsuccess = () => {
          const list = allReq.result as ImportDataset[];
          if (list && list.length > 0) {
            resolve(list[list.length - 1]);
          } else {
            resolve(null);
          }
        };
        allReq.onerror = () => reject(allReq.error);
        return;
      }

      const datasetsStore = tx.objectStore('datasets');
      const dataReq = datasetsStore.get(activeId);
      dataReq.onsuccess = () => resolve(dataReq.result || null);
      dataReq.onerror = () => reject(dataReq.error);
    };

    configReq.onerror = () => reject(configReq.error);
  });
}
export async function getAllDatasets(): Promise<ImportDataset[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getDatasetById(id: string): Promise<ImportDataset | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readonly');
    const store = tx.objectStore('datasets');
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function setActiveDatasetId(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('config', 'readwrite');
    const store = tx.objectStore('config');
    store.put({ key: 'active_dataset_id', value: id });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDataset(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'config'], 'readwrite');
    const datasetsStore = tx.objectStore('datasets');
    const configStore = tx.objectStore('config');

    datasetsStore.delete(id);

    // If deleting active dataset, clear active_dataset_id
    const configReq = configStore.get('active_dataset_id');
    configReq.onsuccess = () => {
      if (configReq.result?.value === id) {
        configStore.delete('active_dataset_id');
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function duplicateDataset(id: string, newTitle?: string): Promise<ImportDataset> {
  const original = await getDatasetById(id);
  if (!original) {
    throw new Error('Projet source introuvable');
  }

  const newId = `ds_copy_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cloned: ImportDataset = {
    ...JSON.parse(JSON.stringify(original)),
    id: newId,
    fileName: newTitle || `${original.fileName} (Copie)`,
    importedAt: new Date().toISOString(),
  };

  await saveActiveDataset(cloned);
  return cloned;
}

export async function renameDataset(id: string, newName: string): Promise<void> {
  const dataset = await getDatasetById(id);
  if (!dataset) return;
  dataset.fileName = newName;
  await saveActiveDataset(dataset);
}

export async function saveMappingConfig(config: MappingConfig): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('config', 'readwrite');
    const store = tx.objectStore('config');
    store.put({ key: 'mapping_config', value: config });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSavedMappingConfig(): Promise<MappingConfig> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('config', 'readonly');
      const store = tx.objectStore('config');
      const req = store.get('mapping_config');
      req.onsuccess = () => {
        resolve(req.result?.value || DEFAULT_MAPPING_CONFIG);
      };
      req.onerror = () => resolve(DEFAULT_MAPPING_CONFIG);
    });
  } catch {
    return DEFAULT_MAPPING_CONFIG;
  }
}

export async function clearAllData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['datasets', 'config'], 'readwrite');
    tx.objectStore('datasets').clear();
    tx.objectStore('config').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
