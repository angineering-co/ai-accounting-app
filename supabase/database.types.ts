export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  pgmq_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      pop: {
        Args: { queue_name: string }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      read: {
        Args: { n: number; queue_name: string; sleep_seconds: number }
        Returns: unknown[]
        SetofOptions: {
          from: "*"
          to: "message_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      send: {
        Args: { message: Json; queue_name: string; sleep_seconds?: number }
        Returns: number[]
      }
      send_batch: {
        Args: { messages: Json[]; queue_name: string; sleep_seconds?: number }
        Returns: number[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      allowances: {
        Row: {
          allowance_serial_code: string | null
          client_id: string | null
          created_at: string | null
          document_id: string
          extracted_data: Json | null
          filename: string | null
          firm_id: string
          id: string
          in_or_out: string
          original_invoice_id: string | null
          original_invoice_serial_code: string | null
          status: string | null
          storage_path: string | null
          tax_filing_period_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          allowance_serial_code?: string | null
          client_id?: string | null
          created_at?: string | null
          document_id: string
          extracted_data?: Json | null
          filename?: string | null
          firm_id: string
          id?: string
          in_or_out: string
          original_invoice_id?: string | null
          original_invoice_serial_code?: string | null
          status?: string | null
          storage_path?: string | null
          tax_filing_period_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          allowance_serial_code?: string | null
          client_id?: string | null
          created_at?: string | null
          document_id?: string
          extracted_data?: Json | null
          filename?: string | null
          firm_id?: string
          id?: string
          in_or_out?: string
          original_invoice_id?: string | null
          original_invoice_serial_code?: string | null
          status?: string | null
          storage_path?: string | null
          tax_filing_period_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allowances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowances_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowances_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowances_tax_filing_period_id_fkey"
            columns: ["tax_filing_period_id"]
            isOneToOne: false
            referencedRelation: "tax_filing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allowances_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_trails: {
        Row: {
          action: string
          actor_at: string
          actor_id: string | null
          before: Json | null
          entity_id: string
          entity_table: string
          firm_id: string
          id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_at?: string
          actor_id?: string | null
          before?: Json | null
          entity_id: string
          entity_table: string
          firm_id: string
          id?: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_at?: string
          actor_id?: string | null
          before?: Json | null
          entity_id?: string
          entity_table?: string
          firm_id?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_trails_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_trails_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string | null
          email: string | null
          firm_id: string | null
          id: string
          industry: string | null
          invoice_purchasing: Json | null
          landlord: Json | null
          mailing_address: string | null
          name: string
          phone: string | null
          platform_credentials: Json | null
          responsible_person: Json | null
          shareholders: Json | null
          tax_id: string
          tax_payer_id: string
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          firm_id?: string | null
          id?: string
          industry?: string | null
          invoice_purchasing?: Json | null
          landlord?: Json | null
          mailing_address?: string | null
          name: string
          phone?: string | null
          platform_credentials?: Json | null
          responsible_person?: Json | null
          shareholders?: Json | null
          tax_id: string
          tax_payer_id: string
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          firm_id?: string | null
          id?: string
          industry?: string | null
          invoice_purchasing?: Json | null
          landlord?: Json | null
          mailing_address?: string | null
          name?: string
          phone?: string | null
          platform_credentials?: Json | null
          responsible_person?: Json | null
          shareholders?: Json | null
          tax_id?: string
          tax_payer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          amount: number | null
          client_id: string
          created_at: string
          created_by: string
          doc_date: string
          doc_type: string
          file_url: string | null
          filename: string | null
          firm_id: string
          id: string
          ocr_status: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          client_id: string
          created_at?: string
          created_by: string
          doc_date: string
          doc_type: string
          file_url?: string | null
          filename?: string | null
          firm_id: string
          id?: string
          ocr_status?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          client_id?: string
          created_at?: string
          created_by?: string
          doc_date?: string
          doc_type?: string
          file_url?: string | null
          filename?: string | null
          firm_id?: string
          id?: string
          ocr_status?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      ecpay_payments: {
        Row: {
          amount: number
          card4no: string | null
          charged_at: string | null
          checkout_token: string
          client_id: string | null
          created_at: string
          description: string
          expires_at: string | null
          firm_id: string
          gwsr: number | null
          id: string
          merchant_trade_no: string | null
          raw_payload: Json | null
          refunded_amount: number | null
          refunded_at: string | null
          status: string
          type: string
        }
        Insert: {
          amount: number
          card4no?: string | null
          charged_at?: string | null
          checkout_token: string
          client_id?: string | null
          created_at?: string
          description: string
          expires_at?: string | null
          firm_id: string
          gwsr?: number | null
          id?: string
          merchant_trade_no?: string | null
          raw_payload?: Json | null
          refunded_amount?: number | null
          refunded_at?: string | null
          status?: string
          type: string
        }
        Update: {
          amount?: number
          card4no?: string | null
          charged_at?: string | null
          checkout_token?: string
          client_id?: string | null
          created_at?: string
          description?: string
          expires_at?: string | null
          firm_id?: string
          gwsr?: number | null
          id?: string
          merchant_trade_no?: string | null
          raw_payload?: Json | null
          refunded_amount?: number | null
          refunded_at?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ecpay_payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ecpay_payments_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firms: {
        Row: {
          created_at: string | null
          id: string
          name: string
          settings: Json | null
          tax_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          settings?: Json | null
          tax_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          settings?: Json | null
          tax_id?: string
        }
        Relationships: []
      }
      fiscal_year_closes: {
        Row: {
          client_id: string
          closed_at: string
          closed_by: string
          firm_id: string
          gregorian_year: number
          id: string
          notes: string | null
        }
        Insert: {
          client_id: string
          closed_at?: string
          closed_by: string
          firm_id: string
          gregorian_year: number
          id?: string
          notes?: string | null
        }
        Update: {
          client_id?: string
          closed_at?: string
          closed_by?: string
          firm_id?: string
          gregorian_year?: number
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_year_closes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_year_closes_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_year_closes_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_ranges: {
        Row: {
          client_id: string
          created_at: string | null
          end_number: string
          firm_id: string
          id: string
          invoice_type: string
          start_number: string
          year_month: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          end_number: string
          firm_id: string
          id?: string
          invoice_type: string
          start_number: string
          year_month: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          end_number?: string
          firm_id?: string
          id?: string
          invoice_type?: string
          start_number?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_ranges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_ranges_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string | null
          created_at: string | null
          document_id: string
          extracted_data: Json | null
          filename: string
          firm_id: string
          id: string
          in_or_out: string
          invoice_serial_code: string | null
          status: string | null
          storage_path: string
          tax_filing_period_id: string | null
          uploaded_by: string
          year_month: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          document_id: string
          extracted_data?: Json | null
          filename: string
          firm_id: string
          id?: string
          in_or_out: string
          invoice_serial_code?: string | null
          status?: string | null
          storage_path: string
          tax_filing_period_id?: string | null
          uploaded_by: string
          year_month?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          document_id?: string
          extracted_data?: Json | null
          filename?: string
          firm_id?: string
          id?: string
          in_or_out?: string
          invoice_serial_code?: string | null
          status?: string | null
          storage_path?: string
          tax_filing_period_id?: string | null
          uploaded_by?: string
          year_month?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tax_filing_period_id_fkey"
            columns: ["tax_filing_period_id"]
            isOneToOne: false
            referencedRelation: "tax_filing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          document_id: string | null
          entry_date: string
          firm_id: string
          id: string
          posted_at: string | null
          posted_by: string | null
          reverses_entry_id: string | null
          status: string
          updated_at: string
          voucher_no: string | null
          voucher_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_id?: string | null
          entry_date: string
          firm_id: string
          id?: string
          posted_at?: string | null
          posted_by?: string | null
          reverses_entry_id?: string | null
          status?: string
          updated_at?: string
          voucher_no?: string | null
          voucher_type: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_id?: string | null
          entry_date?: string
          firm_id?: string
          id?: string
          posted_at?: string | null
          posted_by?: string | null
          reverses_entry_id?: string | null
          status?: string
          updated_at?: string
          voucher_no?: string | null
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_code: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
          line_number: number
        }
        Insert: {
          account_code: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          line_number: number
        }
        Update: {
          account_code?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          line_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          data: Json
          id: string
          lead_code: string
          path: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          lead_code: string
          path: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          lead_code?: string
          path?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      line_accounts: {
        Row: {
          binding_code: string | null
          binding_code_created_at: string | null
          binding_confirmed: boolean
          client_id: string | null
          display_name: string | null
          followed_at: string
          id: string
          lead_id: string | null
          line_user_id: string | null
          linked_at: string | null
        }
        Insert: {
          binding_code?: string | null
          binding_code_created_at?: string | null
          binding_confirmed?: boolean
          client_id?: string | null
          display_name?: string | null
          followed_at?: string
          id?: string
          lead_id?: string | null
          line_user_id?: string | null
          linked_at?: string | null
        }
        Update: {
          binding_code?: string | null
          binding_code_created_at?: string | null
          binding_confirmed?: boolean
          client_id?: string | null
          display_name?: string | null
          followed_at?: string
          id?: string
          lead_id?: string | null
          line_user_id?: string | null
          linked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_accounts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          client_id: string | null
          created_at: string | null
          firm_id: string | null
          id: string
          name: string | null
          role: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          firm_id?: string | null
          id: string
          name?: string | null
          role?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          firm_id?: string | null
          id?: string
          name?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_filing_periods: {
        Row: {
          client_id: string
          client_ready_at: string | null
          created_at: string
          filing: Json
          firm_id: string
          id: string
          status: string
          updated_at: string
          voucher_generation_started_at: string | null
          voucher_generation_status: string
          year_month: string
        }
        Insert: {
          client_id: string
          client_ready_at?: string | null
          created_at?: string
          filing?: Json
          firm_id: string
          id?: string
          status?: string
          updated_at?: string
          voucher_generation_started_at?: string | null
          voucher_generation_status?: string
          year_month: string
        }
        Update: {
          client_id?: string
          client_ready_at?: string | null
          created_at?: string
          filing?: Json
          firm_id?: string
          id?: string
          status?: string
          updated_at?: string
          voucher_generation_started_at?: string | null
          voucher_generation_status?: string
          year_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_filing_periods_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_filing_periods_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_sequences: {
        Row: {
          client_id: string
          next_seq: number
          seq_date: string
        }
        Insert: {
          client_id: string
          next_seq?: number
          seq_date: string
        }
        Update: {
          client_id?: string
          next_seq?: number
          seq_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_sequences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_auth_user_client_id: { Args: never; Returns: string }
      get_auth_user_firm_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  pgmq_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

