/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import loadHighs from 'highs';
import { score, verify } from '../rules';
import { Planning } from '../rules/types';
import { buildLpModel } from '../solver/lpModelBuilder';
import { solvePhaseA } from '../solver/phaseA';
import {
  SolutionQuality,
  SolverProgress,
  SolverResult,
  WorkerInMessage,
  WorkerOutMessage,
} from '../solver/types';

let isCancelled = false;

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;

  if (msg.type === 'CANCEL') {
    isCancelled = true;
    return;
  }

  if (msg.type === 'START') {
    isCancelled = false;
    const { data, config, lockedAssignments = [] } = msg;
    const totalStart = performance.now();

    try {
      // ==========================================
      // PHASE A : Heuristique « Difficiles d'abord »
      // ==========================================
      const startA = performance.now();
      self.postMessage({
        type: 'PROGRESS',
        progress: {
          phase: 'A',
          percent: 5,
          message: 'Démarrage de la Phase A (heuristique « Difficiles d\'abord »)...',
          elapsedMs: 0,
        },
      } as WorkerOutMessage);

      const phaseAPlanning = solvePhaseA(
        data,
        config,
        (pct, m) => {
          self.postMessage({
            type: 'PROGRESS',
            progress: {
              phase: 'A',
              percent: pct,
              message: m,
              elapsedMs: performance.now() - startA,
            },
          } as WorkerOutMessage);
        },
        () => isCancelled,
        lockedAssignments
      );

      if (isCancelled) return;

      const durationA = Math.round(performance.now() - startA);
      const scoreA = score(phaseAPlanning, data, config);
      const violationsA = verify(phaseAPlanning, data, config);

      self.postMessage({
        type: 'PHASE_A_DONE',
        planning: phaseAPlanning,
        score: scoreA,
        durationMs: durationA,
      } as WorkerOutMessage);

      // Si la Phase B n'est pas demandée, s'arrêter ici
      if (!config.enablePhaseB) {
        const finalResult: SolverResult = {
          success: violationsA.filter((v) => v.severite === 'DURE').length === 0,
          planning: phaseAPlanning,
          quality: 'HEURISTIC_ONLY',
          qualityLabel: 'Heuristique seulement (Phase A)',
          score: scoreA,
          phaseADurationMs: durationA,
          totalDurationMs: durationA,
          violations: violationsA,
          benchmark: {
            totalUnits: data.unites.length,
            totalHours: data.unites.reduce((sum, u) => sum + u.heures, 0),
          },
        };

        self.postMessage({ type: 'DONE', result: finalResult } as WorkerOutMessage);
        return;
      }

      // ==========================================
      // PHASE B : Optimisation HiGHS WebAssembly
      // ==========================================
      const startB = performance.now();
      self.postMessage({
        type: 'PROGRESS',
        progress: {
          phase: 'B',
          percent: 52,
          message: 'Phase B : Construction du modèle MIP (CPLEX LP)...',
          elapsedMs: performance.now() - totalStart,
          phaseADurationMs: durationA,
          currentScore: scoreA.total,
        },
      } as WorkerOutMessage);

      const lpModel = buildLpModel(data, config, phaseAPlanning, lockedAssignments);

      if (isCancelled) return;

      self.postMessage({
        type: 'PROGRESS',
        progress: {
          phase: 'B',
          percent: 60,
          message: `Initialisation de HiGHS WebAssembly (${lpModel.variablesCount} var, ${lpModel.constraintsCount} ctr)...`,
          elapsedMs: performance.now() - totalStart,
          phaseADurationMs: durationA,
          currentScore: scoreA.total,
        },
      } as WorkerOutMessage);

      // Chargement du module HiGHS WebAssembly
      const highs = await loadHighs();

      if (isCancelled) return;

      self.postMessage({
        type: 'PROGRESS',
        progress: {
          phase: 'B',
          percent: 70,
          message: `Résolution en cours avec HiGHS (limite max : ${config.timeLimitSeconds} s)...`,
          elapsedMs: performance.now() - totalStart,
          phaseADurationMs: durationA,
          currentScore: scoreA.total,
        },
      } as WorkerOutMessage);

      // Résolution MIP avec limite de temps configurable
      let highsResult: any = null;
      let highsFailed = false;

      try {
        highsResult = highs.solve(lpModel.lpText, {
          time_limit: config.timeLimitSeconds,
          output_flag: false,
        });
      } catch (solveErr) {
        console.warn('HiGHS solve warning/error:', solveErr);
        highsFailed = true;
      }

      const durationB = Math.round(performance.now() - startB);
      const totalDuration = Math.round(performance.now() - totalStart);

      // Analyse du résultat HiGHS
      let finalPlanning = phaseAPlanning;
      let quality: SolutionQuality = 'HEURISTIC_ONLY';
      let qualityLabel = 'Heuristique Phase A conservée';
      let highsStatus = highsResult?.Status || (highsFailed ? 'Failed' : 'Unknown');

      if (!highsFailed && highsResult && highsResult.Columns) {
        // Extraction de l'emploi du temps depuis les colonnes de HiGHS
        const extractedPlanning: Planning = [];

        for (const [varName, info] of Object.entries(highsResult.Columns as Record<string, any>)) {
          if (varName.startsWith('x_') && info.Primal >= 0.5) {
            const mapped = lpModel.variableMap.get(varName);
            if (mapped) {
              extractedPlanning.push({
                uniteId: mapped.uniteId,
                slot: mapped.slot,
              });
            }
          }
        }

        // Validation formelle avec verify()
        const violationsB = verify(extractedPlanning, data, config);
        const hardB = violationsB.filter((v) => v.severite === 'DURE');

        if (hardB.length === 0) {
          const scoreB = score(extractedPlanning, data, config);

          // Si la solution HiGHS est valide et meilleure ou équivalente
          if (highsResult.Status === 'Optimal') {
            finalPlanning = extractedPlanning;
            quality = 'OPTIMAL';
            qualityLabel = 'Optimale prouvée (HiGHS)';
          } else {
            finalPlanning = extractedPlanning;
            quality = 'FEASIBLE_NON_OPTIMAL';
            qualityLabel = 'Valide non prouvée optimale (Temps limite HiGHS atteint)';
          }
        } else {
          // Rejet formel si violation dure détectée : on conserve Phase A
          quality = 'HEURISTIC_ONLY';
          qualityLabel = 'Heuristique Phase A conservée (solution HiGHS non conforme)';
        }
      } else {
        quality = 'HEURISTIC_ONLY';
        qualityLabel = 'Heuristique Phase A conservée (HiGHS sans solution)';
      }

      const finalViolations = verify(finalPlanning, data, config);
      const finalScore = score(finalPlanning, data, config);

      const finalResult: SolverResult = {
        success: finalViolations.filter((v) => v.severite === 'DURE').length === 0,
        planning: finalPlanning,
        quality,
        qualityLabel,
        score: finalScore,
        phaseADurationMs: durationA,
        phaseBDurationMs: durationB,
        totalDurationMs: totalDuration,
        violations: finalViolations,
        benchmark: {
          totalUnits: data.unites.length,
          totalHours: data.unites.reduce((sum, u) => sum + u.heures, 0),
          variablesCount: lpModel.variablesCount,
          constraintsCount: lpModel.constraintsCount,
          highsStatus,
        },
      };

      self.postMessage({ type: 'DONE', result: finalResult } as WorkerOutMessage);
    } catch (err: any) {
      console.error('Erreur dans le Web Worker du solveur:', err);
      self.postMessage({
        type: 'ERROR',
        error: err?.message || 'Erreur inconnue dans le solveur.',
      } as WorkerOutMessage);
    }
  }
};
