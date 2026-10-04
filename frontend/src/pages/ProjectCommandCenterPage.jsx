import React from "react";
import { useSearchParams } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import ProjectCommandCenter from "../components/intelligence/ProjectCommandCenter";

export default function ProjectCommandCenterPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get("projectId") || null;
  const workspaceId = searchParams.get("workspaceId") || null;

  return (
    <MainLayout>
      <ProjectCommandCenter projectId={projectId} workspaceId={workspaceId} />
    </MainLayout>
  );
}
