'use server';

import { createClient } from "@/lib/supabase/server";
import {
  createDocumentSchema,
  type CreateDocumentInput,
} from "@/lib/domain/document";
import type { Database } from "@/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type DocumentServiceOptions = {
  supabaseClient?: SupabaseClient<Database>;
  userId?: string;
};

/**
 * Create a `documents` row — the CTI parent that records the physical facts of
 * an uploaded file. Returns the new document id.
 *
 * `options` lets a caller already inside a server action (e.g. `createInvoice`)
 * reuse its authenticated client and resolved user instead of re-deriving them.
 */
export async function createDocument(
  data: CreateDocumentInput,
  options?: DocumentServiceOptions,
): Promise<string> {
  const supabase = options?.supabaseClient ?? (await createClient());

  let userId = options?.userId;
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');
    userId = user.id;
  }

  const validated = createDocumentSchema.parse(data);

  const { data: document, error } = await supabase
    .from('documents')
    .insert({
      ...validated,
      created_by: userId,
      status: 'active',
    })
    .select('id')
    .single();

  if (error) throw error;
  return document.id;
}
