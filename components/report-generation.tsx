"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type Client,
  tetUConfigSchema,
  type TetUConfig,
  type Allowance,
  type Invoice,
} from "@/lib/domain/models";
import { generateTxtReport, generateTetUReport } from "@/lib/services/reports";
import { toast } from "sonner";
import { RocPeriod } from "@/lib/domain/roc-period";
import { Download, FileText, Loader2 } from "lucide-react";

interface ReportGenerationProps {
  client: Client;
  period: RocPeriod;
  data: {
    invoices: Invoice[],
    allowances: Allowance[]
  };
}

export function ReportGeneration({
  client,
  period,
  data,
}: ReportGenerationProps) {
  const clientId = client.id;
  const taxId = client.tax_id;
  const [isTetUModalOpen, setIsTetUModalOpen] = useState(false);
  const [isGeneratingTxt, setIsGeneratingTxt] = useState(false);
  const hasUnconfirmedDocuments = useMemo(
    () =>
      data.invoices.some((invoice) => invoice.status !== "confirmed") ||
      data.allowances.some((allowance) => allowance.status !== "confirmed"),
    [data.invoices, data.allowances],
  );
  const disabledReason = "請先確認所有發票與折讓單，才能產生報表";

  const tetUForm = useForm<TetUConfig>({
    resolver: zodResolver(tetUConfigSchema),
    defaultValues: {
      fileNumber: "        ",
      consolidatedDeclarationCode: "0",
      declarationCode: "",
      taxPayerId: client.tax_payer_id || "",
      declarationType: "1",
      countyCity: "臺北市",
      declarationMethod: "1",
      declarerId: "",
      declarerName: "",
      declarerPhoneAreaCode: "",
      declarerPhone: "",
      declarerPhoneExtension: "",
      agentRegistrationNumber: "",
      midYearClosureTaxPayable: 0,
      previousPeriodCarryForwardTax: 0,
      midYearClosureTaxRefundable: 0,
    },
  });

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGenerateTxt = async () => {
    setIsGeneratingTxt(true);
    try {
      const content = await generateTxtReport(clientId, period.toString());
      downloadFile(content, `${taxId}.TXT`);
      toast.success(".TXT 報表產生成功");
    } catch (error) {
      toast.error(
        ".TXT 報表產生失敗: " +
          (error instanceof Error ? error.message : String(error))
      );
    } finally {
      setIsGeneratingTxt(false);
    }
  };

  const onTetUSubmit = async (values: TetUConfig) => {
    try {
      const content = await generateTetUReport(clientId, period.toString(), values);
      downloadFile(content, `${taxId}.TET_U`);
      toast.success(".TET_U 報表產生成功");
      setIsTetUModalOpen(false);
    } catch (error) {
      toast.error(
        ".TET_U 報表產生失敗: " +
          (error instanceof Error ? error.message : String(error))
      );
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>報表產生 ({period.format()})</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    onClick={handleGenerateTxt}
                    disabled={isGeneratingTxt || hasUnconfirmedDocuments}
                  >
                    {isGeneratingTxt ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    下載進銷項 .TXT
                  </Button>
                </span>
              </TooltipTrigger>
              {hasUnconfirmedDocuments && (
                <TooltipContent>
                  <p>{disabledReason}</p>
                </TooltipContent>
              )}
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={() => setIsTetUModalOpen(true)}
                    disabled={hasUnconfirmedDocuments}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    產生申報書 .TET_U
                  </Button>
                </span>
              </TooltipTrigger>
              {hasUnconfirmedDocuments && (
                <TooltipContent>
                  <p>{disabledReason}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>

      <Dialog open={isTetUModalOpen} onOpenChange={setIsTetUModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>產生 .TET_U 申報書</DialogTitle>
            <DialogDescription>請填寫報表所需之申報資訊</DialogDescription>
          </DialogHeader>
          <Form {...tetUForm}>
            <form
              onSubmit={tetUForm.handleSubmit(onTetUSubmit)}
              className="space-y-6 py-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={tetUForm.control}
                  name="taxPayerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>稅籍編號</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="例: 351406082" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={tetUForm.control}
                  name="consolidatedDeclarationCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>總繳代號</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">0: 單一機構</SelectItem>
                          <SelectItem value="1">1: 總機構彙總報繳</SelectItem>
                          <SelectItem value="2">2: 各單位分別申報</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={tetUForm.control}
                  name="declarationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>申報種類</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1: 按期申報</SelectItem>
                          <SelectItem value="2">2: 按月申報</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={tetUForm.control}
                  name="countyCity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>縣市別</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[
                            "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市",
                            "基隆市", "新竹市", "嘉義市", "新竹縣", "苗栗縣", "彰化縣",
                            "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
                            "臺東縣", "澎湖縣", "金門縣", "連江縣"
                          ].map((city) => (
                            <SelectItem key={city} value={city}>
                              {city}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={tetUForm.control}
                  name="declarationMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>申報方式</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1: 自行申報</SelectItem>
                          <SelectItem value="2">2: 委託申報</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={tetUForm.control}
                  name="agentRegistrationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>代理人登錄字號</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="委託申報時必填" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4 border rounded-md p-4">
                <h3 className="font-medium text-sm">申報人資訊</h3>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={tetUForm.control}
                    name="declarerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>姓名</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={tetUForm.control}
                    name="declarerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>身分證字號</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <FormField
                    control={tetUForm.control}
                    name="declarerPhoneAreaCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>區碼</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={tetUForm.control}
                    name="declarerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>電話</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={tetUForm.control}
                    name="declarerPhoneExtension"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>分機</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4 border rounded-md p-4">
                <h3 className="font-medium text-sm">稅額調整欄位</h3>
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={tetUForm.control}
                    name="previousPeriodCarryForwardTax"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>上期留抵稅額</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={tetUForm.control}
                    name="midYearClosureTaxPayable"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>調整補徵應繳</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={tetUForm.control}
                    name="midYearClosureTaxRefundable"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>調整應退稅額</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsTetUModalOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={tetUForm.formState.isSubmitting}
                >
                  {tetUForm.formState.isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  下載 .TET_U 報表
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
