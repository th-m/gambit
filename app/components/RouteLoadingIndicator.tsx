/**
 * Route Loading Indicator Component
 *
 * Provides consistent loading states for route transitions and
 * lazy-loaded components. Used as a Suspense fallback.
 */

// =============================================================================
// Full Page Loading Spinner
// =============================================================================

export function PageLoadingIndicator() {
  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" />
        <p className="text-stone-400 text-sm animate-pulse">Loading...</p>
      </div>
    </div>
  );
}

// =============================================================================
// Game Loading Skeleton
// =============================================================================

export function GameLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-stone-900 text-white p-4">
      {/* Header skeleton */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-32 bg-stone-800 rounded animate-pulse" />
          <div className="h-8 w-24 bg-stone-800 rounded animate-pulse" />
        </div>

        {/* Main content grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main game area */}
          <div className="lg:col-span-3 space-y-4">
            {/* Score board skeleton */}
            <div className="bg-stone-800/50 rounded-lg p-4">
              <div className="flex justify-center gap-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-10 h-10 bg-stone-700 rounded-full animate-pulse"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
            </div>

            {/* Phase content skeleton */}
            <div className="bg-stone-800/50 rounded-lg p-8">
              <div className="flex flex-col items-center gap-4">
                <div className="h-6 w-48 bg-stone-700 rounded animate-pulse" />
                <div className="h-4 w-64 bg-stone-700 rounded animate-pulse" />
                <div className="flex gap-4 mt-4">
                  <div className="h-12 w-32 bg-stone-700 rounded animate-pulse" />
                  <div className="h-12 w-32 bg-stone-700 rounded animate-pulse" />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar skeleton */}
          <div className="space-y-4">
            {/* Character info skeleton */}
            <div className="bg-stone-800/50 rounded-lg p-4">
              <div className="h-5 w-24 bg-stone-700 rounded animate-pulse mb-3" />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-stone-700 rounded-lg animate-pulse" />
                <div className="flex-1">
                  <div className="h-4 w-20 bg-stone-700 rounded animate-pulse mb-2" />
                  <div className="h-3 w-16 bg-stone-700 rounded animate-pulse" />
                </div>
              </div>
              <div className="h-3 w-full bg-stone-700 rounded animate-pulse" />
            </div>

            {/* Player list skeleton */}
            <div className="bg-stone-800/50 rounded-lg p-4">
              <div className="h-5 w-16 bg-stone-700 rounded animate-pulse mb-3" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="w-8 h-8 bg-stone-700 rounded-full animate-pulse" />
                    <div className="h-4 flex-1 bg-stone-700 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Lobby Loading Skeleton
// =============================================================================

export function LobbyLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-stone-900 text-white p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="h-8 w-32 bg-stone-800 rounded animate-pulse" />
          <div className="h-8 w-24 bg-stone-800 rounded animate-pulse" />
        </div>

        {/* Game code card */}
        <div className="bg-stone-800/50 rounded-lg p-6 mb-6 text-center">
          <div className="h-4 w-24 bg-stone-700 rounded animate-pulse mx-auto mb-3" />
          <div className="h-12 w-48 bg-stone-700 rounded animate-pulse mx-auto mb-4" />
          <div className="h-10 w-32 bg-stone-700 rounded animate-pulse mx-auto" />
        </div>

        {/* Player list card */}
        <div className="bg-stone-800/50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 w-16 bg-stone-700 rounded animate-pulse" />
            <div className="h-5 w-12 bg-stone-700 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 bg-stone-700/50 rounded-lg animate-pulse"
                style={{ animationDelay: `${i * 75}ms` }}
              >
                <div className="w-10 h-10 bg-stone-600 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 w-20 bg-stone-600 rounded mb-1" />
                  <div className="h-3 w-12 bg-stone-600 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-4 mt-6">
          <div className="h-12 flex-1 bg-stone-800 rounded animate-pulse" />
          <div className="h-12 w-32 bg-stone-800 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Inline Loading Spinner
// =============================================================================

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-3',
  };

  return (
    <div
      className={`${sizeClasses[size]} border-stone-600 border-t-blue-500 rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// =============================================================================
// Route Transition Progress Bar
// =============================================================================

export function RouteProgressBar({ isLoading }: { isLoading: boolean }) {
  if (!isLoading) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-stone-800 overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-[progress_1.5s_ease-in-out_infinite]"
        style={{
          backgroundSize: '200% 100%',
        }}
      />
      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

// =============================================================================
// Component Loading Boundary
// =============================================================================

interface ComponentLoadingBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function ComponentLoadingBoundary({
  children,
  fallback = <LoadingSpinner size="md" />,
}: ComponentLoadingBoundaryProps) {
  return (
    <div className="flex items-center justify-center min-h-[200px]">
      {children || fallback}
    </div>
  );
}
