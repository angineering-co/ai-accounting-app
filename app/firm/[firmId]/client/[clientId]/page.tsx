"use client";

import { use } from "react";
import useSWR from "swr";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { clientSchema } from "@/lib/domain/models";
import { PeriodCard } from "@/components/period-card";
import { NewPeriodDialog } from "@/components/new-period-dialog";
import { getTaxPeriods } from "@/lib/services/tax-period";

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = use(params);
  const router = useRouter();
  const supabase = createSupabaseClient();
  
  // Fetch client details
  const { data: client, isLoading: isClientLoading } = useSWR(
    ["client", clientId],
    async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return clientSchema.parse(data);
    }
  );

  // Fetch tax periods
  const { data: periods = [], isLoading: isPeriodsLoading, mutate: fetchPeriods } = useSWR(
    ["client-periods", clientId],
    () => getTaxPeriods(clientId)
  );

  if (isClientLoading) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!client) return <div className="p-6 text-center">找不到客戶</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
      </div>

      <Tabs defaultValue="filings" className="w-full">
        <TabsList>
          <TabsTrigger value="filings">申報管理</TabsTrigger>
          <TabsTrigger value="basic">基本資料</TabsTrigger>
        </TabsList>

        <TabsContent value="filings" className="mt-6 space-y-6">
          <div className="flex justify-between items-center">
             <h2 className="text-xl font-semibold">申報期別</h2>
             <NewPeriodDialog clientId={clientId} onPeriodCreated={fetchPeriods} />
          </div>

          {isPeriodsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-40 animate-pulse bg-muted" />
              ))}
            </div>
          ) : periods.length === 0 ? (
            <div className="text-center py-12 border rounded-lg bg-muted/10">
              <p className="text-muted-foreground mb-4">尚未建立任何申報期別</p>
              <NewPeriodDialog clientId={clientId} onPeriodCreated={fetchPeriods} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {periods.map((period) => (
                <PeriodCard 
                  key={period.id} 
                  period={period} 
                  firmId={firmId} 
                  clientId={clientId} 
                />
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="basic" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>基本資訊</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">統一編號</p>
                <p>{client.tax_id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">稅籍編號</p>
                <p>{client.tax_payer_id}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">負責人</p>
                <p>{client.contact_person || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">產業</p>
                <p>{client.industry || "-"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
