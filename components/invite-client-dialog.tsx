"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailPlus } from "lucide-react";
import { toast } from "sonner";
import { inviteClientUser } from "@/lib/services/client-user";
import { inviteClientUserSchema } from "@/lib/domain/models";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const formSchema = inviteClientUserSchema.pick({
  email: true,
  name: true,
});

type FormInput = z.infer<typeof formSchema>;

interface InviteClientDialogProps {
  clientId: string;
  defaultName?: string | null;
  onInvited?: () => void;
}

export function InviteClientDialog({
  clientId,
  defaultName,
  onInvited,
}: InviteClientDialogProps) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      name: defaultName || "",
    },
  });

  const onSubmit = async (values: FormInput) => {
    try {
      await inviteClientUser(clientId, values.email, values.name);
      toast.success("邀請已寄出");
      form.reset({ email: "", name: defaultName || "" });
      setOpen(false);
      onInvited?.();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "邀請失敗");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          form.reset({ email: "", name: defaultName || "" });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <MailPlus className="mr-2 h-4 w-4" />
          邀請登入
        </Button>
      </DialogTrigger>
      <ResponsiveDialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>邀請客戶入口網站使用者</DialogTitle>
          <DialogDescription>
            寄送邀請信給客戶，讓對方設定密碼並登入入口網站。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>顯示名稱</FormLabel>
                  <FormControl>
                    <Input placeholder="王小明" {...field} />
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
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="client@example.com" {...field} />
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
                送出邀請
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
