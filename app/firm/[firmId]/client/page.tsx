"use client";

import { useEffect, useState, use, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Client = Database["public"]["Tables"]["clients"]["Row"];

export default function ClientPage({
  params,
}: {
  params: Promise<{ firmId: string }>;
}) {
  const { firmId } = use(params);
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    tax_id: "",
    tax_payer_id: "",
    industry: "",
  });

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("firm_id", firmId)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      } else {
        setClients(data || []);
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("取得客戶資料失敗。");
    } finally {
      setLoading(false);
    }
  }, [firmId, supabase]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      name: "",
      contact_person: "",
      tax_id: "",
      tax_payer_id: "",
      industry: "",
    });
    setEditingClient(null);
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("clients")
        .insert([
          {
            ...formData,
            firm_id: firmId,
          },
        ])
        .select();

      if (error) {
        throw error;
      } else {
        toast.success("新增客戶成功。");
        setIsAddModalOpen(false);
        resetForm();
        fetchClients();
      }
    } catch (error) {
      console.error("Error adding client:", error);
      toast.error("新增客戶失敗。請檢查您的輸入。");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from("clients")
        .update(formData)
        .eq("id", editingClient.id);

      if (error) {
        throw error;
      } else {
        toast.success("更新客戶成功。");
        setEditingClient(null);
        resetForm();
        fetchClients();
      }
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error("更新客戶失敗。請檢查您的輸入。");
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
    setFormData({
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
            <Button onClick={() => resetForm()}>
              <Plus className="mr-2 h-4 w-4" /> Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleAddClient}>
              <DialogHeader>
                <DialogTitle>新增客戶</DialogTitle>
                <DialogDescription>
                  請在此輸入新客戶的詳細資料。點擊保存當您完成時。
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">客戶名稱 (公司)</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="例如：Acme Corp"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tax_id">統一編號</Label>
                  <Input
                    id="tax_id"
                    name="tax_id"
                    value={formData.tax_id}
                    onChange={handleInputChange}
                    placeholder="例如：12345678"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tax_payer_id">稅籍編號</Label>
                  <Input
                    id="tax_payer_id"
                    name="tax_payer_id"
                    value={formData.tax_payer_id}
                    onChange={handleInputChange}
                    placeholder="例如：123456789"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contact_person">負責人</Label>
                  <Input
                    id="contact_person"
                    name="contact_person"
                    value={formData.contact_person}
                    onChange={handleInputChange}
                    placeholder="公司負責人姓名"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="industry">產業</Label>
                  <Input
                    id="industry"
                    name="industry"
                    value={formData.industry}
                    onChange={handleInputChange}
                    placeholder="產業描述，用於AI分析發票摘要"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  保存
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
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
            {loading ? (
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
        onOpenChange={(open) => !open && resetForm()}
      >
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleEditClient}>
            <DialogHeader>
              <DialogTitle>編輯客戶</DialogTitle>
              <DialogDescription>
                請在此編輯客戶的詳細資料。點擊保存當您完成時。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">客戶名稱 (公司)</Label>
                <Input
                  id="edit-name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tax_id">統一編號</Label>
                <Input
                  id="edit-tax_id"
                  name="tax_id"
                  value={formData.tax_id}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tax_payer_id">稅籍編號</Label>
                <Input
                  id="edit-tax_payer_id"
                  name="tax_payer_id"
                  value={formData.tax_payer_id}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-contact_person">負責人</Label>
                <Input
                  id="edit-contact_person"
                  name="contact_person"
                  value={formData.contact_person}
                  onChange={handleInputChange}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-industry">產業</Label>
                <Input
                  id="edit-industry"
                  name="industry"
                  value={formData.industry}
                  onChange={handleInputChange}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
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
