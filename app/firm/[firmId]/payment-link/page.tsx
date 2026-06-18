import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { getFirmPayments } from "@/lib/services/payment-link";
import { getSiteBaseUrl } from "@/lib/services/ecpay/config";
import { CreatePaymentLinkDialog } from "@/components/create-payment-link-dialog";
import { PaymentHistoryTable } from "@/components/payment-history-table";

export default async function PaymentLinkPage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = await params;

  const supabase = await createSupabaseClient();
  const [payments, clientsRes] = await Promise.all([
    getFirmPayments(firmId),
    supabase
      .from("clients")
      .select("id, name")
      .eq("firm_id", firmId)
      .order("name"),
  ]);

  const clients = (clientsRes.data ?? []) as { id: string; name: string }[];
  const baseUrl = getSiteBaseUrl();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">收款</h1>
          <p className="text-muted-foreground text-base">
            產生一次性收款連結（訂金 / 訂閱費 / 加購），寄給客戶以信用卡付款。下方為收款紀錄。
          </p>
        </div>
        <CreatePaymentLinkDialog
          firmId={firmId}
          clients={clients}
          baseUrl={baseUrl}
        />
      </div>

      <PaymentHistoryTable rows={payments} baseUrl={baseUrl} firmId={firmId} />
    </div>
  );
}
