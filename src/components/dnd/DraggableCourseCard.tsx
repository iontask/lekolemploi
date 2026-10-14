/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Lock, Unlock, GripVertical } from 'lucide-react';

interface DraggableCourseCardProps {
  id: string; // Ex: `${uniteId}_slot_${slot}`
  uniteId: string;
  sourceSlots: number[];
  isLocked: boolean;
  onToggleLock: () => void;
  subject: string;
  subTitle: string;
  badgeClass: string;
  isCommon?: boolean;
  isBlock2h?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export const DraggableCourseCard: React.FC<DraggableCourseCardProps> = ({
  id,
  uniteId,
  sourceSlots,
  isLocked,
  onToggleLock,
  subject,
  subTitle,
  badgeClass,
  isCommon = false,
  isBlock2h = false,
  isSelected = false,
  onSelect,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: isLocked,
    data: {
      uniteId,
      sourceSlots,
      isBlock2h,
      subject,
      subTitle,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      title={
        isLocked
          ? 'Cours verrouillé'
          : 'Cliquer pour mettre en surbrillance les possibilités d\'échange et de déplacement (ou glisser-déposer)'
      }
      className={`group relative p-1.5 rounded-lg border text-xs shadow-xs transition-all select-none ${badgeClass} ${
        isDragging ? 'opacity-40 ring-2 ring-slate-900 scale-95' : 'hover:shadow-md'
      } ${
        isSelected
          ? 'ring-2 ring-blue-600 bg-blue-50/90 shadow-md scale-[1.02] border-blue-400 font-bold'
          : isLocked
          ? 'ring-1 ring-amber-400/80 bg-amber-50/40 cursor-default'
          : 'cursor-pointer hover:border-slate-400'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0" {...(isLocked ? {} : listeners)} {...(isLocked ? {} : attributes)}>
          {!isLocked && (
            <GripVertical className="w-3 h-3 text-slate-400 group-hover:text-slate-700 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
          )}
          <span className="font-bold truncate text-[11px] leading-tight">{subject}</span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {isSelected && (
            <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-blue-600 text-white uppercase animate-pulse">
              🎯
            </span>
          )}
          {isBlock2h && (
            <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-indigo-100 text-indigo-900 uppercase">
              2h
            </span>
          )}
          {isCommon && (
            <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-teal-200/80 text-teal-900 uppercase">
              Com
            </span>
          )}

          {/* Bouton de verrouillage (Cadenas) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleLock();
            }}
            title={isLocked ? 'Cours verrouillé (ne sera déplacé ni manuellement ni par le solveur). Cliquez pour déverrouiller.' : 'Verrouiller ce cours (le solveur et le glisser-déposer le garderont fixe).'}
            className={`p-0.5 rounded transition-colors ${
              isLocked
                ? 'text-amber-700 hover:text-amber-900 bg-amber-100'
                : 'text-slate-400 hover:text-slate-700 opacity-60 group-hover:opacity-100'
            }`}
          >
            {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <div
        className="text-[10px] font-medium truncate mt-0.5"
        {...(isLocked ? {} : listeners)}
        {...(isLocked ? {} : attributes)}
      >
        {subTitle}
      </div>
    </div>
  );
};
