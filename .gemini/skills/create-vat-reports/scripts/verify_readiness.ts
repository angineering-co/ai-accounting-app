import { createClient } from "@supabase/supabase-js";
import { Database } from "../../supabase/database.types";

async function verifyReadiness() {
  const clientId = process.argv[2];
  const yyymm = process.argv[3];

  if (!clientId || !yyymm) {
    console.error("Usage: tsx verify_readiness.ts <clientId> <yyymm>");
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables.");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey);

  // 1. Check Client
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    console.error(`Error: Client not found (${clientId})`);
    process.exit(1);
  }

  console.log(`正在驗證客戶資料準備狀態: ${client.name} (${client.tax_id})`);

  let ready = true;

  if (!client.tax_id || client.tax_id === "") {
    console.error("- ❌ 缺漏統一編號");
    ready = false;
  } else {
    console.log("- ✅ 統一編號已設定");
  }

  if (!client.tax_payer_id || client.tax_payer_id === "") {
    console.error("- ❌ 缺漏稅籍編號");
    ready = false;
  } else {
    console.log("- ✅ 稅籍編號已設定");
  }

  // 2. Check Period
  const { data: period, error: periodError } = await supabase
    .from("tax_filing_periods")
    .select("*")
    .eq("client_id", clientId)
    .eq("year_month", yyymm)
    .single();

  if (periodError || !period) {
    console.error(`- ❌ 資料庫中找不到期別 ${yyymm}。`);
    ready = false;
  } else {
    console.log(`- ✅ 已找到申報期別 (狀態: ${period.status})`);
  }

  // 3. Check Invoices
  const { data: unconfirmed, error: unconfirmedError } = await supabase
    .from("invoices")
    .select("id")
    .eq("client_id", clientId)
    .eq("tax_filing_period_id", period?.id || "")
    .neq("status", "confirmed");

  if (unconfirmedError) {
    console.error("- ❌ 檢查發票狀態時發生錯誤");
  } else if (unconfirmed && unconfirmed.length > 0) {
    console.error(`- ❌ 尚有 ${unconfirmed.length} 筆發票未確認。`);
    ready = false;
  } else {
    console.log("- ✅ 所有發票皆已確認");
  }

  // 4. Check Ranges (only for output invoices)
  const { data: ranges, error: rangesError } = await supabase
    .from("invoice_ranges")
    .select("*")
    .eq("client_id", clientId)
    .eq("year_month", yyymm);

  if (rangesError) {
    console.error("- ❌ 檢查發票字軌時發生錯誤");
  } else if (!ranges || ranges.length === 0) {
    console.warn("- ⚠️ 此期別未設定發票字軌範圍，這可能會影響 TXT 報表中的空白發票計算。");
  } else {
    console.log(`- ✅ 已找到 ${ranges.length} 組發票字軌範圍`);
  }

  if (ready) {
    console.log("✅ 驗證通過：資料已就緒，可開始產生營業稅申報報表。");
  } else {
    console.error("❌ 驗證失敗：請先修正上述問題再重新產生報表。");
    process.exit(1);
  }
}

verifyReadiness().catch(console.error);
