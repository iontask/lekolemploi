/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScheduleData } from '../rules/types';
import { SolverConfig, SolverProgress, SolverResult, WorkerInMessage, WorkerOutMessage } from './types';

export class SolverClient {
  private worker: Worker | null = null;
  private isRunning = false;

  public start(
    data: ScheduleData,
    config: SolverConfig,
    onProgress: (progress: SolverProgress) => void,
    onSuccess: (result: SolverResult) => void,
    onError: (error: string) => void,
    lockedAssignments?: import('../rules/types').Affectation[]
  ): void {
    this.cancel(); // Annule tout travail en cours

    try {
      this.worker = new Worker(new URL('../workers/solverWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.isRunning = true;

      this.worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        const msg = e.data;
        if (msg.type === 'PROGRESS') {
          onProgress(msg.progress);
        } else if (msg.type === 'DONE') {
          this.isRunning = false;
          onSuccess(msg.result);
          this.cleanup();
        } else if (msg.type === 'ERROR') {
          this.isRunning = false;
          onError(msg.error);
          this.cleanup();
        }
      };

      this.worker.onerror = (err) => {
        console.error('Erreur non gérée du Worker:', err);
        this.isRunning = false;
        onError(err.message || 'Erreur d\'exécution du Web Worker.');
        this.cleanup();
      };

      const startMsg: WorkerInMessage = {
        type: 'START',
        data,
        config,
        lockedAssignments,
      };

      this.worker.postMessage(startMsg);
    } catch (err: any) {
      this.isRunning = false;
      onError(err?.message || 'Impossible d\'instancier le Web Worker.');
    }
  }

  public cancel(): void {
    if (this.worker && this.isRunning) {
      try {
        this.worker.postMessage({ type: 'CANCEL' } as WorkerInMessage);
      } catch (e) {
        // Ignorer
      }
      this.worker.terminate();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.worker = null;
    this.isRunning = false;
  }

  public get active(): boolean {
    return this.isRunning;
  }
}
