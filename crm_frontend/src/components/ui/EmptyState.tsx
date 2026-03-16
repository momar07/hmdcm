interface EmptyStateProps {
  title:       string;
  description?: string;
  icon?:       React.ReactNode;
  action?:     React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center
                    py-16 text-center px-4">
      {icon && (
        <div className="w-14 h-14 rounded-full bg-gray-100
                        flex items-center justify-center mb-4 text-gray-400">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
