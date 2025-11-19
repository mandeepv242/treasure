import React from 'react';
import { Chest, ChestStatus, ChestType } from '../types';
import { LockIcon, TreasureIcon, SkullIcon, DustIcon } from './Icons';

interface ChestItemProps {
  chest: Chest;
  onClick: () => void;
  disabled: boolean;
  isSelected: boolean;
  isDimmed: boolean;
}

export const ChestItem: React.FC<ChestItemProps> = ({ chest, onClick, disabled, isSelected, isDimmed }) => {
  
  let content = <LockIcon className="w-10 h-10 text-amber-100" />;
  let bgColor = "bg-slate-700";
  let borderColor = "border-slate-500";
  let shadow = "shadow-md";
  let transform = "";

  if (chest.status === ChestStatus.REVEALED || chest.status === ChestStatus.OPENED) {
    if (chest.type === ChestType.TREASURE) {
      content = <TreasureIcon className="w-14 h-14 text-yellow-300 drop-shadow-md" />;
      bgColor = "bg-yellow-600";
      borderColor = "border-yellow-400";
      shadow = "shadow-yellow-500/50";
    } else if (chest.type === ChestType.TRAP) {
      content = <SkullIcon className="w-12 h-12 text-white drop-shadow-md" />;
      bgColor = "bg-red-600";
      borderColor = "border-red-400";
      shadow = "shadow-red-500/50";
    } else {
      content = <DustIcon className="w-12 h-12 text-gray-300" />;
      bgColor = "bg-gray-600";
      borderColor = "border-gray-400";
    }
  } else if (isSelected) {
    borderColor = "border-cyan-400";
    bgColor = "bg-cyan-800";
    shadow = "shadow-cyan-400/50 shadow-lg";
    transform = "-translate-y-2";
    content = <LockIcon className="w-12 h-12 text-cyan-200 animate-pulse" />;
  } else if (!disabled) {
    // Hover state for interactable chests
    bgColor = "bg-slate-700 hover:bg-slate-600";
    borderColor = "border-slate-500 hover:border-amber-300";
  }

  const interactionClasses = !disabled && chest.status === ChestStatus.CLOSED
    ? "cursor-pointer active:scale-95"
    : "cursor-default";

  const dimmedClasses = isDimmed ? "opacity-30 grayscale" : "opacity-100";

  return (
    <div
      onClick={(!disabled && chest.status === ChestStatus.CLOSED) ? onClick : undefined}
      className={`
        relative w-full aspect-square max-w-[140px] rounded-2xl border-4 
        flex flex-col items-center justify-center 
        transition-all duration-200 ease-out
        ${bgColor} ${borderColor} ${shadow} ${interactionClasses} ${dimmedClasses} ${transform}
      `}
    >
      {/* Number badge */}
      <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/30 flex items-center justify-center text-xs font-bold text-white/50">
        {chest.id}
      </div>

      <div className={`transition-transform duration-300 ${chest.status !== ChestStatus.CLOSED ? 'scale-110' : ''}`}>
        {content}
      </div>

      {isSelected && chest.status === ChestStatus.CLOSED && (
         <div className="absolute -bottom-3 bg-cyan-500 text-white text-[10px] uppercase font-black px-2 py-0.5 rounded shadow-sm">
           Your Pick
         </div>
      )}
    </div>
  );
};