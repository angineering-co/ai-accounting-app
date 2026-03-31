"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { WithholdingTaxCalculatorLabor } from "./withholding-tax-calculator-labor";
import { WithholdingTaxCalculatorRent } from "./withholding-tax-calculator-rent";

const TAB_MAP: Record<string, string> = {
  "#labor": "labor",
  "#rent": "rent",
};

export function WithholdingTaxCalculatorClient() {
  const [tab, setTab] = useState("labor");

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && TAB_MAP[hash]) {
      setTab(TAB_MAP[hash]);
    }
  }, []);

  const handleTabChange = (value: string) => {
    setTab(value);
    window.history.replaceState(null, "", `#${value}`);
  };

  return (
    <Tabs value={tab} onValueChange={handleTabChange}>
      <TabsList className="w-full h-12">
        <TabsTrigger value="labor" className="flex-1 text-base">
          執行業務所得
        </TabsTrigger>
        <TabsTrigger value="rent" className="flex-1 text-base">
          租金
        </TabsTrigger>
      </TabsList>
      <TabsContent value="labor" className="mt-6">
        <WithholdingTaxCalculatorLabor />
      </TabsContent>
      <TabsContent value="rent" className="mt-6">
        <WithholdingTaxCalculatorRent />
      </TabsContent>
    </Tabs>
  );
}
