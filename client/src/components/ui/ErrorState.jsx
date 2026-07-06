export default function ErrorState({
  message = 'Something went wrong',
  onRetry,
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <span className="text-5xl mb-4" aria-hidden="true">⚠️</span>
      <h3 className="text-xl font-semibold text-netflix-text mb-2">Error</h3>
      <p className="text-netflix-text-2 max-w-md mb-6">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary">
          Try Again
        </button>
      )}
    </div>
  );
}
