import { redirect } from "next/navigation";

export default async function FirmPage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = await params;
  redirect(`/firm/${firmId}/dashboard`);
}

