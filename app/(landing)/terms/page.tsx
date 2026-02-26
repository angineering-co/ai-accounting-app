export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 selection:bg-emerald-100 selection:text-emerald-900 font-sans text-slate-900 px-5 py-24 md:py-32">
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 md:p-16 shadow-sm ring-1 ring-slate-100">
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-slate-900 text-center md:text-5xl">
          服務條款
        </h1>
        <p className="mb-12 text-center text-lg text-slate-500">
          最後更新日期：2026年2月
        </p>

        <div className="mb-12 rounded-xl bg-emerald-50/50 p-6 text-lg leading-relaxed text-slate-700">
          <p>
            歡迎您使用
            SnapBooks.ai（以下簡稱「本服務」）。本服務由速博智慧有限公司（以下簡稱「本公司」）所建置與提供。請您在開始使用本服務前，詳細閱讀以下服務條款。
          </p>
        </div>

        <div className="space-y-12">
          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                1
              </span>
              服務範圍
            </h2>
            <p className="mb-4 text-lg leading-relaxed text-slate-600">
              本服務專為年營業額 3,000
              萬以下（適用擴大書審）之中小企業提供記帳與稅務申報服務，包含但不限於：
            </p>
            <ul className="list-inside list-disc space-y-2 pl-4 text-lg text-slate-600">
              <li>電子發票/雲端載具自動下載處理</li>
              <li>紙本憑證拍照上傳處理</li>
              <li>營業稅每期申報</li>
              <li>年度營利事業所得稅結算申報</li>
              <li>各類所得扣繳申報</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                2
              </span>
              費用與付款
            </h2>
            <div className="space-y-5 text-lg leading-relaxed text-slate-600">
              <p>
                本服務之基本方案為每月 NT$ 1,200，採一年收取 13
                個月費用之方式計費（第 13
                個月為年度營所稅結算申報費用）。若紙本發票超過每月 50 張，每 50
                張將額外酌收 NT$ 400 處理費。
              </p>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-6 text-amber-900">
                <p className="font-bold mb-2 flex items-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  價格調整權利
                </p>
                <p className="text-base">
                  本公司保留隨時修改或變更本服務收費標準之權利。若有任何價格調整，本公司將於新費率生效前透過電子郵件或
                  Line
                  官方帳號通知您。如您不同意新的收費標準，您有權依據本條款第 4
                  條終止服務合約。
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                3
              </span>
              使用者義務
            </h2>
            <p className="text-lg leading-relaxed text-slate-600">
              您同意提供真實、準確且完整的公司與財務資料，並定期上傳發票與收據。因您延遲提供資料或提供不實資料所導致之稅務罰鍰或法律責任，概由您自行負責。
            </p>
          </section>

          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                4
              </span>
              服務終止
            </h2>
            <div className="space-y-4 text-lg leading-relaxed text-slate-600">
              <p>
                <strong className="text-slate-900 font-bold">
                  雙方終止權：
                </strong>
                本合約之任何一方（即本公司與您）均有權隨時以書面或電子通訊方式（如
                Email、Line）通知他方終止本服務合約。
              </p>
              <ul className="list-inside list-disc space-y-2 pl-4">
                <li>
                  如由您主動終止，已繳交之當月/當期費用原則上不予退還，並將為您完成當期已收款項對應之申報義務。
                </li>
                <li>
                  如由本公司主動終止，本公司將按比例退還未提供服務期間之已預收費用。
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                5
              </span>
              免責聲明
            </h2>
            <p className="text-lg leading-relaxed text-slate-600">
              本服務採用 AI
              技術輔助整理與專業人員覆核，本公司承諾盡善良管理人之注意義務處理您的帳務與稅務申報。然若因天災、不可抗力、第三方服務（如政府稅務系統）中斷，或因您未依約提供完整資料所造成之損失，本公司不負賠償責任。
            </p>
          </section>

          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                6
              </span>
              條款修改
            </h2>
            <p className="text-lg leading-relaxed text-slate-600">
              本公司保留隨時修改本服務條款之權利，修改後的條款將公佈於本網站上，不另行個別通知。若您於條款修改後繼續使用本服務，即視為您已閱讀、瞭解並同意接受修改後之內容。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
