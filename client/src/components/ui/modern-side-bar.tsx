"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  FileText,
  Home,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { useLocation } from "wouter";

interface NavigationItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
}

interface SidebarProps {
  className?: string;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
  role?: "admin" | "student";
}

const adminNavigationItems: NavigationItem[] = [
  { id: "dashboard", name: "Dashboard", icon: Home, href: "/admin" },
  { id: "quizzes", name: "Manage Quizzes", icon: FileText, href: "/admin/quizzes" },
  { id: "leaderboard", name: "Leaderboard", icon: BarChart3, href: "/admin/leaderboard" },
  { id: "history", name: "History", icon: Bell, href: "/history" }
];

const studentNavigationItems: NavigationItem[] = [
  { id: "quizzes", name: "Quizzes", icon: FileText, href: "/" },
  { id: "history", name: "History", icon: Bell, href: "/history" }
];

const getInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "AD";

export function Sidebar({
  className = "",
  userName = "Admin User",
  userRole = "Administrator",
  onLogout,
  role = "admin"
}: SidebarProps) {
  const [location, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const navigationItems = role === "admin" ? adminNavigationItems : studentNavigationItems;

  useEffect(() => {
    const handleResize = () => {
      setIsOpen(window.innerWidth >= 768);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => setIsOpen((value) => !value);
  const handleItemClick = (href: string) => {
    navigate(href);
    if (window.innerWidth < 768) setIsOpen(false);
  };

  const isDesktopExpanded = isHovered;
  const showExpanded = typeof window !== "undefined" && window.innerWidth >= 768 ? isDesktopExpanded : isOpen;

  return (
    <>
      <button
        onClick={toggleSidebar}
        className="fixed left-4 top-4 z-50 rounded-xl border border-slate-200 bg-white p-3 shadow-md transition-all duration-200 hover:bg-slate-50 md:hidden"
        aria-label="Toggle sidebar"
      >
        {isOpen ? <X className="h-5 w-5 text-slate-600" /> : <Menu className="h-5 w-5 text-slate-600" />}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-sm md:hidden"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={[
          "fixed left-0 top-0 z-40 flex h-full flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out md:sticky md:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          showExpanded ? "w-[19.5rem]" : "w-24",
          className
        ].join(" ")}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/60 p-5">
          {showExpanded ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-400 text-white shadow-sm">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-800">TestNova</div>
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {role === "admin" ? "Admin Console" : "Student Portal"}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-sky-400 text-white shadow-sm">
              <BarChart3 className="h-5 w-5" />
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/"
                  ? location === "/"
                  : location === item.href || location.startsWith(item.href);

              return (
                <li key={item.id}>
                  <button
                    onClick={() => handleItemClick(item.href)}
                    className={[
                      "group relative flex w-full items-center rounded-xl px-3 py-3 text-left transition-all duration-200",
                      isActive
                        ? "bg-blue-50 text-blue-700 shadow-sm"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      showExpanded ? "gap-3" : "justify-center px-2"
                    ].join(" ")}
                    title={!showExpanded ? item.name : undefined}
                  >
                    <div className="flex min-w-[24px] items-center justify-center">
                      <Icon
                        className={[
                          "h-[18px] w-[18px] flex-shrink-0 transition-colors duration-200",
                          isActive ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700"
                        ].join(" ")}
                      />
                    </div>

                    {showExpanded && (
                      <div className="flex w-full items-center justify-between">
                        <span className={isActive ? "text-sm font-medium" : "text-sm"}>{item.name}</span>
                        {item.badge && (
                          <span
                            className={[
                              "rounded-full px-1.5 py-0.5 text-xs font-medium",
                              isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                            ].join(" ")}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}

                    {!showExpanded && item.badge && (
                      <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-blue-100">
                        <span className="text-[10px] font-medium text-blue-700">
                          {parseInt(item.badge, 10) > 9 ? "9+" : item.badge}
                        </span>
                      </div>
                    )}

                    {!showExpanded && (
                      <div className="invisible absolute left-full ml-2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-white opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                        {item.name}
                        <div className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-x-1 -translate-y-1/2 rotate-45 bg-slate-800" />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto border-t border-slate-200">
          <div className={showExpanded ? "border-b border-slate-200 bg-slate-50/30 p-3" : "border-b border-slate-200 bg-slate-50/30 px-2 py-3"}>
            {showExpanded ? (
              <div className="rounded-xl bg-white px-3 py-2.5 transition-colors duration-200 hover:bg-slate-50">
                <div className="flex items-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200">
                    <span className="text-sm font-medium text-slate-700">{getInitials(userName)}</span>
                  </div>
                  <div className="ml-3 min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{userName}</p>
                    <p className="truncate text-xs text-slate-500">{userRole}</p>
                  </div>
                  <div className="ml-2 h-2.5 w-2.5 rounded-full bg-emerald-500" title="Online" />
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200">
                    <span className="text-sm font-medium text-slate-700">{getInitials(userName)}</span>
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                </div>
              </div>
            )}
          </div>

          <div className="p-3">
            <button
              onClick={onLogout}
              className={[
                "group relative flex w-full items-center rounded-xl text-left text-red-600 transition-all duration-200 hover:bg-red-50 hover:text-red-700",
                showExpanded ? "gap-3 px-3 py-3" : "justify-center p-3"
              ].join(" ")}
              title={!showExpanded ? "Logout" : undefined}
            >
              <div className="flex min-w-[24px] items-center justify-center">
                <LogOut className="h-[18px] w-[18px] flex-shrink-0 text-red-500 transition-colors duration-200 group-hover:text-red-600" />
              </div>
              {showExpanded && <span className="text-sm font-medium">Logout</span>}
              {!showExpanded && (
                <div className="invisible absolute left-full ml-2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-white opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                  Logout
                  <div className="absolute left-0 top-1/2 h-1.5 w-1.5 -translate-x-1 -translate-y-1/2 rotate-45 bg-slate-800" />
                </div>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
