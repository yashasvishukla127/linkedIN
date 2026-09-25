"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabaseClient";
import { getUnreadMessageCount } from "@/lib/api";
import { usePendingConnections } from "@/hooks/usePendingConnections";
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
    "relative flex h-9 w-9 items-center justify-center rounded-full text-cream/70 transition-colors hover:bg-cream/10 hover:text-terracotta";

  const badge = badgeCount ? (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 font-sans text-[10px] font-medium leading-none text-ink">
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

function AvatarMenu() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setAvatarUrl(data?.avatar_url ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-cream/10 text-cream/70 transition-colors hover:border-terracotta/50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt="Your profile"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-cream/10" />
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-10 w-40 overflow-hidden rounded-xl border border-[#30382B] bg-ink shadow-lg"
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 font-sans text-sm text-cream/80 transition-colors hover:bg-cream/10 hover:text-cream"
          >
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="block w-full px-4 py-2 text-left font-sans text-sm text-cream/80 transition-colors hover:bg-cream/10 hover:text-cream"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NetworkMenu() {
  const {
    incoming,
    sent,
    profiles,
    acceptStatuses,
    cancelStatuses,
    errors,
    handleAccept,
    handleCancel,
  } = usePendingConnections();
  const [open, setOpen] = useState(false);

  const className =
    "relative flex h-9 w-9 items-center justify-center rounded-full text-cream/70 transition-colors hover:bg-cream/10 hover:text-terracotta";

  const badge = incoming.length ? (
    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-terracotta px-1 font-sans text-[10px] font-medium leading-none text-ink">
      {incoming.length > 99 ? "99+" : incoming.length}
    </span>
  ) : null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link href="/network" className={className}>
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
        {badge}
      </Link>

      {open ? (
        <div className="absolute right-0 top-11 z-10 flex w-80 gap-4 rounded-xl border border-[#30382B] bg-ink p-4 shadow-lg">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h3 className="font-sans text-xs font-medium uppercase tracking-wide text-cream/50">
              Incoming
            </h3>
            {incoming.length === 0 ? (
              <p className="font-sans text-xs text-cream/50">Nothing pending.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {incoming.map((r) => {
                  const status = acceptStatuses[r.other_user_id] ?? "idle";
                  return (
                    <li key={r.id} className="flex min-w-0 items-center justify-between gap-2">
                      <NetworkProfile profile={profiles[r.other_user_id]} />
                      <button
                        type="button"
                        disabled={status === "accepting"}
                        onClick={() => handleAccept(r.other_user_id)}
                        className="shrink-0 rounded-full bg-terracotta px-2.5 py-1 font-sans text-xs font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {status === "accepting"
                          ? "…"
                          : status === "error"
                            ? "Retry"
                            : "Accept"}
                      </button>
                      {status === "error" && errors[r.other_user_id] ? (
                        <p className="w-full font-sans text-[10px] text-red-400" role="alert">
                          {errors[r.other_user_id]}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h3 className="font-sans text-xs font-medium uppercase tracking-wide text-cream/50">
              Outgoing
            </h3>
            {sent.length === 0 ? (
              <p className="font-sans text-xs text-cream/50">Nothing sent.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sent.map((r) => {
                  const status = cancelStatuses[r.other_user_id] ?? "idle";
                  return (
                    <li key={r.id} className="flex min-w-0 items-center justify-between gap-2">
                      <NetworkProfile profile={profiles[r.other_user_id]} />
                      <button
                        type="button"
                        disabled={status === "accepting"}
                        onClick={() => handleCancel(r.other_user_id)}
                        className="shrink-0 rounded-full border border-cream/20 px-2.5 py-1 font-sans text-xs font-medium text-cream/80 transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {status === "accepting"
                          ? "…"
                          : status === "error"
                            ? "Retry"
                            : "Cancel"}
                      </button>
                      {status === "error" && errors[r.other_user_id] ? (
                        <p className="w-full font-sans text-[10px] text-red-400" role="alert">
                          {errors[r.other_user_id]}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NetworkProfile({
  profile,
}: {
  profile: { name: string; avatar_url: string | null } | undefined;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="h-6 w-6 shrink-0 rounded-full bg-cream/10" />
      )}
      <span className="truncate font-sans text-xs text-cream/80">
        {profile?.name ?? "Unknown user"}
      </span>
    </div>
  );
}

export function Navbar() {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadUnread() {
      try {
        const { count } = await getUnreadMessageCount();
        if (!cancelled) setUnreadCount(count);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }

    if (!session?.user.id) {
      setUnreadCount(0);
      return;
    }

    loadUnread();
    const interval = setInterval(loadUnread, 15000);
    window.addEventListener("focus", loadUnread);
    window.addEventListener("messages:read", loadUnread);
    window.addEventListener("messages:received", loadUnread);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", loadUnread);
      window.removeEventListener("messages:read", loadUnread);
      window.removeEventListener("messages:received", loadUnread);
    };
  }, [session?.user.id]);

  return (
  <header className="flex h-[68px] w-full items-center border-b border-[#30382B] bg-ink px-6 sm:px-10">
    
    {/* Brand */}
  
      <Link
        href="/"
        className="flex shrink-0 items-center gap-3 rounded-lg transition-opacity hover:opacity-85"
        aria-label="Go to Zorro-X home"
      >
        <Image
          src="/z5.png"
          alt="Zorro-X"
          width={62}
          height={62}
          className="rounded-xl object-contain"
        />

        <span className="font-serif text-[20px] font-semibold tracking-[-0.02em] text-cream">
          Zorro-X
        </span>
      </Link>

    {/* Search */}
    <div className="mx-auto w-full max-w-md px-6">
      <SearchBar />
    </div>

    {/* Right actions */}
    <div className="flex shrink-0 items-center gap-1">
      <IconSlot href="/people">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="h-5 w-5"
        >
          <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M4.5 20c1-3.8 4-6 7.5-6s6.5 2.2 7.5 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </IconSlot>

      <NetworkMenu />

      <IconSlot href="/messages" badgeCount={unreadCount}>
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

      <AvatarMenu />
    </div>
  </header>
);
}
