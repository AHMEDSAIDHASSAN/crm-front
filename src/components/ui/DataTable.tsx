import * as React from "react"
import { cn } from "../../lib/utils"
import { Loader2 } from "lucide-react"

interface DataTableProps<T> {
  data: T[]
  columns: {
    header: string
    className?: string
    accessor?: keyof T | ((item: T) => React.ReactNode)
  }[]
  loading?: boolean
  emptyMessage?: string
  onRowClick?: (item: T) => void
  rowClassName?: string | ((item: T) => string)
  renderCustomRow?: (item: T, index: number) => React.ReactNode
}

export function DataTable<T>({
  data,
  columns,
  loading,
  emptyMessage = "No data found",
  onRowClick,
  rowClassName,
  renderCustomRow,
}: DataTableProps<T>) {
  if (loading && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-foreground/40 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-sira-gold" />
        <p className="text-[10px] font-black uppercase tracking-widest">Loading data...</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-[2rem] border-2 border-dashed border-slate-200 py-20 text-center bg-slate-50/50">
        <p className="text-sm text-foreground/40 font-medium">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="relative overflow-x-auto custom-scrollbar">
      <table className="w-full border-collapse text-start text-sm">
        <thead>
          <tr className="border-b border-sira-border/60 bg-muted/30">
            {columns.map((col, i) => (
              <th
                key={i}
                className={cn(
                  "px-4 py-3 text-start text-[10px] font-black uppercase tracking-widest text-foreground/60 transition-colors",
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {data.map((item, idx) => {
            if (renderCustomRow) return renderCustomRow(item, idx)

            const computedRowClass = typeof rowClassName === "function" ? rowClassName(item) : rowClassName

            return (
              <tr
                key={idx}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  "group transition-colors",
                  onRowClick && "cursor-pointer hover:bg-muted/40",
                  computedRowClass
                )}
              >
                {columns.map((col, i) => {
                  let content: React.ReactNode = null
                  if (typeof col.accessor === "function") {
                    content = col.accessor(item)
                  } else if (col.accessor) {
                    content = (item[col.accessor] as React.ReactNode)
                  }

                  return (
                    <td
                      key={i}
                      className={cn(
                        "px-4 py-3 text-xs text-foreground/90 transition-colors group-hover:text-foreground",
                        col.className
                      )}
                    >
                      {content}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

