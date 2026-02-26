export default function PrivacyPage() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-emerald-100 selection:text-emerald-900 font-sans text-slate-900 px-5 py-24 md:py-32">
      <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 md:p-16 shadow-sm ring-1 ring-slate-100">
        <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-slate-900 text-center md:text-5xl">
          隱私權政策
        </h1>
        <p className="mb-12 text-center text-lg text-slate-500">
          最後更新日期：{currentYear}年
        </p>

        <div className="mb-12 rounded-xl bg-emerald-50/50 p-6 text-lg leading-relaxed text-slate-700">
          <p>
            SnapBooks.ai（速博智慧有限公司，以下簡稱「我們」）非常重視您的隱私權。為了讓您能夠安心使用我們的各項服務，特此向您說明我們的隱私權保護政策，以保障您的權益。
          </p>
        </div>

        <div className="space-y-12">
          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                1
              </span>
              隱私權保護政策的適用範圍
            </h2>
            <p className="text-lg leading-relaxed text-slate-600">
              隱私權保護政策內容，包括我們如何處理在您使用網站服務時收集到的個人及企業識別資料。隱私權保護政策不適用於本網站以外的相關連結網站，也不適用於非本網站所委託或參與管理的人員。
            </p>
          </section>

          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                2
              </span>
              個人與企業資料的蒐集、處理及利用方式
            </h2>
            <ul className="space-y-6 text-lg leading-relaxed text-slate-600">
              <li className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-100">
                <strong className="mb-3 block text-slate-900 font-bold flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  蒐集目的
                </strong>
                <p>
                  為了提供您精準的記帳與稅務申報服務、客戶聯繫、費用結算及其他相關附加服務。
                </p>
              </li>
              <li className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-100">
                <strong className="mb-3 block text-slate-900 font-bold flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  蒐集資料類別
                </strong>
                <p>
                  包括但不限於公司名稱、統一編號、聯絡人姓名、電子郵件、電話號碼、Line
                  帳號，以及您上傳之發票、收據、憑證及銀行交易紀錄等財務資料。
                </p>
              </li>
              <li className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-100">
                <strong className="mb-3 block text-slate-900 font-bold flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                  資料利用
                </strong>
                <p>
                  我們將運用 AI
                  技術協助辨識與整理您上傳的財務憑證，並由專業會計人員進行覆核及稅務申報作業。我們承諾所有資料僅用於提供服務之目的，不會用於任何未經您同意的其他用途。
                </p>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                3
              </span>
              資料之保護
            </h2>
            <p className="text-lg leading-relaxed text-slate-600">
              我們的主機均設有防火牆、防毒系統等相關的各項資訊安全設備及必要的安全防護措施，加以保護網站及您的個人/企業資料。只有經過授權的人員才能接觸您的資料，相關處理人員皆簽有保密合約，如有違反保密義務者，將受相關法律處分。
            </p>
          </section>

          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                4
              </span>
              與第三人共用資料之政策
            </h2>
            <div className="space-y-4 text-lg leading-relaxed text-slate-600">
              <p>
                我們絕不會提供、交換、出租或出售任何您的個人或企業資料給其他個人、團體、私人企業或公務機關，但有法律依據或合約義務者，不在此限。前項但書之情形包括不限於：
              </p>
              <ul className="list-inside list-disc space-y-2 pl-4">
                <li>經由您書面同意。</li>
                <li>法律明文規定（例如：配合稅捐稽徵機關之申報與調查）。</li>
                <li>為免除您生命、身體、自由或財產上之危險。</li>
                <li>
                  委託廠商協助蒐集、處理或利用您的資料時，我們將對委外廠商或個人善盡監督管理之責。
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                5
              </span>
              隱私權保護政策之修正
            </h2>
            <div className="space-y-6 text-lg leading-relaxed text-slate-600">
              <p>
                本隱私權保護政策將因應需求隨時進行修正，修正後的條款將刊登於網站上。如果您對我們的隱私權政策有任何疑問，請透過以下方式與我們聯繫：
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <p className="font-bold text-slate-900 mb-2">聯絡資訊</p>
                <div className="space-y-1 text-base">
                  <p>
                    <span className="text-slate-500">聯絡信箱：</span>
                    joe700619@chixin.com.tw
                  </p>
                  <p>
                    <span className="text-slate-500">通訊地址：</span>
                    台中市西區五權路1-67號11樓之5
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
