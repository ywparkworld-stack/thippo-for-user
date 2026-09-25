export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          description: string
          key: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          description?: string
          key: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          payload: NonNullable<Json>
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: never
          payload?: NonNullable<Json>
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: never
          payload?: NonNullable<Json>
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          close_time: string
          created_at: string
          id: string
          open_time: string
          space_id: string
          weekday: number
        }
        Insert: {
          close_time: string
          created_at?: string
          id?: string
          open_time: string
          space_id: string
          weekday: number
        }
        Update: {
          close_time?: string
          created_at?: string
          id?: string
          open_time?: string
          space_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_space_id_fkey"
            columns: ["space_id"]
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_fees: {
        Row: {
          application_fee: number
          booking_id: string
          created_at: string
          hours: number
          platform_fee_excl_tax: number
          platform_fee_tax: number
          stripe_fee_estimated: number
        }
        Insert: {
          application_fee: number
          booking_id: string
          created_at?: string
          hours: number
          platform_fee_excl_tax: number
          platform_fee_tax: number
          stripe_fee_estimated: number
        }
        Update: {
          application_fee?: number
          booking_id?: string
          created_at?: string
          hours?: number
          platform_fee_excl_tax?: number
          platform_fee_tax?: number
          stripe_fee_estimated?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_fees_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancel_policy: Database["public"]["Enums"]["cancel_policy"] | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["cancel_actor"] | null
          created_at: string
          guest_id: string
          host_id: string
          id: string
          no_show_recorded_at: string | null
          order_id: string
          period: unknown
          price_per_30min: number
          slots: number
          space_id: string
          status: Database["public"]["Enums"]["booking_status"]
          total: number
          updated_at: string
        }
        Insert: {
          cancel_policy?: Database["public"]["Enums"]["cancel_policy"] | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["cancel_actor"] | null
          created_at?: string
          guest_id: string
          host_id: string
          id?: string
          no_show_recorded_at?: string | null
          order_id: string
          period: unknown
          price_per_30min: number
          slots: number
          space_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          total: number
          updated_at?: string
        }
        Update: {
          cancel_policy?: Database["public"]["Enums"]["cancel_policy"] | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["cancel_actor"] | null
          created_at?: string
          guest_id?: string
          host_id?: string
          id?: string
          no_show_recorded_at?: string | null
          order_id?: string
          period?: unknown
          price_per_30min?: number
          slots?: number
          space_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_guest_id_fkey"
            columns: ["guest_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_host_id_fkey"
            columns: ["host_id"]
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_space_id_fkey"
            columns: ["space_id"]
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cancel_events: {
        Row: {
          booking_id: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: never
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: never
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancel_events_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancel_events_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          period: unknown
          slots: number | null
          space_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          period: unknown
          slots?: never
          space_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          period?: unknown
          slots?: never
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_space_id_fkey"
            columns: ["space_id"]
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          guest_id: string
          host_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          guest_id: string
          host_id?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          guest_id?: string
          host_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_guest_id_fkey"
            columns: ["guest_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_host_id_fkey"
            columns: ["host_id"]
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      closures: {
        Row: {
          created_at: string
          date: string
          space_id: string
        }
        Insert: {
          created_at?: string
          date: string
          space_id: string
        }
        Update: {
          created_at?: string
          date?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "closures_space_id_fkey"
            columns: ["space_id"]
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      host_applications: {
        Row: {
          address: string
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          host_id: string | null
          id: string
          note: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["host_application_status"]
          updated_at: string
        }
        Insert: {
          address: string
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          host_id?: string | null
          id?: string
          note?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["host_application_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          company_name?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          host_id?: string | null
          id?: string
          note?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["host_application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_applications_host_id_fkey"
            columns: ["host_id"]
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      host_members: {
        Row: {
          created_at: string
          host_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          host_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          host_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_members_host_id_fkey"
            columns: ["host_id"]
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_members_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hosts: {
        Row: {
          charges_enabled: boolean
          company_name: string
          created_at: string
          deleted_at: string | null
          id: string
          invoice_registration_number: string | null
          payouts_enabled: boolean
          status: Database["public"]["Enums"]["host_status"]
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          charges_enabled?: boolean
          company_name: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_registration_number?: string | null
          payouts_enabled?: boolean
          status?: Database["public"]["Enums"]["host_status"]
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          charges_enabled?: boolean
          company_name?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          invoice_registration_number?: string | null
          payouts_enabled?: boolean
          status?: Database["public"]["Enums"]["host_status"]
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      identity_documents: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["identity_document_status"]
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["identity_document_status"]
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["identity_document_status"]
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_documents_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_statements: {
        Row: {
          created_at: string
          gross: number
          host_id: string
          id: string
          issued_at: string | null
          month: string
          net: number
          pdf_path: string | null
          platform_fee_excl_tax: number
          platform_fee_tax: number
          stripe_fee: number
        }
        Insert: {
          created_at?: string
          gross: number
          host_id: string
          id?: string
          issued_at?: string | null
          month: string
          net: number
          pdf_path?: string | null
          platform_fee_excl_tax: number
          platform_fee_tax: number
          stripe_fee: number
        }
        Update: {
          created_at?: string
          gross?: number
          host_id?: string
          id?: string
          issued_at?: string | null
          month?: string
          net?: number
          pdf_path?: string | null
          platform_fee_excl_tax?: number
          platform_fee_tax?: number
          stripe_fee?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_statements_host_id_fkey"
            columns: ["host_id"]
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: NonNullable<Json>
          provider_message_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          subject: string
          template: string
          to_email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: NonNullable<Json>
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject: string
          template: string
          to_email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: NonNullable<Json>
          provider_message_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string
          template?: string
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          application_fee_amount: number
          created_at: string
          expires_at: string
          guest_id: string
          host_id: string
          id: string
          order_number: string
          paid_at: string | null
          status: Database["public"]["Enums"]["order_status"]
          stripe_charge_id: string | null
          stripe_fee_actual: number | null
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          application_fee_amount: number
          created_at?: string
          expires_at: string
          guest_id: string
          host_id: string
          id?: string
          order_number?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_charge_id?: string | null
          stripe_fee_actual?: number | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          total: number
          updated_at?: string
        }
        Update: {
          application_fee_amount?: number
          created_at?: string
          expires_at?: string
          guest_id?: string
          host_id?: string
          id?: string
          order_number?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          stripe_charge_id?: string | null
          stripe_fee_actual?: number | null
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_guest_id_fkey"
            columns: ["guest_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_host_id_fkey"
            columns: ["host_id"]
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string
          email: string
          id: string
          identity_status: Database["public"]["Enums"]["identity_status"]
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          email: string
          id: string
          identity_status?: Database["public"]["Enums"]["identity_status"]
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          email?: string
          id?: string
          identity_status?: Database["public"]["Enums"]["identity_status"]
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          attempts: number
          booking_id: string
          created_at: string
          created_by: string | null
          failure_reason: string | null
          id: string
          policy: Database["public"]["Enums"]["cancel_policy"]
          refund_amount: number
          status: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id: string | null
          stripe_transfer_reversal_id: string | null
          transfer_reversal_amount: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          booking_id: string
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          id?: string
          policy: Database["public"]["Enums"]["cancel_policy"]
          refund_amount: number
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id?: string | null
          stripe_transfer_reversal_id?: string | null
          transfer_reversal_amount: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          created_at?: string
          created_by?: string | null
          failure_reason?: string | null
          id?: string
          policy?: Database["public"]["Enums"]["cancel_policy"]
          refund_amount?: number
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id?: string | null
          stripe_transfer_reversal_id?: string | null
          transfer_reversal_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_booking_id_fkey"
            columns: ["booking_id"]
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_photos: {
        Row: {
          created_at: string
          id: string
          sort_order: number
          space_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          sort_order?: number
          space_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          sort_order?: number
          space_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_photos_space_id_fkey"
            columns: ["space_id"]
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          address: string
          amenities: string[]
          area: string
          capacity: number
          created_at: string
          deleted_at: string | null
          description: string
          host_id: string
          id: string
          min_slots: number
          name: string
          price_per_30min: number
          status: Database["public"]["Enums"]["space_status"]
          updated_at: string
        }
        Insert: {
          address?: string
          amenities?: string[]
          area?: string
          capacity: number
          created_at?: string
          deleted_at?: string | null
          description?: string
          host_id: string
          id?: string
          min_slots?: number
          name: string
          price_per_30min: number
          status?: Database["public"]["Enums"]["space_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          amenities?: string[]
          area?: string
          capacity?: number
          created_at?: string
          deleted_at?: string | null
          description?: string
          host_id?: string
          id?: string
          min_slots?: number
          name?: string
          price_per_30min?: number
          status?: Database["public"]["Enums"]["space_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_host_id_fkey"
            columns: ["host_id"]
            referencedRelation: "hosts"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          event_id: string
          payload: NonNullable<Json>
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          payload: NonNullable<Json>
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          payload?: NonNullable<Json>
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calc_booking_fees: {
        Args: { p_price_per_30min: number; p_slots: number }
        Returns: {
          application_fee: number
          host_transfer: number
          hours: number
          platform_fee_excl_tax: number
          platform_fee_tax: number
          stripe_fee_estimated: number
          total: number
        }[]
      }
      can_manage_space: { Args: { p_space_id: string }; Returns: boolean }
      can_read_booking: { Args: { p_booking_id: string }; Returns: boolean }
      host_can_publish: { Args: { p_host_id: string }; Returns: boolean }
      host_is_active: { Args: { p_host_id: string }; Returns: boolean }
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_host_member: { Args: { p_host_id: string }; Returns: boolean }
      is_price_allowed: {
        Args: { p_min_slots: number; p_price_per_30min: number }
        Returns: boolean
      }
      is_single_jst_day: { Args: { p_period: unknown }; Returns: boolean }
      is_slot_aligned: { Args: { p_ts: string }; Returns: boolean }
      is_space_public: { Args: { p_space_id: string }; Returns: boolean }
      is_valid_booking_period: { Args: { p_period: unknown }; Returns: boolean }
      last_bookable_date: { Args: { p_now: string }; Returns: string }
      owns_cart: { Args: { p_cart_id: string }; Returns: boolean }
      period_slots: { Args: { p_period: unknown }; Returns: number }
      pricing_config: {
        Args: Record<PropertyKey, never>
        Returns: {
          booking_window_days: number
          cancel_count_limit: number
          cancel_count_window_hours: number
          consumption_tax_rate_percent: number
          full_refund_deadline_hours: number
          half_cancel_platform_fee_per_hour_excl_tax: number
          max_price_per_30min: number
          max_slots_per_booking: number
          min_price_per_30min: number
          pending_order_ttl_minutes: number
          platform_fee_per_hour_excl_tax: number
          slot_minutes: number
          stripe_fee_rate_basis_points: number
        }[]
      }
      space_busy_periods: {
        Args: { p_from: string; p_space_id: string; p_to: string }
        Returns: {
          period: unknown
        }[]
      }
    }
    Enums: {
      account_status: "active" | "suspended"
      app_role: "guest" | "host" | "admin"
      booking_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "completed"
        | "no_show"
      cancel_actor: "guest" | "host" | "admin"
      cancel_policy: "full" | "half" | "none"
      host_application_status: "pending" | "approved" | "rejected"
      host_status: "applied" | "active" | "suspended"
      identity_document_status: "pending" | "approved" | "rejected"
      identity_status: "unsubmitted" | "pending" | "approved" | "rejected"
      notification_status: "queued" | "sent" | "failed"
      order_status: "pending" | "paid" | "expired" | "failed"
      refund_status: "pending" | "succeeded" | "failed"
      space_status: "draft" | "published" | "suspended"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["active", "suspended"],
      app_role: ["guest", "host", "admin"],
      booking_status: [
        "pending",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ],
      cancel_actor: ["guest", "host", "admin"],
      cancel_policy: ["full", "half", "none"],
      host_application_status: ["pending", "approved", "rejected"],
      host_status: ["applied", "active", "suspended"],
      identity_document_status: ["pending", "approved", "rejected"],
      identity_status: ["unsubmitted", "pending", "approved", "rejected"],
      notification_status: ["queued", "sent", "failed"],
      order_status: ["pending", "paid", "expired", "failed"],
      refund_status: ["pending", "succeeded", "failed"],
      space_status: ["draft", "published", "suspended"],
    },
  },
} as const

