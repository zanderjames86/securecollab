import { createContext, useContext } from "react";
import type { Identity } from "@securecollab/crypto";
import type { OpenRoom } from "./rooms";

export interface Session {
  identity: Identity;
  name: string;
  keyring: OpenRoom;
  lock: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession used outside an unlocked session");
  return session;
}
