export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlatformRole = "SUPERADMIN" | "USER";
export type OrganizationRole = "OWNER" | "MANAGER" | "AGENT";
export type LeadTemperature = "HOT" | "WARM" | "COLD";
export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "FOLLOW_UP"
  | "CONVERTED"
  | "LOST"
  | "DO_NOT_CALL";
export type CallStatus =
  | "QUEUED"
  | "INITIATING"
  | "RINGING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "BUSY"
  | "NO_ANSWER"
  | "FAILED"
  | "CANCELED";
export type LanguageMode = "AUTO" | "ENGLISH" | "TAMIL" | "TANGLISH";
export type CallDisposition =
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "CALLBACK_REQUESTED"
  | "DO_NOT_CALL"
  | "WRONG_NUMBER"
  | "VOICEMAIL"
  | "ESCALATED";
export type SentimentType = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "MIXED";

export type BusinessOutcome =
  | "QUALIFIED"
  | "FOLLOW_UP_REQUIRED"
  | "NOT_INTERESTED"
  | "WRONG_NUMBER"
  | "UNRESOLVED"
  | "INFORMATIONAL_COMPLETE";

export type ComplianceState =
  | "NONE"
  | "DNC_REQUESTED"
  | "DNC_REGISTERED"
  | "DNC_REGISTRATION_FAILED";

export type EscalationState =
  | "NONE"
  | "REQUESTED"
  | "FOLLOW_UP_PENDING"
  | "NOTIFICATION_DELIVERED"
  | "TRANSFER_COMPLETED";

export type AnalysisJobStatus =
  | "QUEUED"
  | "CLAIMED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "DEAD_LETTER";

export type AutomationRunStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIAL_FAILURE"
  | "FAILED"
  | "SKIPPED_DNC"
  | "DEAD_LETTER";

export type NotificationAudience = "CUSTOMER" | "INTERNAL_STAFF";
export type NotificationChannel = "WHATSAPP" | "SMS" | "EMAIL";
export type NotificationDispatchStatus =
  | "DRAFT_PENDING_APPROVAL"
  | "APPROVED"
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "REJECTED";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          phone: string | null;
          platform_role: PlatformRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          avatar_url?: string | null;
          phone?: string | null;
          platform_role?: PlatformRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          avatar_url?: string | null;
          phone?: string | null;
          platform_role?: PlatformRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: string;
          logo_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan?: string;
          logo_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          plan?: string;
          logo_url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrganizationRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: OrganizationRole;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          role?: OrganizationRole;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      businesses: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          legal_name: string | null;
          tagline: string | null;
          description: string | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          address_line1: string | null;
          city: string | null;
          state: string | null;
          pincode: string | null;
          country: string;
          business_hours: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          legal_name?: string | null;
          tagline?: string | null;
          description?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          address_line1?: string | null;
          city?: string | null;
          state?: string | null;
          pincode?: string | null;
          country?: string;
          business_hours?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          legal_name?: string | null;
          tagline?: string | null;
          description?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          address_line1?: string | null;
          city?: string | null;
          state?: string | null;
          pincode?: string | null;
          country?: string;
          business_hours?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      business_pages: {
        Row: {
          id: string;
          business_id: string;
          slug: string;
          title: string;
          meta_description: string | null;
          hero_headline: string | null;
          hero_subheadline: string | null;
          published: boolean;
          theme_config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          slug: string;
          title: string;
          meta_description?: string | null;
          hero_headline?: string | null;
          hero_subheadline?: string | null;
          published?: boolean;
          theme_config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          slug?: string;
          title?: string;
          meta_description?: string | null;
          hero_headline?: string | null;
          hero_subheadline?: string | null;
          published?: boolean;
          theme_config?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          sku: string | null;
          description: string | null;
          category: string | null;
          price_amount: number | null;
          currency: string;
          price_display: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          sku?: string | null;
          description?: string | null;
          category?: string | null;
          price_amount?: number | null;
          currency?: string;
          price_display?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          sku?: string | null;
          description?: string | null;
          category?: string | null;
          price_amount?: number | null;
          currency?: string;
          price_display?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          business_id: string;
          name: string;
          description: string | null;
          category: string | null;
          pricing_model: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          name: string;
          description?: string | null;
          category?: string | null;
          pricing_model?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          name?: string;
          description?: string | null;
          category?: string | null;
          pricing_model?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          channel: string;
          source: string | null;
          medium: string | null;
          budget: number | null;
          clicks_count: number;
          leads_count: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          slug: string;
          channel: string;
          source?: string | null;
          medium?: string | null;
          budget?: number | null;
          clicks_count?: number;
          leads_count?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          slug?: string;
          channel?: string;
          source?: string | null;
          medium?: string | null;
          budget?: number | null;
          clicks_count?: number;
          leads_count?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tracking_links: {
        Row: {
          id: string;
          campaign_id: string;
          destination_url: string;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          short_code: string;
          clicks_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          destination_url: string;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          short_code: string;
          clicks_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          destination_url?: string;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          short_code?: string;
          clicks_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          organization_id: string;
          business_id: string | null;
          campaign_id: string | null;
          name: string;
          phone: string;
          email: string | null;
          temperature: LeadTemperature;
          status: LeadStatus;
          score: number;
          source: string;
          primary_interest: string | null;
          location: string | null;
          summary: string | null;
          notes: string | null;
          do_not_call: boolean;
          last_activity_at: string;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          business_id?: string | null;
          campaign_id?: string | null;
          name: string;
          phone: string;
          email?: string | null;
          temperature?: LeadTemperature;
          status?: LeadStatus;
          score?: number;
          source?: string;
          primary_interest?: string | null;
          location?: string | null;
          summary?: string | null;
          notes?: string | null;
          do_not_call?: boolean;
          last_activity_at?: string;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          business_id?: string | null;
          campaign_id?: string | null;
          name?: string;
          phone?: string;
          email?: string | null;
          temperature?: LeadTemperature;
          status?: LeadStatus;
          score?: number;
          source?: string;
          primary_interest?: string | null;
          location?: string | null;
          summary?: string | null;
          notes?: string | null;
          do_not_call?: boolean;
          last_activity_at?: string;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_events: {
        Row: {
          id: string;
          lead_id: string;
          organization_id: string;
          event_type: string;
          title: string;
          description: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          organization_id: string;
          event_type: string;
          title: string;
          description?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          organization_id?: string;
          event_type?: string;
          title?: string;
          description?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      lead_intelligence: {
        Row: {
          id: string;
          lead_id: string;
          intent_signals: Json;
          objections_raised: Json;
          buying_stage: string | null;
          recommended_next_action: string | null;
          qualification_reasons: Json;
          budget_estimate: string | null;
          urgency_rating: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          intent_signals?: Json;
          objections_raised?: Json;
          buying_stage?: string | null;
          recommended_next_action?: string | null;
          qualification_reasons?: Json;
          budget_estimate?: string | null;
          urgency_rating?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          intent_signals?: Json;
          objections_raised?: Json;
          buying_stage?: string | null;
          recommended_next_action?: string | null;
          qualification_reasons?: Json;
          budget_estimate?: string | null;
          urgency_rating?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_recovery_records: {
        Row: {
          id: string;
          organization_id: string;
          visitor_session_id: string | null;
          phone: string | null;
          email: string | null;
          abandoned_url: string | null;
          activity_summary: string | null;
          dwell_time_seconds: number;
          recovery_score: number;
          is_recovered: boolean;
          recovered_lead_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          visitor_session_id?: string | null;
          phone?: string | null;
          email?: string | null;
          abandoned_url?: string | null;
          activity_summary?: string | null;
          dwell_time_seconds?: number;
          recovery_score?: number;
          is_recovered?: boolean;
          recovered_lead_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          visitor_session_id?: string | null;
          phone?: string | null;
          email?: string | null;
          abandoned_url?: string | null;
          activity_summary?: string | null;
          dwell_time_seconds?: number;
          recovery_score?: number;
          is_recovered?: boolean;
          recovered_lead_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_agents: {
        Row: {
          id: string;
          organization_id: string;
          business_id: string | null;
          name: string;
          role_title: string;
          language_mode: LanguageMode;
          primary_language: string;
          status: string;
          active_version_id: string | null;
          voice_id: string;
          voice_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          business_id?: string | null;
          name: string;
          role_title: string;
          language_mode?: LanguageMode;
          primary_language?: string;
          status?: string;
          active_version_id?: string | null;
          voice_id: string;
          voice_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          business_id?: string | null;
          name?: string;
          role_title?: string;
          language_mode?: LanguageMode;
          primary_language?: string;
          status?: string;
          active_version_id?: string | null;
          voice_id?: string;
          voice_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_versions: {
        Row: {
          id: string;
          agent_id: string;
          version_number: string;
          system_prompt: string;
          greeting_message: string;
          turn_timeout_ms: number;
          max_duration_seconds: number;
          tools_enabled: Json;
          knowledge_context: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          version_number: string;
          system_prompt: string;
          greeting_message: string;
          turn_timeout_ms?: number;
          max_duration_seconds?: number;
          tools_enabled?: Json;
          knowledge_context?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          version_number?: string;
          system_prompt?: string;
          greeting_message?: string;
          turn_timeout_ms?: number;
          max_duration_seconds?: number;
          tools_enabled?: Json;
          knowledge_context?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_knowledge_sources: {
        Row: {
          id: string;
          agent_id: string;
          title: string;
          source_type: string;
          content: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          title: string;
          source_type: string;
          content?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          title?: string;
          source_type?: string;
          content?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_profiles: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          language: string;
          gender: string | null;
          provider: string;
          provider_voice_id: string;
          is_custom_clone: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          language: string;
          gender?: string | null;
          provider?: string;
          provider_voice_id: string;
          is_custom_clone?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          language?: string;
          gender?: string | null;
          provider?: string;
          provider_voice_id?: string;
          is_custom_clone?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_profile_consents: {
        Row: {
          id: string;
          voice_profile_id: string;
          organization_id: string;
          speaker_name: string;
          speaker_identity_doc_ref: string | null;
          consent_text: string;
          consent_audio_url: string | null;
          consented_at: string;
          verified_by: string | null;
        };
        Insert: {
          id?: string;
          voice_profile_id: string;
          organization_id: string;
          speaker_name: string;
          speaker_identity_doc_ref?: string | null;
          consent_text: string;
          consent_audio_url?: string | null;
          consented_at?: string;
          verified_by?: string | null;
        };
        Update: {
          id?: string;
          voice_profile_id?: string;
          organization_id?: string;
          speaker_name?: string;
          speaker_identity_doc_ref?: string | null;
          consent_text?: string;
          consent_audio_url?: string | null;
          consented_at?: string;
          verified_by?: string | null;
        };
        Relationships: [];
      };
      call_sessions: {
        Row: {
          id: string;
          organization_id: string;
          business_id: string | null;
          lead_id: string | null;
          agent_id: string | null;
          agent_version_id: string | null;
          direction: string;
          channel: string;
          customer_phone: string | null;
          customer_name: string | null;
          status: CallStatus;
          start_time: string | null;
          end_time: string | null;
          duration_seconds: number;
          recording_url: string | null;
          twilio_call_sid: string | null;
          parent_call_sid: string | null;
          telephony_provider: string | null;
          caller_number: string | null;
          callee_number: string | null;
          recording_sid: string | null;
          recording_duration_seconds: number | null;
          transfer_status: string | null;
          transfer_target: string | null;
          telephony_cost: number | null;
          telephony_currency: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          business_id?: string | null;
          lead_id?: string | null;
          agent_id?: string | null;
          agent_version_id?: string | null;
          direction?: string;
          channel?: string;
          customer_phone?: string | null;
          customer_name?: string | null;
          status?: CallStatus;
          start_time?: string | null;
          end_time?: string | null;
          duration_seconds?: number;
          recording_url?: string | null;
          twilio_call_sid?: string | null;
          parent_call_sid?: string | null;
          telephony_provider?: string | null;
          caller_number?: string | null;
          callee_number?: string | null;
          recording_sid?: string | null;
          recording_duration_seconds?: number | null;
          transfer_status?: string | null;
          transfer_target?: string | null;
          telephony_cost?: number | null;
          telephony_currency?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          business_id?: string | null;
          lead_id?: string | null;
          agent_id?: string | null;
          agent_version_id?: string | null;
          direction?: string;
          channel?: string;
          customer_phone?: string | null;
          customer_name?: string | null;
          status?: CallStatus;
          start_time?: string | null;
          end_time?: string | null;
          duration_seconds?: number;
          recording_url?: string | null;
          twilio_call_sid?: string | null;
          parent_call_sid?: string | null;
          telephony_provider?: string | null;
          caller_number?: string | null;
          callee_number?: string | null;
          recording_sid?: string | null;
          recording_duration_seconds?: number | null;
          transfer_status?: string | null;
          transfer_target?: string | null;
          telephony_cost?: number | null;
          telephony_currency?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      call_events: {
        Row: {
          id: string;
          call_session_id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          call_session_id: string;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          call_session_id?: string;
          event_type?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      transcript_segments: {
        Row: {
          id: string;
          call_session_id: string;
          speaker: string;
          language: string | null;
          text: string;
          confidence: number | null;
          start_offset_ms: number | null;
          end_offset_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          call_session_id: string;
          speaker: string;
          language?: string | null;
          text: string;
          confidence?: number | null;
          start_offset_ms?: number | null;
          end_offset_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          call_session_id?: string;
          speaker?: string;
          language?: string | null;
          text?: string;
          confidence?: number | null;
          start_offset_ms?: number | null;
          end_offset_ms?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      call_outcomes: {
        Row: {
          id: string;
          call_session_id: string;
          disposition: CallDisposition | null;
          business_outcome: BusinessOutcome;
          compliance_state: ComplianceState;
          escalation_state: EscalationState;
          sentiment: SentimentType | null;
          confidence_score: number | null;
          summary: string | null;
          key_points: Json;
          action_items: Json;
          intelligence_data: Json;
          evidence_coverage: number;
          extraction_confidence: number;
          qualification_decision: string | null;
          follow_up_recommended: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          call_session_id: string;
          disposition?: CallDisposition | null;
          business_outcome?: BusinessOutcome;
          compliance_state?: ComplianceState;
          escalation_state?: EscalationState;
          sentiment?: SentimentType | null;
          confidence_score?: number | null;
          summary?: string | null;
          key_points?: Json;
          action_items?: Json;
          intelligence_data?: Json;
          evidence_coverage?: number;
          extraction_confidence?: number;
          qualification_decision?: string | null;
          follow_up_recommended?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          call_session_id?: string;
          disposition?: CallDisposition | null;
          business_outcome?: BusinessOutcome;
          compliance_state?: ComplianceState;
          escalation_state?: EscalationState;
          sentiment?: SentimentType | null;
          confidence_score?: number | null;
          summary?: string | null;
          key_points?: Json;
          action_items?: Json;
          intelligence_data?: Json;
          evidence_coverage?: number;
          extraction_confidence?: number;
          qualification_decision?: string | null;
          follow_up_recommended?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      follow_up_tasks: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string | null;
          call_session_id: string | null;
          assigned_to: string | null;
          title: string;
          description: string | null;
          due_date: string | null;
          priority: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id?: string | null;
          call_session_id?: string | null;
          assigned_to?: string | null;
          title: string;
          description?: string | null;
          due_date?: string | null;
          priority?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          lead_id?: string | null;
          call_session_id?: string | null;
          assigned_to?: string | null;
          title?: string;
          description?: string | null;
          due_date?: string | null;
          priority?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      automations: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          trigger_event: string;
          trigger_conditions: Json;
          action_type: string;
          action_config: Json;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          trigger_event: string;
          trigger_conditions?: Json;
          action_type: string;
          action_config?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          title?: string;
          trigger_event?: string;
          trigger_conditions?: Json;
          action_type?: string;
          action_config?: Json;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      integration_connections: {
        Row: {
          id: string;
          organization_id: string;
          provider: string;
          status: string;
          config: Json;
          last_synced_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          provider: string;
          status?: string;
          config?: Json;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          provider?: string;
          status?: string;
          config?: Json;
          last_synced_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string | null;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          details?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      call_analysis_jobs: {
        Row: {
          id: string;
          organization_id: string;
          call_session_id: string;
          analysis_version: number;
          status: AnalysisJobStatus;
          attempts: number;
          max_attempts: number;
          available_at: string;
          locked_by: string | null;
          lock_expires_at: string | null;
          fencing_token: number;
          last_error: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          call_session_id: string;
          analysis_version?: number;
          status?: AnalysisJobStatus;
          attempts?: number;
          max_attempts?: number;
          available_at?: string;
          locked_by?: string | null;
          lock_expires_at?: string | null;
          fencing_token?: number;
          last_error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          call_session_id?: string;
          analysis_version?: number;
          status?: AnalysisJobStatus;
          attempts?: number;
          max_attempts?: number;
          available_at?: string;
          locked_by?: string | null;
          lock_expires_at?: string | null;
          fencing_token?: number;
          last_error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lead_scoring_breakdowns: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string | null;
          call_session_id: string;
          analysis_version: number;
          total_score: number | null;
          normalized_observed_score: number | null;
          observed_weight_total: number;
          evidence_coverage: number;
          extraction_confidence: number;
          classification: "HOT" | "WARM" | "COLD" | "UNCLASSIFIED";
          scoring_factors: Json;
          unresolved_unknowns: Json;
          scoring_version: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id?: string | null;
          call_session_id: string;
          analysis_version?: number;
          total_score?: number | null;
          normalized_observed_score?: number | null;
          observed_weight_total?: number;
          evidence_coverage?: number;
          extraction_confidence?: number;
          classification?: "HOT" | "WARM" | "COLD" | "UNCLASSIFIED";
          scoring_factors?: Json;
          unresolved_unknowns?: Json;
          scoring_version?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          lead_id?: string | null;
          call_session_id?: string;
          analysis_version?: number;
          total_score?: number | null;
          normalized_observed_score?: number | null;
          observed_weight_total?: number;
          evidence_coverage?: number;
          extraction_confidence?: number;
          classification?: "HOT" | "WARM" | "COLD" | "UNCLASSIFIED";
          scoring_factors?: Json;
          unresolved_unknowns?: Json;
          scoring_version?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      automation_runs: {
        Row: {
          id: string;
          organization_id: string;
          call_session_id: string;
          automation_id: string;
          idempotency_key: string;
          status: AutomationRunStatus;
          attempt_count: number;
          max_attempts: number;
          available_at: string;
          locked_at: string | null;
          lock_expires_at: string | null;
          last_error: string | null;
          result_metadata: Json;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          call_session_id: string;
          automation_id: string;
          idempotency_key: string;
          status?: AutomationRunStatus;
          attempt_count?: number;
          max_attempts?: number;
          available_at?: string;
          locked_at?: string | null;
          lock_expires_at?: string | null;
          last_error?: string | null;
          result_metadata?: Json;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          call_session_id?: string;
          automation_id?: string;
          idempotency_key?: string;
          status?: AutomationRunStatus;
          attempt_count?: number;
          max_attempts?: number;
          available_at?: string;
          locked_at?: string | null;
          lock_expires_at?: string | null;
          last_error?: string | null;
          result_metadata?: Json;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_dispatches: {
        Row: {
          id: string;
          organization_id: string;
          call_session_id: string | null;
          lead_id: string | null;
          audience: NotificationAudience;
          channel: NotificationChannel;
          recipient: string;
          consent_verified: boolean;
          consent_reference: string | null;
          rendered_message: string;
          status: NotificationDispatchStatus;
          provider: string;
          provider_message_id: string | null;
          twilio_message_sid: string | null;
          whatsapp_conversation_id: string | null;
          delivery_status_details: Json | null;
          idempotency_key: string | null;
          error_details: Json | null;
          retry_count: number;
          max_retries: number;
          webhook_verification_metadata: Json | null;
          approved_by: string | null;
          approved_at: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          call_session_id?: string | null;
          lead_id?: string | null;
          audience?: NotificationAudience;
          channel?: NotificationChannel;
          recipient: string;
          consent_verified?: boolean;
          consent_reference?: string | null;
          rendered_message: string;
          status?: NotificationDispatchStatus;
          provider?: string;
          provider_message_id?: string | null;
          twilio_message_sid?: string | null;
          whatsapp_conversation_id?: string | null;
          delivery_status_details?: Json | null;
          idempotency_key?: string | null;
          error_details?: Json | null;
          retry_count?: number;
          max_retries?: number;
          webhook_verification_metadata?: Json | null;
          approved_by?: string | null;
          approved_at?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          call_session_id?: string | null;
          lead_id?: string | null;
          audience?: NotificationAudience;
          channel?: NotificationChannel;
          recipient?: string;
          consent_verified?: boolean;
          consent_reference?: string | null;
          rendered_message?: string;
          status?: NotificationDispatchStatus;
          provider?: string;
          provider_message_id?: string | null;
          twilio_message_sid?: string | null;
          whatsapp_conversation_id?: string | null;
          delivery_status_details?: Json | null;
          idempotency_key?: string | null;
          error_details?: Json | null;
          retry_count?: number;
          max_retries?: number;
          webhook_verification_metadata?: Json | null;
          approved_by?: string | null;
          approved_at?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      telephony_phone_numbers: {
        Row: {
          id: string;
          organization_id: string;
          phone_number: string;
          friendly_name: string | null;
          country_code: string;
          provider: string;
          capabilities: Json;
          assigned_agent_id: string | null;
          status: string;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          phone_number: string;
          friendly_name?: string | null;
          country_code?: string;
          provider?: string;
          capabilities?: Json;
          assigned_agent_id?: string | null;
          status?: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          phone_number?: string;
          friendly_name?: string | null;
          country_code?: string;
          provider?: string;
          capabilities?: Json;
          assigned_agent_id?: string | null;
          status?: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      telephony_events: {
        Row: {
          id: string;
          organization_id: string;
          call_session_id: string | null;
          twilio_call_sid: string | null;
          event_type: string;
          event_payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          call_session_id?: string | null;
          twilio_call_sid?: string | null;
          event_type: string;
          event_payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          call_session_id?: string | null;
          twilio_call_sid?: string | null;
          event_type?: string;
          event_payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_organization_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      is_org_member: {
        Args: { org_uuid: string };
        Returns: boolean;
      };
      has_org_role: {
        Args: { org_uuid: string; required_roles: OrganizationRole[] };
        Returns: boolean;
      };
      complete_call_session: {
        Args: { p_call_session_id: string; p_duration_seconds?: number };
        Returns: Database["public"]["Tables"]["call_analysis_jobs"]["Row"];
      };
      reanalyze_call_session: {
        Args: { p_call_session_id: string };
        Returns: Database["public"]["Tables"]["call_analysis_jobs"]["Row"];
      };
      claim_call_analysis_job: {
        Args: { p_worker_id: string; p_lease_seconds?: number };
        Returns: Array<{
          id: string;
          organization_id: string;
          call_session_id: string;
          analysis_version: number;
          attempts: number;
          max_attempts: number;
          fencing_token: number;
        }>;
      };
      renew_call_analysis_job_lease: {
        Args: { p_job_id: string; p_worker_id: string; p_fencing_token: number; p_lease_seconds?: number };
        Returns: boolean;
      };
      complete_call_analysis_job: {
        Args: { p_job_id: string; p_worker_id: string; p_fencing_token: number };
        Returns: boolean;
      };
      fail_call_analysis_job: {
        Args: {
          p_job_id: string;
          p_worker_id: string;
          p_fencing_token: number;
          p_error: string;
          p_retry_delay_seconds?: number;
        };
        Returns: boolean;
      };
      reconcile_missing_analysis_jobs: {
        Args: { p_limit?: number };
        Returns: number;
      };
    };
    Enums: {
      platform_role: PlatformRole;
      organization_role: OrganizationRole;
      lead_temperature: LeadTemperature;
      lead_status: LeadStatus;
      call_status: CallStatus;
      language_mode: LanguageMode;
      call_disposition: CallDisposition;
      sentiment_type: SentimentType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
