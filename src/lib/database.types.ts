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
      ai_daily: {
        Row: {
          calls: number
          day: string
          input_tokens: number
          output_tokens: number
          task: string
        }
        Insert: {
          calls?: number
          day?: string
          input_tokens?: number
          output_tokens?: number
          task: string
        }
        Update: {
          calls?: number
          day?: string
          input_tokens?: number
          output_tokens?: number
          task?: string
        }
        Relationships: []
      }
      ai_prompt_versions: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: number
          review: Json
          task: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: never
          review?: Json
          task: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: never
          review?: Json
          task?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          enabled: boolean
          fallback_model: string | null
          fallback_provider: string | null
          model: string | null
          provider: string | null
          task: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          fallback_model?: string | null
          fallback_provider?: string | null
          model?: string | null
          provider?: string | null
          task: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          fallback_model?: string | null
          fallback_provider?: string | null
          model?: string | null
          provider?: string | null
          task?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          at: string
          error_code: string | null
          id: number
          input_tokens: number | null
          model: string
          outcome: string
          output_tokens: number | null
          provider: string
          task: string
        }
        Insert: {
          at?: string
          error_code?: string | null
          id?: never
          input_tokens?: number | null
          model: string
          outcome: string
          output_tokens?: number | null
          provider: string
          task: string
        }
        Update: {
          at?: string
          error_code?: string | null
          id?: never
          input_tokens?: number | null
          model?: string
          outcome?: string
          output_tokens?: number | null
          provider?: string
          task?: string
        }
        Relationships: []
      }
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
      anon_token_quota: {
        Row: {
          day: string
          n: number
          user_id: string
        }
        Insert: {
          day?: string
          n?: number
          user_id: string
        }
        Update: {
          day?: string
          n?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anon_token_quota_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anon_used_tokens: {
        Row: {
          day: string
          nonce_hash: string
        }
        Insert: {
          day?: string
          nonce_hash: string
        }
        Update: {
          day?: string
          nonce_hash?: string
        }
        Relationships: []
      }
      anonymous_events: {
        Row: {
          body: string
          day: string
          id: number
          kind: string
          report_id: string
        }
        Insert: {
          body?: string
          day?: string
          id?: never
          kind: string
          report_id: string
        }
        Update: {
          body?: string
          day?: string
          id?: never
          kind?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anonymous_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "anonymous_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      anonymous_handlers: {
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
        Relationships: [
          {
            foreignKeyName: "anonymous_handlers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anonymous_reports: {
        Row: {
          body: string
          case_code: string
          category: string
          day: string
          id: string
          secret_hash: string
          status: string
          title: string
        }
        Insert: {
          body: string
          case_code: string
          category: string
          day?: string
          id?: string
          secret_hash: string
          status?: string
          title: string
        }
        Update: {
          body?: string
          case_code?: string
          category?: string
          day?: string
          id?: string
          secret_hash?: string
          status?: string
          title?: string
        }
        Relationships: []
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
      automation_rules: {
        Row: {
          enabled: boolean
          key: string
          last_count: number | null
          last_run_at: string | null
          params: Json
        }
        Insert: {
          enabled?: boolean
          key: string
          last_count?: number | null
          last_run_at?: string | null
          params?: Json
        }
        Update: {
          enabled?: boolean
          key?: string
          last_count?: number | null
          last_run_at?: string | null
          params?: Json
        }
        Relationships: []
      }
      awards: {
        Row: {
          company_id: string
          created_at: string
          granted_by: string
          id: string
          idea_id: string
          kind: string
          month: string
          note: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          granted_by: string
          id?: string
          idea_id: string
          kind: string
          month: string
          note: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          granted_by?: string
          id?: string
          idea_id?: string
          kind?: string
          month?: string
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "awards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "group_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      challenges: {
        Row: {
          closes_at: string
          company_id: string | null
          created_at: string
          created_by: string
          description: string
          goal: string
          id: string
          status: string
          title: string
        }
        Insert: {
          closes_at: string
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string
          goal?: string
          id?: string
          status?: string
          title: string
        }
        Update: {
          closes_at?: string
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          goal?: string
          id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          wave_id: string | null
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
          wave_id?: string | null
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
          wave_id?: string | null
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
          {
            foreignKeyName: "companies_wave_id_fkey"
            columns: ["wave_id"]
            isOneToOne: false
            referencedRelation: "rollout_waves"
            referencedColumns: ["id"]
          },
        ]
      }
      company_channels: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          events: string[]
          id: string
          kind: string
          last_error: string | null
          webhook_url: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          kind: string
          last_error?: string | null
          webhook_url: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          kind?: string
          last_error?: string | null
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_checklist: {
        Row: {
          company_id: string
          done_at: string
          done_by: string | null
          item: string
        }
        Insert: {
          company_id: string
          done_at?: string
          done_by?: string | null
          item: string
        }
        Update: {
          company_id?: string
          done_at?: string
          done_by?: string | null
          item?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_checklist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      company_queue: {
        Row: {
          attempts: number
          channel_id: string
          created_at: string
          event: string
          href: string
          id: string
          last_error: string | null
          next_attempt_at: string
          status: string
          title: string
        }
        Insert: {
          attempts?: number
          channel_id: string
          created_at?: string
          event: string
          href: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          status?: string
          title: string
        }
        Update: {
          attempts?: number
          channel_id?: string
          created_at?: string
          event?: string
          href?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_queue_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "company_channels"
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
      cron_ticks: {
        Row: {
          at: string
          duration_ms: number | null
          id: number
          summary: Json
        }
        Insert: {
          at?: string
          duration_ms?: number | null
          id?: never
          summary?: Json
        }
        Update: {
          at?: string
          duration_ms?: number | null
          id?: never
          summary?: Json
        }
        Relationships: []
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
      emergency_events: {
        Row: {
          actor_id: string
          body: string
          created_at: string
          id: number
          incident_id: string
          kind: string
        }
        Insert: {
          actor_id: string
          body?: string
          created_at?: string
          id?: never
          incident_id: string
          kind: string
        }
        Update: {
          actor_id?: string
          body?: string
          created_at?: string
          id?: never
          incident_id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "emergency_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_incidents: {
        Row: {
          body: string
          category: string
          company_id: string
          created_at: string
          escalated_at: string | null
          handled_by: string | null
          id: string
          phone: string | null
          place: string
          reporter_id: string
          status: string
          updated_at: string
        }
        Insert: {
          body: string
          category: string
          company_id: string
          created_at?: string
          escalated_at?: string | null
          handled_by?: string | null
          id?: string
          phone?: string | null
          place: string
          reporter_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          company_id?: string
          created_at?: string
          escalated_at?: string | null
          handled_by?: string | null
          id?: string
          phone?: string | null
          place?: string
          reporter_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_incidents_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_incidents_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          event_id: string
          response: string
          updated_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          response: string
          updated_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          response?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          company_id: string | null
          created_at: string
          created_by: string
          description: string
          ends_at: string | null
          id: string
          link: string | null
          location: string
          starts_at: string
          status: string
          title: string
        }
        Insert: {
          capacity?: number | null
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string
          ends_at?: string | null
          id?: string
          link?: string | null
          location?: string
          starts_at: string
          status?: string
          title: string
        }
        Update: {
          capacity?: number | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          ends_at?: string | null
          id?: string
          link?: string | null
          location?: string
          starts_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          idea_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          idea_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          idea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_comments_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "group_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_comments_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_criteria: {
        Row: {
          active: boolean
          company_id: string
          id: string
          name_en: string
          name_th: string
          weight: number
        }
        Insert: {
          active?: boolean
          company_id: string
          id?: string
          name_en?: string
          name_th: string
          weight?: number
        }
        Update: {
          active?: boolean
          company_id?: string
          id?: string
          name_en?: string
          name_th?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "idea_criteria_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_outcomes: {
        Row: {
          created_at: string
          id: string
          idea_id: string
          metric: string
          note: string
          period_end: string
          period_start: string
          recorded_by: string
          value: number
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          idea_id: string
          metric: string
          note?: string
          period_end: string
          period_start: string
          recorded_by: string
          value: number
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          idea_id?: string
          metric?: string
          note?: string
          period_end?: string
          period_start?: string
          recorded_by?: string
          value?: number
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idea_outcomes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "group_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_outcomes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_scores: {
        Row: {
          comment: string
          criterion_id: string
          idea_id: string
          score: number
          scorer_id: string
        }
        Insert: {
          comment?: string
          criterion_id: string
          idea_id: string
          score: number
          scorer_id: string
        }
        Update: {
          comment?: string
          criterion_id?: string
          idea_id?: string
          score?: number
          scorer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "idea_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_scores_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "group_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_scores_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_scores_scorer_id_fkey"
            columns: ["scorer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_stage_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage: string | null
          id: number
          idea_id: string
          note: string
          to_stage: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage?: string | null
          id?: never
          idea_id: string
          note?: string
          to_stage?: string | null
          type?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage?: string | null
          id?: never
          idea_id?: string
          note?: string
          to_stage?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_stage_events_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "group_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_stage_events_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_votes: {
        Row: {
          created_at: string
          idea_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          idea_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          idea_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_votes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "group_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_votes_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          challenge_id: string | null
          company_id: string
          created_at: string
          decision_reason: string
          escalation_level: number
          expected_benefit: string
          first_response_at: string | null
          id: string
          linked_report_id: string | null
          owner_id: string
          problem_or_opportunity: string
          resources_needed: string
          respond_by: string
          stage: string
          stage_entered_at: string
          submitter_id: string
          target_customers: string
          title: string
          type_key: string
          updated_at: string
          visibility: string
          vote_count: number
        }
        Insert: {
          challenge_id?: string | null
          company_id: string
          created_at?: string
          decision_reason?: string
          escalation_level?: number
          expected_benefit?: string
          first_response_at?: string | null
          id?: string
          linked_report_id?: string | null
          owner_id: string
          problem_or_opportunity?: string
          resources_needed?: string
          respond_by: string
          stage?: string
          stage_entered_at?: string
          submitter_id: string
          target_customers?: string
          title: string
          type_key: string
          updated_at?: string
          visibility?: string
          vote_count?: number
        }
        Update: {
          challenge_id?: string | null
          company_id?: string
          created_at?: string
          decision_reason?: string
          escalation_level?: number
          expected_benefit?: string
          first_response_at?: string | null
          id?: string
          linked_report_id?: string | null
          owner_id?: string
          problem_or_opportunity?: string
          resources_needed?: string
          respond_by?: string
          stage?: string
          stage_entered_at?: string
          submitter_id?: string
          target_customers?: string
          title?: string
          type_key?: string
          updated_at?: string
          visibility?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ideas_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_linked_report_id_fkey"
            columns: ["linked_report_id"]
            isOneToOne: false
            referencedRelation: "group_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_linked_report_id_fkey"
            columns: ["linked_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_submitter_id_fkey"
            columns: ["submitter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      line_link_attempts: {
        Row: {
          at: string
          id: number
          line_user_id: string
        }
        Insert: {
          at?: string
          id?: never
          line_user_id: string
        }
        Update: {
          at?: string
          id?: never
          line_user_id?: string
        }
        Relationships: []
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
      message_log: {
        Row: {
          at: string
          channel: string
          error: string | null
          id: number
          kind: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          at?: string
          channel: string
          error?: string | null
          id?: never
          kind?: string | null
          status: string
          user_id?: string | null
        }
        Update: {
          at?: string
          channel?: string
          error?: string | null
          id?: never
          kind?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notification_channels: {
        Row: {
          address: string | null
          channel: string
          code_expires_at: string | null
          code_hash: string | null
          created_at: string
          id: string
          last_error: string | null
          status: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          address?: string | null
          channel: string
          code_expires_at?: string | null
          code_hash?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          status?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          address?: string | null
          channel?: string
          code_expires_at?: string | null
          code_hash?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          status?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_channels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          grp: string
          line: boolean
          user_id: string
        }
        Insert: {
          grp: string
          line?: boolean
          user_id: string
        }
        Update: {
          grp?: string
          line?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_id: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_user_id_fkey"
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
          params: Json
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
          params?: Json
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
          params?: Json
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
      poll_options: {
        Row: {
          id: string
          label: string
          poll_id: string
          pos: number
        }
        Insert: {
          id?: string
          label: string
          poll_id: string
          pos: number
        }
        Update: {
          id?: string
          label?: string
          poll_id?: string
          pos?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          closes_at: string
          company_id: string | null
          created_at: string
          created_by: string
          id: string
          multi: boolean
          question: string
          results_mode: string
          status: string
        }
        Insert: {
          closes_at: string
          company_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          multi?: boolean
          question: string
          results_mode?: string
          status?: string
        }
        Update: {
          closes_at?: string
          company_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          multi?: boolean
          question?: string
          results_mode?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      privacy_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: string
          note: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: string
          note?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: string
          note?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      qa_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          author_id: string
          body: string
          created_at: string
          hide_name: boolean
          id: string
          session_id: string
          status: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          author_id: string
          body: string
          created_at?: string
          hide_name?: boolean
          id?: string
          session_id: string
          status?: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          author_id?: string
          body?: string
          created_at?: string
          hide_name?: boolean
          id?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_questions_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_questions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "qa_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_sessions: {
        Row: {
          closes_at: string
          company_id: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          status: string
          title: string
        }
        Insert: {
          closes_at: string
          company_id?: string | null
          created_at?: string
          created_by: string
          description?: string
          id?: string
          status?: string
          title: string
        }
        Update: {
          closes_at?: string
          company_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_votes: {
        Row: {
          question_id: string
          user_id: string
        }
        Insert: {
          question_id: string
          user_id: string
        }
        Update: {
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_votes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "qa_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      recognition_points: {
        Row: {
          company_id: string
          created_at: string
          id: number
          idea_id: string
          points: number
          reason: string
          ref: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: never
          idea_id: string
          points: number
          reason: string
          ref?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: never
          idea_id?: string
          points?: number
          reason?: string
          ref?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recognition_points_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognition_points_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "group_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognition_points_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recognition_points_reason_fkey"
            columns: ["reason"]
            isOneToOne: false
            referencedRelation: "recognition_rules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "recognition_points_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recognition_rules: {
        Row: {
          key: string
          points: number
        }
        Insert: {
          key: string
          points: number
        }
        Update: {
          key?: string
          points?: number
        }
        Relationships: []
      }
      report_attachments: {
        Row: {
          bytes: number
          created_at: string
          id: string
          mime: string
          report_id: string
          storage_path: string
        }
        Insert: {
          bytes: number
          created_at?: string
          id?: string
          mime: string
          report_id: string
          storage_path: string
        }
        Update: {
          bytes?: number
          created_at?: string
          id?: string
          mime?: string
          report_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "group_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_attachments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_categories: {
        Row: {
          active: boolean
          company_id: string
          default_severity: string
          id: string
          key: string
          name_en: string
          name_th: string
        }
        Insert: {
          active?: boolean
          company_id: string
          default_severity?: string
          id?: string
          key: string
          name_en?: string
          name_th: string
        }
        Update: {
          active?: boolean
          company_id?: string
          default_severity?: string
          id?: string
          key?: string
          name_en?: string
          name_th?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          report_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          report_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "group_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: number
          note: string
          report_id: string
          to_status: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string
          report_id: string
          to_status?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string
          report_id?: string
          to_status?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "group_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_metoo: {
        Row: {
          created_at: string
          report_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          report_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_metoo_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "group_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_metoo_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_metoo_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category_id: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          department_id: string | null
          description: string
          escalation_level: number
          first_response_at: string | null
          id: string
          impact: string
          merged_into_id: string | null
          metoo_count: number
          owner_id: string
          proposed_fix: string
          quick_fix: boolean
          quick_fix_approved_by: string | null
          resolution_note: string
          respond_by: string
          severity: string
          shared_at: string | null
          shared_by: string | null
          status: string
          submitter_id: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          category_id?: string | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          department_id?: string | null
          description?: string
          escalation_level?: number
          first_response_at?: string | null
          id?: string
          impact?: string
          merged_into_id?: string | null
          metoo_count?: number
          owner_id: string
          proposed_fix?: string
          quick_fix?: boolean
          quick_fix_approved_by?: string | null
          resolution_note?: string
          respond_by: string
          severity?: string
          shared_at?: string | null
          shared_by?: string | null
          status?: string
          submitter_id: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          category_id?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          department_id?: string | null
          description?: string
          escalation_level?: number
          first_response_at?: string | null
          id?: string
          impact?: string
          merged_into_id?: string | null
          metoo_count?: number
          owner_id?: string
          proposed_fix?: string
          quick_fix?: boolean
          quick_fix_approved_by?: string | null
          resolution_note?: string
          respond_by?: string
          severity?: string
          shared_at?: string | null
          shared_by?: string | null
          status?: string
          submitter_id?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "report_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "group_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_submitter_id_fkey"
            columns: ["submitter_id"]
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
      rollout_waves: {
        Row: {
          business_unit_id: string | null
          created_at: string
          features: string[]
          id: string
          name: string
          planned_on: string | null
          status: string
        }
        Insert: {
          business_unit_id?: string | null
          created_at?: string
          features?: string[]
          id?: string
          name: string
          planned_on?: string | null
          status?: string
        }
        Update: {
          business_unit_id?: string | null
          created_at?: string
          features?: string[]
          id?: string
          name?: string
          planned_on?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rollout_waves_business_unit_id_fkey"
            columns: ["business_unit_id"]
            isOneToOne: false
            referencedRelation: "business_units"
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
      routing_rules: {
        Row: {
          category_id: string
          company_id: string
          owner_user_id: string
          sla_hours: number | null
        }
        Insert: {
          category_id: string
          company_id: string
          owner_user_id: string
          sla_hours?: number | null
        }
        Update: {
          category_id?: string
          company_id?: string
          owner_user_id?: string
          sla_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "routing_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "report_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_rules_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      group_ideas: {
        Row: {
          company_id: string | null
          company_name: string | null
          expected_benefit: string | null
          id: string | null
          problem_or_opportunity: string | null
          stage: string | null
          submitter_name: string | null
          title: string | null
          type_key: string | null
          vote_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ideas_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      group_reports: {
        Row: {
          category_id: string | null
          company_id: string | null
          company_name: string | null
          description: string | null
          id: string | null
          impact: string | null
          metoo_count: number | null
          proposed_fix: string | null
          severity: string | null
          shared_at: string | null
          status: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "report_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      ack_announcement: { Args: { p_id: string }; Returns: undefined }
      admin_activate_company: {
        Args: { p_company: string }
        Returns: undefined
      }
      admin_activate_wave: { Args: { p_wave: string }; Returns: Json }
      admin_analytics: { Args: { p_days?: number }; Returns: Json }
      admin_assign_wave: {
        Args: { p_company: string; p_wave: string }
        Returns: undefined
      }
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
      admin_create_wave: {
        Args: {
          p_bu: string
          p_features: string[]
          p_name: string
          p_planned: string
        }
        Returns: string
      }
      admin_purge_audit: { Args: { p_before: string }; Returns: number }
      admin_save_prompt: {
        Args: { p_body: string; p_review: Json; p_task: string }
        Returns: number
      }
      admin_set_ai_route: {
        Args: {
          p_enabled: boolean
          p_fb_model: string
          p_fb_provider: string
          p_model: string
          p_provider: string
          p_task: string
        }
        Returns: undefined
      }
      admin_set_anon_handler: {
        Args: { p_on: boolean; p_user: string }
        Returns: undefined
      }
      admin_set_anon_handler_email: {
        Args: { p_email: string; p_on: boolean }
        Returns: undefined
      }
      admin_set_checklist: {
        Args: { p_company: string; p_done: boolean; p_item: string }
        Returns: undefined
      }
      admin_set_coordinator: {
        Args: { p_company: string; p_email: string }
        Returns: string
      }
      admin_set_points: {
        Args: { p_key: string; p_points: number }
        Returns: undefined
      }
      admin_set_rule: {
        Args: { p_enabled: boolean; p_hours: number; p_key: string }
        Returns: undefined
      }
      admin_update_company: {
        Args: { p_id: string; p_sla: number; p_status: string }
        Returns: undefined
      }
      ai_count: {
        Args: { p_in: number; p_out: number; p_task: string }
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
      anon_followup: {
        Args: { p_code: string; p_message: string; p_secret_hash: string }
        Returns: undefined
      }
      anon_reply: {
        Args: { p_body: string; p_id: string; p_kind: string }
        Returns: undefined
      }
      anon_set_status: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: undefined
      }
      anon_status: {
        Args: { p_code: string; p_secret_hash: string }
        Returns: Json
      }
      anon_submit: {
        Args: {
          p_body: string
          p_category: string
          p_code: string
          p_nonce_hash: string
          p_secret_hash: string
          p_title: string
        }
        Returns: string
      }
      anon_take_token: { Args: never; Returns: boolean }
      anonymize_user: { Args: { p_user: string }; Returns: undefined }
      archive_announcement: { Args: { p_id: string }; Returns: undefined }
      award_grant: {
        Args: { p_idea: string; p_kind: string; p_note: string }
        Returns: string
      }
      can_coordinate: { Args: { p_company: string }; Returns: boolean }
      challenge_close: { Args: { p_id: string }; Returns: undefined }
      challenge_create: {
        Args: {
          p_closes: string
          p_company: string
          p_description: string
          p_goal: string
          p_title: string
        }
        Returns: string
      }
      challenges_list: {
        Args: never
        Returns: {
          closes_at: string
          company_id: string
          description: string
          goal: string
          id: string
          ideas: number
          manage: boolean
          status: string
          title: string
        }[]
      }
      claim_roster: { Args: never; Returns: number }
      company_dashboard: {
        Args: { p_company: string; p_days?: number }
        Returns: Json
      }
      company_readiness: { Args: { p_company: string }; Returns: Json }
      create_invitation: {
        Args: { p_company: string; p_ttl_hours?: number }
        Returns: string
      }
      decide_join: {
        Args: { p_approve: boolean; p_request: string }
        Returns: undefined
      }
      decide_privacy: {
        Args: { p_id: string; p_status: string }
        Returns: undefined
      }
      emergency_add_note: {
        Args: { p_body: string; p_id: string }
        Returns: undefined
      }
      emergency_set_status: {
        Args: { p_id: string; p_note?: string; p_status: string }
        Returns: undefined
      }
      end_membership: { Args: { p_membership: string }; Returns: undefined }
      event_cancel: { Args: { p_id: string }; Returns: number }
      event_create: {
        Args: {
          p_capacity: number
          p_company: string
          p_description: string
          p_ends: string
          p_link: string
          p_location: string
          p_starts: string
          p_title: string
        }
        Returns: string
      }
      event_guests: {
        Args: { p_id: string }
        Returns: {
          display_name: string
          response: string
          user_id: string
        }[]
      }
      event_rsvp: {
        Args: { p_id: string; p_response: string }
        Returns: undefined
      }
      events_list: {
        Args: { p_from?: string }
        Returns: {
          capacity: number
          company_id: string
          description: string
          ends_at: string
          going: number
          id: string
          link: string
          location: string
          manage: boolean
          maybe: number
          mine: string
          starts_at: string
          status: string
          title: string
        }[]
      }
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
      idea_add_outcome: {
        Args: {
          p_end: string
          p_idea: string
          p_metric: string
          p_note?: string
          p_start: string
          p_value: number
        }
        Returns: string
      }
      idea_assign: {
        Args: { p_id: string; p_owner: string }
        Returns: undefined
      }
      idea_link_challenge: {
        Args: { p_challenge: string; p_idea: string }
        Returns: undefined
      }
      idea_score: {
        Args: {
          p_comment?: string
          p_criterion: string
          p_idea: string
          p_score: number
        }
        Returns: undefined
      }
      idea_set_visibility: {
        Args: { p_id: string; p_visibility: string }
        Returns: undefined
      }
      idea_toggle_vote: { Args: { p_id: string }; Returns: boolean }
      idea_transition: {
        Args: { p_id: string; p_note?: string; p_to: string }
        Returns: undefined
      }
      idea_verify_outcome: { Args: { p_outcome: string }; Returns: undefined }
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
      my_channels: {
        Args: never
        Returns: {
          channel: string
          code_expires_at: string
          last_error: string
          status: string
          verified_at: string
        }[]
      }
      my_data_export: { Args: never; Returns: Json }
      notify_self_password_changed: { Args: never; Returns: undefined }
      notify_system: {
        Args: {
          p_dedupe: string
          p_href: string
          p_kind: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      poll_close: { Args: { p_id: string }; Returns: undefined }
      poll_create: {
        Args: {
          p_closes: string
          p_company: string
          p_mode: string
          p_multi: boolean
          p_options: string[]
          p_question: string
        }
        Returns: string
      }
      poll_results: {
        Args: { p_id: string }
        Returns: {
          label: string
          option_id: string
          voters: number
          votes: number
        }[]
      }
      poll_vote: {
        Args: { p_id: string; p_options: string[] }
        Returns: undefined
      }
      prune_old_data: { Args: never; Returns: Json }
      publish_announcement: { Args: { p_id: string }; Returns: number }
      qa_answer: {
        Args: { p_answer: string; p_question: string }
        Returns: undefined
      }
      qa_ask: {
        Args: { p_body: string; p_hide?: boolean; p_session: string }
        Returns: string
      }
      qa_close_session: { Args: { p_id: string }; Returns: undefined }
      qa_create_session: {
        Args: {
          p_closes: string
          p_company: string
          p_description: string
          p_title: string
        }
        Returns: string
      }
      qa_hide: {
        Args: { p_on: boolean; p_question: string }
        Returns: undefined
      }
      qa_list: {
        Args: { p_session: string }
        Returns: {
          answer: string
          answered_at: string
          asker: string
          body: string
          created_at: string
          id: string
          mine: boolean
          status: string
          voted: boolean
          votes: number
        }[]
      }
      qa_vote: { Args: { p_question: string }; Returns: boolean }
      redeem_invitation: { Args: { p_code: string }; Returns: string }
      report_assign: {
        Args: { p_id: string; p_owner: string }
        Returns: undefined
      }
      report_emergency: {
        Args: {
          p_body: string
          p_category: string
          p_company: string
          p_phone?: string
          p_place: string
        }
        Returns: string
      }
      report_merge: {
        Args: { p_dup: string; p_into: string }
        Returns: undefined
      }
      report_metoo: { Args: { p_id: string }; Returns: undefined }
      report_quick_fix: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      report_set_visibility: {
        Args: { p_id: string; p_visibility: string }
        Returns: undefined
      }
      report_transition: {
        Args: { p_id: string; p_note?: string; p_to: string }
        Returns: undefined
      }
      request_join: {
        Args: { p_company: string; p_note?: string }
        Returns: string
      }
      request_privacy: {
        Args: { p_kind: string; p_note?: string }
        Returns: string
      }
      revoke_admin: { Args: { p_user: string }; Returns: undefined }
      revoke_role: { Args: { p_id: string }; Returns: undefined }
      run_emergency_escalation: { Args: never; Returns: number }
      run_flush: { Args: never; Returns: undefined }
      run_tick: { Args: never; Returns: Json }
      set_category_active: {
        Args: { p_active: boolean; p_category: string }
        Returns: undefined
      }
      set_criteria: {
        Args: {
          p_active: boolean
          p_company: string
          p_id: string
          p_name_th: string
          p_weight: number
        }
        Returns: string
      }
      set_routing: {
        Args: {
          p_category: string
          p_company: string
          p_owner: string
          p_sla?: number
        }
        Returns: undefined
      }
      set_supervisor: {
        Args: { p_membership: string; p_supervisor: string }
        Returns: undefined
      }
      similar_reports: {
        Args: { p_company: string; p_terms: string[] }
        Returns: {
          hits: number
          id: string
          metoo_count: number
          status: string
          title: string
        }[]
      }
      submit_idea: {
        Args: {
          p_benefit: string
          p_company: string
          p_customers: string
          p_id: string
          p_problem: string
          p_report?: string
          p_resources: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      submit_report: {
        Args: {
          p_attachments?: Json
          p_category: string
          p_company: string
          p_description: string
          p_fix: string
          p_id: string
          p_impact: string
          p_severity: string
          p_title: string
        }
        Returns: string
      }
      unlink_channel: { Args: { p_channel: string }; Returns: undefined }
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
