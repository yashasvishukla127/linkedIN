"use client";

import Link from "next/link";
import AvatarUploader from "@/components/AvatarUploader";

export default function ProfilePage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Profile
        </h1>
        <Link href="/" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
          Back to dashboard
        </Link>
      </div>
      <AvatarUploader />
    </div>
  );
}
