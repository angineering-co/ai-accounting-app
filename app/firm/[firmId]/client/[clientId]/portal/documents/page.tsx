import { DocumentsView } from "@/components/documents-view";

// Portal (client) view of their own 其他文件. Same browse / upload / delete surface
// as the firm view in PR-1a; the proxy confines a client to their own clientId.
export default async function PortalDocumentsPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = await params;
  return <DocumentsView firmId={firmId} clientId={clientId} />;
}
