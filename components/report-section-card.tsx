import Link from "next/link";

import { AmountCell } from "@/components/amount-cell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SYNTHETIC_NET_INCOME_CODE,
  type ReportSection,
} from "@/lib/services/financial-statements";

export function ReportSectionCard({
  title,
  section,
  linkBuilder,
  highlightSyntheticRow,
  subtotalSuffix = "小計",
}: {
  title: string;
  section: ReportSection;
  linkBuilder?: (accountCode: string) => string | null;
  highlightSyntheticRow?: boolean;
  subtotalSuffix?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span>{title}</span>
          <AmountCell amount={section.subtotal} />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">科目代碼</TableHead>
              <TableHead>科目名稱</TableHead>
              <TableHead className="text-right">金額</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {section.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center py-6 text-sm text-muted-foreground"
                >
                  尚無資料
                </TableCell>
              </TableRow>
            ) : (
              section.rows.map((row) => {
                const synthetic =
                  highlightSyntheticRow &&
                  row.accountCode === SYNTHETIC_NET_INCOME_CODE;
                const href = linkBuilder?.(row.accountCode) ?? null;
                return (
                  <TableRow
                    key={row.accountCode}
                    className={synthetic ? "bg-muted/30" : undefined}
                  >
                    <TableCell className="font-mono text-base">
                      {href ? (
                        <Link
                          href={href}
                          className="text-primary hover:underline"
                        >
                          {row.accountCode}
                        </Link>
                      ) : (
                        row.accountCode
                      )}
                    </TableCell>
                    <TableCell className="text-base">
                      {row.accountName}
                      {synthetic && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          (合成,即時計算)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <AmountCell amount={row.amount} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
            {section.rows.length > 0 && (
              <TableRow className="bg-muted/40">
                <TableCell colSpan={2} className="font-medium text-base">
                  {title}
                  {subtotalSuffix}
                </TableCell>
                <TableCell className="text-right">
                  <AmountCell amount={section.subtotal} />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
