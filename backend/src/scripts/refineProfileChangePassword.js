import fs from "node:fs";

console.log("Refining Profile page & Sidebar to eliminate duplicate Change Password entry points...");

// 1. Profile.jsx
let p = fs.readFileSync("frontend/src/pages/profile/Profile.jsx", "utf8");
const isCrlfP = p.includes("\r\n");
let normalizedP = p.replace(/\r\n/g, "\n");

const oldHeader = `                <PageHeader
                    title={pageTitle}
                    description="Manage your personal details and account preferences."
                    actions={
                        <Link to="/profile/change-password">
                            <Button variant="secondary">
                                <FiKey size={16} />
                                Change password
                            </Button>
                        </Link>
                    }
                />`;

const newHeader = `                <PageHeader
                    title={pageTitle}
                    description="Manage your personal details and account preferences."
                />`;

if (normalizedP.includes(oldHeader)) {
    normalizedP = normalizedP.replace(oldHeader, newHeader);
    if (isCrlfP) normalizedP = normalizedP.replace(/\n/g, "\r\n");
    fs.writeFileSync("frontend/src/pages/profile/Profile.jsx", normalizedP, "utf8");
    console.log("Successfully removed top-right Change password button from Profile.jsx");
} else {
    console.error("Could not find oldHeader in Profile.jsx");
}

// 2. Sidebar.jsx
let s = fs.readFileSync("frontend/src/layouts/Sidebar.jsx", "utf8");
const isCrlfS = s.includes("\r\n");
let normalizedS = s.replace(/\r\n/g, "\n");

// Remove FiLock import
normalizedS = normalizedS.replace("  FiLock,\n", "");

// Remove Change Password item from accountNavigation
const oldAccountNav = `const accountNavigation = [
  { label: "Profile", icon: FiUser, path: "/profile" },
  { label: "Settings", icon: FiSettings, path: "/settings" },
  { label: "Change Password", icon: FiLock, path: "/profile/change-password" },
];`;

const newAccountNav = `const accountNavigation = [
  { label: "Profile", icon: FiUser, path: "/profile" },
  { label: "Settings", icon: FiSettings, path: "/settings" },
];`;

if (normalizedS.includes(oldAccountNav)) {
    normalizedS = normalizedS.replace(oldAccountNav, newAccountNav);
    if (isCrlfS) normalizedS = normalizedS.replace(/\n/g, "\r\n");
    fs.writeFileSync("frontend/src/layouts/Sidebar.jsx", normalizedS, "utf8");
    console.log("Successfully removed Change Password item from Sidebar.jsx");
} else {
    console.error("Could not find oldAccountNav in Sidebar.jsx");
}

console.log("Refinement script completed.");
