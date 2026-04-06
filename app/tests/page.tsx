"use client";

import { useState } from "react";
import { Check, Upload, Plus, FileText, Briefcase, FileSignature, MapPin, BadgeDollarSign, Building, HelpCircle, Trash2, Info, MessageSquare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STEPS = [
  { id: 1, title: "股東名冊", desc: "建立股東資料", icon: Briefcase },
  { id: 2, title: "資本額證明", desc: "存摺影本與餘額證明", icon: BadgeDollarSign },
  { id: 3, title: "房屋租約或使用同意書", desc: "公司所在地的租賃契約", icon: MapPin },
  { id: 4, title: "房屋稅單", desc: "最近一期房屋稅單", icon: FileText },
  { id: 5, title: "公司章程", desc: "公司運作規範文件", icon: FileSignature },
  { id: 6, title: "董監事名單", desc: "公司管理階層", icon: Building },
  { id: 7, title: "完成送出", desc: "補充說明與提交", icon: MessageSquare },
];

const QA_CONTENT: Record<number, { q: string; a: string }[]> = {
  1: [
    { q: "誰需要列入股東名冊？", a: "所有出資的股東都需要列入，不管是自然人或是法人。如果有外資，需要另外進行投審會審查手續(投審會程序需約1-2個月)。" },
    { q: "負責人可以不是股東嗎？", a: "原則上負責人（董事長/董事）必須是由具有行為能力的自然人擔任，且有限公司的董事必須是股東，股份有限公司則是負責人可由非股東擔任。" }
  ],
  2: [
    { q: "如何取得餘額證明？", a: "首先至銀行開設「公司籌備處」帳戶，股東各自依照出資額將資本額匯入，並且取得存摺封面、內頁、以及餘額頁；接著這「隔天」請銀行開立餘額證明，或是隔天存入1000元後再刷一次存摺，這樣也能證明資本額到存入的當天24點為止，資本額都還沒動用" },
    { q: "銀行開設籌備戶需要甚麼資料？", a: "每家銀行規定不同，最好先行致電銀行詢問開設「公司籌備處」帳戶需要準備甚麼資料，依照經驗，需要資料如下：1.公司名稱預查核准函、負責人雙證件、負責人小章(公司大章通常不需要，但還是因銀行規定為準)。" },
    { q: "資本額存入後當天就可以開立餘額證明嗎？", a: "不可以，因為公司法的資本充實原則，資本額需要實際到位，並且不能隨意退回股東，為了要證明資本額到晚上的24點為止還在公司帳戶，因此最快也只能「隔天」請銀行開立。" },
    { q: "資本額可以分次存入嗎？", a: "可以，但需要能看得出來每個股東各自匯款多少。" }
  ],
  3: [
    { q: "租約可以使用個人名義簽訂嗎？", a: "不行，要用公司/行號的明細跟房東簽約，如果已經用個人名義簽約了，而且房東不允許換約，這時候可以請房東出具使用同意書代替。" },
    { q: "可以跟二房東簽約嗎？", a: "不行，除非二房東跟房東的租約上面已經載明可以轉租，但條文要非常清楚的寫出來可以轉租。" },
    { q: "房東不同意租約給公司使用怎麼辦？", a: "可以請房東出具使用同意書代替，如果房東也不同意出具使用同意書，那麼該地址無法登記。" },
    { q: "房子是我負責人自己的，還需要租約嗎？", a: "還是需要租約或是使用同意書，因為法人具備自己的獨立法人格，而負責人自己的房子不必然等於是公司的房子，因此法律上仍需要有租約或是使用同意書。" },
  ],
  4: [
    { q: "為什麼需要房屋稅單？", a: "為了要確定簽約的房東是真正的屋主，而不是二房東；並且要確定房東的人數，如果房東有多人，需要至少1/2以上屋主都同意才行。" },
    { q: "如果無法取得房屋稅稅單該怎麼辦？", a: "可以提供其他證明文件，例如：建物所有權狀影本等等。" },
    { q: "房屋稅單影本有的效期限？", a: "必須要是最近一期的房屋稅單，4月以前都可以使用上一年度的，例如115年5月以其申請，都可以使用114年度的，但如果超過4月，就必須要是115年度的房屋稅單。" },
    { q: "地價稅稅單可以替代嗎？", a: "不行，必須要是房屋稅單。" },
  ],
  5: [
    { q: "公司章程可以自己寫嗎？", a: "可以，經濟部有提供公司章程的範本，但建議根據公司的實際分潤、股份轉讓限制等需求進行調整。" },
    { q: "自己寫的章程有問題會被退件嗎？", a: "不用擔心，即使是客戶撰寫的章程，我們仍會協助審核，確保章程內容符合公司法的規定。" },
  ],
  6: [
    { q: "董事或監察人一定要股東嗎？", a: "不一定，董事或監察人可以由股東擔任，也可以由非股東擔任。" },
    { q: "董事或監察人可以由外國人擔任嗎？", a: "可以，董事或監察人可以由外國人擔任，但必須提供護照影本。" },
    { q: "董事或監察人最低人數多少？", a: "股份有限公司至少需要一名董事及一名監察人；但是如果股東是由單一法人股東組成(就是只有一個股東，且該股東是法人)，則可以不設監察人。" },
  ]
};

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

export default function CompanySetupPage() {
  const [activeStep, setActiveStep] = useState(1);

  // Step 1 States
  const [shareholders, setShareholders] = useState<Shareholder[]>([
    { id: "1", name: "", idNumber: "", birthday: "", address: "", investmentAmount: "", idFront: null, idBack: null }
  ]);

  // Step 2 States
  const [useAlternativeBalanceCheck, setUseAlternativeBalanceCheck] = useState(false);

  // Step 5 States
  const [charterOption, setCharterOption] = useState<'own' | 'draft' | null>(null);

  // Step 6 States
  const [directors, setDirectors] = useState<Director[]>([
    { id: "1", title: "董事長", name: "", idNumber: "", address: "", investmentAmount: "", isCorporateRep: false, corporateName: "" },
    { id: "2", title: "監察人", name: "", idNumber: "", address: "", investmentAmount: "", isCorporateRep: false, corporateName: "" }
  ]);

  // Step 7 States
  const [otherNotes, setOtherNotes] = useState("");

  // Global Status State
  const [stepStatuses, setStepStatuses] = useState<Record<number, 'idle' | 'complete' | 'incomplete'>>({
    1: 'idle', 2: 'idle', 3: 'idle', 4: 'idle', 5: 'idle', 6: 'idle', 7: 'idle'
  });

  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  // Mandatory File States (Simplifying for demo purposes)
  const [files, setFiles] = useState<Record<string, File | null>>({
    passbookFront: null, passbookInner: null, passbookAmount: null, balanceCert: null,
    leaseAgreement: null, taxBill: null, charterFile: null
  });

  // Validation Logic
  const validateStep = (id: number): boolean => {
    switch (id) {
      case 1:
        return shareholders.length > 0 && shareholders.every(s => 
          s.name.trim() !== "" && s.idNumber.trim() !== "" && s.birthday !== "" && 
          s.address.trim() !== "" && s.investmentAmount !== "" && s.idFront && s.idBack
        );
      case 2:
        if (useAlternativeBalanceCheck) {
          return !!files.passbookAmount;
        }
        return !!(files.passbookFront && files.passbookInner && files.passbookAmount && files.balanceCert);
      case 3:
        return !!files.leaseAgreement;
      case 4:
        return !!files.taxBill;
      case 5:
        if (!charterOption) return false;
        if (charterOption === 'own') return !!files.charterFile;
        return true;
      case 6:
        return directors.length > 0 && directors.every(d => 
          d.title.trim() !== "" && d.name.trim() !== "" && d.idNumber.trim() !== "" && 
          d.address.trim() !== "" && d.investmentAmount !== "" && 
          (!d.isCorporateRep || (d.isCorporateRep && d.corporateName.trim() !== ""))
        );
      case 7:
        return true; // Optional step
      default:
        return false;
    }
  };

  const handleSaveStep = (id: number) => {
    const isValid = validateStep(id);
    setStepStatuses({ ...stepStatuses, [id]: isValid ? 'complete' : 'incomplete' });
    // Subtle feedback instead of a disruptive alert later? For now just mark.
  };

  // -- Handlers for Shareholders --
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

  // -- Handlers for Directors --
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

  // -- Render Methods --
  const renderShareholderStep = () => {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">股東名冊資料</h3>
            <p className="text-sm text-muted-foreground">請填寫所有股東的基本資料並上傳身分證正反面影本。</p>
          </div>
          <Button onClick={addShareholder} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            新增股東
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
          </Table>
        </div>
      </div>
    );
  };

  const renderCapitalStep = () => {
    return (
      <div className="space-y-8">
        <div>
          <h3 className="text-lg font-medium mb-1">第一部分：存摺影本</h3>
          <p className="text-sm text-muted-foreground mb-4">請上傳公司籌備處帳戶的相關存摺頁面照片或掃描檔。</p>
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
      </div>
    );
  };

  const renderArticlesStep = () => {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-medium mb-4">請選擇公司章程的準備方式：</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className={`border rounded-lg p-6 cursor-pointer flex flex-col items-center text-center transition-all ${charterOption === 'own' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
            onClick={() => setCharterOption('own')}
          >
            <div className={`h-6 w-6 rounded-full border flex items-center justify-center mb-4 ${charterOption === 'own' ? 'border-primary' : 'border-muted-foreground'}`}>
              {charterOption === 'own' && <div className="h-3 w-3 rounded-full bg-primary" />}
            </div>
            <h4 className="font-semibold text-lg mb-2">我有自己的章程</h4>
            <p className="text-sm text-muted-foreground">我已備妥公司章程檔案，直接上傳即可。</p>
          </div>

          <div
            className={`border rounded-lg p-6 cursor-pointer flex flex-col items-center text-center transition-all ${charterOption === 'draft' ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:border-slate-300 dark:hover:border-slate-700'}`}
            onClick={() => setCharterOption('draft')}
          >
            <div className={`h-6 w-6 rounded-full border flex items-center justify-center mb-4 ${charterOption === 'draft' ? 'border-primary' : 'border-muted-foreground'}`}>
              {charterOption === 'draft' && <div className="h-3 w-3 rounded-full bg-primary" />}
            </div>
            <h4 className="font-semibold text-lg mb-2">請幫我草擬章程</h4>
            <p className="text-sm text-muted-foreground">如果您還沒有頭緒，我們可以協助您起草基本規範。</p>
          </div>
        </div>

        {charterOption === 'own' && (
          <div className="mt-8 border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center text-center gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">上傳公司章程</p>
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

  const renderPlaceholderStep = (stepNumber: number, title: string) => {
    const fileId = stepNumber === 3 ? 'leaseAgreement' : 'taxBill';
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

  const currentStepData = STEPS.find(s => s.id === activeStep) || STEPS[0];

  return (
    <div className="container mx-auto py-10 px-4 md:px-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">設立公司上傳文件</h1>
        <p className="text-muted-foreground mt-2">請依序完成以下步驟，備妥公司設立所需之文件。</p>
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
                {STEPS.map((step, index) => {
                  const isActive = activeStep === step.id;
                  const status = stepStatuses[step.id];

                  return (
                    <div
                      key={step.id}
                      className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group select-none cursor-pointer p-2 rounded-lg transition-colors ${isActive ? 'bg-primary/5' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      onClick={() => setActiveStep(step.id)}
                    >
                      {/* Only showing as a list for better side-navigation aesthetics */}
                      <div className="flex items-center gap-3 w-full">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 bg-background z-10 shrink-0 ${
                          status === 'complete' ? 'border-green-500 text-green-500 bg-green-50' : 
                          status === 'incomplete' ? 'border-amber-500 text-amber-500 bg-amber-50' :
                          isActive ? 'border-primary text-primary' : 'border-slate-300 text-slate-400'
                        }`}>
                          {status === 'complete' ? <Check className="w-4 h-4" /> : 
                           status === 'incomplete' ? <AlertCircle className="w-4 h-4" /> :
                           <span className="text-xs font-semibold">{step.id}</span>}
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
                  <currentStepData.icon className="w-6 h-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Step {currentStepData.id}: {currentStepData.title}</CardTitle>
                  <CardDescription className="text-base mt-1.5">{currentStepData.desc}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 flex-grow">
              {activeStep === 1 && renderShareholderStep()}
              {activeStep === 2 && renderCapitalStep()}
              {activeStep === 3 && renderPlaceholderStep(activeStep, currentStepData.title)}
              {activeStep === 4 && renderPlaceholderStep(activeStep, currentStepData.title)}
              {activeStep === 5 && renderArticlesStep()}
              {activeStep === 6 && renderDirectorsStep()}
              {activeStep === 7 && renderOtherStep()}
            </CardContent>
            <CardFooter className="flex justify-between border-t bg-slate-50/30 pt-6">
              <Button
                variant="outline"
                onClick={() => setActiveStep(Math.max(1, activeStep - 1))}
                disabled={activeStep === 1}
              >
                上一步
              </Button>

              <div className="flex gap-3">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all active:scale-95"
                  onClick={() => {
                    handleSaveStep(activeStep);
                  }}
                >
                  <Check className="w-4 h-4 mr-2" />
                  儲存
                </Button>

                {activeStep === STEPS.length ? (
                  <Button
                    onClick={() => {
                      const incompleteSteps = STEPS.slice(0, -1)
                        .filter(step => !validateStep(step.id))
                        .map(step => `Step ${step.id}: ${step.title}`);
                      
                      if (incompleteSteps.length > 0) {
                        setSubmitErrors(incompleteSteps);
                      } else {
                        setSubmitErrors([]);
                        alert("您的公司設立申請已成功送出！我們將盡快為您審核。");
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
                      setSubmitErrors([]); // Clear errors when moving
                      setActiveStep(Math.min(STEPS.length, activeStep + 1));
                    }}
                  >
                    下一步
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>

          {/* Q&A Section */}
          <Card className="bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-800 dark:text-blue-300">
                <HelpCircle className="w-5 h-5" />
                常見問題 (Q&A)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {QA_CONTENT[activeStep] ? (
                  QA_CONTENT[activeStep].map((qa, index) => (
                    <Alert key={index} className="bg-white dark:bg-slate-950 border-blue-100 dark:border-blue-900">
                      <AlertTitle className="text-sm font-bold text-slate-800 dark:text-slate-200">Q: {qa.q}</AlertTitle>
                      <AlertDescription className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                        A: {qa.a}
                      </AlertDescription>
                    </Alert>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">目前此步驟沒有相關的問答。</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
