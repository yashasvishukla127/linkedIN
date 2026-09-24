"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { listPendingConnections } from "@/lib/api";
import { SearchBar } from "./SearchBar";

function IconSlot({
  children,
  href,
  badgeCount,
}: {
  children: React.ReactNode;
  href?: string;
  badgeCount?: number;
}) {
  const className =
    "relative flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-paper)]/70 transition-colors hover:bg-[var(--color-paper)]/10 hover:text-[var(--color-paper)]";

  const badge = badgeCount ? (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-flare)] px-1 text-[10px] font-medium leading-none text-[var(--color-ink)]">
      {badgeCount > 99 ? "99+" : badgeCount}
    </span>
  ) : null;

  if (!href) {
    return (
      <span className={className}>
        {children}
        {badge}
      </span>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
      {badge}
    </Link>
  );
}

export function Navbar() {
  const { session } = useAuth();
  const [incomingCount, setIncomingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const pending = await listPendingConnections();
        if (cancelled) return;
        setIncomingCount(
          pending.filter((r) => r.direction === "incoming").length,
        );
      } catch {
        if (!cancelled) setIncomingCount(0);
      }
    }

    if (session?.user.id) load();
    else setIncomingCount(0);

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  return (
    <header className="flex h-16 w-full items-center gap-4 border-b border-[var(--color-line-dark)] bg-[var(--color-ink)] px-4 sm:px-6">
      <div className="flex shrink-0 items-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-paper)]">
          <Image
            src="/logo-icon.png"
            alt="Zorro-X"
            width={44}
            height={44}
            className="rounded-full"
          />
        </span>
      </div>

      <div className="mx-auto w-full max-w-md">
        <SearchBar />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <IconSlot href="/network" badgeCount={incomingCount}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5"
          >
            <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="17" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M2.5 20c.7-3 3-5 4.5-5s3.8 2 4.5 5M12.5 20c.7-3 3-5 4.5-5s3.8 2 4.5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </IconSlot>

        <IconSlot>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5"
          >
            <path
              d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v9a2.5 2.5 0 0 1-2.5 2.5H8l-4.5 4v-4A2.5 2.5 0 0 1 3 15.5v-9Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </IconSlot>
      </div>
    </header>
  );
}
