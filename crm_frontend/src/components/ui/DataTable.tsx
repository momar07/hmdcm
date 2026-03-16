import clsx from 'clsx';

export interface Column<T> {
  key:       string;
  header:    string;
  render?:   (row: T) => React.ReactNode;
  className?: string;
  width?:    string;
}

interface DataTableProps<T> {
  columns:    Column<T>[];
  data:       T[];
  keyField:   keyof T;
  isLoading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyField,
  isLoading  = false,
  emptyText  = 'No records found.',
  onRowClick,
  className,
}: DataTableProps<T>) {
  return (
    <div className={clsx('overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm', className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  className={clsx(
                    'px-4 py-3 text-left text-xs font-semibold',
                    'text-gray-500 uppercase tracking-wider',
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center"
                >
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <div className="w-6 h-6 border-2 border-blue-500
                                    border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-gray-400"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={String(row[keyField])}
                  onClick={() => onRowClick?.(row)}
                  className={clsx(
                    'transition-colors duration-100',
                    onRowClick && 'cursor-pointer hover:bg-gray-50'
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={clsx(
                        'px-4 py-3 text-sm text-gray-700',
                        col.className
                      )}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
