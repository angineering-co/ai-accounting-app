"use client";

import { useState, useEffect } from "react";
import { Building2, Store, Factory, Info, Check, User, Phone, Mail, MapPin, Search, FileText, HelpCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export default function ApplyPage() {
  // --- Form State ---
  const [serviceType, setServiceType] = useState<'new_company' | 'bookkeeping'>('new_company');

  // New Company Flow
  const [orgType, setOrgType] = useState<'inc' | 'ltd' | 'firm'>('ltd');
  const [hasForeigners, setHasForeigners] = useState<'no' | 'yes'>('no');
  const [nameCheckType, setNameCheckType] = useState<'checked' | 'need_check'>('need_check');
  const [expectedNames, setExpectedNames] = useState<string[]>(['', '', '', '', '']);
  const [businessScope, setBusinessScope] = useState('');

  // Bookkeeping Flow (or general base)
  const [companyName, setCompanyName] = useState('');
  const [vatNumber, setVatNumber] = useState('');

  // Responsible Person (負責人)
  const [respName, setRespName] = useState('');
  const [respId, setRespId] = useState('');
  const [respAddress, setRespAddress] = useState('');

  // Contact Info (聯絡資訊)
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactLine, setContactLine] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactAddress, setContactAddress] = useState('');

  // Checkbox States for Copying Data
  const [isContactSameAsResp, setIsContactSameAsResp] = useState(false);

  // Validation State
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Handlers & Effects ---

  const handleNameChange = (index: number, value: string) => {
    const newNames = [...expectedNames];
    newNames[index] = value;
    setExpectedNames(newNames);
  };

  useEffect(() => {
    if (isContactSameAsResp) {
      setContactName(respName);
      setContactAddress(respAddress);
    }
  }, [isContactSameAsResp, respName, respAddress]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate API Call
    setTimeout(() => {
      setIsSubmitting(false);
      alert("表單已成功送出！這是一個測試按鈕。未來這裡將會串接寄信與建立訂單的 API，隨後引導客戶進入文件的獨立上傳系統。");
    }, 800);
  };

  const orgSuffix = orgType === 'inc' ? '股份有限公司' : orgType === 'ltd' ? '有限公司' : '';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">線上帳務與設立服務申請</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            只要填寫基本需求與聯絡方式，我們將為您安排專屬的顧問與後續流程。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Section 1: Service Type */}
          <Card className="border-t-4 border-t-primary shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">您需要的服務類型</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className={`border-2 rounded-xl p-6 cursor-pointer flex flex-col items-center justify-center text-center transition-all ${serviceType === 'new_company' ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-slate-200 hover:border-primary/50'}`}
                  onClick={() => setServiceType('new_company')}
                >
                  <Building2 className={`w-10 h-10 mb-3 ${serviceType === 'new_company' ? 'text-primary' : 'text-slate-400'}`} />
                  <h3 className="font-bold text-lg">尚無統編，需要成立新公司</h3>
                  <p className="text-sm text-slate-500 mt-2">包含名稱預查、公司設立登記與後續記帳服務</p>
                </div>
                <div
                  className={`border-2 rounded-xl p-6 cursor-pointer flex flex-col items-center justify-center text-center transition-all ${serviceType === 'bookkeeping' ? 'border-primary bg-primary/5 ring-4 ring-primary/10' : 'border-slate-200 hover:border-primary/50'}`}
                  onClick={() => setServiceType('bookkeeping')}
                >
                  <FileText className={`w-10 h-10 mb-3 ${serviceType === 'bookkeeping' ? 'text-primary' : 'text-slate-400'}`} />
                  <h3 className="font-bold text-lg">已有統編，僅需記帳服務</h3>
                  <p className="text-sm text-slate-500 mt-2">公司/行號已經設立完成，需要委託稅務與記帳服務</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Conditional Flow: New Company */}
          {serviceType === 'new_company' ? (
            <div className="space-y-8 animate-in fade-in">
              {/* Org Type */}
              <Card className="shadow-sm">
                <CardHeader className="pb-4 bg-slate-50 dark:bg-slate-900/50 rounded-t-xl border-b">
                  <CardTitle className="text-xl">1. 公司組織形式</CardTitle>
                  <CardDescription>請選擇您預計成立的組織型態</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <RadioGroup value={orgType} onValueChange={(val: any) => setOrgType(val)} className="space-y-4">
                    <Label htmlFor="type-inc" className={`block p-4 border rounded-lg cursor-pointer transition-colors ${orgType === 'inc' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="inc" id="type-inc" />
                        <span className="font-bold text-base">股份有限公司</span>
                      </div>
                      <p className="text-sm text-slate-600 mt-2 ml-7 leading-relaxed font-normal">適合股東人數多、股權大小不一、遇到糾紛以股東會開會表決，且股份可自由轉讓。</p>
                    </Label>

                    <Label htmlFor="type-ltd" className={`block p-4 border rounded-lg cursor-pointer transition-colors ${orgType === 'ltd' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="ltd" id="type-ltd" />
                        <span className="font-bold text-base">有限公司</span>
                      </div>
                      <p className="text-sm text-slate-600 mt-2 ml-7 leading-relaxed font-normal">適合股東彼此熟悉，股東間彼此討論同意後決定，未來仍人數變多可以變更為「股份有限公司」。</p>
                    </Label>

                    <Label htmlFor="type-firm" className={`block p-4 border rounded-lg cursor-pointer transition-colors ${orgType === 'firm' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-slate-50'}`}>
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value="firm" id="type-firm" />
                        <span className="font-bold text-base">行號</span>
                      </div>
                      <p className="text-sm text-slate-600 mt-2 ml-7 leading-relaxed font-normal">稅務上較為優惠，但股東需承擔無限責任(這邊要插入稅務計算表)，且名稱僅限登記縣市。</p>
                    </Label>
                  </RadioGroup>

                  <div className="mt-8 pt-4 border-t border-dashed border-slate-200">
                    <p className="text-sm text-slate-500 flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-primary" />
                      還不清楚我適合什麼類型嗎？
                      <a href="#" className="text-primary font-bold hover:underline">看看我們的創業大禮包</a>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Foreigners */}
              <Card className="shadow-sm">
                <CardHeader className="pb-4 bg-slate-50 dark:bg-slate-900/50 rounded-t-xl border-b">
                  <CardTitle className="text-xl">2. 是否有外國股東</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <RadioGroup value={hasForeigners} onValueChange={(val: any) => setHasForeigners(val)} className="flex flex-col sm:flex-row gap-6">
                    <Label htmlFor="foreign-no" className="flex items-center space-x-2 cursor-pointer">
                      <RadioGroupItem value="no" id="foreign-no" />
                      <span className="text-base font-medium">股東均為台灣人</span>
                    </Label>
                    <div 
                      className="flex items-center space-x-2 opacity-50 cursor-not-allowed relative group"
                      onClick={() => alert("目前本服務僅針對全台灣股東進行辦理，尚未提供僑外資(外國股東)的服務，造成不便請見諒。")}
                    >
                      <RadioGroupItem value="yes" id="foreign-yes" disabled className="cursor-not-allowed" />
                      <span className="cursor-not-allowed text-base font-medium">股東含一個(或以上)外國人或法​​人</span>
                      <span className="hidden group-hover:inline-block absolute -top-8 left-0 bg-slate-800 text-white text-[10px] py-1 px-2 rounded-md shadow-lg z-20">
                        目前未承辦僑外資
                      </span>
                      <span className="text-xs text-amber-600 font-bold ml-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> 目前未承辦僑外資
                      </span>
                    </div>
                  </RadioGroup>
                </CardContent>
              </Card>

              {/* Name Check */}
              <Card className="shadow-sm">
                <CardHeader className="pb-4 bg-slate-50 dark:bg-slate-900/50 rounded-t-xl border-b">
                  <CardTitle className="text-xl">3. 公司名稱預查</CardTitle>
                  <CardDescription>為確保公司名稱沒有被他人註冊，需要先進行名稱預查。</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <RadioGroup value={nameCheckType} onValueChange={(val: any) => setNameCheckType(val)} className="space-y-4">
                    <Label htmlFor="name-checked" className={`flex items-center space-x-2 p-3 rounded-lg border cursor-pointer transition-colors ${nameCheckType === 'checked' ? 'border-primary bg-primary/5' : 'bg-slate-50 hover:bg-slate-100'}`}>
                      <RadioGroupItem value="checked" id="name-checked" />
                      <span className="font-medium">我已取得經濟部「公司名稱及所營事業登記預查核定書」</span>
                    </Label>
                    <Label htmlFor="name-need" className={`flex items-center space-x-2 p-3 rounded-lg border cursor-pointer transition-colors ${nameCheckType === 'need_check' ? 'border-primary bg-primary/5' : 'bg-slate-50 hover:bg-slate-100'}`}>
                      <RadioGroupItem value="need_check" id="name-need" />
                      <span className="font-medium">請依喜好順序列出 3~5 個預定名稱由我們為您預查</span>
                    </Label>
                  </RadioGroup>

                  {nameCheckType === 'need_check' && (
                    <div className="space-y-4 pt-4 border-t animate-in fade-in">
                      <Alert className="bg-blue-50 text-blue-800 border-blue-200">
                        <Info className="h-4 w-4" />
                        <AlertTitle className="text-sm font-bold">預查規定</AlertTitle>
                        <AlertDescription className="text-xs">
                          1.依照喜好順序，填寫3個名稱，我們將依照順序進行申請，但只會喜好順序的第一個。
                          2.組織類別無法做為區別，例如台積電「股份有限公司」已經被使用，則台積電「股份有限公司」是無法申請的。
                          3.如果喜歡某「OO」名稱，可以在名稱後面加上可茲區別的文字，例如「速博智慧有限公司」、「速博智慧科技有限公司」等，都是不同的法定名稱。
                        </AlertDescription>
                      </Alert>

                      <div className="space-y-3">
                        {expectedNames.map((name, i) => (
                          <div key={i} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <Label className="w-24 text-slate-600">公司名稱 {i + 1}</Label>
                            <div className="flex-1 flex items-center gap-2">
                              <Input
                                placeholder={`請輸入第 ${i + 1} 順位名稱 (例如：心朋)`}
                                value={name}
                                onChange={(e) => handleNameChange(i, e.target.value)}
                                className="flex-1"
                                required={i < 3 && nameCheckType === 'need_check'} // First 3 are mandatory
                              />
                              {orgSuffix && <span className="text-sm font-medium text-slate-700 whitespace-nowrap">{orgSuffix}</span>}
                            </div>
                            {i < 3 && <span className="text-red-500 text-sm font-bold shrink-0">*必填</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
                    <Label className="text-base text-slate-800 dark:text-slate-200">公司營業項目 <span className="text-red-500">*</span></Label>
                    <textarea 
                      className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-500"
                      placeholder="大概敘述您想要經營的營業內容，我們將為您選取營業項目。或是您已經有想要的項目，想要參考的公司，也可以直接填上"
                      value={businessScope}
                      onChange={(e) => setBusinessScope(e.target.value)}
                      required={serviceType === 'new_company'}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Responsible Person Base */}
              <Card className="shadow-sm">
                <CardHeader className="pb-4 bg-slate-50 dark:bg-slate-900/50 rounded-t-xl border-b">
                  <CardTitle className="text-xl flex items-center gap-2"><User className="w-5 h-5 text-primary" /> 4. 負責人資訊</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label>負責人姓名 <span className="text-red-500">*</span></Label>
                      <Input required placeholder="王大明" value={respName} onChange={e => setRespName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>身分證字號 <span className="text-red-500">*</span></Label>
                      <Input required placeholder="A123456789" value={respId} onChange={e => setRespId(e.target.value)} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>負責人戶籍地址 <span className="text-red-500">*</span></Label>
                      <Input required placeholder="請填寫身分證背面的完整戶籍地址" value={respAddress} onChange={e => setRespAddress(e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          ) : (
            // Conditional Flow: Bookkeeping Only
            <div className="space-y-8 animate-in fade-in">
              <Card className="shadow-sm">
                <CardHeader className="pb-4 bg-slate-50 dark:bg-slate-900/50 rounded-t-xl border-b">
                  <CardTitle className="text-xl">1. 基本資訊</CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 md:col-span-2">
                      <Label>公司組織形式 <span className="text-red-500">*</span></Label>
                      <RadioGroup value={orgType} onValueChange={(val: any) => setOrgType(val)} className="flex gap-6 mt-2">
                        <Label htmlFor="bk-inc" className="flex items-center space-x-2 cursor-pointer hover:text-primary">
                          <RadioGroupItem value="inc" id="bk-inc" />
                          <span className="font-medium">股份有限公司</span>
                        </Label>
                        <Label htmlFor="bk-ltd" className="flex items-center space-x-2 cursor-pointer hover:text-primary">
                          <RadioGroupItem value="ltd" id="bk-ltd" />
                          <span className="font-medium">有限公司</span>
                        </Label>
                        <Label htmlFor="bk-firm" className="flex items-center space-x-2 cursor-pointer hover:text-primary">
                          <RadioGroupItem value="firm" id="bk-firm" />
                          <span className="font-medium">行號</span>
                        </Label>
                      </RadioGroup>
                    </div>

                    <div className="space-y-2">
                      <Label>公司名稱 <span className="text-red-500">*</span></Label>
                      <div className="flex items-center gap-2">
                        <Input required placeholder="輸入名稱 (如: 心朋)" value={companyName} onChange={e => setCompanyName(e.target.value)} className="flex-1" />
                        {orgSuffix && <span className="text-sm font-medium text-slate-700 whitespace-nowrap">{orgSuffix}</span>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>統一編號 <span className="text-red-500">*</span></Label>
                      <Input required placeholder="12345678" value={vatNumber} onChange={e => setVatNumber(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>負責人姓名 <span className="text-red-500">*</span></Label>
                      <Input required placeholder="王大明" value={respName} onChange={e => setRespName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>身分證字號 <span className="text-red-500">*</span></Label>
                      <Input required placeholder="A123456789" value={respId} onChange={e => setRespId(e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Section: Contact Info (Shared) */}
          <Card className="shadow-sm border-blue-100 dark:border-blue-900 border-2">
            <CardHeader className="pb-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-t-xl border-b border-blue-100 dark:border-blue-900">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl flex items-center gap-2 text-blue-800 dark:text-blue-300">
                  <Phone className="w-5 h-5" /> {serviceType === 'new_company' ? '5.' : '2.'} 聯絡資訊
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2 mb-6">
                <Checkbox
                  id="same-as-resp"
                  checked={isContactSameAsResp}
                  onCheckedChange={(c) => setIsContactSameAsResp(!!c)}
                />
                <Label htmlFor="same-as-resp" className="cursor-pointer font-medium text-blue-800 dark:text-blue-300 text-base">同負責人</Label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>聯絡人姓名 <span className="text-red-500">*</span></Label>
                  <Input required placeholder="王大明" value={contactName} onChange={e => { setContactName(e.target.value); setIsContactSameAsResp(false); }} />
                </div>
                <div className="space-y-2">
                  <Label>聯絡人電話 <span className="text-red-500">*</span></Label>
                  <Input required placeholder="0912-345-678" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Line ID</Label>
                  <Input placeholder="Line ID (選填)" value={contactLine} onChange={e => setContactLine(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>E-mail <span className="text-red-500">*</span></Label>
                  <Input required type="email" placeholder="example@email.com" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
                  <p className="text-xs text-slate-500 mt-1">請將「設立流程主要聯絡人」放在此欄位</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>聯絡地址 (收發公文使用) <span className="text-red-500">*</span></Label>
                  <Input required placeholder="請填寫通訊地址" value={contactAddress} onChange={e => { setContactAddress(e.target.value); setIsContactSameAsResp(false); }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="pt-6 pb-12 flex justify-center">
            <Button type="submit" size="lg" className="w-full md:w-1/3 text-lg font-bold shadow-lg h-14" disabled={isSubmitting}>
              {isSubmitting ? "資料送出中..." : "確認送出申請"}
            </Button>
          </div>

        </form>
      </div>
    </div>
  );
}
