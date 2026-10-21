import type { ReactNode } from "react";
import { useSession } from "../lib/session";
import { Avatar, Lock } from "./ui";

export interface Crumb {
  label: string;
  href?: string;
}

export function Layout({ crumbs, right, children, wide }: { crumbs: Crumb[]; right?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { identity, name, lock } = useSession();
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand small" href="#/" aria-label="Home">
          <span className="brand-mark">
            <Lock />
          </span>
        </a>
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={i} className="crumb">
              {i > 0 && <span className="crumb-sep">/</span>}
              {c.href ? <a href={c.href}>{c.label}</a> : <span aria-current="page">{c.label}</span>}
            </span>
          ))}
        </nav>
        <div className="topbar-right">
          {right}
          <a href="#/settings" className="me" title="Account and security">
            <Avatar id={identity.id} name={name} size={30} />
          </a>
          <button className="icon-btn" onClick={lock} title="Lock now" aria-label="Lock now">
            <Lock />
          </button>
        </div>
      </header>
      <main className={wide ? "page page-wide" : "page"}>{children}</main>
    </div>
  );
}
