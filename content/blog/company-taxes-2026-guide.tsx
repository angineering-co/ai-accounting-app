export default function Content() {
  return (
    <>
      <p className="text-lg leading-relaxed text-slate-600">
        開公司第一年，最怕的不是沒客戶，是被國稅局罰錢。
      </p>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">
        營業稅、營所稅、扣繳、暫繳、二代健保、未分配盈餘稅... 光名字就六種，每一種的申報時間、算法、罰則都不一樣。搞錯一個，滯報金就來了。
      </p>
      <p className="mt-4 text-lg leading-relaxed text-slate-600">
        這篇幫你用最短的時間，搞懂 2026
        年公司和行號該報的所有稅。
      </p>

      <h2 className="mt-12 mb-4 text-2xl font-bold text-slate-900">
        公司 vs 行號，報的稅不一樣
      </h2>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        先搞清楚你是公司還是行號，因為稅種差很多。
      </p>
      <p className="mb-2 text-lg leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-800">公司要報：</span>
        營業稅、營所稅、扣繳、暫繳、二代健保、未分配盈餘稅
      </p>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        <span className="font-semibold text-slate-800">行號要報：</span>
        營業稅、綜所稅（併入負責人個人）、扣繳、二代健保
      </p>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        最大的差別在所得稅。公司繳營所稅（稅率
        20%），行號是併入負責人的綜所稅（稅率
        5%～40%，看你收入多少）。
      </p>
      <p className="text-lg leading-relaxed text-slate-600">
        如果你個人收入高，開行號反而可能繳更多稅。這點很多老闆沒注意到。
      </p>

      <h2 className="mt-12 mb-4 text-2xl font-bold text-slate-900">
        六大稅種，一次講完
      </h2>

      <h3 className="mt-8 mb-3 text-xl font-bold text-slate-900">營業稅</h3>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        賣東西或提供服務，就要代收 5%
        營業稅。每兩個月申報一次（單數月 15 日前）。
      </p>
      <p className="mb-4 text-lg font-semibold text-slate-800">
        核心公式：銷項稅額 - 進項稅額 = 你要繳的稅
      </p>
      <p className="text-lg leading-relaxed text-slate-600">
        小規模營業人可以免開發票，適用 1% 稅率。
      </p>

      <h3 className="mt-8 mb-3 text-xl font-bold text-slate-900">營所稅</h3>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        公司一整年賺的「純益」課 20%。每年 5 月申報。
      </p>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        注意是扣掉成本和費用之後的淨利，不是營收。課稅所得 12
        萬以下免繳，12～20 萬之間有過渡算法。
      </p>

      <h3 className="mt-8 mb-3 text-xl font-bold text-slate-900">扣繳</h3>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        只要你付錢給個人（薪資、租金、獎金、勞報），就要先幫對方扣一筆稅交給國稅局。
      </p>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        每月 10
        日前繳上個月的扣繳稅款，每年 1 月底前做年度申報。居住者薪資超過
        90,500 元才需扣繳（有填免稅額申請表的話）。
      </p>

      <h3 className="mt-8 mb-3 text-xl font-bold text-slate-900">暫繳</h3>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        每年 9
        月，把去年營所稅的一半先繳給國稅局，等於預繳的概念。行號和小規模營業人免辦。
      </p>
      <p className="text-lg leading-relaxed text-slate-600">
        如果上半年營收大幅下降，可以請會計師做「試算暫繳」來減輕負擔。
      </p>

      <h3 className="mt-8 mb-3 text-xl font-bold text-slate-900">
        二代健保
      </h3>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        除了一般保費（5.17%），當公司付的薪資總額超過員工投保金額總額，超出的部分要再繳
        2.11% 的補充保費。
      </p>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        個人的兼職薪資、股利、租金等六類收入達門檻也要繳。每年 1
        月底前申報。
      </p>

      <h3 className="mt-8 mb-3 text-xl font-bold text-slate-900">
        未分配盈餘稅
      </h3>
      <p className="mb-4 text-lg leading-relaxed text-slate-600">
        公司賺了錢沒分給股東？那這筆未分配的盈餘要再課 5%。每年 5
        月跟營所稅一起申報。
      </p>
      <p className="text-lg leading-relaxed text-slate-600">
        這是為了防止大股東把錢留在公司裡避稅。
      </p>

      <h2 className="mt-12 mb-4 text-2xl font-bold text-slate-900">
        2026 報稅行事曆重點
      </h2>
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-lg">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-800">時間</th>
              <th className="px-4 py-3 font-semibold text-slate-800">項目</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-slate-600">
            <tr>
              <td className="px-4 py-3 whitespace-nowrap">每月 10 日前</td>
              <td className="px-4 py-3">上月扣繳稅款</td>
            </tr>
            <tr>
              <td className="px-4 py-3 whitespace-nowrap">1 月</td>
              <td className="px-4 py-3">
                扣繳年度申報 + 二代健保申報 + 營業稅
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 whitespace-nowrap">
                3、5、7、9、11 月 15 日前
              </td>
              <td className="px-4 py-3">營業稅</td>
            </tr>
            <tr>
              <td className="px-4 py-3 whitespace-nowrap">5 月</td>
              <td className="px-4 py-3">營所稅 + 未分配盈餘稅</td>
            </tr>
            <tr>
              <td className="px-4 py-3 whitespace-nowrap">9 月</td>
              <td className="px-4 py-3">暫繳申報</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-lg leading-relaxed text-slate-600">
        漏報最常發生在 1
        月（扣繳＋二代健保擠在一起）和 9
        月（暫繳容易忘）。建議年初就把時間標進行事曆。
      </p>

      <h2 className="mt-12 mb-4 text-2xl font-bold text-slate-900">
        罰則有多痛？
      </h2>
      <ul className="mb-6 space-y-3 text-lg text-slate-600">
        <li className="flex gap-3">
          <span className="shrink-0 text-emerald-500">•</span>
          <span>
            <span className="font-semibold text-slate-800">
              營業稅逾期：
            </span>
            每 2 日加徵 1% 滯報金，最高 12,000 元；超過 30
            天再加怠報金，最高 30,000 元。
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 text-emerald-500">•</span>
          <span>
            <span className="font-semibold text-slate-800">
              營所稅漏報：
            </span>
            最重可罰所漏稅額 2 倍。
          </span>
        </li>
        <li className="flex gap-3">
          <span className="shrink-0 text-emerald-500">•</span>
          <span>
            <span className="font-semibold text-slate-800">
              扣繳沒繳：
            </span>
            逾 30 日直接移送強制執行。
          </span>
        </li>
      </ul>
      <p className="text-lg leading-relaxed text-slate-600">
        這些都是可以避免的。關鍵就是平時有在記帳、憑證有整理好。
      </p>

      <div className="mt-12 rounded-2xl bg-emerald-50 p-8">
        <p className="text-lg font-semibold text-emerald-800">
          讓報稅不再是每年的惡夢
        </p>
        <p className="mt-2 text-lg leading-relaxed text-emerald-700">
          如果你平時就有把發票和支出記錄好，報稅其實不難。難的是「平時沒在記，報稅才開始翻箱倒櫃」。
        </p>
        <p className="mt-4 text-lg leading-relaxed text-emerald-700">
          SnapBooks.ai
          幫你解決的就是這件事。拍照上傳憑證，AI
          自動分類記帳，會計師幫你把關。等到報稅季，該有的數字都在，不用再一筆一筆撈。
        </p>
        <p className="mt-4 text-lg leading-relaxed text-emerald-700">
          想聊聊你的記帳需求？直接加我們的{" "}
          <a
            href="https://lin.ee/nPVmG3M"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-800 underline hover:text-emerald-900"
          >
            Line
          </a>
          ，或{" "}
          <a
            href="https://calendar.app.google/Cy9JgZH521YNiHV77"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-emerald-800 underline hover:text-emerald-900"
          >
            會計師免費諮詢
          </a>
          。
        </p>
      </div>
    </>
  );
}
