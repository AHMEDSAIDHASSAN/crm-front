import * as React from "react"
import { cn } from "../../lib/utils"

interface PageCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  contentClassName?: string;
  headerClassName?: string;
}

export function PageCard({
  className,
  title,
  icon,
  headerActions,
  contentClassName,
  headerClassName,
  children,
  ...props
}: PageCardProps) {
  return (
    <div
      className={cn("page-section flex flex-col", className)}
      {...props}
    >
      {(title || icon || headerActions) && (
        <div className={cn("flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 p-4 sm:p-6", headerClassName)}>
          <div className="flex items-center gap-3">
            {icon && <div className="text-sira-gold shrink-0">{icon}</div>}
            {title && (
              <h2 className="section-title m-0">
                {title}
              </h2>
            )}
          </div>
          {headerActions && (
            <div className="flex items-center gap-2">
              {headerActions}
            </div>
          )}
        </div>
      )}
      <div className={cn("p-4 sm:p-6 flex-1", contentClassName)}>
        {children}
      </div>
    </div>
  )
}

