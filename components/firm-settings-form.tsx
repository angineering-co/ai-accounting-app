"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  type Firm,
  type UpdateFirmSettingsInput,
  updateFirmSettingsSchema,
} from "@/lib/domain/models";
import { updateFirmSettings } from "@/lib/services/firm";

interface FirmSettingsFormProps {
  firm: Firm;
}

export function FirmSettingsForm({ firm }: FirmSettingsFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<UpdateFirmSettingsInput>({
    resolver: zodResolver(updateFirmSettingsSchema),
    defaultValues: {
      name: firm.name,
      tax_id: firm.tax_id,
      settings: {
        agent_registration_number: firm.settings?.agent_registration_number ?? "",
        declarer_name: firm.settings?.declarer_name ?? "",
        declarer_id: firm.settings?.declarer_id ?? "",
        declarer_phone_area_code: firm.settings?.declarer_phone_area_code ?? "",
        declarer_phone: firm.settings?.declarer_phone ?? "",
        declarer_phone_extension: firm.settings?.declarer_phone_extension ?? "",
      },
    },
  });

  const onSubmit = async (values: UpdateFirmSettingsInput) => {
    setIsSaving(true);
    try {
      await updateFirmSettings(firm.id, values);
      toast.success("設定已儲存");
    } catch (error) {
      toast.error(
        "儲存失敗：" + (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>事務所基本資料</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>事務所名稱</FormLabel>
                    <FormControl>
                      <Input placeholder="例如：記帳事務所" {...field} />
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
                      <Input placeholder="例如：12345678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>報表申報資訊</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="settings.agent_registration_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>代理人登錄字號</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="委託申報時填入；產生 .TET_U 時自動套用"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4 border rounded-md p-4">
              <h3 className="font-medium text-base">申報人資訊</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="settings.declarer_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>姓名</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="settings.declarer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>身分證字號</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <FormField
                  control={form.control}
                  name="settings.declarer_phone_area_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>區碼</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="settings.declarer_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>電話</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="settings.declarer_phone_extension"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>分機</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            儲存設定
          </Button>
        </div>
      </form>
    </Form>
  );
}
