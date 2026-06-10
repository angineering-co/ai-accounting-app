import { DocumentsView } from "@/components/documents-view";

// Firm-staff view of a client's 其他文件. The proxy redirects portal clients off
// this (non-/portal) path to their own portal route, so this is staff-only.
export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = await params;
  return <DocumentsView firmId={firmId} clientId={clientId} />;
}
