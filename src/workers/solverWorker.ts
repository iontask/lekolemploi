/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import loadHighs from 'highs';
import { score, verify } from '../rules';
import { Planning } from '../rules/types';
import { buildLpModel } from '../solver/lpModelBuilder';
import { compactAndRepairTeacherSchedules, solvePhaseAWithDiagnostics } from '../solver/phaseA';
import {
  GenerationBottleneck,
  GenerationLogEntry,
  LogSeverity,
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
    const accumulatedLogs: GenerationLogEntry[] = [];
    let accumulatedBottlenecks: GenerationBottleneck[] = [];

    const addWorkerLog = (
      severity: LogSeverity,
      message: string,
      phase: GenerationLogEntry['phase'] = 'PHASE_B',
      details?: string
    ) => {
      const entry: GenerationLogEntry = {
        id: `log_w_${Date.now()}_${accumulatedLogs.length + 1}`,
        timestamp: performance.now(),
        phase,
        severity,
        message,
        details,
      };
      accumulatedLogs.push(entry);
      return entry;
    };

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

      const phaseAResult = solvePhaseAWithDiagnostics(
        data,
        config,
        (pct, m, recentLogs) => {
          self.postMessage({
            type: 'PROGRESS',
            progress: {
              phase: 'A',
              percent: pct,
              message: m,
              elapsedMs: performance.now() - startA,
              recentLogs,
            },
          } as WorkerOutMessage);
        },
        () => isCancelled,
        lockedAssignments
      );

      if (isCancelled) return;

      const phaseAPlanning = phaseAResult.planning;
      accumulatedLogs.push(...phaseAResult.logs);
      accumulatedBottlenecks = phaseAResult.bottlenecks;

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
        addWorkerLog(
          'INFO',
          `Génération conclue en Phase A (${phaseAPlanning.length}/${data.unites.reduce((s, u) => s + u.heures, 0)} h placées).`,
          'SUMMARY'
        );

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
          logs: accumulatedLogs,
          bottlenecks: accumulatedBottlenecks,
        };

        self.postMessage({ type: 'DONE', result: finalResult } as WorkerOutMessage);
        return;
      }

      // ==========================================
      // PHASE B : Optimisation HiGHS WebAssembly
      // ==========================================
      const startB = performance.now();
      addWorkerLog('INFO', 'Démarrage de la Phase B (MIP HiGHS WebAssembly)...', 'PHASE_B');

      self.postMessage({
        type: 'PROGRESS',
        progress: {
          phase: 'B',
          percent: 52,
          message: 'Phase B : Construction du modèle MIP (CPLEX LP)...',
          elapsedMs: performance.now() - totalStart,
          phaseADurationMs: durationA,
          currentScore: scoreA.total,
          recentLogs: accumulatedLogs.slice(-5),
        },
      } as WorkerOutMessage);

      const lpModel = buildLpModel(data, config, phaseAPlanning, lockedAssignments);

      if (isCancelled) return;

      addWorkerLog(
        'INFO',
        `Modèle LP construit : ${lpModel.variablesCount} variables, ${lpModel.constraintsCount} contraintes.`,
        'PHASE_B'
      );

      self.postMessage({
        type: 'PROGRESS',
        progress: {
          phase: 'B',
          percent: 60,
          message: `Initialisation de HiGHS WebAssembly (${lpModel.variablesCount} var, ${lpModel.constraintsCount} ctr)...`,
          elapsedMs: performance.now() - totalStart,
          phaseADurationMs: durationA,
          currentScore: scoreA.total,
          recentLogs: accumulatedLogs.slice(-5),
        },
      } as WorkerOutMessage);

      // Chargement du module HiGHS WebAssembly
      const highs = await loadHighs();

      if (isCancelled) return;

      addWorkerLog(
        'INFO',
        `Solveur HiGHS initialisé. Lancement de la résolution avec limite de ${config.timeLimitSeconds} s...`,
        'PHASE_B'
      );

      self.postMessage({
        type: 'PROGRESS',
        progress: {
          phase: 'B',
          percent: 70,
          message: `Résolution en cours avec HiGHS (limite max : ${config.timeLimitSeconds} s)...`,
          elapsedMs: performance.now() - totalStart,
          phaseADurationMs: durationA,
          currentScore: scoreA.total,
          recentLogs: accumulatedLogs.slice(-5),
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
      } catch (solveErr: any) {
        console.warn('HiGHS solve warning/error:', solveErr);
        highsFailed = true;
        addWorkerLog('WARNING', `HiGHS solve exception : ${solveErr?.message || 'Erreur solveur'}. Conservation Phase A.`, 'PHASE_B');
      }

      const durationB = Math.round(performance.now() - startB);
      const totalDuration = Math.round(performance.now() - totalStart);

      // Analyse du résultat HiGHS
      let finalPlanning = phaseAPlanning;
      let quality: SolutionQuality = 'HEURISTIC_ONLY';
      let qualityLabel = 'Heuristique Phase A conservée';
      let highsStatus = highsResult?.Status || (highsFailed ? 'Failed' : 'Unknown');

      if (!highsFailed && highsResult && highsResult.Columns) {
        addWorkerLog('INFO', `HiGHS a terminé avec le statut : ${highsStatus}. Extraction du planning...`, 'PHASE_B');

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

        if (hardB.length === 0 && extractedPlanning.length >= phaseAPlanning.length) {
          const scoreB = score(extractedPlanning, data, config);

          if (highsResult.Status === 'Optimal') {
            finalPlanning = extractedPlanning;
            quality = 'OPTIMAL';
            qualityLabel = 'Optimale prouvée (HiGHS)';
            addWorkerLog('SUCCESS', `HiGHS : Solution optimale prouvée obtenue (Score : ${scoreB.total} pts).`, 'PHASE_B');
          } else {
            finalPlanning = extractedPlanning;
            quality = 'FEASIBLE_NON_OPTIMAL';
            qualityLabel = 'Valide non prouvée optimale (Temps limite HiGHS atteint)';
            addWorkerLog('SUCCESS', `HiGHS : Solution réalisable valide retenue (Score : ${scoreB.total} pts).`, 'PHASE_B');
          }
        } else {
          quality = 'HEURISTIC_ONLY';
          qualityLabel = 'Heuristique Phase A conservée (solution HiGHS non conforme)';
          addWorkerLog('WARNING', `HiGHS a retourné une solution avec violations dures ou moins d'heures. Solution Phase A conservée.`, 'PHASE_B');
        }
      } else {
        quality = 'HEURISTIC_ONLY';
        qualityLabel = 'Heuristique Phase A conservée (HiGHS sans solution)';
        addWorkerLog('INFO', `HiGHS sans solution réalisable (${highsStatus}). Planning Phase A conservé.`, 'PHASE_B');
      }

      // Optimisation finale des contraintes enseignants sur le planning retenu
      compactAndRepairTeacherSchedules(finalPlanning, data, config, lockedAssignments);

      const finalViolations = verify(finalPlanning, data, config);
      const finalScore = score(finalPlanning, data, config);
      const totalTargetH = data.unites.reduce((sum, u) => sum + u.heures, 0);

      addWorkerLog(
        finalPlanning.length === totalTargetH ? 'SUCCESS' : 'WARNING',
        `Génération terminée : ${finalPlanning.length}/${totalTargetH} heures placées (${Math.round((finalPlanning.length / (totalTargetH || 1)) * 100)} % d'insertion). Durée totale : ${(totalDuration / 1000).toFixed(2)} s.`,
        'SUMMARY'
      );

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
          totalHours: totalTargetH,
          variablesCount: lpModel.variablesCount,
          constraintsCount: lpModel.constraintsCount,
          highsStatus,
        },
        logs: accumulatedLogs,
        bottlenecks: accumulatedBottlenecks,
      };

      self.postMessage({ type: 'DONE', result: finalResult } as WorkerOutMessage);
    } catch (err: any) {
      console.error('Erreur dans le Web Worker du solveur:', err);
      addWorkerLog('WARNING', `Erreur fatale dans le Web Worker : ${err?.message || 'Erreur'}`, 'SUMMARY');
      self.postMessage({
        type: 'ERROR',
        error: err?.message || 'Erreur inconnue dans le solveur.',
      } as WorkerOutMessage);
    }
  }
};
