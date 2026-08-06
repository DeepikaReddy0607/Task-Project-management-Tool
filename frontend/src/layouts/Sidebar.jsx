function Sidebar() {
  return (
    <aside className="w-64 bg-slate-800 text-white p-5">
      <h2 className="text-lg font-semibold mb-6">Menu</h2>

      <ul className="space-y-4">
        <li>Dashboard</li>
        <li>Workspaces</li>
        <li>Projects</li>
        <li>Tasks</li>
        <li>Calendar</li>
        <li>Reports</li>
        <li>Notifications</li>
        <li>Profile</li>
      </ul>
    </aside>
  );
}

export default Sidebar;