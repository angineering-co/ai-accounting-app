"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateClientSettings } from "@/lib/services/client-settings";
import {
  COUNTY_CITY_NAMES,
  taxFilingConfigSchema,
  type Client,
} from "@/lib/domain/models";

const formSchema = z.object({
  tax_filing_config: taxFilingConfigSchema,
});

// taxFilingConfigSchema 內含 .default()，故 input/output 型別不同：
// 表單欄位用 input（欄位可為 undefined），送出後 onSubmit 收到 output。
type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

interface FilingConfigSectionProps {
  clientId: string;
  client: Client;
  onSaveSuccess?: () => void;
}

export function FilingConfigSection({
  clientId,
  client,
  onSaveSuccess,
}: FilingConfigSectionProps) {
  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tax_filing_config: {
        declaration_type: client.tax_filing_config?.declaration_type ?? "1",
        county_city: client.tax_filing_config?.county_city ?? "臺北市",
      },
    },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await updateClientSettings(clientId, values);
      form.reset(values);
      toast.success("申報書設定已儲存");
      onSaveSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>申報書設定</CardTitle>
        <CardDescription>
          產生 .TET_U 申報書時的預設申報種類與縣市別，設定後即免逐次選填。
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="tax_filing_config.declaration_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>申報種類</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="1">1: 按期申報</SelectItem>
                      <SelectItem value="2">2: 按月申報</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tax_filing_config.county_city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>縣市別</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COUNTY_CITY_NAMES.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              // 尚未存過設定 (config 為 null) 時，即使表單未變動也允許按下，
              // 讓事務所可直接把預設值落地存檔。
              disabled={
                form.formState.isSubmitting ||
                (!form.formState.isDirty && client.tax_filing_config != null)
              }
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
