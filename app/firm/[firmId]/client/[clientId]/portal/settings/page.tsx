"use client";

import { use } from "react";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { getClientSettings } from "@/lib/services/client-settings";
import { ClientSettingsSections } from "@/components/client-settings/client-settings-sections";

export default function PortalSettingsPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { clientId } = use(params);

  const {
    data: client,
    isLoading,
    mutate,
  } = useSWR(["client-settings", clientId], () => getClientSettings(clientId));

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!client) {
    return <div className="p-6 text-center">找不到客戶</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">設定</h1>
        <p className="text-sm text-muted-foreground">
          管理公司基本資料與相關設定。
        </p>
      </div>

      <ClientSettingsSections
        clientId={clientId}
        client={client}
        isPortal
        onSaveSuccess={() => mutate()}
      />
    </div>
  );
}
