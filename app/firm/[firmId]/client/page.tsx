"use client"

import { useEffect, useState, use, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Database } from "@/supabase/database.types"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Pencil, Loader2 } from "lucide-react"

type Client = Database["public"]["Tables"]["clients"]["Row"]

export default function ClientPage({
  params,
}: {
  params: Promise<{ firmId: string }>
}) {
  const { firmId } = use(params)
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    tax_id: "",
    tax_payer_id: "",
    industry: "",
  })

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("firm_id", firmId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching clients:", error)
    } else {
      setClients(data || [])
    }
    setLoading(false)
  }, [firmId, supabase])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const resetForm = () => {
    setFormData({
      name: "",
      contact_person: "",
      tax_id: "",
      tax_payer_id: "",
      industry: "",
    })
    setEditingClient(null)
  }

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const { error } = await supabase.from("clients").insert([
      {
        ...formData,
        firm_id: firmId,
      },
    ]).select()

    if (error) {
      console.error("Error adding client:", error)
      alert("Failed to add client. Please check your inputs.")
    } else {
      setIsAddModalOpen(false)
      resetForm()
      fetchClients()
    }
    setIsSubmitting(false)
  }

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingClient) return
    setIsSubmitting(true)

    const { error } = await supabase
      .from("clients")
      .update(formData)
      .eq("id", editingClient.id)

    if (error) {
      console.error("Error updating client:", error)
      alert("Failed to update client.")
    } else {
      setEditingClient(null)
      resetForm()
      fetchClients()
    }
    setIsSubmitting(false)
  }

  const openEditModal = (client: Client) => {
    setEditingClient(client)
    setFormData({
      name: client.name,
      contact_person: client.contact_person || "",
      tax_id: client.tax_id,
      tax_payer_id: client.tax_payer_id,
      industry: client.industry || "",
    })
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">Manage your firm&apos;s clients here.</p>
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
                <DialogTitle>Add New Client</DialogTitle>
                <DialogDescription>
                  Enter the details of the new client here. Click save when you&apos;re done.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Client Name (Company)</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="e.g. Acme Corp"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tax_id">Tax ID (統一編號)</Label>
                  <Input
                    id="tax_id"
                    name="tax_id"
                    value={formData.tax_id}
                    onChange={handleInputChange}
                    placeholder="8 digits"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tax_payer_id">Tax Payer ID (稅籍編號)</Label>
                  <Input
                    id="tax_payer_id"
                    name="tax_payer_id"
                    value={formData.tax_payer_id}
                    onChange={handleInputChange}
                    placeholder="9 digits"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="contact_person">Contact Person</Label>
                  <Input
                    id="contact_person"
                    name="contact_person"
                    value={formData.contact_person}
                    onChange={handleInputChange}
                    placeholder="Name of the person in charge"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Input
                    id="industry"
                    name="industry"
                    value={formData.industry}
                    onChange={handleInputChange}
                    placeholder="e.g. Retail, Tech, etc."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Client
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
              <TableHead>Name</TableHead>
              <TableHead>Tax ID</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Industry</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No clients found.
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
                      <span className="sr-only">Edit</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editingClient} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleEditClient}>
            <DialogHeader>
              <DialogTitle>Edit Client</DialogTitle>
              <DialogDescription>
                Make changes to the client details here. Click save when you&apos;re done.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Client Name (Company)</Label>
                <Input
                  id="edit-name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tax_id">Tax ID (統一編號)</Label>
                <Input
                  id="edit-tax_id"
                  name="tax_id"
                  value={formData.tax_id}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tax_payer_id">Tax Payer ID (稅籍編號)</Label>
                <Input
                  id="edit-tax_payer_id"
                  name="tax_payer_id"
                  value={formData.tax_payer_id}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-contact_person">Contact Person</Label>
                <Input
                  id="edit-contact_person"
                  name="contact_person"
                  value={formData.contact_person}
                  onChange={handleInputChange}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-industry">Industry</Label>
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
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
