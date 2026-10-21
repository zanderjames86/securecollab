import { useEffect, useState, useSyncExternalStore } from "react";
import type * as Y from "yjs";
import type { ConnectionStatus, EncryptedProvider } from "../sync/provider";

/** Live entries of a Y.Map, re-rendering on any change. */
export function useYMap<T>(map: Y.Map<T> | null | undefined): Array<[string, T]> {
  const [entries, setEntries] = useState<Array<[string, T]>>(() => (map ? [...map.entries()] : []));
  useEffect(() => {
    if (!map) {
      setEntries([]);
      return;
    }
    const update = () => setEntries([...map.entries()]);
    update();
    map.observe(update);
    return () => map.unobserve(update);
  }, [map]);
  return entries;
}

/** A single live value from a Y.Map. */
export function useYMapValue<T>(map: Y.Map<T> | null | undefined, key: string): T | undefined {
  const entries = useYMap(map);
  return entries.find(([k]) => k === key)?.[1];
}

export interface ProviderState {
  status: ConnectionStatus;
  synced: boolean;
  unsaved: number;
}

/** Connection status, first-sync flag and unsaved edit count of a provider. */
export function useProviderState(provider: EncryptedProvider | null | undefined): ProviderState {
  const [state, setState] = useState<ProviderState>(() => snapshot(provider));
  useEffect(() => {
    if (!provider) return;
    const update = () => setState(snapshot(provider));
    update();
    const offs = [provider.on("status", update), provider.on("synced", update)];
    // Unsaved count changes on local edits and acks; poll cheaply.
    const timer = setInterval(update, 700);
    return () => {
      offs.forEach((off) => off());
      clearInterval(timer);
    };
  }, [provider]);
  return state;
}

function snapshot(provider: EncryptedProvider | null | undefined): ProviderState {
  return provider
    ? { status: provider.status, synced: provider.synced, unsaved: provider.unsavedCount }
    : { status: "connecting", synced: false, unsaved: 0 };
}

/** The current location hash, e.g. "#/t/abc". */
export function useHash(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb);
      return () => window.removeEventListener("hashchange", cb);
    },
    () => location.hash,
  );
}

export function navigate(hash: string): void {
  if (location.hash !== hash) location.hash = hash;
}
