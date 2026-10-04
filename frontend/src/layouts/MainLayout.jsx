import { useState, useEffect } from "react";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import QuackieAssistant from "../components/assistant/QuackieAssistant";
import GlobalSearchModal from "../components/search/GlobalSearchModal";

function MainLayout({ children }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const closeMobileNavigation = () => {
    setMobileNavigationOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchModalOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen">
      <div className="relative flex min-h-screen">
        <Sidebar isOpen={mobileNavigationOpen} onClose={closeMobileNavigation} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar
            mobileNavigationOpen={mobileNavigationOpen}
            onMenuToggle={() => setMobileNavigationOpen((isOpen) => !isOpen)}
            onOpenSearch={() => setSearchModalOpen(true)}
          />

          <main className="taskflow-page-enter flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>

      {/* Global Search & Command Modal (Ctrl/Cmd + K) */}
      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />

      {/* Globally available Quackie Assistant */}
      <QuackieAssistant />
    </div>
  );
}

export default MainLayout;
