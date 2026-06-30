"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronsUpDown, ListChecks, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDateZhTW } from "@/lib/utils";
import type { AssignableLineAccount } from "@/lib/services/line";
import {
  createTodo,
  deleteTodo,
  setTodoStatus,
  type TodoRecord,
} from "@/lib/services/todo";

function lineAccountLabel(account: AssignableLineAccount): string {
  const name = account.display_name ?? "（未命名）";
  return account.client_name ? `${name}（客戶：${account.client_name}）` : name;
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

function LineAccountCombobox({
  accounts,
  value,
  onChange,
  disabled,
}: {
  accounts: AssignableLineAccount[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = accounts.find((a) => a.id === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? accounts.filter((a) =>
        [a.display_name, a.client_name]
          .filter((s): s is string => Boolean(s))
          .some((s) => s.toLowerCase().includes(q)),
      )
    : accounts;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? lineAccountLabel(selected) : "選擇 LINE 帳號"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋名稱或客戶"
            className="h-9"
          />
        </div>
        <div className="max-h-60 overflow-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              找不到 LINE 帳號
            </p>
          ) : (
            filtered.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => {
                  onChange(account.id);
                  setQuery("");
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-left text-base hover:bg-accent",
                  account.id === value && "bg-accent",
                )}
              >
                <span className="truncate">
                  {account.display_name ?? "（未命名）"}
                </span>
                {account.client_name && (
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {account.client_name}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TodoWidget({
  firmId,
  todos,
  lineAccounts,
}: {
  firmId: string;
  todos: TodoRecord[];
  lineAccounts: AssignableLineAccount[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lineAccountId, setLineAccountId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState("");

  const openTodos = todos.filter((t) => t.status !== "done");
  const doneTodos = todos.filter((t) => t.status === "done");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setLineAccountId(null);
    setDueDate("");
  };

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("請輸入標題。");
      return;
    }
    if (!lineAccountId) {
      toast.error("請選擇 LINE 帳號。");
      return;
    }
    startTransition(async () => {
      try {
        await createTodo({
          firm_id: firmId,
          title: title.trim(),
          description: description.trim() || null,
          line_account_id: lineAccountId,
          due_date: dueDate || null,
        });
        toast.success("已新增待辦。");
        resetForm();
        setDialogOpen(false);
        router.refresh();
      } catch {
        toast.error("新增失敗，請稍後再試。");
      }
    });
  };

  const handleToggle = (todo: TodoRecord, done: boolean) => {
    startTransition(async () => {
      try {
        await setTodoStatus(todo.id, done ? "done" : "open");
        router.refresh();
      } catch {
        toast.error("更新失敗，請稍後再試。");
      }
    });
  };

  const handleDelete = (todo: TodoRecord) => {
    startTransition(async () => {
      try {
        await deleteTodo(todo.id);
        toast.success("已刪除待辦。");
        router.refresh();
      } catch {
        toast.error("刪除失敗，請稍後再試。");
      }
    });
  };

  const renderTodo = (todo: TodoRecord) => {
    const done = todo.status === "done";
    const overdue = !done && isOverdue(todo.due_date);
    return (
      <li key={todo.id} className="flex items-start gap-3 py-3">
        <Checkbox
          checked={done}
          onCheckedChange={(checked) => handleToggle(todo, checked === true)}
          disabled={isPending}
          className="mt-1"
          aria-label={done ? "標記為未完成" : "標記為完成"}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "text-base font-medium text-slate-900",
              done && "text-muted-foreground line-through",
            )}
          >
            {todo.title}
          </span>
          {todo.description && (
            <span className="text-sm whitespace-pre-wrap break-words text-slate-600">
              {todo.description}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              LINE · {todo.line_account_display_name ?? "（未命名）"}
            </span>
            {todo.client_name && <span>客戶：{todo.client_name}</span>}
            {todo.due_date && (
              <span
                className={cn(overdue && "font-medium text-destructive")}
              >
                截止 {formatDateZhTW(new Date(todo.due_date))}
                {overdue && "（已逾期）"}
              </span>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => handleDelete(todo)}
          disabled={isPending}
          aria-label="刪除待辦"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </li>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-emerald-600" />
          待辦事項
          {openTodos.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              · {openTodos.length} 項待處理
            </span>
          )}
        </CardTitle>
        <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新增待辦
        </Button>
      </CardHeader>
      <CardContent>
        {openTodos.length === 0 ? (
          <p className="text-base text-muted-foreground">目前沒有待辦事項。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {openTodos.map(renderTodo)}
          </ul>
        )}

        {doneTodos.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="text-sm text-muted-foreground hover:text-slate-900"
            >
              {showCompleted
                ? "隱藏已完成"
                : `顯示已完成（${doneTodos.length}）`}
            </button>
            {showCompleted && (
              <ul className="divide-y divide-slate-100">
                {doneTodos.map(renderTodo)}
              </ul>
            )}
          </div>
        )}
      </CardContent>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增待辦</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="todo-title">標題</Label>
              <Input
                id="todo-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：提醒客戶補上傳發票"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="todo-description">說明（選填）</Label>
              <textarea
                id="todo-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="補充細節（選填）"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>LINE 帳號</Label>
              <LineAccountCombobox
                accounts={lineAccounts}
                value={lineAccountId}
                onChange={setLineAccountId}
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="todo-due">截止日（選填）</Label>
              <Input
                id="todo-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="button" onClick={handleCreate} disabled={isPending}>
              新增
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
