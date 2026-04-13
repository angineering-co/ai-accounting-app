"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { landlordSchema } from "@/lib/domain/models";
import { updateClientSettings } from "@/lib/services/client-settings";
import type { Client } from "@/lib/domain/models";

const formSchema = z.object({
  landlord: landlordSchema.nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface LandlordSectionProps {
  clientId: string;
  client: Client;
  onSaveSuccess?: () => void;
}

export function LandlordSection({
  clientId,
  client,
  onSaveSuccess,
}: LandlordSectionProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      landlord: client.landlord ?? { type: undefined as unknown as "company" | "individual", rent_amount: undefined },
    },
  });

  const landlord = form.watch("landlord");

  const onSubmit = async (values: FormValues) => {
    try {
      await updateClientSettings(clientId, values);
      form.reset(values);
      toast.success("租賃與扣繳資料已儲存");
      onSaveSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>租賃與扣繳</CardTitle>
        <CardDescription>
          此關係到您是否需要主動「扣繳」。可使用我們的
          <a
            href="/tools/withholding-tax-calculator#rent"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
          >
            租金扣繳計算機
          </a>
          算實際金額。
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="landlord.type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>房東身份</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="company" id="landlord-company" />
                        <Label htmlFor="landlord-company">公司</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="individual" id="landlord-individual" />
                        <Label htmlFor="landlord-individual">個人</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {landlord?.type && (
              <FormField
                control={form.control}
                name="landlord.rent_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>每月租金</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          NT$
                        </span>
                        <Input
                          inputMode="numeric"
                          placeholder="0"
                          className="pl-12"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === ""
                                ? undefined
                                : Number(e.target.value),
                            )
                          }
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
