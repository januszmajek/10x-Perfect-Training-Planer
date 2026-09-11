import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { UserRound } from "lucide-react";

interface NavigationItem {
  href: string;
  label: string;
}

interface Props {
  currentPath: string;
  navigation: NavigationItem[];
}

function isActivePath(href: string, currentPath: string): boolean {
  if (href === "/workouts/new") {
    return currentPath === "/workouts/new" || currentPath === "/workouts/edit";
  }

  return currentPath === href || currentPath.startsWith(`${href}/`);
}

function subscribeToPortalTarget() {
  return () => undefined;
}

function getPortalTarget() {
  return document.body;
}

function getServerPortalTarget() {
  return null;
}

export default function MobileNavigation({ currentPath, navigation }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const portalTarget = useSyncExternalStore(subscribeToPortalTarget, getPortalTarget, getServerPortalTarget);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstNavigationLinkRef = useRef<HTMLAnchorElement>(null);

  function closeMenu(returnFocus = false) {
    setIsOpen(false);

    if (returnFocus) {
      menuButtonRef.current?.focus();
    }
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu(true);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    firstNavigationLinkRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    const closeAtDesktopBreakpoint = () => {
      if (window.matchMedia("(min-width: 640px)").matches) setIsOpen(false);
    };

    window.addEventListener("resize", closeAtDesktopBreakpoint);
    closeAtDesktopBreakpoint();
    return () => {
      window.removeEventListener("resize", closeAtDesktopBreakpoint);
    };
  }, []);

  return (
    <div className="sm:hidden">
      <button
        ref={menuButtonRef}
        type="button"
        aria-controls="mobile-navigation-drawer"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => {
          if (isOpen) {
            closeMenu(true);
          } else {
            setIsOpen(true);
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-lg text-blue-100/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
      >
        {isOpen ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-5"
          >
            <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="size-5"
          >
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {portalTarget &&
        createPortal(
          <div
            aria-hidden={!isOpen}
            inert={!isOpen}
            className={`fixed inset-0 z-[100] transition-opacity duration-300 motion-reduce:transition-none ${
              isOpen ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={() => {
                closeMenu(true);
              }}
              className="absolute inset-0 w-full bg-black/70 backdrop-blur-sm"
            />
            <aside
              id="mobile-navigation-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Private workspace navigation"
              className={`fixed top-0 left-0 z-10 flex h-dvh w-[min(20rem,calc(100vw-2rem))] flex-col bg-[#020617] p-4 shadow-2xl shadow-black/60 transition-transform duration-300 ease-out motion-reduce:transition-none ${
                isOpen ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <nav className="flex flex-col gap-1" aria-label="Private workspace">
                {navigation.map(({ href, label }, index) => (
                  <a
                    key={href}
                    ref={index === 0 ? firstNavigationLinkRef : undefined}
                    href={href}
                    aria-current={isActivePath(href, currentPath) ? "page" : undefined}
                    onClick={() => {
                      closeMenu();
                    }}
                    className={`rounded-lg px-4 py-3 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 ${
                      isActivePath(href, currentPath)
                        ? "bg-purple-500/20 text-purple-100"
                        : "text-blue-100/75 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {label}
                  </a>
                ))}
              </nav>

              <div className="mt-auto border-t border-white/10 pt-4">
                <a
                  href="/account"
                  onClick={() => {
                    closeMenu();
                  }}
                  className="flex items-center gap-3 rounded-lg px-4 py-3 text-base font-medium text-blue-100/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
                >
                  <span className="inline-flex size-8 items-center justify-center rounded-full bg-purple-500/25 text-purple-100">
                    <UserRound aria-hidden="true" className="size-4" />
                  </span>
                  Account
                </a>
              </div>
            </aside>
          </div>,
          portalTarget,
        )}
    </div>
  );
}
