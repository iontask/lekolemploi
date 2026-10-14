/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { UnassignedSessionItem } from '../../utils/dndRulesHelper';
import { getSubjectMeta } from '../../utils/subjectFormatters';
import { Inbox, GripVertical, CheckCircle2, ArrowDownToLine, Plus, AlertCircle } from 'lucide-react';

interface DraggableBinItemCardProps {
  item: UnassignedSessionItem;
  isSelected?: boolean;
  onSelect?: () => void;
}

const DraggableBinItemCard: React.FC<DraggableBinItemCardProps> = ({
  item,
  isSelected = false,
  onSelect,
}) => {
  const meta = getSubjectMeta(item.matiere);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: {
      isFromBin: true,
      binItemId: item.id,
      uniteId: item.uniteId,
      isBlock2h: item.isBlock2h,
      sourceSlots: [],
      subject: item.matiere,
      subTitle: `${item.profNom} · ${item.classesLabel}`,
      badgeClass: meta.badgeClass,
      duration: item.duration,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 60,
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
      title="Glissez sur la grille ci-dessous ou cliquez pour sélectionner la destination"
      className={`group relative flex items-center justify-between gap-2.5 p-2 rounded-lg border text-xs shadow-xs transition-all cursor-pointer select-none ${
        meta.badgeClass
      } ${
        isDragging
          ? 'opacity-40 ring-2 ring-slate-900 scale-95 shadow-md'
          : 'hover:shadow-md hover:scale-[1.01]'
      } ${
        isSelected
          ? 'ring-2 ring-blue-600 bg-blue-50/95 shadow-md border-blue-500 font-bold'
          : 'border-slate-300 hover:border-slate-400'
      }`}
    >
      <div
        className="flex items-center gap-1.5 min-w-0 flex-1"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-800 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-slate-900 truncate text-[12px] leading-tight">
              {item.matiere}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                item.isBlock2h
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-200 text-slate-800'
              }`}
            >
              {item.isBlock2h ? 'Bloc 2h' : '1h'}
            </span>
          </div>
          <div className="text-[10px] text-slate-600 truncate mt-0.5">
            {item.profNom} · <span className="font-semibold">{item.classesLabel}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.();
          }}
          className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors flex items-center gap-1 ${
            isSelected
              ? 'bg-blue-600 text-white'
              : 'bg-white/80 hover:bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
          }`}
        >
          <Plus className="w-3 h-3" />
          <span>{isSelected ? 'Actif' : 'Placer'}</span>
        </button>
      </div>
    </div>
  );
};

interface UnassignedBinProps {
  items: UnassignedSessionItem[];
  selectedBinItemId: string | null;
  onSelectBinItem: (item: UnassignedSessionItem) => void;
  isDragActive?: boolean;
  isDraggingGridCourse?: boolean;
  contextLabel: string;
}

export const UnassignedBin: React.FC<UnassignedBinProps> = ({
  items,
  selectedBinItemId,
  onSelectBinItem,
  isDragActive = false,
  isDraggingGridCourse = false,
  contextLabel,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned_bin',
    data: { isBin: true },
  });

  const totalUnassignedHours = items.reduce((sum, item) => sum + item.duration, 0);

  return (
    <div
      ref={setNodeRef}
      className={`relative rounded-xl border transition-all duration-200 print:hidden ${
        isOver && isDraggingGridCourse
          ? 'bg-amber-100/90 border-2 border-dashed border-amber-500 ring-4 ring-amber-200 scale-[1.01] shadow-lg'
          : items.length > 0
          ? 'bg-amber-50/60 border-amber-200 shadow-xs'
          : isDraggingGridCourse
          ? 'bg-slate-50 border-2 border-dashed border-slate-300'
          : 'bg-slate-50/70 border-slate-200'
      }`}
    >
      <div className="p-3.5 sm:p-4">
        {/* En-tête du Bac */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                items.length > 0
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                  Bac de matières non affectées ({contextLabel})
                </h3>
                {items.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900">
                    {items.length} bloc(s) · {totalUnassignedHours} h en attente
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>0 en attente (100% placé)</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {items.length > 0
                  ? 'Glissez un bloc sur un créneau libre de la grille ci-dessous, ou glissez un cours déjà programmé vers ce bac pour le libérer.'
                  : 'Vous pouvez glisser-déposer n\'importe quel cours de la grille dans ce bac pour le libérer temporairement.'}
              </p>
            </div>
          </div>

          {/* Indication visuelle de zone de dépôt si un cours est en cours de déplacement */}
          {isDraggingGridCourse && (
            <div
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 animate-pulse ${
                isOver
                  ? 'bg-amber-600 text-white border-amber-700 shadow-md scale-105'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4 shrink-0" />
              <span>
                {isOver
                  ? 'Relâcher pour renvoyer le cours dans le bac !'
                  : 'Glissez ici pour déposer dans le bac'}
              </span>
            </div>
          )}
        </div>

        {/* Liste des séances non affectées dans le bac */}
        {items.length > 0 ? (
          <div className="mt-3 pt-3 border-t border-amber-200/80">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {items.map((item) => (
                <DraggableBinItemCard
                  key={item.id}
                  item={item}
                  isSelected={selectedBinItemId === item.id}
                  onSelect={() => onSelectBinItem(item)}
                />
              ))}
            </div>
          </div>
        ) : (
          isDraggingGridCourse && (
            <div className="mt-2.5 p-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/80 text-center text-xs text-amber-900 font-medium">
              Déposez votre cours ici pour le retirer temporairement de la grille et le placer dans ce bac.
            </div>
          )
        )}
      </div>
    </div>
  );
};
