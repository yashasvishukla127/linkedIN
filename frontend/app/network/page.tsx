"use client";

import RequestsPanel from "@/components/RequestsPanel";

export default function NetworkPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Network
      </h1>
      <RequestsPanel />
    </div>
  );
}
