"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  name: z.string().min(1, "客戶名稱為必填"),
  tax_id: z.string().min(8, "統一編號格式錯誤").max(8, "統一編號格式錯誤"),
  tax_payer_id: z.string().min(1, "稅籍編號為必填"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("信箱格式錯誤").or(z.literal("")).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface CompanyBasicsSectionProps {
  clientId: string;
  client: Client;
  isPortal?: boolean;
  onSaveSuccess?: () => void;
}

export function CompanyBasicsSection({
  clientId,
  client,
  isPortal = false,
  onSaveSuccess,
}: CompanyBasicsSectionProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: client.name,
      tax_id: client.tax_id,
      tax_payer_id: client.tax_payer_id,
      address: client.address ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await updateClientSettings(clientId, values);
      form.reset(values);
      toast.success("公司基本資料已儲存");
      onSaveSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>公司基本資料</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>公司名稱</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPortal} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tax_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>統一編號</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPortal} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tax_payer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>稅籍編號</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPortal} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>公司地址</FormLabel>
                  <FormControl>
                    <Input placeholder="請輸入公司地址" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>聯絡電話</FormLabel>
                    <FormControl>
                      <Input placeholder="請輸入聯絡電話" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>聯絡信箱</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="請輸入聯絡信箱" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
