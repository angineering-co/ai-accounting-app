"use server";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import {
  createTodoSchema,
  CreateTodoInput,
  updateTodoSchema,
  UpdateTodoInput,
  TODO_STATUSES,
  TodoStatus,
} from "@/lib/domain/models";
import { listAssignableLineAccounts } from "@/lib/services/line";
import { listFirmStaff } from "@/lib/services/firm-dashboard";
import { revalidatePath } from "next/cache";

// A todo joined with its LINE account's display name and (if bound) client name,
// plus the assignee's name.
export type TodoRecord = {
  id: string;
  firm_id: string;
  title: string;
  description: string | null;
  line_account_id: string | null;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  assignee_id: string | null;
  created_at: string;
  line_account_display_name: string | null;
  client_name: string | null;
  assignee_name: string | null;
};

export async function createTodo(data: CreateTodoInput) {
  const validation = createTodoSchema.safeParse(data);

  if (!validation.success) {
    throw new Error("Invalid data: " + validation.error.message);
  }

  const supabase = await createSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("todos").insert({
    ...validation.data,
    created_by: user?.id ?? null,
  });

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  revalidatePath(`/firm/${data.firm_id}/dashboard`);
}

export async function updateTodo(todoId: string, data: UpdateTodoInput) {
  const validation = updateTodoSchema.safeParse(data);

  if (!validation.success) {
    throw new Error("Invalid data: " + validation.error.message);
  }

  const supabase = await createSupabaseClient();
  const { data: updated, error } = await supabase
    .from("todos")
    .update({ ...validation.data, updated_at: new Date().toISOString() })
    .eq("id", todoId)
    .select("firm_id")
    .single();

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  revalidatePath(`/firm/${updated.firm_id}/dashboard`);
}

export async function setTodoStatus(todoId: string, status: TodoStatus) {
  if (!TODO_STATUSES.includes(status)) {
    throw new Error("Invalid status: " + status);
  }

  const supabase = await createSupabaseClient();
  const { data: updated, error } = await supabase
    .from("todos")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", todoId)
    .select("firm_id")
    .single();

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  revalidatePath(`/firm/${updated.firm_id}/dashboard`);
}

export async function setTodoAssignee(
  todoId: string,
  assigneeId: string | null,
) {
  const supabase = await createSupabaseClient();
  const { data: updated, error } = await supabase
    .from("todos")
    .update({ assignee_id: assigneeId, updated_at: new Date().toISOString() })
    .eq("id", todoId)
    .select("firm_id")
    .single();

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  revalidatePath(`/firm/${updated.firm_id}/dashboard`);
}

export async function deleteTodo(todoId: string) {
  const supabase = await createSupabaseClient();
  const { data: deleted, error } = await supabase
    .from("todos")
    .delete()
    .eq("id", todoId)
    .select("firm_id")
    .single();

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  revalidatePath(`/firm/${deleted.firm_id}/dashboard`);
}

export async function listTodos(firmId: string): Promise<TodoRecord[]> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from("todos")
    .select(
      "id, firm_id, title, description, line_account_id, due_date, status, completed_at, assignee_id, created_at",
    )
    .eq("firm_id", firmId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Database error: " + error.message);
  }

  // LINE account names cannot be embedded from todos (line_accounts RLS is
  // closed to the auth role), so enrich from the admin-fetched account map.
  // Staff names come from the firm-scoped profiles list.
  const [accounts, staff] = await Promise.all([
    listAssignableLineAccounts(),
    listFirmStaff(firmId),
  ]);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const staffById = new Map(staff.map((s) => [s.id, s]));

  return (data ?? []).map((row) => {
    const account = row.line_account_id
      ? accountById.get(row.line_account_id)
      : undefined;
    return {
      ...row,
      line_account_display_name: account?.display_name ?? null,
      client_name: account?.client_name ?? null,
      assignee_name: row.assignee_id
        ? (staffById.get(row.assignee_id)?.name ?? null)
        : null,
    };
  });
}
