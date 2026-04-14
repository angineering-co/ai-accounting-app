"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { updateClientSettings } from "@/lib/services/client-settings";
import type { Client } from "@/lib/domain/models";

const formSchema = z.object({
  invoice_purchasing: z.object({
    enabled: z.boolean(),
    two_part_manual: z.number().int().nonnegative(),
    two_part_manual_duplicate: z.boolean(),
    three_part_manual: z.number().int().nonnegative(),
    three_part_manual_duplicate: z.boolean(),
    two_part_register: z.number().int().nonnegative(),
    three_part_register: z.number().int().nonnegative(),
  }),
});

type FormValues = z.infer<typeof formSchema>;

const INVOICE_TYPES = [
  { key: "two_part_manual" as const, label: "二聯式手開發票", unit: "本", unitNote: "一本50張", duplicateKey: "two_part_manual_duplicate" as const },
  { key: "three_part_manual" as const, label: "三聯式手開發票", unit: "本", unitNote: "一本50張", duplicateKey: "three_part_manual_duplicate" as const },
  { key: "two_part_register" as const, label: "二聯式收銀機", unit: "卷", unitNote: "一卷50張" },
  { key: "three_part_register" as const, label: "三聯式收銀機", unit: "卷", unitNote: "一卷50張" },
] as const;

interface InvoicePurchasingSectionProps {
  clientId: string;
  client: Client;
  onSaveSuccess?: () => void;
}

export function InvoicePurchasingSection({
  clientId,
  client,
  onSaveSuccess,
}: InvoicePurchasingSectionProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      invoice_purchasing: {
        enabled: false,
        two_part_manual: 0,
        two_part_manual_duplicate: false,
        three_part_manual: 0,
        three_part_manual_duplicate: false,
        two_part_register: 0,
        three_part_register: 0,
        ...client.invoice_purchasing,
      },
    },
  });

  const enabled = form.watch("invoice_purchasing.enabled");

  const onSubmit = async (values: FormValues) => {
    try {
      const data = values.invoice_purchasing.enabled
        ? values
        : {
            invoice_purchasing: {
              enabled: false,
              two_part_manual: 0,
              two_part_manual_duplicate: false,
              three_part_manual: 0,
              three_part_manual_duplicate: false,
              two_part_register: 0,
              three_part_register: 0,
            },
          };
      await updateClientSettings(clientId, data);
      form.reset(data);
      toast.success("代購發票設定已儲存");
      onSaveSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          代購發票
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-sm p-3" side="bottom">
                <p>我們採用網路統一購買，因財政部印刷廠要求單月以前要確定數量，因此超過25後以後變動，將在下期生效。</p>
                <p className="mt-2">舉例來說，3/25號以前是購買5-6月的發票，因此如果4/1提出修改，7-8月的購買發票的數量將修改，而不會影響5-6月已經購買的數量</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>
          發票+寄送給您的郵票錢，實報實銷。
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="invoice_purchasing.enabled"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="!mt-0">需要代購發票</FormLabel>
                </FormItem>
              )}
            />

            {enabled && (
              <div className="space-y-3 rounded-md border p-4">
                {INVOICE_TYPES.map((invoiceType) => (
                  <div key={invoiceType.key} className="space-y-2">
                    <FormField
                      control={form.control}
                      name={`invoice_purchasing.${invoiceType.key}`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{invoiceType.label}</FormLabel>
                          <div className="flex items-center gap-2">
                            <FormControl>
                              <Input
                                inputMode="numeric"
                                className="w-24"
                                {...field}
                                onChange={(e) =>
                                  field.onChange(
                                    e.target.value === ""
                                      ? 0
                                      : Number(e.target.value),
                                  )
                                }
                              />
                            </FormControl>
                            <span className="text-base text-muted-foreground whitespace-nowrap">
                              {invoiceType.unit}（{invoiceType.unitNote}）
                            </span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {"duplicateKey" in invoiceType && (
                      <FormField
                        control={form.control}
                        name={`invoice_purchasing.${invoiceType.duplicateKey}`}
                        render={({ field }) => (
                          <FormItem className="flex items-center gap-2 ml-1">
                            <FormControl>
                              <Checkbox
                                checked={field.value as boolean}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <Label htmlFor={invoiceType.duplicateKey} className="!mt-0 text-sm font-normal">
                              加副聯
                            </Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-sm p-3" side="bottom">
                                  手開發票可選擇「加副聯」類型，副聯的作用在於讓銷售方多留存一份紙本紀錄。因為當第一聯（存根聯）連同發票本交給會計師事務所或國稅局記帳時，自行留存的「副聯」可以做為對帳的依據。
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || !form.formState.isDirty}
            >
              {form.formState.isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              儲存
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
