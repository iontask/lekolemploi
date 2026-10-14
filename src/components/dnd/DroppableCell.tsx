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
  headerLabel,
  className = '',
  children,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { slot },
  });

  // Détermination du style selon l'évaluation
  let dndClass = '';
  let statusIcon: React.ReactNode = null;
  let tooltipText = '';

  if (isDragActive && evaluation) {
    if (evaluation.status === 'red') {
      dndClass = isOver
        ? 'bg-rose-100/90 border-2 border-rose-500 ring-2 ring-rose-400 cursor-not-allowed'
        : 'bg-rose-50/70 border-rose-300 ring-1 ring-rose-200 cursor-not-allowed';
      statusIcon = <XCircle className="w-3 h-3 text-rose-600 shrink-0" />;
      tooltipText = `Interdit (Règle dure) :\n• ${evaluation.reasons.join('\n• ')}`;
    } else if (evaluation.status === 'orange') {
      dndClass = isOver
        ? 'bg-amber-100/90 border-2 border-amber-500 ring-2 ring-amber-400'
        : 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200';
      statusIcon = evaluation.isSwap ? (
        <ArrowLeftRight className="w-3 h-3 text-amber-700 shrink-0" />
      ) : (
        <AlertTriangle className="w-3 h-3 text-amber-700 shrink-0" />
      );
      tooltipText = `Autorisé avec avertissement :\n• ${evaluation.reasons.join('\n• ')}`;
    } else if (evaluation.status === 'green') {
      dndClass = isOver
        ? 'bg-emerald-100/90 border-2 border-emerald-500 ring-2 ring-emerald-400'
        : 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200';
      statusIcon = evaluation.isSwap ? (
        <ArrowLeftRight className="w-3 h-3 text-emerald-700 shrink-0" />
      ) : (
        <Check className="w-3 h-3 text-emerald-700 shrink-0" />
      );
      tooltipText = evaluation.isSwap
        ? `Échange possible (0 conflit)\n• ${evaluation.reasons.join('\n• ')}`
        : `Déplacement optimal (0 conflit)\n• ${evaluation.reasons.join('\n• ')}`;
    }
  }

  return (
    <div
      ref={setNodeRef}
      title={tooltipText || undefined}
      className={`relative p-1.5 transition-all duration-150 flex flex-col justify-between ${
        !isDispo && !isDragActive ? 'bg-rose-50/40' : ''
      } ${dndClass} ${className}`}
    >
      {/* En-tête de créneau ou indicateur d'état */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-0.5">
        <span>{headerLabel}</span>
        {isDragActive && statusIcon ? (
          <div className="flex items-center gap-1">
            {statusIcon}
            <span
              className={`text-[9px] font-bold font-sans ${
                evaluation?.status === 'red'
                  ? 'text-rose-700'
                  : evaluation?.status === 'orange'
                  ? 'text-amber-700'
                  : 'text-emerald-700'
              }`}
            >
              {evaluation?.status === 'red'
                ? 'Conflit'
                : evaluation?.status === 'orange'
                ? 'Avert.'
                : 'Valide'}
            </span>
          </div>
        ) : (
          !isDispo && <span className="text-rose-600 font-sans font-medium">Indispo</span>
        )}
      </div>

      {/* Contenu de la case */}
      <div className="flex-1 flex flex-col justify-center">
        {children || <div className="h-full flex items-center justify-center text-slate-200 text-xs select-none">·</div>}
      </div>

      {/* Infobulle visuelle au survol d'une case interdite ou avertie */}
      {isOver && evaluation && evaluation.reasons.length > 0 && (
        <div className="absolute left-1/2 -bottom-2 translate-y-full -translate-x-1/2 z-50 pointer-events-none w-56 p-2 rounded-lg bg-slate-900 text-white text-[11px] leading-tight shadow-xl border border-slate-700 text-center animate-in fade-in zoom-in-95 duration-100">
          <div className="font-bold mb-1 flex items-center justify-center gap-1">
            {evaluation.status === 'red' ? '❌ Conflit règle dure' : evaluation.status === 'orange' ? '⚠️ Règle souple' : '✅ Déplacement valide'}
          </div>
          <div className="text-[10px] text-slate-300">
            {evaluation.reasons[0]}
          </div>
        </div>
      )}
    </div>
  );
};
