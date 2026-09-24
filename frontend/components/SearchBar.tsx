export function SearchBar() {
  return (
    <div className="flex w-full items-center gap-2 rounded-full border border-[var(--color-line-dark)] bg-[var(--color-ink)] px-4 py-2 focus-within:border-[var(--color-flare)]">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="h-4 w-4 shrink-0 text-[var(--color-paper)]/50"
      >
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M17 17l-3.5-3.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <input
        type="search"
        placeholder="Search"
        disabled
        className="w-full bg-transparent font-[var(--font-body)] text-sm text-[var(--color-paper)] placeholder:text-[var(--color-paper)]/50 focus:outline-none disabled:cursor-default"
      />
    </div>
  );
}
