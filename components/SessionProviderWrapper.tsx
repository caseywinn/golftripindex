"use client";

import { SessionProvider } from "next-auth/react";
import { UserItemsProvider } from "@/lib/userItems";

export default function SessionProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <UserItemsProvider>{children}</UserItemsProvider>
    </SessionProvider>
  );
}
