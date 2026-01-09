"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createInvoiceRange,
  deleteInvoiceRange,
  getInvoiceRanges,
} from "@/lib/services/invoice-range";
import {
  createInvoiceRangeSchema,
  type CreateInvoiceRangeInput,
} from "@/lib/domain/models";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";

interface RangeManagementProps {
  clientId: string;
  yearMonth: string;
}

export function RangeManagement({ clientId, yearMonth }: RangeManagementProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const {
    data: ranges = [],
    mutate,
    isLoading,
  } = useSWR(["invoice-ranges", clientId, yearMonth], () =>
    getInvoiceRanges(clientId, yearMonth)
  );

  const form = useForm<CreateInvoiceRangeInput>({
    resolver: zodResolver(createInvoiceRangeSchema),
    values: {
      client_id: clientId,
      year_month: yearMonth,
      invoice_type: "手開三聯式",
      start_number: "",
      end_number: "",
    },
  });

  const onSubmit = async (values: CreateInvoiceRangeInput) => {
    try {
      await createInvoiceRange(values);
      toast.success("新增成功");
      setIsAddModalOpen(false);
      form.reset();
      mutate();
    } catch (error) {
      console.error(error);
      toast.error("新增失敗");
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(id);
    try {
      await deleteInvoiceRange(id, clientId);
      toast.success("刪除成功");
      mutate();
    } catch (error) {
      console.error(error);
      toast.error("刪除失敗");
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>發票字軌管理 ({yearMonth})</CardTitle>
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> 新增字軌
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增發票字軌</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="year_month"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>所屬年月 (YYYMM)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如: 11309" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="invoice_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>發票類型</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="請選擇類型" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="手開三聯式">手開三聯式</SelectItem>
                          <SelectItem value="手開二聯式">手開二聯式</SelectItem>
                          <SelectItem value="三聯式收銀機">
                            三聯式收銀機
                          </SelectItem>
                          <SelectItem value="二聯式收銀機">
                            二聯式收銀機
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="start_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>起始號碼 (10 碼)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如: RT33662450" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>結束號碼 (10 碼)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如: RT33662499" {...field} />
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
                    確認新增
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>類型</TableHead>
              <TableHead>起始號碼</TableHead>
              <TableHead>結束號碼</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : ranges.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-4 text-muted-foreground"
                >
                  尚未建立字軌資料
                </TableCell>
              </TableRow>
            ) : (
              ranges.map((range) => (
                <TableRow key={range.id}>
                  <TableCell>{range.invoice_type}</TableCell>
                  <TableCell>{range.start_number}</TableCell>
                  <TableCell>{range.end_number}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(range.id)}
                      disabled={isDeleting === range.id}
                    >
                      {isDeleting === range.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
