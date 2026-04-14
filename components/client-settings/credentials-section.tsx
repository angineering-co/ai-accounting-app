"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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
import { platformCredentialsSchema } from "@/lib/domain/models";
import { updateClientSettings } from "@/lib/services/client-settings";
import type { Client } from "@/lib/domain/models";

const formSchema = z.object({
  platform_credentials: platformCredentialsSchema,
});

type FormValues = z.infer<typeof formSchema>;

interface CredentialsSectionProps {
  clientId: string;
  client: Client;
  onSaveSuccess?: () => void;
}

export function CredentialsSection({
  clientId,
  client,
  onSaveSuccess,
}: CredentialsSectionProps) {
  const [showPasswords, setShowPasswords] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      platform_credentials: client.platform_credentials ?? {
        einvoice_username: "",
        einvoice_password: "",
        tax_filing_password: "",
      },
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await updateClientSettings(clientId, values);
      form.reset(values);
      toast.success("平台帳號密碼已儲存");
      onSaveSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>平台帳號密碼</CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPasswords(!showPasswords)}
          >
            {showPasswords ? (
              <EyeOff className="mr-1 h-4 w-4" />
            ) : (
              <Eye className="mr-1 h-4 w-4" />
            )}
            {showPasswords ? "隱藏" : "顯示"}密碼
          </Button>
        </div>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-base font-medium text-muted-foreground mb-1">
                電子發票平台
              </h3>
              <p className="text-base text-muted-foreground mb-3">
                財政部電子發票平台（俗稱大平台）
                <a
                  href="https://www.einvoice.nat.gov.tw"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
                >
                  申請營業人帳號
                </a>
                ，需提供給我們才能幫您下載每期電子發票。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="platform_credentials.einvoice_username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>帳號</FormLabel>
                      <FormControl>
                        <Input placeholder="電子發票平台帳號" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="platform_credentials.einvoice_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>密碼</FormLabel>
                      <FormControl>
                        <Input
                          type={showPasswords ? "text" : "password"}
                          placeholder="電子發票平台密碼"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div>
              <h3 className="text-base font-medium text-muted-foreground mb-1">
                營業人電子申報平台
              </h3>
              <p className="text-base text-muted-foreground mb-3">
                <a
                  href="https://tax.nat.gov.tw/password.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
                >
                  申請帳號密碼
                </a>
                ，需提供給我們才能幫您上傳每期營業稅、營所稅。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="platform_credentials.tax_filing_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>密碼</FormLabel>
                      <FormControl>
                        <Input
                          type={showPasswords ? "text" : "password"}
                          placeholder="營業人電子申報平台密碼"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
