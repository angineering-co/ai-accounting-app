"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createPaymentLink } from "@/lib/services/payment-link";
import {
  PAYMENT_LINK_TYPES,
  PAYMENT_LINK_TYPE_LABELS,
} from "@/lib/domain/models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CopyLinkButton } from "@/components/copy-link-button";

const NONE_CLIENT = "__none__";

// 表單欄位皆以字串收集（送出前轉數字），數值上限由 server 端 createPaymentLinkSchema
// 權威把關，這裡只做基本格式與範圍提示。
const formSchema = z.object({
  client_id: z.string(),
  type: z.enum(PAYMENT_LINK_TYPES),
  amount: z
    .string()
    .trim()
    .regex(/^\d+$/, "請輸入正整數金額")
    .refine((v) => Number(v) >= 1 && Number(v) <= 1_000_000, "金額需介於 1 ~ 1,000,000"),
  description: z
    .string()
    .trim()
    .min(1, "請填寫品項說明")
    .max(100, "品項說明請少於 100 字"),
  expires_in_days: z
    .string()
    .trim()
    .regex(/^\d+$/, "請輸入天數")
    .refine((v) => Number(v) >= 1 && Number(v) <= 90, "有效天數需介於 1 ~ 90 天"),
});

type FormValues = z.infer<typeof formSchema>;

interface CreatePaymentLinkDialogProps {
  firmId: string;
  clients: { id: string; name: string }[];
  baseUrl: string;
}

export function CreatePaymentLinkDialog({
  firmId,
  clients,
  baseUrl,
}: CreatePaymentLinkDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      client_id: NONE_CLIENT,
      type: "deposit",
      amount: "",
      description: "",
      expires_in_days: "7",
    },
  });

  const resetAll = () => {
    form.reset();
    setCreatedLink(null);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const { checkoutToken } = await createPaymentLink({
        firm_id: firmId,
        client_id: values.client_id === NONE_CLIENT ? null : values.client_id,
        type: values.type,
        amount: Number(values.amount),
        description: values.description,
        expires_in_days: Number(values.expires_in_days),
      });
      setCreatedLink(`${baseUrl}/pay/${checkoutToken}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "產生連結失敗");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetAll();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          產生收款連結
        </Button>
      </DialogTrigger>
      <ResponsiveDialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>產生收款連結</DialogTitle>
          <DialogDescription>
            建立一筆一次性收款，產生可寄給客戶的信用卡付款連結。
          </DialogDescription>
        </DialogHeader>

        {createdLink ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <p className="text-base font-medium">連結已產生</p>
              <p className="text-sm text-muted-foreground">
                複製以下連結，透過 Email 或 LINE 寄給客戶付款。
              </p>
            </div>
            <Input readOnly value={createdLink} onFocus={(e) => e.target.select()} />
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={resetAll}>
                再開一筆
              </Button>
              <CopyLinkButton url={createdLink} />
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4 py-2"
            >
              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>客戶</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE_CLIENT}>
                          不指定客戶（例如簽約前訂金）
                        </SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>類型</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PAYMENT_LINK_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {PAYMENT_LINK_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>金額（新台幣）</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="16380"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      客戶將以信用卡一次付清此金額。
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>品項說明</FormLabel>
                    <FormControl>
                      <Input placeholder="2026 年度訂閱" {...field} />
                    </FormControl>
                    <FormDescription>
                      會顯示在綠界付款頁與收據上。
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expires_in_days"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>有效天數</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="7" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  產生連結
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </ResponsiveDialogContent>
    </Dialog>
  );
}
