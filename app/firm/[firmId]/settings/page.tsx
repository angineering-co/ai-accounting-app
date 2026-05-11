import { getFirmSettings } from "@/lib/services/firm";
import { FirmSettingsForm } from "@/components/firm-settings-form";

export default async function FirmSettingsPage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = await params;
  const firm = await getFirmSettings(firmId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">設定</h1>
        <p className="text-muted-foreground text-base">
          管理事務所基本資料與報表申報資訊。儲存後將自動套用於 .TET_U 申報書。
        </p>
      </div>

      <FirmSettingsForm firm={firm} />
    </div>
  );
}
