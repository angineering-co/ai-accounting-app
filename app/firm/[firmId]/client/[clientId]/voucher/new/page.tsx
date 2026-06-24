"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ManualVoucherForm } from "@/components/manual-voucher-form";
import { getOpeningEntry } from "@/lib/services/voucher";

export default function NewVoucherPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") === "opening" ? "opening" : "general";

  // One opening entry per client. In opening mode, surface the existing one (if
  // any) and route to its detail page for editing instead of a second create.
  const { data: opening, isLoading } = useSWR(
    mode === "opening" ? ["opening-entry", clientId] : null,
    () => getOpeningEntry(clientId),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          {mode === "opening" ? "期初開帳" : "新增傳票"}
        </h1>
      </div>

      {mode === "opening" && isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-base text-muted-foreground">
            載入中…
          </CardContent>
        </Card>
      ) : mode === "opening" && opening ? (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <p className="text-base">此客戶已建立期初開帳傳票。</p>
            <Button asChild>
              <Link href={`/firm/${firmId}/client/${clientId}/voucher/${opening.id}`}>
                檢視 / 編輯期初開帳傳票
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ManualVoucherForm firmId={firmId} clientId={clientId} mode={mode} />
      )}
    </div>
  );
}
