"use client";

import { use, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { PeriodCard } from "@/components/period-card";
import { NewPeriodDialog } from "@/components/new-period-dialog";
import { getTaxPeriods } from "@/lib/services/tax-period";
import {
  getClientUsers,
  revokeClientUserAccess,
} from "@/lib/services/client-user";
import { getClientSettings } from "@/lib/services/client-settings";
import { InviteClientDialog } from "@/components/invite-client-dialog";
import { LinkLineDialog } from "@/components/link-line-dialog";
import { ClientSettingsSections } from "@/components/client-settings/client-settings-sections";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = use(params);
  const router = useRouter();

  // Fetch client details (includes settings fields)
  const { data: client, isLoading: isClientLoading, mutate: mutateClient } = useSWR(
    ["client", clientId],
    () => getClientSettings(clientId),
  );

  // Fetch tax periods
  const {
    data: periods = [],
    isLoading: isPeriodsLoading,
    mutate: fetchPeriods,
  } = useSWR(["client-periods", clientId], () => getTaxPeriods(clientId));

  const {
    data: portalUsers = [],
    isLoading: isPortalUsersLoading,
    mutate: fetchPortalUsers,
  } = useSWR(["client-portal-users", clientId], () => getClientUsers(clientId));

  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);

  const handleRevokeAccess = async (userId: string) => {
    setIsRevoking(true);
    try {
      await revokeClientUserAccess(userId);
      toast.success("已撤銷入口網站帳號");
      setRevokeDialogOpen(false);
      fetchPortalUsers();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "撤銷失敗");
    } finally {
      setIsRevoking(false);
    }
  };

  if (isClientLoading)
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
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
            <NewPeriodDialog
              clientId={clientId}
              onPeriodCreated={fetchPeriods}
            />
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
              <NewPeriodDialog
                clientId={clientId}
                onPeriodCreated={fetchPeriods}
              />
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
          <div className="space-y-6">
            <ClientSettingsSections
              clientId={clientId}
              client={client}
              onSaveSuccess={() => mutateClient()}
            />

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  入口網站存取
                </CardTitle>
                <div className="flex items-center gap-2">
                  <LinkLineDialog clientId={clientId} />
                  <InviteClientDialog
                    clientId={clientId}
                    defaultName={client.contact_person || client.name}
                    onInvited={fetchPortalUsers}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {isPortalUsersLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : portalUsers.length === 0 ? (
                  <p className="text-base text-muted-foreground">
                    尚未建立入口網站帳號。
                  </p>
                ) : (
                  <div className="space-y-3">
                    {portalUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="space-y-1">
                          <p className="font-medium">{user.name || "未命名使用者"}</p>
                          <p className="text-base text-muted-foreground">
                            {user.email || "無 Email"}
                          </p>
                          <Badge variant="secondary">啟用中</Badge>
                        </div>
                        <AlertDialog
                          open={revokeDialogOpen}
                          onOpenChange={setRevokeDialogOpen}
                        >
                          <AlertDialogTrigger asChild>
                            <Button variant="outline">撤銷存取</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                確定要撤銷此帳號的存取權限?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                撤銷後，{user.name || user.email || "此使用者"}
                                將無法再登入入口網站。此操作無法復原。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isRevoking}>
                                取消
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                                disabled={isRevoking}
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleRevokeAccess(user.id);
                                }}
                              >
                                {isRevoking && (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                確定撤銷
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
