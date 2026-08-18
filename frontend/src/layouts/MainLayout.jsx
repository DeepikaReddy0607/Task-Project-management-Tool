import { useState } from "react";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

function MainLayout({ children }) {
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  const closeMobileNavigation = () => {
    setMobileNavigationOpen(false);
  };

  return (
    <div className="min-h-screen">
      <div className="relative flex min-h-screen">
        <Sidebar isOpen={mobileNavigationOpen} onClose={closeMobileNavigation} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar
            mobileNavigationOpen={mobileNavigationOpen}
            onMenuToggle={() => setMobileNavigationOpen((isOpen) => !isOpen)}
          />

          <main className="taskflow-page-enter flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default MainLayout;
