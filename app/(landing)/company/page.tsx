import { CheckCircle2 } from "lucide-react";

export default function CompanyPage() {
  return (
    <div className="min-h-screen bg-white selection:bg-emerald-100 selection:text-emerald-900 font-sans text-slate-900 px-5 py-24 md:py-32">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-12 text-4xl font-extrabold tracking-tight text-slate-900 md:text-5xl">
          關於我們
        </h1>

        <div className="mb-16">
          <p className="mb-6 text-xl leading-relaxed text-slate-700 font-medium">
            SnapBooks.ai (速博智慧有限公司) 是一家新型態的 AI
            記帳事務所，結合前沿的 AI
            自動化技術與深厚的稅法實務經驗，致力於成為企業主最可靠的後盾。
          </p>
        </div>

        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold text-slate-900 border-b-2 border-emerald-100 pb-2 inline-block">
            我們的理念
          </h2>
          <p className="mb-6 text-lg leading-relaxed text-slate-600">
            我們深知台灣中小企業在記帳與報稅上面臨的痛點。傳統流程繁瑣，而純軟體工具又缺乏專業稅務的最終把關。
          </p>
          <p className="mb-6 text-lg leading-relaxed text-slate-600">
            SnapBooks.ai 的誕生，是因為我們相信：
            <span className="font-bold text-emerald-700">
              記帳應該像拍照一樣簡單，而報稅必須像傳統事務所一樣嚴謹。
            </span>
            由專業會計師把關，您只需專注在產品和成長，帳務與報稅就交給我們。
          </p>
        </section>

        <section className="mb-16">
          <h2 className="mb-8 text-2xl font-bold text-slate-900 border-b-2 border-emerald-100 pb-2 inline-block">
            創辦團隊
          </h2>

          <div className="mb-12 rounded-2xl bg-slate-50 p-8 ring-1 ring-slate-100">
            <h3 className="mb-2 text-xl font-bold text-slate-900">
              黃勝平 Joe
            </h3>
            <p className="mb-6 font-semibold text-emerald-600">
              共同創辦人暨稅務主理人
            </p>
            <ul className="space-y-4 text-slate-600">
              <li className="flex gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                <span className="leading-relaxed text-lg">
                  勤信聯合會計事務所 所長 (10年+ 實務經驗)
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                <span className="leading-relaxed text-lg">
                  出身於四大會計師事務所
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                <span className="leading-relaxed text-lg">
                  台灣會計界自動化先鋒，率先導入自動化系統化管理
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                <span className="leading-relaxed text-lg">
                  客戶遍佈全台，深諳各行各業稅務痛點與節稅策略
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl bg-slate-50 p-8 ring-1 ring-slate-100">
            <h3 className="mb-2 text-xl font-bold text-slate-900">
              王致昂 Ang
            </h3>
            <p className="mb-6 font-semibold text-emerald-600">
              共同創辦人暨技術負責人
            </p>
            <ul className="space-y-4 text-slate-600">
              <li className="flex gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                <span className="leading-relaxed text-lg">
                  審計雲 (AuditEasy) 創辦人
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                <span className="leading-relaxed text-lg">
                  矽谷科技公司技術主管 (Google, Square, Carousell)
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                <span className="leading-relaxed text-lg">
                  擁有深厚的金融科技 (FinTech) 與大型系統架構經驗
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                <span className="leading-relaxed text-lg">
                  專注於將企業級的 AI 數據處理能力，帶入中小企業日常
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-6 text-2xl font-bold text-slate-900 border-b-2 border-emerald-100 pb-2 inline-block">
            聯絡我們
          </h2>
          <div className="text-lg leading-relaxed text-slate-600 space-y-2">
            <p className="font-semibold text-slate-900">
              速博智慧有限公司｜速博智慧記帳事務所
            </p>
            <p>地址：台中市西區五權路1-67號11樓之5</p>
            <p>電子信箱：joe700619@chixin.com.tw</p>
          </div>
        </section>
      </div>
    </div>
  );
}
