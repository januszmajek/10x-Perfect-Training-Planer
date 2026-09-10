import type { ComponentType, SVGProps } from "react";
import { Dumbbell, History, LayoutDashboard, UserRound } from "lucide-react";

interface NavigationItem {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface Props {
  currentPath: string;
  workoutRoute: boolean;
}

const navigation: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/workouts/new", label: "Workout", Icon: Dumbbell },
  { href: "/history", label: "History", Icon: History },
];

function isActivePath(href: string, currentPath: string): boolean {
  if (href === "/workouts/new") {
    return currentPath === "/workouts/new" || currentPath === "/workouts/edit";
  }

  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function accountLink(compact: boolean) {
  return (
    <a
      href="/account"
      aria-label={compact ? "Account" : undefined}
      className={
        compact
          ? "group relative inline-flex size-11 items-center justify-center rounded-xl text-blue-100/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
          : "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-blue-100/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
      }
    >
      <span className="inline-flex size-8 items-center justify-center rounded-full bg-purple-500/25 text-purple-100">
        <UserRound aria-hidden="true" className="size-4" />
      </span>
      {!compact && <span>Account</span>}
      {compact && <span className="sidebar-tooltip">Account</span>}
    </a>
  );
}

function primaryLinks(currentPath: string, compact: boolean) {
  return navigation.map(({ href, label, Icon }) => {
    const active = isActivePath(href, currentPath);
    return (
      <a
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={compact ? label : undefined}
        className={
          compact
            ? `group relative inline-flex size-11 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 ${
                active ? "bg-purple-500/20 text-purple-100" : "text-blue-100/75 hover:bg-white/10 hover:text-white"
              }`
            : `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 ${
                active ? "bg-purple-500/20 text-purple-100" : "text-blue-100/75 hover:bg-white/10 hover:text-white"
              }`
        }
      >
        <Icon aria-hidden="true" className="size-5" />
        {!compact && <span>{label}</span>}
        {compact && <span className="sidebar-tooltip">{label}</span>}
      </a>
    );
  });
}

export default function SidebarNavigation({ currentPath, workoutRoute }: Props) {
  return (
    <>
      <aside
        className={`sticky top-0 hidden h-dvh w-64 shrink-0 self-start overflow-hidden border-r border-white/10 bg-slate-950/70 px-4 py-5 backdrop-blur-xl xl:flex ${
          workoutRoute ? "xl:hidden" : ""
        }`}
      >
        <a
          href="/dashboard"
          className="rounded-sm px-2 text-center text-sm leading-tight font-semibold tracking-tight text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-300"
        >
          Perfect Training Planner
        </a>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Private workspace">
          {primaryLinks(currentPath, false)}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-4">{accountLink(false)}</div>
      </aside>

      <aside
        className={`sticky top-0 hidden h-dvh w-20 shrink-0 self-start overflow-hidden border-r border-white/10 bg-slate-950/70 px-3 py-5 backdrop-blur-xl sm:flex ${
          workoutRoute ? "" : "xl:hidden"
        }`}
      >
        <a
          href="/dashboard"
          aria-label="Perfect Training Planner"
          className="inline-flex size-11 items-center justify-center rounded-xl bg-purple-500/20 text-lg font-bold text-purple-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
        >
          PTP
        </a>
        <nav className="mt-8 flex flex-col items-center gap-2" aria-label="Private workspace">
          {primaryLinks(currentPath, true)}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-4">{accountLink(true)}</div>
      </aside>
    </>
  );
}
