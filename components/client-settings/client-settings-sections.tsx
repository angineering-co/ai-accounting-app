"use client";

import { CompanyBasicsSection } from "./company-basics-section";
import { PeopleSection } from "./people-section";
import { CredentialsSection } from "./credentials-section";
import { LandlordSection } from "./landlord-section";
import { InvoicePurchasingSection } from "./invoice-purchasing-section";
import type { Client } from "@/lib/domain/models";

interface ClientSettingsSectionsProps {
  clientId: string;
  client: Client;
  onSaveSuccess?: () => void;
}

export function ClientSettingsSections({
  clientId,
  client,
  onSaveSuccess,
}: ClientSettingsSectionsProps) {
  return (
    <>
      <CompanyBasicsSection
        clientId={clientId}
        client={client}
        onSaveSuccess={onSaveSuccess}
      />
      <PeopleSection
        clientId={clientId}
        client={client}
        onSaveSuccess={onSaveSuccess}
      />
      <CredentialsSection
        clientId={clientId}
        client={client}
        onSaveSuccess={onSaveSuccess}
      />
      <LandlordSection
        clientId={clientId}
        client={client}
        onSaveSuccess={onSaveSuccess}
      />
      <InvoicePurchasingSection
        clientId={clientId}
        client={client}
        onSaveSuccess={onSaveSuccess}
      />
    </>
  );
}
