export function ProposalPageError({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="glass rounded-2xl border border-red-200/50 bg-red-50/60 p-6 shadow-lg shadow-red-500/5 dark:border-red-900/40 dark:bg-red-950/20">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-red-700 dark:text-red-300">
          {title}
        </h1>
        <p className="text-sm text-red-600/80 dark:text-red-400/80">
          {message}
        </p>
      </div>
    </div>
  );
}
