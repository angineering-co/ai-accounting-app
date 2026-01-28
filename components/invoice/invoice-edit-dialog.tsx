"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeriodSelector } from "@/components/period-selector";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { RocPeriod } from "@/lib/domain/roc-period";
import { updateInvoice } from "@/lib/services/invoice";
import { getTaxPeriodByYYYMM } from "@/lib/services/tax-period";
import { type Invoice, updateInvoiceSchema } from "@/lib/domain/models";

const updateFormSchema = updateInvoiceSchema.extend({
  period: z.instanceof(RocPeriod),
});

type UpdateFormInput = z.infer<typeof updateFormSchema>;

interface InvoiceEditDialogProps {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  currentPeriod: RocPeriod;
  currentPeriodId: string;
  onSuccess: () => void;
}

export function InvoiceEditDialog({
  invoice,
  open,
  onOpenChange,
  clientId,
  currentPeriod,
  currentPeriodId,
  onSuccess,
}: InvoiceEditDialogProps) {
  const updateForm = useForm<UpdateFormInput>({
    resolver: zodResolver(updateFormSchema),
    defaultValues: {
      client_id: clientId,
      in_or_out: "in",
      status: "uploaded",
      period: currentPeriod,
    },
  });

  useEffect(() => {
    if (invoice && open) {
      updateForm.reset({
        client_id: invoice.client_id || clientId,
        in_or_out: invoice.in_or_out,
        status: invoice.status,
        period: invoice.year_month
          ? RocPeriod.fromYYYMM(invoice.year_month)
          : currentPeriod,
      });
    }
  }, [invoice, open, clientId, currentPeriod, updateForm]);

  const handleEditInvoice = async (values: UpdateFormInput) => {
    if (!invoice) return;

    try {
      const { period: newPeriod, ...rest } = values;
      const newPeriodStr = newPeriod.toString();
      let targetPeriodId: string | undefined;

      // Determine tax_filing_period_id
      if (newPeriodStr === currentPeriod.toString()) {
        targetPeriodId = currentPeriodId;
      } else {
        const targetPeriod = await getTaxPeriodByYYYMM(clientId, newPeriodStr);

        if (targetPeriod) {
          targetPeriodId = targetPeriod.id;
        } else {
          toast.error(`期別 ${newPeriod.format()} 尚未建立，請先建立期別`);
          return;
        }
      }

      await updateInvoice(invoice.id, {
        ...rest,
        year_month: newPeriodStr,
        tax_filing_period_id: targetPeriodId,
      });

      toast.success("更新發票成功");
      onOpenChange(false);
      updateForm.reset();
      onSuccess();
    } catch (error) {
      console.error("Error updating invoice:", error);
      toast.error("更新失敗");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>編輯發票</DialogTitle>
          <DialogDescription>編輯發票的類型與期別。</DialogDescription>
        </DialogHeader>
        <Form {...updateForm}>
          <form
            onSubmit={updateForm.handleSubmit(handleEditInvoice)}
            className="flex flex-col flex-1 min-h-0"
          >
            <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
              <FormField
                control={updateForm.control}
                name="period"
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

              <FormField
                control={updateForm.control}
                name="in_or_out"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>發票類型</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="in">進項發票</SelectItem>
                        <SelectItem value="out">銷項發票</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="submit"
                disabled={updateForm.formState.isSubmitting}
              >
                {updateForm.formState.isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                保存
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
