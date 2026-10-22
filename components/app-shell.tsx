"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { Sidebar, TopBar } from "./chrome";
import { isRtlLanguage } from "@/lib/i18n";
import { useT } from "@/lib/use-i18n";

/**
 * Application chrome: a persistent sidebar on large screens and a slide-in
 * drawer on small ones.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, language } = useT();
  const rtl = isRtlLanguage(language);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh border-e border-border/70 bg-card/30 backdrop-blur-sm lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen ? (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 start-0 z-50 w-[280px] border-e border-border bg-background lg:hidden"
              initial={{ x: rtl ? 300 : -300 }}
              animate={{ x: 0 }}
              exit={{ x: rtl ? 300 : -300 }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
            >
              <button
                onClick={() => setMenuOpen(false)}
                aria-label={t("chrome.closeNav")}
                className="focus-ring absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <Sidebar onNavigate={() => setMenuOpen(false)} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
