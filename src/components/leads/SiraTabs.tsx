import React from 'react';
import { cn } from '../../lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SiraTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const SiraTabs: React.FC<SiraTabsProps> = ({ tabs, activeTab, onChange, className }) => {
  return (
    <div className={cn("border-b border-sira-border", className)}>
      <div className="flex -mb-px overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative shrink-0 flex-1 px-3 py-3 text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 sm:px-6 sm:py-4 sm:text-[11px] sm:tracking-[0.2em]",
                activeTab === tab.id
                  ? "text-sira-brown"
                  : "text-sira-text-muted hover:text-sira-text-secondary"
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-sira-brown rounded-t-full shadow-[0_-2px_10px_rgba(77,45,43,0.3)] anim-slide-in" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
