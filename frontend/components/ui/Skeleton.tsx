export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-[#242424] border border-[#E4E2DC] dark:border-[#3A3A3A] p-4 animate-pulse">
      <div className="h-3 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-16 mb-3 rounded" />
      <div className="h-8 bg-[#E4E2DC] dark:bg-[#3A3A3A] w-12 rounded" />
    </div>
  );
}

export function SkeletonTableRow({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-[#E4E2DC] dark:border-[#3A3A3A]">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <div 
            className="h-4 bg-[#E4E2DC] dark:bg-[#3A3A3A] rounded animate-pulse" 
            style={{ width: i === 0 ? '6rem' : i === 1 ? '4rem' : '2rem', marginLeft: i > 1 ? 'auto' : undefined }}
          />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonText({ width = '100%', height = '1rem' }: { width?: string; height?: string }) {
  return (
    <div 
      className="bg-[#E4E2DC] dark:bg-[#3A3A3A] rounded animate-pulse" 
      style={{ width, height }}
    />
  );
}

export function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <svg 
      className={`animate-spin ${className}`} 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
