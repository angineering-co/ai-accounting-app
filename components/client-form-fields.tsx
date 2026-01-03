"use client";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { UseFormReturn, Control } from "react-hook-form";
import { CreateClientInput, UpdateClientInput } from "@/lib/domain/models";

type ClientFormFieldsProps = {
  form:
    | UseFormReturn<CreateClientInput>
    | UseFormReturn<UpdateClientInput>;
};

export function ClientFormFields({ form }: ClientFormFieldsProps) {
  // Cast control to UpdateClientInput since all form fields exist in both types
  const control = form.control as Control<UpdateClientInput>;
  
  return (
    <>
      <FormField
        control={control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>客戶名稱 (公司)</FormLabel>
            <FormControl>
              <Input placeholder="例如：Acme Corp" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
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
      <FormField
        control={control}
        name="tax_payer_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>稅籍編號</FormLabel>
            <FormControl>
              <Input placeholder="例如：123456789" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="contact_person"
        render={({ field }) => (
          <FormItem>
            <FormLabel>負責人</FormLabel>
            <FormControl>
              <Input
                placeholder="公司負責人姓名"
                {...field}
                value={field.value || ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name="industry"
        render={({ field }) => (
          <FormItem>
            <FormLabel>產業</FormLabel>
            <FormControl>
              <Input
                placeholder="產業描述，用於AI分析發票摘要"
                {...field}
                value={field.value || ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}

