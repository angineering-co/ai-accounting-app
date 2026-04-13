"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { responsiblePersonSchema, shareholderSchema } from "@/lib/domain/models";
import { updateClientSettings } from "@/lib/services/client-settings";
import type { Client } from "@/lib/domain/models";

const formSchema = z.object({
  responsible_person: responsiblePersonSchema,
  shareholders: z.array(shareholderSchema),
});

type FormValues = z.infer<typeof formSchema>;

interface PeopleSectionProps {
  clientId: string;
  client: Client;
  onSaveSuccess?: () => void;
}

export function PeopleSection({
  clientId,
  client,
  onSaveSuccess,
}: PeopleSectionProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      responsible_person: client.responsible_person ?? {
        name: client.contact_person ?? "",
        national_id: "",
        address: "",
        capital_contribution: undefined,
      },
      shareholders: client.shareholders ?? [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "shareholders",
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await updateClientSettings(clientId, values);
      form.reset(values);
      toast.success("負責人與股東資料已儲存");
      onSaveSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>負責人與股東</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">負責人</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="responsible_person.name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>姓名</FormLabel>
                      <FormControl>
                        <Input placeholder="負責人姓名" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responsible_person.national_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>身分證字號</FormLabel>
                      <FormControl>
                        <Input placeholder="身分證字號" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responsible_person.address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>戶籍地址</FormLabel>
                      <FormControl>
                        <Input placeholder="戶籍地址" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="responsible_person.capital_contribution"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>出資額</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            NT$
                          </span>
                          <Input
                            inputMode="numeric"
                            placeholder="0"
                            className="pl-12"
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                              )
                            }
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">股東</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({
                      name: "",
                      national_id: "",
                      address: "",
                      capital_contribution: undefined,
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" />
                  新增股東
                </Button>
              </div>

              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">尚未新增股東資料。</p>
              ) : (
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="relative rounded-md border p-4"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-10">
                        <FormField
                          control={form.control}
                          name={`shareholders.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>姓名</FormLabel>
                              <FormControl>
                                <Input placeholder="股東姓名" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`shareholders.${index}.national_id`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>身分證字號</FormLabel>
                              <FormControl>
                                <Input placeholder="身分證字號" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`shareholders.${index}.address`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>戶籍地址</FormLabel>
                              <FormControl>
                                <Input placeholder="戶籍地址" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`shareholders.${index}.capital_contribution`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>出資額</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                                    NT$
                                  </span>
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    placeholder="0"
                                    className="pl-12"
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) =>
                                      field.onChange(
                                        e.target.value === ""
                                          ? undefined
                                          : Number(e.target.value),
                                      )
                                    }
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || !form.formState.isDirty}
            >
              {form.formState.isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              儲存
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
