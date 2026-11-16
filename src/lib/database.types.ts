export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      aivora_links: {
        Row: {
          aivora_user_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          aivora_user_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          aivora_user_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      announcement_audiences: {
        Row: {
          announcement_id: string
          audience_type: string
          target_id: string | null
        }
        Insert: {
          announcement_id: string
          audience_type: string
          target_id?: string | null
        }
        Update: {
          announcement_id?: string
          audience_type?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_audiences_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_comments: {
        Row: {
          announcement_id: string
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
        }
        Insert: {
          announcement_id: string
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
        }
        Update: {
          announcement_id?: string
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_comments_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_receipts: {
        Row: {
          acked_at: string | null
          announcement_id: string
          delivered_at: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          acked_at?: string | null
          announcement_id: string
          delivered_at?: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          acked_at?: string | null
          announcement_id?: string
          delivered_at?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_receipts_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          ack_due_at: string | null
          author_id: string
          body: string
          company_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          pinned: boolean
          publish_at: string | null
          requires_ack: boolean
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          ack_due_at?: string | null
          author_id: string
          body?: string
          company_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          pinned?: boolean
          publish_at?: string | null
          requires_ack?: boolean
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          ack_due_at?: string | null
          author_id?: string
          body?: string
          company_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          pinned?: boolean
          publish_at?: string | null
          requires_ack?: boolean
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          at: string
          company_id: string | null
          detail: Json
          entity: string
          entity_id: string | null
          id: number
          source: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          at?: string
          company_id?: string | null
          detail?: Json
          entity: string
          entity_id?: string | null
          id?: never
          source?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          at?: string
          company_id?: string | null
          detail?: Json
          entity?: string
          entity_id?: string | null
          id?: never
          source?: string
        }
        Relationships: []
      }
      audit_purges: {
        Row: {
          actor_id: string | null
          at: string
          before_ts: string
          id: number
          rows_deleted: number
        }
        Insert: {
          actor_id?: string | null
          at?: string
          before_ts: string
          id?: never
          rows_deleted: number
        }
        Update: {
          actor_id?: string | null
          at?: string
          before_ts?: string
          id?: never
          rows_deleted?: number
        }
        Relationships: []
      }
      business_units: {
        Row: {
          id: string
          name_en: string
          name_th: string
          sort: number
        }
        Insert: {
          id?: string
          name_en?: string
          name_th: string
          sort?: number
        }
        Update: {
          id?: string
          name_en?: string
          name_th?: string
          sort?: number
        }
        Relationships: []
      }
      companies: {
        Row: {
          business_unit_id: string | null
          code: string
          created_at: string
          id: string
          is_demo: boolean
          name_en: string
          name_th: string
          response_sla_hours: number
          settings: Json
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          business_unit_id?: string | null
          code: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name_en?: string
          name_th: string
          response_sla_hours?: number
          settings?: Json
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          business_unit_id?: string | null
          code?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          name_en?: string
          name_th?: string
          response_sla_hours?: number
          settings?: Json
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "company_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      company_features: {
        Row: {
          company_id: string
          enabled: boolean
          key: string
        }
        Insert: {
          company_id: string
          enabled: boolean
          key: string
        }
        Update: {
          company_id?: string
          enabled?: boolean
          key?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_features_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_templates: {
        Row: {
          config: Json
          created_at: string
          id: string
          name: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          accepted_at: string
          kind: string
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          kind: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          kind?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          company_id: string
          id: string
          name_en: string
          name_th: string
          parent_id: string | null
        }
        Insert: {
          company_id: string
          id?: string
          name_en?: string
          name_th: string
          parent_id?: string | null
        }
        Update: {
          company_id?: string
          id?: string
          name_en?: string
          name_th?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          code_hash: string
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          preset: Json
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code_hash: string
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          preset?: Json
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code_hash?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          preset?: Json
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          company_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          note: string | null
          status: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          status?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string
          department_id: string | null
          employee_code: string | null
          ended_at: string | null
          id: string
          is_primary: boolean
          position_id: string | null
          started_at: string
          status: string
          supervisor_membership_id: string | null
          user_id: string
          work_email: string | null
        }
        Insert: {
          company_id: string
          department_id?: string | null
          employee_code?: string | null
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          position_id?: string | null
          started_at?: string
          status?: string
          supervisor_membership_id?: string | null
          user_id: string
          work_email?: string | null
        }
        Update: {
          company_id?: string
          department_id?: string | null
          employee_code?: string | null
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          position_id?: string | null
          started_at?: string
          status?: string
          supervisor_membership_id?: string | null
          user_id?: string
          work_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_supervisor_membership_id_fkey"
            columns: ["supervisor_membership_id"]
            isOneToOne: false
            referencedRelation: "directory"
            referencedColumns: ["membership_id"]
          },
          {
            foreignKeyName: "memberships_supervisor_membership_id_fkey"
            columns: ["supervisor_membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          href: string
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          dedupe_key: string
          href?: string
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          href?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      positions: {
        Row: {
          company_id: string
          id: string
          name_en: string
          name_th: string
        }
        Insert: {
          company_id: string
          id?: string
          name_en?: string
          name_th: string
        }
        Update: {
          company_id?: string
          id?: string
          name_en?: string
          name_th?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_events: {
        Row: {
          at: string
          day: string
          id: number
          name: string
          tag: string | null
          user_id: string
        }
        Insert: {
          at?: string
          day?: string
          id?: never
          name: string
          tag?: string | null
          user_id: string
        }
        Update: {
          at?: string
          day?: string
          id?: never
          name?: string
          tag?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string
          id: string
          locale: string
          must_change_password: boolean
          status: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id: string
          locale?: string
          must_change_password?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string
          id?: string
          locale?: string
          must_change_password?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          kind?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: string
          scope_id: string | null
          scope_type: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: string
          scope_id?: string | null
          scope_type: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: string
          scope_id?: string | null
          scope_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_entries: {
        Row: {
          batch_id: string | null
          claimed_by: string | null
          company_id: string
          created_at: string
          department_id: string | null
          display_name: string | null
          employee_code: string | null
          id: string
          imported_by: string | null
          position_id: string | null
          work_email: string
        }
        Insert: {
          batch_id?: string | null
          claimed_by?: string | null
          company_id: string
          created_at?: string
          department_id?: string | null
          display_name?: string | null
          employee_code?: string | null
          id?: string
          imported_by?: string | null
          position_id?: string | null
          work_email: string
        }
        Update: {
          batch_id?: string | null
          claimed_by?: string | null
          company_id?: string
          created_at?: string
          department_id?: string | null
          display_name?: string | null
          employee_code?: string | null
          id?: string
          imported_by?: string | null
          position_id?: string | null
          work_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_entries_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_entries_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      directory: {
        Row: {
          avatar_path: string | null
          company_id: string | null
          department_en: string | null
          department_th: string | null
          display_name: string | null
          membership_id: string | null
          position_en: string | null
          position_th: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      ack_announcement: { Args: { p_id: string }; Returns: undefined }
      admin_analytics: { Args: { p_days?: number }; Returns: Json }
      admin_create_bu: {
        Args: { p_name_en?: string; p_name_th: string }
        Returns: string
      }
      admin_create_company: {
        Args: {
          p_bu: string
          p_code: string
          p_name_en: string
          p_name_th: string
          p_template: string
        }
        Returns: string
      }
      admin_purge_audit: { Args: { p_before: string }; Returns: number }
      admin_set_coordinator: {
        Args: { p_company: string; p_email: string }
        Returns: string
      }
      admin_update_company: {
        Args: { p_id: string; p_sla: number; p_status: string }
        Returns: undefined
      }
      announcement_readership: {
        Args: { p_id: string }
        Returns: {
          acked_at: string
          display_name: string
          read_at: string
          user_id: string
        }[]
      }
      archive_announcement: { Args: { p_id: string }; Returns: undefined }
      claim_roster: { Args: never; Returns: number }
      create_invitation: {
        Args: { p_company: string; p_ttl_hours?: number }
        Returns: string
      }
      decide_join: {
        Args: { p_approve: boolean; p_request: string }
        Returns: undefined
      }
      end_membership: { Args: { p_membership: string }; Returns: undefined }
      grant_admin: { Args: { p_email: string }; Returns: undefined }
      grant_role: {
        Args: {
          p_role: string
          p_scope_id?: string
          p_scope_type: string
          p_user: string
        }
        Returns: string
      }
      import_roster: {
        Args: { p_company: string; p_rows: Json }
        Returns: number
      }
      join_company_options: {
        Args: never
        Returns: {
          id: string
          name_en: string
          name_th: string
        }[]
      }
      mark_announcement_read: { Args: { p_id: string }; Returns: undefined }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      publish_announcement: { Args: { p_id: string }; Returns: number }
      redeem_invitation: { Args: { p_code: string }; Returns: string }
      request_join: {
        Args: { p_company: string; p_note?: string }
        Returns: string
      }
      revoke_admin: { Args: { p_user: string }; Returns: undefined }
      revoke_role: { Args: { p_id: string }; Returns: undefined }
      set_supervisor: {
        Args: { p_membership: string; p_supervisor: string }
        Returns: undefined
      }
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
    Enums: {},
  },
} as const
