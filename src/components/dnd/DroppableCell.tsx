/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { CellDropEvaluation } from '../../utils/dndRulesHelper';
import { Check, AlertTriangle, XCircle, ArrowLeftRight } from 'lucide-react';

interface DroppableCellProps {
  id: string;
  slot: number;
  isDispo?: boolean;
  evaluation?: CellDropEvaluation | null;
  isDragActive?: boolean;
  isClickSelectionActive?: boolean;
  isSourceSlot?: boolean;
  onClickCell?: () => void;
  headerLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export const DroppableCell: React.FC<DroppableCellProps> = ({
  id,
  slot,
  isDispo = true,
  evaluation,
  isDragActive = false,
  isClickSelectionActive = false,
  isSourceSlot = false,
  onClickCell,
  headerLabel,
  className = '',
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { slot },
  });

  const isInteractive = isDragActive || isClickSelectionActive;

  // Détermination du style selon l'évaluation
  let dndClass = '';
  let statusIcon: React.ReactNode = null;
  let statusLabel = '';
  let tooltipText = '';

  if (isSourceSlot) {
    dndClass = 'bg-blue-50/90 border-2 border-dashed border-blue-500 ring-2 ring-blue-300';
    statusLabel = '📍 Source';
    tooltipText = 'Emplacement actuel du cours sélectionné (cliquer pour désélectionner)';
  } else if (isInteractive && evaluation) {
    if (evaluation.status === 'red') {
      dndClass = isOver
        ? 'bg-rose-100/90 border-2 border-rose-500 ring-2 ring-rose-400 cursor-not-allowed'
        : 'bg-rose-50/50 border-rose-200 opacity-60 cursor-not-allowed hover:opacity-95';
      statusIcon = <XCircle className="w-3 h-3 text-rose-600 shrink-0" />;
      statusLabel = 'Conflit';
      tooltipText = `Interdit (Règle dure) :\n• ${evaluation.reasons.join('\n• ')}`;
    } else if (evaluation.status === 'orange') {
      dndClass = isOver
        ? 'bg-amber-100/90 border-2 border-amber-500 ring-2 ring-amber-400'
        : 'bg-amber-50/80 border-2 border-amber-400 ring-1 ring-amber-200 cursor-pointer hover:bg-amber-100 hover:shadow-xs';
      statusIcon = evaluation.isSwap ? (
        <ArrowLeftRight className="w-3 h-3 text-amber-700 shrink-0" />
      ) : (
        <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
      );
      statusLabel = evaluation.isSwap ? '⇄ Échanger' : '⚠️ Possible';
      tooltipText = `Autorisé avec avertissement :\n• ${evaluation.reasons.join('\n• ')}`;
    } else if (evaluation.status === 'green') {
      dndClass = isOver
        ? 'bg-emerald-100/90 border-2 border-emerald-500 ring-2 ring-emerald-400'
        : evaluation.isSwap
        ? 'bg-emerald-50/90 border-2 border-emerald-500 ring-2 ring-emerald-200 cursor-pointer hover:bg-emerald-100 hover:shadow-xs'
        : 'bg-emerald-50/70 border-2 border-dashed border-emerald-500 ring-1 ring-emerald-200 cursor-pointer hover:bg-emerald-100 hover:shadow-xs';
      statusIcon = evaluation.isSwap ? (
        <ArrowLeftRight className="w-3 h-3 text-emerald-700 shrink-0" />
      ) : (
        <Check className="w-3 h-3 text-emerald-700 shrink-0" />
      );
      statusLabel = evaluation.isSwap ? '⇄ Échanger' : '✓ Déplacer ici';
      tooltipText = evaluation.isSwap
        ? `Échange possible (0 conflit)\n• ${evaluation.reasons.join('\n• ')}`
        : `Déplacement optimal (0 conflit)\n• ${evaluation.reasons.join('\n• ')}`;
    }
  }

  return (
    <div
      ref={setNodeRef}
      onClick={onClickCell}
      title={tooltipText || undefined}
      className={`relative p-1.5 transition-all duration-150 flex flex-col justify-between ${
        !isDispo && !isInteractive ? 'bg-rose-50/40' : ''
      } ${dndClass} ${className}`}
    >
      {/* En-tête de créneau ou indicateur d'état */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-0.5">
        <span className="font-semibold text-slate-500">{headerLabel}</span>
        {isSourceSlot ? (
          <span className="text-[9px] font-bold font-sans text-blue-700 bg-blue-100 px-1 py-0.2 rounded">
            {statusLabel}
          </span>
        ) : isInteractive && statusLabel ? (
          <div className="flex items-center gap-1">
            {statusIcon}
            <span
              className={`text-[9px] font-bold font-sans px-1 py-0.2 rounded ${
                evaluation?.status === 'red'
                  ? 'text-rose-700 bg-rose-100/80'
                  : evaluation?.status === 'orange'
                  ? 'text-amber-800 bg-amber-100/80'
                  : 'text-emerald-800 bg-emerald-100/90 font-bold'
              }`}
            >
              {statusLabel}
            </span>
          </div>
        ) : (
          !isDispo && <span className="text-rose-600 font-sans font-medium text-[9px]">Indispo</span>
        )}
      </div>

      {/* Contenu de la case */}
      <div className="flex-1 flex flex-col justify-center">
        {children || (
          <div className="h-full min-h-[38px] flex items-center justify-center text-slate-300 text-xs select-none">
            {isInteractive && evaluation?.status === 'green' && !evaluation.isSwap ? (
              <span className="text-[10px] text-emerald-600 font-medium">Libre</span>
            ) : (
              '·'
            )}
          </div>
        )}
      </div>

      {/* Infobulle visuelle au survol d'une case interdite ou avertie */}
      {isOver && evaluation && evaluation.reasons.length > 0 && (
        <div className="absolute left-1/2 -bottom-2 translate-y-full -translate-x-1/2 z-50 pointer-events-none w-56 p-2 rounded-lg bg-slate-900 text-white text-[11px] leading-tight shadow-xl border border-slate-700 text-center animate-in fade-in zoom-in-95 duration-100">
          <div className="font-bold mb-1 flex items-center justify-center gap-1">
            {evaluation.status === 'red'
              ? '❌ Conflit règle dure'
              : evaluation.status === 'orange'
              ? '⚠️ Règle souple'
              : '✅ Déplacement valide'}
          </div>
          <div className="text-[10px] text-slate-300">
            {evaluation.reasons[0]}
          </div>
        </div>
      )}
    </div>
  );
};
