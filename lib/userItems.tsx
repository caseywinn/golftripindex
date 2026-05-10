"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSession } from "next-auth/react";

type ItemStatus = "wishlist" | "played";

interface UserItemsContextValue {
  getStatus: (itemType: string, itemId: string) => ItemStatus | null;
  setStatus: (
    itemType: string,
    itemId: string,
    status: ItemStatus | null
  ) => Promise<void>;
  loading: boolean;
}

const UserItemsContext = createContext<UserItemsContextValue>({
  getStatus: () => null,
  setStatus: async () => {},
  loading: false,
});

export function UserItemsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const [items, setItems] = useState<Map<string, ItemStatus>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      setItems(new Map());
      return;
    }
    setLoading(true);
    fetch("/api/user/items")
      .then((r) => r.json())
      .then((data) => {
        const map = new Map<string, ItemStatus>();
        for (const item of data.items ?? []) {
          map.set(`${item.itemType}:${item.itemId}`, item.status);
        }
        setItems(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.user?.id]);

  const getStatus = useCallback(
    (itemType: string, itemId: string): ItemStatus | null =>
      items.get(`${itemType}:${itemId}`) ?? null,
    [items]
  );

  const setStatus = useCallback(
    async (
      itemType: string,
      itemId: string,
      status: ItemStatus | null
    ): Promise<void> => {
      const key = `${itemType}:${itemId}`;
      setItems((prev) => {
        const next = new Map(prev);
        if (status === null) next.delete(key);
        else next.set(key, status);
        return next;
      });
      await fetch("/api/user/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType, itemId, status }),
      });
    },
    []
  );

  return (
    <UserItemsContext.Provider value={{ getStatus, setStatus, loading }}>
      {children}
    </UserItemsContext.Provider>
  );
}

export function useUserItems() {
  return useContext(UserItemsContext);
}
