"use client";

import { useEffect, useState, use } from "react";
import useSWR from "swr";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { Database } from "@/supabase/database.types";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Client = Database["public"]["Tables"]["clients"]["Row"];

import { updateClient, createClient } from "@/lib/services/client";
import {
  UpdateClientInput,
  updateClientSchema,
  CreateClientInput,
  createClientSchema,
} from "@/lib/domain/models";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";

export default function ClientPage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = use(params);
  const supabase = createSupabaseClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Separate forms for create and update to handle different schemas and default values
  const createForm = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: "",
      contact_person: "",
      tax_id: "",
      tax_payer_id: "",
      industry: "",
      firm_id: firmId,
    },
  });

  const updateForm = useForm<UpdateClientInput>({
    resolver: zodResolver(updateClientSchema),
    defaultValues: {
      name: "",
      contact_person: "",
      tax_id: "",
      tax_payer_id: "",
      industry: "",
    },
  });

  const fetcher = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("firm_id", firmId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  };

  const {
    data: clients = [],
    error,
    isLoading,
    mutate: fetchClients,
  } = useSWR(["clients", firmId], fetcher);

  useEffect(() => {
    if (error) {
      console.error("Error fetching clients:", error);
      toast.error("取得客戶資料失敗。");
    }
  }, [error]);

  const openAddModal = () => {
    createForm.reset({
      name: "",
      contact_person: "",
      tax_id: "",
      tax_payer_id: "",
      industry: "",
      firm_id: firmId,
    });
    setEditingClient(null);
    setIsAddModalOpen(true);
  };

  const handleAddClient = async (data: CreateClientInput) => {
    setIsSubmitting(true);

    try {
      await createClient(data);

      toast.success("新增客戶成功。");
      setIsAddModalOpen(false);
      createForm.reset();
      fetchClients();
    } catch (error) {
      console.error("Error adding client:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "新增客戶失敗。請檢查您的輸入。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClient = async (data: UpdateClientInput) => {
    if (!editingClient) return;
    setIsSubmitting(true);

    try {
      await updateClient(editingClient.id, data);

      toast.success("更新客戶成功。");
      setEditingClient(null);
      updateForm.reset();
      fetchClients();
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "更新客戶失敗。請檢查您的輸入。"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientToDelete.id);

      if (error) {
        throw error;
      } else {
        toast.success("刪除客戶成功。");
        setClientToDelete(null);
        fetchClients();
      }
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("刪除客戶失敗。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    updateForm.reset({
      name: client.name,
      contact_person: client.contact_person || "",
      tax_id: client.tax_id,
      tax_payer_id: client.tax_payer_id,
      industry: client.industry || "",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">客戶</h1>
          <p className="text-muted-foreground">管理您的客戶資料。</p>
        </div>
        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAddModal}>
              <Plus className="mr-2 h-4 w-4" /> Add Client
            </Button>
          </DialogTrigger>
          <ResponsiveDialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>新增客戶</DialogTitle>
              <DialogDescription>
                請在此輸入新客戶的詳細資料。點擊保存當您完成時。
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form
                onSubmit={createForm.handleSubmit(handleAddClient)}
                className="flex flex-col flex-1 min-h-0"
              >
                <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
                  <FormField
                    control={createForm.control}
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
                    control={createForm.control}
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
                    control={createForm.control}
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
                    control={createForm.control}
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
                    control={createForm.control}
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
                </div>
                <DialogFooter className="pt-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    保存
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </ResponsiveDialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>客戶名稱</TableHead>
              <TableHead>統一編號</TableHead>
              <TableHead>負責人</TableHead>
              <TableHead>產業</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  無客戶資料。
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{client.tax_id}</TableCell>
                  <TableCell>{client.contact_person || "-"}</TableCell>
                  <TableCell>{client.industry || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditModal(client)}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">編輯</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setClientToDelete(client)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">刪除</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Modal */}
      <Dialog
        open={!!editingClient}
        onOpenChange={(open) => !open && setEditingClient(null)}
      >
        <ResponsiveDialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>編輯客戶</DialogTitle>
            <DialogDescription>
              請在此編輯客戶的詳細資料。點擊保存當您完成時。
            </DialogDescription>
          </DialogHeader>
          <Form {...updateForm}>
            <form
              onSubmit={updateForm.handleSubmit(handleEditClient)}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="grid gap-4 py-4 flex-1 overflow-y-auto px-1">
                <FormField
                  control={updateForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>客戶名稱 (公司)</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={updateForm.control}
                  name="tax_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>統一編號</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={updateForm.control}
                  name="tax_payer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>稅籍編號</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={updateForm.control}
                  name="contact_person"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>負責人</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={updateForm.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>產業</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter className="pt-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  保存
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </ResponsiveDialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!clientToDelete}
        onOpenChange={(open) => !open && setClientToDelete(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">確認刪除</DialogTitle>
            <DialogDescription>
              您確定要刪除客戶「{clientToDelete?.name}」嗎？此操作無法復原。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setClientToDelete(null)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteClient}
              disabled={isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
