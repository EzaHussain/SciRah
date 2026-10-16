export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading paper">
      <div className="skeleton mb-3 h-5 w-28" />
      <div className="skeleton mb-2 h-9 w-11/12" />
      <div className="skeleton mb-6 h-9 w-2/3" />
      <div className="skeleton mb-2 h-4 w-1/2" />
      <div className="skeleton mb-10 h-4 w-1/3" />
      <div className="skeleton mb-2 h-4 w-full max-w-2xl" />
      <div className="skeleton mb-2 h-4 w-full max-w-2xl" />
      <div className="skeleton h-4 w-3/4 max-w-2xl" />
    </div>
  );
}
