"use client";

import { useState, useMemo, useEffect } from "react";
import { Check, Upload, Plus, FileText, Briefcase, FileSignature, MapPin, BadgeDollarSign, Building, HelpCircle, Trash2, Info, MessageSquare, AlertCircle, Building2, Store, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// --- Types ---
type OrgType = 'firm' | 'ltd' | 'inc' | null;
type StepKey = 'shareholders' | 'capital' | 'lease' | 'taxbill' | 'charter' | 'directors' | 'other';

type Shareholder = {
  id: string;
  name: string;
  idNumber: string;
  birthday: string;
  address: string;
  investmentAmount: string;
  idFront: File | null;
  idBack: File | null;
};

type Director = {
  id: string;
  title: string;
  name: string;
  idNumber: string;
  address: string;
  investmentAmount: string;
  isCorporateRep: boolean;
  corporateName: string;
};

// --- Q&A Content Dictionary (Tagging System) ---
type QAItem = {
  q: string;
  a: string;
  appliesTo?: OrgType[];
};

const QA_CONTENT: Record<StepKey, QAItem[]> = {
  shareholders: [
    { q: "誰需要列入出資者/合夥人名冊？", a: "所有參與出資的人都需要列入。", appliesTo: ['firm'] },
    { q: "誰需要列入股東名冊？", a: "所有出資的股東都需要列入，不管是自然人或是法人。如果有外資，需要另外進行投審會審查手續。", appliesTo: ['ltd', 'inc'] },
  ],
  capital: [
    { q: "行號需要籌備處帳戶嗎？", a: "出資額大於25萬以上才需要，如果低於25萬，那麼不需要出資額證明。", appliesTo: ['firm'] },
    { q: "如何取得餘額證明？", a: "首先至銀行開設「公司籌備處」帳戶，股東各自依照出資額將資本額匯入，並且取得存摺封面、內頁、以及餘額頁；接著隔天請銀行開立餘額證明，或次日存入1000元後再刷存摺。", appliesTo: ['ltd', 'inc'] },
    { q: "銀行開立餘額證明困難該怎麼辦？", a: "資本額都存入籌備戶後，隔天再存入1000元，然後再刷存摺，這樣也能證明資本額在前一天的24點以前都沒動用，可以做為餘額證明替代使用。", appliesTo: ['ltd', 'inc'] },
    { q: "資本額可以分次存入嗎？", a: "可以，但需要能看得出來每個股東各自匯款多少。" }
  ],
  lease: [
    { q: "租約可以用負責人名義簽訂嗎？", a: "不行，請以公司籌備處或正式公司名稱與房東簽約，不然會變成負責人租了多處房屋，每個都可以做登記使用了。" },
    { q: "房東不同意租約給公司/行號使用怎麼辦？", a: "依舊需要房東出具房屋使用同意書代替，否則無法辦理登記。" },
    { q: "可以跟二房東簽約嗎？", a: "不行，必須跟屋主簽約，且需要屋主同意；除非原本二房東跟屋主的租約有非常明確的「同意轉租條款」才可以(一定是要寫在租約裡面可以算數)。" },
    { q: "負責人自己的房子還需要簽訂租約或使用同意書嗎？", a: "要，因為公司是獨立法人，需要證明公司有使用該地址的權利，雖然行號可以放寬不取得，但是實務上國稅局仍會要求提供。" }, // 未標註 appliesTo，代表所有型態皆適用
  ],
  taxbill: [
    { q: "無法取得或是遺失房屋稅單該怎麼辦？", a: "可以至稅捐機關申請補發，或是提供建物所有權狀影本代替。" },
    { q: "屋主有二人以上時？", a: "若擁有多位屋主需至少 1/2 以上同意，所以租約或房屋使用同意書，需要1/2以上所有人的簽名或蓋章" },
    { q: "房屋稅單影本有的效期限？", a: "必須為最近一期的房屋稅單，舉例來說，115年5月政府會發出115年的房屋稅稅單，因此115年4月以前申請的，都能用114年的房屋稅作為證明，超過115年5月以後申請，就只能提供115年的房屋稅單了" } // 所有型態通用
  ],
  charter: [
    { q: "合夥契約可以自己寫嗎？", a: "可以，清楚訂定雙方出資比例與利潤分配即可。", appliesTo: ['firm'] },
    { q: "公司章程可以自己寫嗎？", a: "可以，經濟部有提供範本，建議根據公司的實際分潤、股份轉讓限制等需求進行調整。", appliesTo: ['ltd', 'inc'] },
    { q: "自己寫的文件有問題會被退件嗎？", a: "不用擔心，我們會協助審核，確保內容符合相關法規的規定。" } // 通用
  ],
  directors: [
    { q: "負責人可以隨時更換嗎？", a: "如果有兩位以上合夥人，負責人可以經由合夥人同意後更換。", appliesTo: ['firm'] },
    { q: "有限公司也需要董監事名單嗎？", a: "有限公司只需設立董事(至少一人)執行業務並代表公司，不用監察人。", appliesTo: ['ltd'] },
    { q: "董事或監察人最低人數多少？", a: "至少需要一名董事及一名監察人；但如果是由單一法人股東組成(就是說股東只有一人，且該股東是法人而非自然人)，則可免設監察人。", appliesTo: ['inc'] },
    { q: "負責人或監察人一定要股東嗎？", a: "不一定，負責人或監察人可以由股東或非股東擔任。", appliesTo: ['inc'] },
    { q: "有限公司的董事可以一定要由股東擔任嗎？", a: "是的，有限公司的董事只能由股東擔任。", appliesTo: ['ltd'] },
  ],
  other: [
    { q: "我還有其他問題不清楚該怎麼辦？", a: "不用擔心，收到文件後我們仍將審理，若有問題，將主動與您聯繫" },
    { q: "流程中沒有寫道的問題該怎處理", a: "在這邊填寫，我們都會與您確認" }
  ]
};

export default function CompanySetupPage() {
  // --- Main Setup States ---
  const [orgType, setOrgType] = useState<OrgType>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // Global Status State keyed by StepKey
  const [stepStatuses, setStepStatuses] = useState<Record<string, 'idle' | 'complete' | 'incomplete'>>({
    shareholders: 'idle', capital: 'idle', lease: 'idle', taxbill: 'idle', charter: 'idle', directors: 'idle', other: 'idle'
  });
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  // --- Step States ---
  const [shareholders, setShareholders] = useState<Shareholder[]>([
    { id: "1", name: "", idNumber: "", birthday: "", address: "", investmentAmount: "", idFront: null, idBack: null }
  ]);
  const [useAlternativeBalanceCheck, setUseAlternativeBalanceCheck] = useState(false);
  const [charterOption, setCharterOption] = useState<'own' | 'draft' | null>(null);
  const [directors, setDirectors] = useState<Director[]>([
    { id: "1", title: "董事長", name: "", idNumber: "", address: "", investmentAmount: "", isCorporateRep: false, corporateName: "" },
    { id: "2", title: "監察人", name: "", idNumber: "", address: "", investmentAmount: "", isCorporateRep: false, corporateName: "" }
  ]);
  const [responsiblePersonId, setResponsiblePersonId] = useState<string>("");
  const [otherNotes, setOtherNotes] = useState("");

  const [files, setFiles] = useState<Record<string, File | null>>({
    passbookFront: null, passbookInner: null, passbookAmount: null, balanceCert: null,
    leaseAgreement: null, taxBill: null, charterFile: null
  });

  // --- Derived Calculations ---
  const totalInvestment = shareholders.reduce((sum, s) => sum + (parseInt(s.investmentAmount) || 0), 0);
  const validShareholdersCount = shareholders.filter(s => s.name.trim() !== "").length || shareholders.length;

  // --- Dynamic Flow Configuration ---
  const currentSteps = useMemo(() => {
    if (!orgType) return [];

    const steps: { id: StepKey, title: string, desc: string, icon: any, number: number }[] = [];
    let counter = 1;

    // Step 1: Shareholders
    steps.push({ id: 'shareholders', number: counter++, title: orgType === 'firm' ? "出資者名冊" : "股東名冊", desc: "建立基本資料", icon: Briefcase });

    // Step 2: Capital Proof (Conditionally hidden for firm <= 250k)
    const isFirmAndLowCapital = orgType === 'firm' && totalInvestment <= 250000;
    if (!isFirmAndLowCapital) {
      steps.push({ id: 'capital', number: counter++, title: "資本額證明", desc: "相關證明文件", icon: BadgeDollarSign });
    }

    // Step 3 & 4: Lease & Tax Bill
    steps.push({ id: 'lease', number: counter++, title: "房屋租約或使用同意書", desc: "公司所在地", icon: MapPin });
    steps.push({ id: 'taxbill', number: counter++, title: "房屋稅單", desc: "最近一期房屋稅單", icon: FileText });

    // Step 5: Charter / Partnership (Hidden for Firm Solopreneur)
    const isFirmAndSingle = orgType === 'firm' && validShareholdersCount <= 1;
    if (!isFirmAndSingle) {
      steps.push({
        id: 'charter',
        number: counter++,
        title: orgType === 'firm' ? "合夥契約書" : "公司章程",
        desc: "運作規範文件",
        icon: FileSignature
      });
    }

    // Step 6: Directors / Responsible Person
    steps.push({
      id: 'directors',
      number: counter++,
      title: orgType === 'inc' ? "董監事名單" : (orgType === 'ltd' ? "董事設定" : "負責人設定"),
      desc: orgType === 'inc' ? "公司管理階層" : "選定負責人",
      icon: Building
    });

    // Step 7: Completion
    steps.push({ id: 'other', number: counter++, title: "完成送出", desc: "補充說明與提交", icon: MessageSquare });

    return steps;
  }, [orgType, totalInvestment, validShareholdersCount]);

  const activeStep = currentSteps[activeStepIndex] || null;

  // --- Reset/Init Helper ---
  useEffect(() => {
    if ((orgType === 'firm' || orgType === 'ltd') && shareholders.length > 0 && !responsiblePersonId) {
      setResponsiblePersonId(shareholders[0].id);
    }
  }, [orgType, shareholders, responsiblePersonId]);

  // --- Handlers ---
  const addShareholder = () => {
    setShareholders([
      ...shareholders,
      { id: Math.random().toString(36).substr(2, 9), name: "", idNumber: "", birthday: "", address: "", investmentAmount: "", idFront: null, idBack: null }
    ]);
  };
  const updateShareholder = (id: string, field: keyof Shareholder, value: any) => {
    setShareholders(shareholders.map(s => s.id === id ? { ...s, [field]: value } : s));
  };
  const removeShareholder = (id: string) => {
    setShareholders(shareholders.filter(s => s.id !== id));
  };
  const handleShareholderFileUpload = (id: string, side: 'idFront' | 'idBack', e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      updateShareholder(id, side, e.target.files[0]);
    }
  };

  const addDirector = () => {
    setDirectors([
      ...directors,
      { id: Math.random().toString(36).substr(2, 9), title: "董事", name: "", idNumber: "", address: "", investmentAmount: "", isCorporateRep: false, corporateName: "" }
    ]);
  };
  const updateDirector = (id: string, field: keyof Director, value: any) => {
    setDirectors(directors.map(d => d.id === id ? { ...d, [field]: value } : d));
  };
  const removeDirector = (id: string) => {
    setDirectors(directors.filter(d => d.id !== id));
  };

  const validateStep = (id: StepKey): boolean => {
    switch (id) {
      case 'shareholders':
        return shareholders.length > 0 && shareholders.every(s =>
          s.name.trim() !== "" && s.idNumber.trim() !== "" && s.birthday !== "" &&
          s.address.trim() !== "" && s.investmentAmount !== "" && s.idFront && s.idBack
        );
      case 'capital':
        if (orgType === 'firm') {
          return !!(files.passbookFront && files.passbookInner && files.passbookAmount);
        }
        if (useAlternativeBalanceCheck) {
          return !!(files.passbookFront && files.passbookInner && files.passbookAmount);
        }
        return !!(files.passbookFront && files.passbookInner && files.passbookAmount && files.balanceCert);
      case 'lease':
        return !!files.leaseAgreement;
      case 'taxbill':
        return !!files.taxBill;
      case 'charter':
        if (!charterOption) return false;
        if (charterOption === 'own') return !!files.charterFile;
        return true;
      case 'directors':
        if (orgType === 'firm' || orgType === 'ltd') return responsiblePersonId !== "";
        return directors.length > 0 && directors.every(d =>
          d.title.trim() !== "" && d.name.trim() !== "" && d.idNumber.trim() !== "" &&
          d.address.trim() !== "" && d.investmentAmount !== "" &&
          (!d.isCorporateRep || (d.isCorporateRep && d.corporateName.trim() !== ""))
        );
      case 'other':
        return true;
      default:
        return false;
    }
  };

  const handleSaveStep = (stepKey: StepKey) => {
    const isValid = validateStep(stepKey);
    setStepStatuses(prev => ({ ...prev, [stepKey]: isValid ? 'complete' : 'incomplete' }));
  };

  // --- Render Sections ---
  if (!orgType) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-4xl w-full">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold tracking-tight">歡迎使用線上設立登記服務</h1>
            <p className="text-muted-foreground mt-3 text-lg">請先選擇您預計設立的組織型態，我們將為您安排專屬的檢核流程。</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="cursor-pointer hover:border-blue-500 hover:ring-2 hover:ring-blue-200 transition-all shadow-sm hover:shadow-md bg-white dark:bg-slate-900" onClick={() => setOrgType('firm')}>
              <CardContent className="p-8 text-center flex flex-col items-center">
                <div className="h-16 w-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                  <Store className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-2">行號</h3>
                <p className="text-muted-foreground text-sm">程序簡便，適合獨資或合夥經營的小型商家或工作室。</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:border-purple-500 hover:ring-2 hover:ring-purple-200 transition-all shadow-sm hover:shadow-md bg-white dark:bg-slate-900" onClick={() => setOrgType('ltd')}>
              <CardContent className="p-8 text-center flex flex-col items-center">
                <div className="h-16 w-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-6">
                  <Building2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-2">有限公司</h3>
                <p className="text-muted-foreground text-sm">有限債務責任，適合多數中小企業與新創團隊，架構靈活。</p>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:border-teal-500 hover:ring-2 hover:ring-teal-200 transition-all shadow-sm hover:shadow-md bg-white dark:bg-slate-900" onClick={() => setOrgType('inc')}>
              <CardContent className="p-8 text-center flex flex-col items-center">
                <div className="h-16 w-16 bg-teal-100 text-teal-600 rounded-2xl flex items-center justify-center mb-6">
                  <Factory className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-2">股份有限公司</h3>
                <p className="text-muted-foreground text-sm">適合未來有大規模募資、發行股票或上市櫃計畫的企業。</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const renderShareholderStep = () => {
    const isFirm = orgType === 'firm';
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">{isFirm ? "出資者/合夥人資料" : "股東名冊資料"}</h3>
            <p className="text-sm text-muted-foreground">請填寫所有{isFirm ? "出資者" : "股東"}的基本資料並上傳身分證正反面影本。</p>
          </div>
          <Button onClick={addShareholder} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            新增{isFirm ? "人員" : "股東"}
          </Button>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-900 whitespace-nowrap">
                <TableHead className="min-w-[120px]">姓名 <span className="text-red-500">*</span></TableHead>
                <TableHead className="min-w-[140px]">身分證/統編 <span className="text-red-500">*</span></TableHead>
                <TableHead className="min-w-[140px]">生日 <span className="text-red-500">*</span></TableHead>
                <TableHead className="min-w-[200px]">戶籍地址 <span className="text-red-500">*</span></TableHead>
                <TableHead className="min-w-[120px]">出資額 <span className="text-red-500">*</span></TableHead>
                <TableHead className="w-[120px]">身分證正面 <span className="text-red-500">*</span></TableHead>
                <TableHead className="w-[120px]">身分證背面 <span className="text-red-500">*</span></TableHead>
                <TableHead className="w-[80px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shareholders.map((person) => (
                <TableRow key={person.id}>
                  <TableCell>
                    <Input placeholder="陳大文" value={person.name} onChange={(e) => updateShareholder(person.id, 'name', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input placeholder="A123456789" value={person.idNumber} onChange={(e) => updateShareholder(person.id, 'idNumber', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input type="date" value={person.birthday} onChange={(e) => updateShareholder(person.id, 'birthday', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input placeholder="台北市信義區..." value={person.address} onChange={(e) => updateShareholder(person.id, 'address', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" placeholder="100000" value={person.investmentAmount} onChange={(e) => updateShareholder(person.id, 'investmentAmount', e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <div className="relative">
                      <Input type="file" accept="image/*" className="hidden" id={`front-${person.id}`} onChange={(e) => handleShareholderFileUpload(person.id, 'idFront', e)} />
                      <label htmlFor={`front-${person.id}`} className="cursor-pointer flex items-center justify-center w-full h-10 border rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm whitespace-nowrap px-2">
                        {person.idFront ? <><Check className="w-4 h-4 mr-1 text-green-500" /> 已上傳</> : <><Upload className="w-4 h-4 mr-1" /> 上傳</>}
                      </label>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="relative">
                      <Input type="file" accept="image/*" className="hidden" id={`back-${person.id}`} onChange={(e) => handleShareholderFileUpload(person.id, 'idBack', e)} />
                      <label htmlFor={`back-${person.id}`} className="cursor-pointer flex items-center justify-center w-full h-10 border rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm whitespace-nowrap px-2">
                        {person.idBack ? <><Check className="w-4 h-4 mr-1 text-green-500" /> 已上傳</> : <><Upload className="w-4 h-4 mr-1" /> 上傳</>}
                      </label>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeShareholder(person.id)} disabled={shareholders.length === 1} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-blue-50/50 dark:bg-blue-900/20 font-bold">
                <TableCell colSpan={4} className="text-right">總出資額合計：</TableCell>
                <TableCell className="text-blue-700 dark:text-blue-300">${totalInvestment.toLocaleString()}</TableCell>
                <TableCell colSpan={3}></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {isFirm && totalInvestment <= 250000 && (
          <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
            <Info className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-sm font-bold text-green-800 dark:text-green-300">行號資本額免責免附提醒</AlertTitle>
            <AlertDescription className="text-sm text-green-700 dark:text-green-400 mt-1">
              因為行號且總出資額未超過或等於 250,000 元，流程中已<span className="font-bold underline">自動省略</span>「資本額證明」步驟。
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  const renderCapitalStep = () => {
    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-medium mb-1">存摺影本</h3>
          <p className="text-sm text-muted-foreground mb-4">請上傳籌備處或負責人帳戶的相關存摺頁面照片或掃描檔。</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-6 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-900/50 gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-sm">存摺封面</p>
                <p className="text-xs text-muted-foreground mt-1">需有戶名與帳號</p>
              </div>
              <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => document.getElementById('passbookFront')?.click()}>
                {files.passbookFront ? <><Check className="w-4 h-4 mr-2 text-green-500" /> 已選擇</> : <><Upload className="h-4 w-4 mr-2" /> 選擇檔案</>}
              </Button>
              <input type="file" id="passbookFront" className="hidden" onChange={(e) => setFiles({ ...files, passbookFront: e.target.files?.[0] || null })} />
            </div>

            <div className="border rounded-lg p-6 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-900/50 gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-sm">存摺內頁</p>
                <p className="text-xs text-muted-foreground mt-1">印鑑頁或規定內頁</p>
              </div>
              <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => document.getElementById('passbookInner')?.click()}>
                {files.passbookInner ? <><Check className="w-4 h-4 mr-2 text-green-500" /> 已選擇</> : <><Upload className="h-4 w-4 mr-2" /> 選擇檔案</>}
              </Button>
              <input type="file" id="passbookInner" className="hidden" onChange={(e) => setFiles({ ...files, passbookInner: e.target.files?.[0] || null })} />
            </div>

            <div className="border rounded-lg p-6 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-900/50 gap-3">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <BadgeDollarSign className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-sm">存摺金額頁</p>
                <p className="text-xs text-muted-foreground mt-1">需顯示資本額存入</p>
              </div>
              <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => document.getElementById('passbookAmount')?.click()}>
                {files.passbookAmount ? <><Check className="w-4 h-4 mr-2 text-green-500" /> 已選擇</> : <><Upload className="h-4 w-4 mr-2" /> 選擇檔案</>}
              </Button>
              <input type="file" id="passbookAmount" className="hidden" onChange={(e) => setFiles({ ...files, passbookAmount: e.target.files?.[0] || null })} />
            </div>
          </div>
        </div>

        {orgType !== 'firm' && (
          <>
            <Separator />
            <div>
              <h3 className="text-lg font-medium mb-1">第二部分：餘額證明</h3>
              <p className="text-sm text-muted-foreground mb-4">您可以向銀行申請存款餘額證明，或選擇次日存入 1000 元作為替代。</p>

              <div className="flex items-center space-x-2 my-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border">
                <Checkbox
                  id="alt-balance"
                  checked={useAlternativeBalanceCheck}
                  onCheckedChange={(checked) => setUseAlternativeBalanceCheck(!!checked)}
                />
                <Label htmlFor="alt-balance" className="font-medium cursor-pointer">採用次日存入 1000 元替代餘額證明</Label>
              </div>

              {useAlternativeBalanceCheck ? (
                <Alert className="bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800">
                  <Info className="h-5 w-5" />
                  <AlertTitle className="font-bold ml-2">採用次日存入1000元替代餘額證明：</AlertTitle>
                  <AlertDescription className="ml-2 mt-2 leading-relaxed">
                    並務必於存入資本額於籌備戶的<span className="font-bold underline">隔天</span>，存入1000元後再刷一次存摺，並且在第一部分上傳存摺金額頁，作為餘額證明替代使用。
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="mt-4 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-medium">上傳餘額證明</p>
                    <p className="text-sm text-muted-foreground mt-1">請上傳銀行開立之存款餘額證明書</p>
                  </div>
                  <Button variant="outline" onClick={() => document.getElementById('balanceCert')?.click()}>
                    {files.balanceCert ? <><Check className="w-4 h-4 mr-2 text-green-500" /> 已選擇</> : <><Upload className="w-4 h-4 mr-2" /> 選擇檔案</>}
                  </Button>
                  <input type="file" id="balanceCert" className="hidden" onChange={(e) => setFiles({ ...files, balanceCert: e.target.files?.[0] || null })} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderArticlesStep = () => {
    const title = orgType === 'firm' ? "合夥契約書" : "公司章程";
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-medium mb-4">請選擇 {title} 的準備方式：</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className={`border rounded-lg p-6 cursor-pointer flex flex-col items-center text-center transition-all ${charterOption === 'own' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
            onClick={() => setCharterOption('own')}
          >
            <div className={`h-6 w-6 rounded-full border flex items-center justify-center mb-4 ${charterOption === 'own' ? 'border-primary' : 'border-muted-foreground'}`}>
              {charterOption === 'own' && <div className="h-3 w-3 rounded-full bg-primary" />}
            </div>
            <h4 className="font-semibold text-lg mb-2">我有自己的{title}</h4>
            <p className="text-sm text-muted-foreground">我已備妥相關檔案，直接上傳即可。</p>
          </div>

          <div
            className={`border rounded-lg p-6 cursor-pointer flex flex-col items-center text-center transition-all ${charterOption === 'draft' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
            onClick={() => setCharterOption('draft')}
          >
            <div className={`h-6 w-6 rounded-full border flex items-center justify-center mb-4 ${charterOption === 'draft' ? 'border-primary' : 'border-muted-foreground'}`}>
              {charterOption === 'draft' && <div className="h-3 w-3 rounded-full bg-primary" />}
            </div>
            <h4 className="font-semibold text-lg mb-2">請幫我草擬{title}</h4>
            <p className="text-sm text-muted-foreground">如果您還沒有頭緒，我們可以協助您起草基本規範。</p>
          </div>
        </div>

        {charterOption === 'own' && (
          <div className="mt-8 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">上傳{title}</p>
              <p className="text-sm text-muted-foreground mt-1">支援 PDF 或 Word 檔案</p>
            </div>
            <Button variant="outline" onClick={() => document.getElementById('charterFile')?.click()}>
              {files.charterFile ? <><Check className="w-4 h-4 mr-2 text-green-500" /> 已選擇</> : <><Upload className="w-4 h-4 mr-2" /> 選擇檔案</>}
            </Button>
            <input type="file" id="charterFile" className="hidden" onChange={(e) => setFiles({ ...files, charterFile: e.target.files?.[0] || null })} />
          </div>
        )}

        {charterOption === 'draft' && (
          <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded-lg text-center flex flex-col items-center gap-3 animate-in fade-in slide-in-from-top-4">
            <div className="h-10 w-10 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-sm">
              <FileSignature className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-blue-800 dark:text-blue-200 font-medium">✨ 我們將為您擬稿後，提供給您參考與確認。</p>
          </div>
        )}
      </div>
    );
  };

  const renderDirectorsStep = () => {
    // --- Firm & Ltd Logic (Radio Select) ---
    if (orgType === 'firm' || orgType === 'ltd') {
      const validShareholders = shareholders.filter(s => s.name.trim() !== "");
      const title = orgType === 'firm' ? "負責人設定" : "董事設定";
      const desc = orgType === 'firm'
        ? "請由下方的合夥人中選擇一位擔任行號的商業負責人。"
        : "請由下方的股東中選擇一位擔任有限公司的董事（負責人）。";

      return (
        <div className="space-y-6">
          <div className="mb-4">
            <h3 className="text-lg font-medium">{title}</h3>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>

          <div className="border rounded-md p-6 bg-slate-50 dark:bg-slate-900">
            {validShareholders.length === 0 ? (
              <p className="text-sm text-amber-600">請先返回步驟一「出資者/股東名冊」填寫姓名，才能選擇負責人。</p>
            ) : (
              <RadioGroup value={responsiblePersonId} onValueChange={setResponsiblePersonId}>
                {validShareholders.map((person) => (
                  <div key={person.id} className="flex items-center space-x-3 mb-4 last:mb-0 bg-white dark:bg-slate-950 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 cursor-pointer" onClick={() => setResponsiblePersonId(person.id)}>
                    <RadioGroupItem value={person.id} id={`resp-${person.id}`} />
                    <Label htmlFor={`resp-${person.id}`} className="font-semibold cursor-pointer w-full flex justify-between items-center text-base">
                      {person.name}
                      <span className="text-sm font-normal text-muted-foreground">
                        {person.idNumber} | 出資：${parseInt(person.investmentAmount || '0').toLocaleString()}
                      </span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          </div>
        </div>
      );
    }

    // --- Inc Logic (Original Table) ---
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">董監事名單</h3>
            <p className="text-sm text-muted-foreground">請提供公司的管理階層人員名單與相關資訊。</p>
          </div>
          <Button onClick={addDirector} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            新增職位
          </Button>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-900 whitespace-nowrap">
                <TableHead className="min-w-[140px]">職稱 <span className="text-red-500">*</span></TableHead>
                <TableHead className="min-w-[120px]">姓名 <span className="text-red-500">*</span></TableHead>
                <TableHead className="min-w-[140px]">身分證字號 <span className="text-red-500">*</span></TableHead>
                <TableHead className="min-w-[200px]">戶籍地址 <span className="text-red-500">*</span></TableHead>
                <TableHead className="min-w-[120px]">出資額 <span className="text-red-500">*</span></TableHead>
                {/* 只有當股東名冊中有8碼的法人時才顯示法人代表相關欄位 */}
                {shareholders.some(s => s.idNumber.length === 8) && (
                  <>
                    <TableHead className="w-[100px]">法人代表</TableHead>
                    <TableHead className="min-w-[200px]">法人名稱</TableHead>
                  </>
                )}
                <TableHead className="w-[80px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {directors.map((person, index) => {
                const isFixed = index < 2; // Chairman and Supervisor are fixed
                const corporateShareholders = shareholders.filter(s => s.idNumber.trim().length === 8);
                const hasCorporateShareholders = corporateShareholders.length > 0;

                return (
                  <TableRow key={person.id}>
                    <TableCell>
                      <Select
                        value={person.title}
                        onValueChange={(val) => updateDirector(person.id, 'title', val)}
                        disabled={isFixed}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="請選擇職稱" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="董事長">董事長</SelectItem>
                          <SelectItem value="董事">董事</SelectItem>
                          <SelectItem value="監察人">監察人</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input placeholder="陳大文" value={person.name} onChange={(e) => updateDirector(person.id, 'name', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input placeholder="A123456789" value={person.idNumber} onChange={(e) => updateDirector(person.id, 'idNumber', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input placeholder="台北市信義區..." value={person.address} onChange={(e) => updateDirector(person.id, 'address', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" placeholder="100000" value={person.investmentAmount} onChange={(e) => updateDirector(person.id, 'investmentAmount', e.target.value)} />
                    </TableCell>

                    {/* 條件式顯示法人代表欄位 */}
                    {hasCorporateShareholders && (
                      <>
                        <TableCell className="text-center">
                          <div className="flex justify-center items-center h-full">
                            <Checkbox
                              checked={person.isCorporateRep}
                              onCheckedChange={(checked) => updateDirector(person.id, 'isCorporateRep', checked)}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {person.isCorporateRep ? (
                            <Select
                              value={person.corporateName}
                              onValueChange={(val) => updateDirector(person.id, 'corporateName', val)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="請選擇法人股東" />
                              </SelectTrigger>
                              <SelectContent>
                                {corporateShareholders.map((s, i) => (
                                  <SelectItem key={i} value={s.name}>{s.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm text-muted-foreground pl-3">-</span>
                          )}
                        </TableCell>
                      </>
                    )}

                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDirector(person.id)}
                        disabled={isFixed}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {directors.some(d => d.isCorporateRep) && (
          <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-sm font-bold text-blue-800 dark:text-blue-300">法人代表說明：</AlertTitle>
            <AlertDescription className="text-sm text-blue-700 dark:text-blue-400 mt-1">
              法人代表是指該董事/監察人代表的是背後的法人股東，法人股東可以隨時替換該董事/監察人；例如富邦銀行的董事蔡明興，是富邦金融控股有限公司指派。
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  const renderOtherStep = () => {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium mb-4">完成送出</h3>
        <p className="text-sm text-muted-foreground mb-4">如果您有任何其他想補充的事情，請寫在下方。若無，請確認上方流程是否皆顯示為綠色勾勾，並提交您的申請。</p>
        <Label className="text-sm font-medium mb-2 block text-slate-700 dark:text-slate-300">其他要告訴我的事情（非必填）</Label>
        <textarea
          className="flex min-h-[150px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder="請在此輸入您想補充交代的事項..."
          value={otherNotes}
          onChange={(e) => setOtherNotes(e.target.value)}
        />

        {submitErrors.length > 0 && (
          <Alert variant="destructive" className="mt-6 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="font-bold">無法送出！請先補齊以下步驟：</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside mt-2 space-y-1">
                {submitErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  };

  const renderPlaceholderStep = (stepId: StepKey, title: string) => {
    const fileId = stepId === 'lease' ? 'leaseAgreement' : 'taxBill';
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-4 border-2 border-dashed rounded-lg bg-slate-50/50 dark:bg-slate-900/50 text-center px-4">
        <Upload className="h-10 w-10 text-muted-foreground mb-2" />
        <h3 className="text-xl font-medium">上傳 {title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          在此步驟上傳對應的證明文件。支援 PDF, JPG, PNG 格式。檔案大小不超過 10MB。
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => document.getElementById(fileId)?.click()}>
            {files[fileId] ? <><Check className="w-4 h-4 mr-2 text-green-500" /> 已選擇</> : "選擇檔案"}
          </Button>
          <input type="file" id={fileId} className="hidden" onChange={(e) => setFiles({ ...files, [fileId]: e.target.files?.[0] || null })} />
        </div>
      </div>
    );
  };

  if (!activeStep) return null;

  return (
    <div className="container mx-auto py-10 px-4 md:px-8 max-w-7xl animate-in fade-in">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">網路設立登記文件上傳</h1>
          <p className="text-muted-foreground mt-2">目前辦理型態：<span className="font-bold text-primary">{orgType === 'firm' ? '行號' : orgType === 'ltd' ? '有限公司' : '股份有限公司'}</span></p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOrgType(null)} className="text-muted-foreground hover:text-slate-900">
          重新選擇型態
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Left Sidebar: Flowchart */}
        <div className="w-full md:w-1/4 shrink-0">
          <Card className="sticky top-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">辦理流程</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {currentSteps.map((step, index) => {
                  const isActive = activeStepIndex === index;
                  const status = stepStatuses[step.id];

                  return (
                    <div
                      key={step.id}
                      className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group select-none cursor-pointer p-2 rounded-lg transition-colors ${isActive ? 'bg-primary/5' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      onClick={() => setActiveStepIndex(index)}
                    >
                      <div className="flex items-center gap-3 w-full">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 bg-background z-10 shrink-0 shadow-sm ${status === 'complete' ? 'border-green-500 text-green-500 bg-green-50' :
                          status === 'incomplete' ? 'border-amber-500 text-amber-500 bg-amber-50' :
                            isActive ? 'border-primary text-primary' : 'border-slate-300 text-slate-400'
                          }`}>
                          {status === 'complete' ? <Check className="w-4 h-4" /> :
                            status === 'incomplete' ? <AlertCircle className="w-4 h-4" /> :
                              <span className="text-xs font-semibold">{step.number}</span>}
                        </div>
                        <div className="flex flex-col">
                          <span className={`text-sm font-medium ${isActive ? 'text-primary font-bold' : status === 'complete' ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500'}`}>
                            {step.title}
                          </span>
                          <span className="text-xs text-muted-foreground hidden lg:block">{step.desc}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Content Area */}
        <div className="w-full md:w-3/4 flex flex-col gap-6">
          <Card className="min-h-[400px] flex flex-col shadow-sm border-slate-200/60 transition-all duration-300 animate-in fade-in-50 slide-in-from-bottom-2">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <activeStep.icon className="w-6 h-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Step {activeStep.number}: {activeStep.title}</CardTitle>
                  <CardDescription className="text-base mt-1.5">{activeStep.desc}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 flex-grow">
              {activeStep.id === 'shareholders' && renderShareholderStep()}
              {activeStep.id === 'capital' && renderCapitalStep()}
              {(activeStep.id === 'lease' || activeStep.id === 'taxbill') && renderPlaceholderStep(activeStep.id, activeStep.title)}
              {activeStep.id === 'charter' && renderArticlesStep()}
              {activeStep.id === 'directors' && renderDirectorsStep()}
              {activeStep.id === 'other' && renderOtherStep()}
            </CardContent>

            <CardFooter className="flex justify-between border-t bg-slate-50/30 pt-6">
              <Button
                variant="outline"
                onClick={() => setActiveStepIndex(Math.max(0, activeStepIndex - 1))}
                disabled={activeStepIndex === 0}
              >
                上一步
              </Button>

              <div className="flex gap-3">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all active:scale-95"
                  onClick={() => handleSaveStep(activeStep.id)}
                >
                  <Check className="w-4 h-4 mr-2" />
                  儲存
                </Button>

                {activeStepIndex === currentSteps.length - 1 ? (
                  <Button
                    onClick={() => {
                      const incompleteSteps = currentSteps.slice(0, -1)
                        .filter(step => !validateStep(step.id))
                        .map(step => `Step ${step.number}: ${step.title}`);

                      if (incompleteSteps.length > 0) {
                        setSubmitErrors(incompleteSteps);
                      } else {
                        setSubmitErrors([]);
                        alert("您的設立申請已成功送出！我們將盡快為您審核。");
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold shadow-md transition-all active:scale-95"
                  >
                    完成送出
                  </Button>
                ) : (
                  <Button
                    className="transition-all active:scale-95"
                    onClick={() => {
                      setSubmitErrors([]);
                      setActiveStepIndex(Math.min(currentSteps.length - 1, activeStepIndex + 1));
                    }}
                  >
                    下一步
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>

          {/* Dynamic Q&A Section based on orgType */}
          <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-800 dark:text-blue-300">
                <HelpCircle className="w-5 h-5" />
                常見問題 (Q&A)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(() => {
                  const relevantQAs = QA_CONTENT[activeStep.id]?.filter(qa => !qa.appliesTo || (orgType && qa.appliesTo.includes(orgType))) || [];

                  if (relevantQAs.length > 0) {
                    return relevantQAs.map((qa, index) => (
                      <Alert key={index} className="bg-white dark:bg-slate-950 border-blue-100 dark:border-blue-900">
                        <AlertTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">Q: {qa.q}</AlertTitle>
                        <AlertDescription className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                          A: {qa.a}
                        </AlertDescription>
                      </Alert>
                    ));
                  } else {
                    return <p className="text-sm text-muted-foreground py-4 text-center">目前此型態與步驟沒有相關的問答。</p>;
                  }
                })()}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
