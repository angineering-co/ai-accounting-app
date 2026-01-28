"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PeriodSelector } from "@/components/period-selector";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RocPeriod } from "@/lib/domain/roc-period";
import { createTaxPeriod } from "@/lib/services/tax-period";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

// Form schema - simplifed version of the full create schema since we only need year_month
const createPeriodFormSchema = z.object({
  year_month: z.instanceof(RocPeriod),
});

type CreatePeriodFormInput = z.infer<typeof createPeriodFormSchema>;

interface NewPeriodDialogProps {
  clientId: string;
  onPeriodCreated?: () => void;
}

export function NewPeriodDialog({
  clientId,
  onPeriodCreated,
}: NewPeriodDialogProps) {
  const [open, setOpen] = useState(false);

  const form = useForm<CreatePeriodFormInput>({
    resolver: zodResolver(createPeriodFormSchema),
    defaultValues: {
      year_month: RocPeriod.now(),
    },
  });

  const onSubmit = async (values: CreatePeriodFormInput) => {
    try {
      await createTaxPeriod(clientId, values.year_month.toString());

      toast.success("期別已建立");
      setOpen(false);
      form.reset();

      if (onPeriodCreated) {
        onPeriodCreated();
      }
    } catch (error) {
      console.error(error);
      toast.error("建立期別失敗");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> 新增期別
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>新增申報期別</DialogTitle>
          <DialogDescription>
            請選擇要新增的申報期別 (例如: 113年 01-02月)。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="year_month"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>所屬期別</FormLabel>
                  <FormControl>
                    <PeriodSelector
                      value={field.value}
                      onChange={field.onChange}
                    />
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
                建立
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
