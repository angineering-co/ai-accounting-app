"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Check, ArrowRight, Building2, FileText, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { submitApplyForm, type ApplyFormData } from "@/lib/actions/apply";
import { trackApplySubmit } from "@/lib/analytics";
import { REGISTRATION_PRICING_NOTE, PRICES, LINE_URL } from "@/lib/pricing";

// ── Registration path: "我們會為您處理的事項" checklist ──────────────
const REGISTRATION_STEPS = [
  "預查公司名稱，確認可用性",
  "協助開設籌備戶，完成資本簽證",
  "備齊文件，向主管機關申請設立登記",
  "取得統一編號與公司設立登記表",
  "辦理稅籍登記，開始合法營運",
];

// ── Curated Q&As (conversion-focused, not overwhelming) ─────────────
const REGISTRATION_FAQS = [
  {
    q: "負責人一定要是股東嗎？",
    a: "有限公司的負責人必須由股東中選出。股份有限公司則可由董事會聘任非股東擔任董事(長)。",
  },
  {
    q: "資本額存入銀行後，當天就可以開餘額證明嗎？",
    a: "通常需要等 1-2 個工作日，銀行才會開立籌備戶存款餘額證明。建議預留時間，避免影響設立流程。",
  },
  {
    q: "節省房屋稅與地價稅？",
    a: "若登記在自家，可向稅捐稽徵處申請「按比例課徵營業用稅率」。通常可申請將六分之一面積設為營業用，其餘維持住家用稅率。",
  },
  {
    q: "設立後如何委託記帳？",
    a: "設立完成後，只需簽署記帳委任合約即可無縫銜接。與傳統事務所不同，我們每月只要 NT$1,260 起，並提供線上平台讓您隨時查看進度、上傳憑證、下載報稅文件，省去郵寄或親送的麻煩。",
  }
];

const BOOKKEEPING_FAQS = [
  {
    q: "年度中間是否可以委託 SnapBooks 速博記帳？",
    a: "隨時都可以進行移轉喔！只需要提供最近期的401申報書、明細帳、所得稅等資料就可以無縫移轉。詳細文件清單，我們將依照您設立的年度，開立發票方式等提供清單給您。\n\n若原本有委託記帳，只需要將清單提供給委託業者就可以了、若自行記帳，我們也會另外提供需要的文件清單給您。詳細狀況，可以加入我們官方帳號將有專人為您服務。",
  },
  {
    q: "你們怎麼收費？",
    a: <>SnapBooks標榜收費透明，以年繳方案為例，基本收費只需要NT$1,260/月，並提供線上平台讓您隨時查看進度、上傳憑證、下載報稅文件，省去郵寄或親送的麻煩。詳細情形，可以參考<a href="/pricing" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-slate-700">收費說明</a></>,
  },
];

export function ApplyFormClient() {
  const [path, setPath] = useState<"registration" | "bookkeeping" | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ leadCode: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Restore prior submission from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("apply_lead_code");
    if (saved) setResult({ leadCode: saved });
  }, []);

  // Registration fields
  const [companyType, setCompanyType] = useState("");
  const [companyNames, setCompanyNames] = useState(["", "", ""]);
  const [businessDescription, setBusinessDescription] = useState("");
  const [capitalAmount, setCapitalAmount] = useState("");
  const [shareholderCount, setShareholderCount] = useState("");
  const [addressSituation, setAddressSituation] = useState("");
  const [articlesOfIncorporation, setArticlesOfIncorporation] = useState("");

  // Bookkeeping fields
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [bkCompanyType, setBkCompanyType] = useState("");
  const [currentAccounting, setCurrentAccounting] = useState("");

  // Contact fields (shared)
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  function handleCopyCode() {
    if (!result?.leadCode) return;
    navigator.clipboard.writeText(result.leadCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!path) {
      setError("請先選擇服務類型");
      return;
    }

    const formData: ApplyFormData = {
      path,
      contactName: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      notes: notes.trim() || undefined,
    };

    if (path === "registration") {
      formData.companyType = companyType || undefined;
      formData.companyNames = companyNames.filter((n) => n.trim());
      formData.businessDescription = businessDescription.trim() || undefined;
      formData.capitalAmount = capitalAmount.trim() || undefined;
      formData.shareholderCount = shareholderCount.trim() || undefined;
      formData.addressSituation = addressSituation || undefined;
      formData.articlesOfIncorporation = articlesOfIncorporation || undefined;
    } else {
      formData.companyName = companyName.trim();
      formData.taxId = taxId.trim();
      formData.companyType = bkCompanyType || undefined;
      formData.currentAccounting = currentAccounting || undefined;
    }

    startTransition(async () => {
      const res = await submitApplyForm(formData);
      if (res.success && res.leadCode) {
        trackApplySubmit(path);
        localStorage.setItem("apply_lead_code", res.leadCode);
        setResult({ leadCode: res.leadCode });
      } else {
        setError(res.error ?? "送出失敗，請稍後再試");
      }
    });
  }

  // ── Success state ──────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 md:p-10">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">申請已送出！</h2>
          <p className="mt-2 text-base text-slate-600">
            您的專屬代碼：
          </p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="rounded-lg bg-white px-5 py-3 font-mono text-2xl font-bold tracking-wider text-emerald-700 shadow-sm border border-emerald-200">
              {result.leadCode}
            </span>
            <button
              onClick={handleCopyCode}
              className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700"
              aria-label="複製代碼"
            >
              {copied ? (
                <Check className="h-5 w-5 text-emerald-600" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </button>
          </div>

          <Separator className="my-6" />

          <div className="space-y-3 text-left">
            <p className="text-base font-semibold text-slate-800">
              下一步：加入 LINE 好友
            </p>
            <ol className="list-decimal pl-5 space-y-1.5 text-base text-slate-600">
              <li>點擊下方按鈕，加入速博 LINE 官方帳號</li>
              <li>
                傳送代碼{" "}
                <span className="font-mono font-semibold text-emerald-700">
                  {result.leadCode}
                </span>{" "}
                給我們
              </li>
              <li>我們會盡快與您聯繫！</li>
            </ol>
          </div>

          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] px-8 py-4 text-lg font-bold text-white shadow-lg shadow-green-600/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-600/30"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white" aria-hidden="true">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            加入 LINE 好友
          </a>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────
  const faqs = path === "registration" ? REGISTRATION_FAQS : BOOKKEEPING_FAQS;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {/* Path selection */}
      <div className="space-y-3">
        <Label className="text-lg font-semibold text-slate-700">
          您的公司是否已有統一編號？
        </Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPath("registration")}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all ${
              path === "registration"
                ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <Building2
              className={`h-7 w-7 ${path === "registration" ? "text-emerald-600" : "text-slate-400"}`}
            />
            <span className="text-base font-semibold text-slate-800">還沒有統編</span>
            <span className="text-sm text-slate-500">我要設立公司 + 記帳</span>
          </button>
          <button
            type="button"
            onClick={() => setPath("bookkeeping")}
            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all ${
              path === "bookkeeping"
                ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <FileText
              className={`h-7 w-7 ${path === "bookkeeping" ? "text-emerald-600" : "text-slate-400"}`}
            />
            <span className="text-base font-semibold text-slate-800">已經有統編</span>
            <span className="text-sm text-slate-500">我要委託記帳</span>
          </button>
        </div>
      </div>

      {/* Path-dependent form fields */}
      {path && (
        <>
          <Separator />

          {path === "registration" ? (
            <RegistrationFields
              companyType={companyType}
              setCompanyType={setCompanyType}
              companyNames={companyNames}
              setCompanyNames={setCompanyNames}
              businessDescription={businessDescription}
              setBusinessDescription={setBusinessDescription}
              capitalAmount={capitalAmount}
              setCapitalAmount={setCapitalAmount}
              shareholderCount={shareholderCount}
              setShareholderCount={setShareholderCount}
              addressSituation={addressSituation}
              setAddressSituation={setAddressSituation}
              articlesOfIncorporation={articlesOfIncorporation}
              setArticlesOfIncorporation={setArticlesOfIncorporation}
            />
          ) : (
            <BookkeepingFields
              companyName={companyName}
              setCompanyName={setCompanyName}
              taxId={taxId}
              setTaxId={setTaxId}
              companyType={bkCompanyType}
              setCompanyType={setBkCompanyType}
              currentAccounting={currentAccounting}
              setCurrentAccounting={setCurrentAccounting}
            />
          )}

          <Separator />

          {/* Contact fields */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-700">聯絡資訊</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="contactName" className="text-base">聯絡人姓名 *</Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="王大明"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-base">電子信箱 *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-base">聯絡電話 *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912-345-678"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-base">備註（選填）</Label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="其他需求或問題..."
                  rows={3}
                  maxLength={300}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-sm text-muted-foreground text-right">{notes.length} / 300</p>
              </div>
            </div>
          </div>

          {/* Pricing summary */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-5">
            <p className="font-semibold text-slate-700 mb-2">參考費用</p>
            {path === "registration" ? (
              <div className="space-y-1 text-base text-slate-600">
                <p>設立登記：{REGISTRATION_PRICING_NOTE}</p>
                <p>記帳報稅：每月 NT${PRICES.annual.toLocaleString()} 起（年繳）</p>
              </div>
            ) : (
              <p className="text-base text-slate-600">
                記帳報稅：每月 NT${PRICES.annual.toLocaleString()} 起（年繳）/ NT${PRICES.monthly.toLocaleString()} 起（月繳）
              </p>
            )}
          </div>

          {/* Registration path: what we handle for you */}
          {path === "registration" && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="font-semibold text-slate-700 mb-3">
                我們會為您處理的事項
              </p>
              <ol className="space-y-2">
                {REGISTRATION_STEPS.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-base text-slate-600">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Curated Q&A */}
          <div>
            <p className="font-semibold text-slate-700 mb-2">常見問題</p>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-base text-left">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-base text-slate-600 leading-relaxed whitespace-pre-line">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            <p className="mt-3 text-sm text-slate-500">
              更多問題？請加入
              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-slate-700"
              >
                官方 LINE 帳號
                <ExternalLink className="h-3 w-3" />
              </a>
              專人回覆、
              <a
                href="/faq"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-slate-700"
              >
                常見問題
                <ExternalLink className="h-3 w-3" />
              </a>
              ，或
              <a
                href="/tools/incorporation-flow"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-slate-700"
              >
                開公司流程圖
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-base text-red-700">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={isPending}
            size="lg"
            className="group w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 h-14 text-lg font-bold shadow-lg shadow-emerald-600/20 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 disabled:opacity-50"
          >
            {isPending ? "送出中..." : "送出申請"}
            {!isPending && (
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            )}
          </Button>
        </>
      )}
    </form>
  );
}

// ── Registration path fields ───────────────────────────────────────────
function RegistrationFields({
  companyType,
  setCompanyType,
  companyNames,
  setCompanyNames,
  businessDescription,
  setBusinessDescription,
  capitalAmount,
  setCapitalAmount,
  shareholderCount,
  setShareholderCount,
  addressSituation,
  setAddressSituation,
  articlesOfIncorporation,
  setArticlesOfIncorporation,
}: {
  companyType: string;
  setCompanyType: (v: string) => void;
  companyNames: string[];
  setCompanyNames: (v: string[]) => void;
  businessDescription: string;
  setBusinessDescription: (v: string) => void;
  capitalAmount: string;
  setCapitalAmount: (v: string) => void;
  shareholderCount: string;
  setShareholderCount: (v: string) => void;
  addressSituation: string;
  setAddressSituation: (v: string) => void;
  articlesOfIncorporation: string;
  setArticlesOfIncorporation: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-slate-700">公司資訊</h3>

      {/* Company type */}
      <div className="space-y-2">
        <Label className="text-base">公司型態</Label>
        <RadioGroup value={companyType} onValueChange={(v) => {
          setCompanyType(v);
          if (v === "商行") setArticlesOfIncorporation("");
        }}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="商行" id="ct-sole" />
            <Label htmlFor="ct-sole" className="text-base font-normal">商行（行號）</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="有限公司" id="ct-llc" />
            <Label htmlFor="ct-llc" className="text-base font-normal">有限公司</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="股份有限公司" id="ct-corp" />
            <Label htmlFor="ct-corp" className="text-base font-normal">股份有限公司</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Company names */}
      <div className="space-y-2">
        <Label className="text-base">期望的公司名稱</Label>
        <p className="text-sm text-slate-500">建議準備 3 個名字，以備名稱預查未通過時使用</p>
        {companyNames.map((name, i) => (
          <Input
            key={i}
            value={name}
            onChange={(e) => {
              const updated = [...companyNames];
              updated[i] = e.target.value;
              setCompanyNames(updated);
            }}
            placeholder={`第 ${i + 1} 志願`}
          />
        ))}
      </div>

      {/* Business description */}
      <div className="space-y-1.5">
        <Label htmlFor="bizDesc" className="text-base">主要業務簡述</Label>
        <p className="text-sm text-slate-500">簡述主要業務，我們協助轉換營業項目代碼</p>
        <Input
          id="bizDesc"
          value={businessDescription}
          onChange={(e) => setBusinessDescription(e.target.value)}
          placeholder="例：網路零售、餐飲、軟體開發..."
          maxLength={100}
        />
      </div>

      {/* Capital amount */}
      <div className="space-y-1.5">
        <Label htmlFor="capital" className="text-base">預計資本額（NT$）</Label>
        <Input
          id="capital"
          value={capitalAmount}
          onChange={(e) => setCapitalAmount(e.target.value)}
          placeholder="例：100,000"
        />
      </div>

      {/* Shareholder count */}
      <div className="space-y-1.5">
        <Label htmlFor="shareholders" className="text-base">股東人數</Label>
        <Input
          id="shareholders"
          type="number"
          min="1"
          value={shareholderCount}
          onChange={(e) => setShareholderCount(e.target.value)}
          placeholder="1"
        />
      </div>

      {/* Address situation */}
      <div className="space-y-2">
        <Label className="text-base">登記地址</Label>
        <RadioGroup value={addressSituation} onValueChange={setAddressSituation}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="自家地址" id="addr-have" />
            <Label htmlFor="addr-have" className="text-base font-normal">自家地址</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="外租地址" id="addr-need" />
            <Label htmlFor="addr-need" className="text-base font-normal">外租地址</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Articles of incorporation (not applicable to 商行) */}
      {companyType !== "商行" && (
        <div className="space-y-2">
          <Label className="text-base">公司章程</Label>
          <RadioGroup value={articlesOfIncorporation} onValueChange={setArticlesOfIncorporation}>
            <div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="自行準備" id="aoi-self" />
                <Label htmlFor="aoi-self" className="text-base font-normal">自行準備</Label>
              </div>
              <p className="ml-6 text-sm text-slate-500">我們將協助審查是否符合公司法要求</p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="請協助草擬" id="aoi-draft" />
                <Label htmlFor="aoi-draft" className="text-base font-normal">請協助草擬</Label>
              </div>
              <p className="ml-6 text-sm text-slate-500">我們將依照經濟部範本撰寫（特殊特別股等股權規劃不包含在內）</p>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="尚未決定" id="aoi-undecided" />
              <Label htmlFor="aoi-undecided" className="text-base font-normal">尚未決定</Label>
            </div>
          </RadioGroup>
        </div>
      )}
    </div>
  );
}

// ── Bookkeeping path fields ────────────────────────────────────────────
function BookkeepingFields({
  companyName,
  setCompanyName,
  taxId,
  setTaxId,
  companyType,
  setCompanyType,
  currentAccounting,
  setCurrentAccounting,
}: {
  companyName: string;
  setCompanyName: (v: string) => void;
  taxId: string;
  setTaxId: (v: string) => void;
  companyType: string;
  setCompanyType: (v: string) => void;
  currentAccounting: string;
  setCurrentAccounting: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-slate-700">公司資訊</h3>

      <div className="space-y-1.5">
        <Label htmlFor="companyName" className="text-base">公司名稱 *</Label>
        <Input
          id="companyName"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="速博智慧有限公司"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="taxId" className="text-base">統一編號 *</Label>
        <Input
          id="taxId"
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          placeholder="12345678"
          maxLength={8}
          pattern="\d{8}"
          required
        />
      </div>

      <div className="space-y-2">
        <Label className="text-base">公司型態</Label>
        <RadioGroup value={companyType} onValueChange={setCompanyType}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="商行" id="bk-ct-sole" />
            <Label htmlFor="bk-ct-sole" className="text-base font-normal">商行（行號）</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="有限公司" id="bk-ct-llc" />
            <Label htmlFor="bk-ct-llc" className="text-base font-normal">有限公司</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="股份有限公司" id="bk-ct-corp" />
            <Label htmlFor="bk-ct-corp" className="text-base font-normal">股份有限公司</Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label className="text-base">目前記帳方式</Label>
        <RadioGroup value={currentAccounting} onValueChange={setCurrentAccounting}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="自行處理" id="ca-self" />
            <Label htmlFor="ca-self" className="text-base font-normal">自行處理</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="其他事務所" id="ca-other" />
            <Label htmlFor="ca-other" className="text-base font-normal">其他事務所</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="目前無" id="ca-none" />
            <Label htmlFor="ca-none" className="text-base font-normal">目前無</Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}
