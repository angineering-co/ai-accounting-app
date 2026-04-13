"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
    three_part_manual: z.number().int().nonnegative(),
    two_part_register: z.number().int().nonnegative(),
    three_part_register: z.number().int().nonnegative(),
  }),
});

type FormValues = z.infer<typeof formSchema>;

const INVOICE_TYPES = [
  { key: "two_part_manual" as const, label: "二聯式手開發票", unit: "本", unitNote: "一本50張" },
  { key: "three_part_manual" as const, label: "三聯式手開發票", unit: "本", unitNote: "一本50張" },
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
      invoice_purchasing: client.invoice_purchasing ?? {
        enabled: false,
        two_part_manual: 0,
        three_part_manual: 0,
        two_part_register: 0,
        three_part_register: 0,
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
              three_part_manual: 0,
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
        <CardTitle>代購發票</CardTitle>
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
                {INVOICE_TYPES.map(({ key, label, unit, unitNote }) => (
                  <FormField
                    key={key}
                    control={form.control}
                    name={`invoice_purchasing.${key}`}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-3">
                          <FormLabel className="min-w-[140px] shrink-0">
                            {label}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={0}
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
                          <span className="text-sm text-muted-foreground">
                            {unit}（{unitNote}）
                          </span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
