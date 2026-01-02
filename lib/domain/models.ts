import { z } from "zod";

export const clientSchema = z.object({
  id: z.uuid(),
  firm_id: z.uuid(),
  name: z.string().min(1, "客戶名稱為必填"),
  contact_person: z.string().nullable().optional(),
  tax_id: z.string().min(8, "統一編號格式錯誤").max(8, "統一編號格式錯誤"),
  tax_payer_id: z.string().min(1, "稅籍編號為必填"),
  industry: z.string().nullable().optional(),
});

export const updateClientSchema = clientSchema.pick({
  name: true,
  contact_person: true,
  tax_id: true,
  tax_payer_id: true,
  industry: true,
});

export const createClientSchema = clientSchema.pick({
  firm_id: true,
  name: true,
  contact_person: true,
  tax_id: true,
  tax_payer_id: true,
  industry: true,
});

export type Client = z.infer<typeof clientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type CreateClientInput = z.infer<typeof createClientSchema>;
