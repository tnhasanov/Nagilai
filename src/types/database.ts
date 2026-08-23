/**
 * GENERATED FILE - do not edit by hand.
 *
 * Regenerate after changing a migration:
 *   DATABASE_URL=postgres://... node scripts/generate-db-types.mjs
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AiOperation = 'text_generation' | 'image_generation' | 'speech_synthesis' | 'moderation' | 'embedding';
export type AssetStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'skipped';
export type BookBinding = 'softcover' | 'hardcover';
export type CreditReason = 'signup_grant' | 'monthly_grant' | 'purchase' | 'promotional' | 'refund' | 'admin_adjustment' | 'story_text' | 'story_illustration' | 'story_narration' | 'story_pdf_hq' | 'reversal';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'dead_letter';
export type JobType = 'story_text' | 'story_illustration' | 'story_cover' | 'story_narration' | 'story_pdf' | 'print_submission';
export type ModerationOutcome = 'allowed' | 'flagged' | 'blocked' | 'regenerated';
export type ModerationStage = 'user_input' | 'generated_text' | 'illustration_prompt' | 'generated_image' | 'share_metadata';
export type NarrationScope = 'full_story' | 'page';
export type OrderStatus = 'draft' | 'awaiting_payment' | 'paid' | 'in_production' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'failed';
export type PaymentStatus = 'requires_action' | 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
export type PrintJobStatus = 'not_submitted' | 'submitted' | 'accepted' | 'printing' | 'shipped' | 'delivered' | 'rejected' | 'cancelled';
export type ProductKind = 'subscription_plan' | 'credit_pack' | 'printed_book' | 'digital_addon';
export type RemixKind = 'alternate_ending' | 'new_adventure' | 'shorter' | 'longer' | 'different_lesson' | 'different_language' | 'different_style';
export type StoryLength = 'short' | 'medium' | 'long';
export type StoryStatus = 'draft' | 'queued' | 'generating_text' | 'text_ready' | 'generating_images' | 'images_ready' | 'generating_audio' | 'ready' | 'failed' | 'archived';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'paused' | 'unpaid';
export type UserRole = 'user' | 'support' | 'admin';

export interface Database {
  __InternalSupabase: { PostgrestVersion: '13' };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          before_state: Json | null;
          after_state: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          actor_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          actor_id?: string | null;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          before_state?: Json | null;
          after_state?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'admin_audit_log_actor_id_fkey'; columns: ['actor_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      analytics_events: {
        Row: {
          id: number;
          owner_id: string | null;
          anonymous_id: string | null;
          session_id: string | null;
          name: string;
          properties: Json;
          url: string | null;
          referrer: string | null;
          forwarded_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          owner_id?: string | null;
          anonymous_id?: string | null;
          session_id?: string | null;
          name: string;
          properties?: Json;
          url?: string | null;
          referrer?: string | null;
          forwarded_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          owner_id?: string | null;
          anonymous_id?: string | null;
          session_id?: string | null;
          name?: string;
          properties?: Json;
          url?: string | null;
          referrer?: string | null;
          forwarded_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'analytics_events_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          is_public: boolean;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          description?: string | null;
          is_public?: boolean;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          description?: string | null;
          is_public?: boolean;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'app_settings_updated_by_fkey'; columns: ['updated_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      children: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          nickname: string | null;
          birth_date: string | null;
          age_years: number | null;
          gender: string | null;
          preferred_language: string;
          interests: string[];
          favourite_animals: string[];
          favourite_activities: string[];
          favourite_characters: string[];
          personality_traits: string[];
          learning_interests: string[];
          parent_notes: string | null;
          avatar_color: string | null;
          photo_storage_path: string | null;
          photo_consent_at: string | null;
          photo_consent_by: string | null;
          appearance_description: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          nickname?: string | null;
          birth_date?: string | null;
          age_years?: number | null;
          gender?: string | null;
          preferred_language?: string;
          interests?: string[];
          favourite_animals?: string[];
          favourite_activities?: string[];
          favourite_characters?: string[];
          personality_traits?: string[];
          learning_interests?: string[];
          parent_notes?: string | null;
          avatar_color?: string | null;
          photo_storage_path?: string | null;
          photo_consent_at?: string | null;
          photo_consent_by?: string | null;
          appearance_description?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          nickname?: string | null;
          birth_date?: string | null;
          age_years?: number | null;
          gender?: string | null;
          preferred_language?: string;
          interests?: string[];
          favourite_animals?: string[];
          favourite_activities?: string[];
          favourite_characters?: string[];
          personality_traits?: string[];
          learning_interests?: string[];
          parent_notes?: string | null;
          avatar_color?: string | null;
          photo_storage_path?: string | null;
          photo_consent_at?: string | null;
          photo_consent_by?: string | null;
          appearance_description?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'children_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'children_photo_consent_by_fkey'; columns: ['photo_consent_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'children_preferred_language_fkey'; columns: ['preferred_language']; isOneToOne: false; referencedRelation: 'languages'; referencedColumns: ['code'] },
        ];
      };
      credit_transactions: {
        Row: {
          id: number;
          owner_id: string;
          delta: number;
          reason: CreditReason;
          balance_after: number;
          story_id: string | null;
          job_id: string | null;
          order_id: string | null;
          note: string | null;
          metadata: Json;
          idempotency_key: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          owner_id: string;
          delta: number;
          reason: CreditReason;
          balance_after: number;
          story_id?: string | null;
          job_id?: string | null;
          order_id?: string | null;
          note?: string | null;
          metadata?: Json;
          idempotency_key?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          owner_id?: string;
          delta?: number;
          reason?: CreditReason;
          balance_after?: number;
          story_id?: string | null;
          job_id?: string | null;
          order_id?: string | null;
          note?: string | null;
          metadata?: Json;
          idempotency_key?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'credit_transactions_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'credit_transactions_job_id_fkey'; columns: ['job_id']; isOneToOne: false; referencedRelation: 'generation_jobs'; referencedColumns: ['id'] },
          { foreignKeyName: 'credit_transactions_order_fk'; columns: ['order_id']; isOneToOne: false; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'credit_transactions_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'credit_transactions_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
        ];
      };
      device_push_tokens: {
        Row: {
          id: string;
          owner_id: string;
          token: string;
          provider: string;
          platform: string;
          device_id: string | null;
          device_name: string | null;
          app_version: string | null;
          locale: string;
          disabled_at: string | null;
          disabled_reason: string | null;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          token: string;
          provider?: string;
          platform: string;
          device_id?: string | null;
          device_name?: string | null;
          app_version?: string | null;
          locale?: string;
          disabled_at?: string | null;
          disabled_reason?: string | null;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          token?: string;
          provider?: string;
          platform?: string;
          device_id?: string | null;
          device_name?: string | null;
          app_version?: string | null;
          locale?: string;
          disabled_at?: string | null;
          disabled_reason?: string | null;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'device_push_tokens_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      educational_objectives: {
        Row: {
          id: string;
          slug: string;
          category: string;
          labels: Json;
          prompt_guidance: string | null;
          min_age: number;
          max_age: number;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          category?: string;
          labels?: Json;
          prompt_guidance?: string | null;
          min_age?: number;
          max_age?: number;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          category?: string;
          labels?: Json;
          prompt_guidance?: string | null;
          min_age?: number;
          max_age?: number;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      generation_jobs: {
        Row: {
          id: string;
          type: JobType;
          status: JobStatus;
          owner_id: string | null;
          story_id: string | null;
          version_id: string | null;
          page_id: string | null;
          payload: Json;
          result: Json | null;
          priority: number;
          attempts: number;
          max_attempts: number;
          run_after: string;
          locked_at: string | null;
          locked_by: string | null;
          started_at: string | null;
          finished_at: string | null;
          error_message: string | null;
          error_detail: Json | null;
          idempotency_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          type: JobType;
          status?: JobStatus;
          owner_id?: string | null;
          story_id?: string | null;
          version_id?: string | null;
          page_id?: string | null;
          payload?: Json;
          result?: Json | null;
          priority?: number;
          attempts?: number;
          max_attempts?: number;
          run_after?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          error_message?: string | null;
          error_detail?: Json | null;
          idempotency_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          type?: JobType;
          status?: JobStatus;
          owner_id?: string | null;
          story_id?: string | null;
          version_id?: string | null;
          page_id?: string | null;
          payload?: Json;
          result?: Json | null;
          priority?: number;
          attempts?: number;
          max_attempts?: number;
          run_after?: string;
          locked_at?: string | null;
          locked_by?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          error_message?: string | null;
          error_detail?: Json | null;
          idempotency_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'generation_jobs_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'generation_jobs_page_id_fkey'; columns: ['page_id']; isOneToOne: false; referencedRelation: 'story_pages'; referencedColumns: ['id'] },
          { foreignKeyName: 'generation_jobs_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
          { foreignKeyName: 'generation_jobs_version_id_fkey'; columns: ['version_id']; isOneToOne: false; referencedRelation: 'story_versions'; referencedColumns: ['id'] },
        ];
      };
      illustration_styles: {
        Row: {
          id: string;
          slug: string;
          labels: Json;
          prompt_prefix: string;
          negative_prompt: string | null;
          preview_image_url: string | null;
          is_premium: boolean;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          labels?: Json;
          prompt_prefix: string;
          negative_prompt?: string | null;
          preview_image_url?: string | null;
          is_premium?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          labels?: Json;
          prompt_prefix?: string;
          negative_prompt?: string | null;
          preview_image_url?: string | null;
          is_premium?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      languages: {
        Row: {
          code: string;
          name_native: string;
          name_en: string;
          flag_emoji: string | null;
          is_story_language: boolean;
          is_ui_language: boolean;
          style_guidance: string | null;
          default_voice_id: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          name_native: string;
          name_en: string;
          flag_emoji?: string | null;
          is_story_language?: boolean;
          is_ui_language?: boolean;
          style_guidance?: string | null;
          default_voice_id?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          name_native?: string;
          name_en?: string;
          flag_emoji?: string | null;
          is_story_language?: boolean;
          is_ui_language?: boolean;
          style_guidance?: string | null;
          default_voice_id?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'languages_default_voice_fk'; columns: ['default_voice_id']; isOneToOne: false; referencedRelation: 'voices'; referencedColumns: ['id'] },
        ];
      };
      moderation_events: {
        Row: {
          id: number;
          owner_id: string | null;
          story_id: string | null;
          job_id: string | null;
          stage: ModerationStage;
          outcome: ModerationOutcome;
          provider: string | null;
          model: string | null;
          categories: string[];
          scores: Json | null;
          excerpt: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          owner_id?: string | null;
          story_id?: string | null;
          job_id?: string | null;
          stage: ModerationStage;
          outcome: ModerationOutcome;
          provider?: string | null;
          model?: string | null;
          categories?: string[];
          scores?: Json | null;
          excerpt?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          owner_id?: string | null;
          story_id?: string | null;
          job_id?: string | null;
          stage?: ModerationStage;
          outcome?: ModerationOutcome;
          provider?: string | null;
          model?: string | null;
          categories?: string[];
          scores?: Json | null;
          excerpt?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'moderation_events_job_id_fkey'; columns: ['job_id']; isOneToOne: false; referencedRelation: 'generation_jobs'; referencedColumns: ['id'] },
          { foreignKeyName: 'moderation_events_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'moderation_events_reviewed_by_fkey'; columns: ['reviewed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'moderation_events_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
        ];
      };
      narrations: {
        Row: {
          id: string;
          story_id: string;
          version_id: string;
          page_id: string | null;
          scope: NarrationScope;
          voice_id: string | null;
          voice_slug: string;
          language_code: string;
          speed: number;
          provider: string;
          model: string | null;
          storage_path: string | null;
          mime_type: string;
          bytes: number | null;
          duration_seconds: number | null;
          timings: Json | null;
          text_hash: string;
          status: AssetStatus;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          version_id: string;
          page_id?: string | null;
          scope?: NarrationScope;
          voice_id?: string | null;
          voice_slug: string;
          language_code: string;
          speed?: number;
          provider?: string;
          model?: string | null;
          storage_path?: string | null;
          mime_type?: string;
          bytes?: number | null;
          duration_seconds?: number | null;
          timings?: Json | null;
          text_hash: string;
          status?: AssetStatus;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          version_id?: string;
          page_id?: string | null;
          scope?: NarrationScope;
          voice_id?: string | null;
          voice_slug?: string;
          language_code?: string;
          speed?: number;
          provider?: string;
          model?: string | null;
          storage_path?: string | null;
          mime_type?: string;
          bytes?: number | null;
          duration_seconds?: number | null;
          timings?: Json | null;
          text_hash?: string;
          status?: AssetStatus;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'narrations_page_id_fkey'; columns: ['page_id']; isOneToOne: false; referencedRelation: 'story_pages'; referencedColumns: ['id'] },
          { foreignKeyName: 'narrations_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
          { foreignKeyName: 'narrations_version_id_fkey'; columns: ['version_id']; isOneToOne: false; referencedRelation: 'story_versions'; referencedColumns: ['id'] },
          { foreignKeyName: 'narrations_voice_id_fkey'; columns: ['voice_id']; isOneToOne: false; referencedRelation: 'voices'; referencedColumns: ['id'] },
        ];
      };
      notification_deliveries: {
        Row: {
          id: string;
          owner_id: string;
          story_id: string | null;
          kind: string;
          dedupe_key: string;
          status: string;
          detail: Json;
          device_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          story_id?: string | null;
          kind: string;
          dedupe_key: string;
          status?: string;
          detail?: Json;
          device_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          story_id?: string | null;
          kind?: string;
          dedupe_key?: string;
          status?: string;
          detail?: Json;
          device_count?: number;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'notification_deliveries_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'notification_deliveries_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          story_id: string | null;
          version_id: string | null;
          pdf_id: string | null;
          description: string;
          quantity: number;
          unit_amount: number;
          total_amount: number;
          configuration: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          story_id?: string | null;
          version_id?: string | null;
          pdf_id?: string | null;
          description: string;
          quantity?: number;
          unit_amount?: number;
          total_amount?: number;
          configuration?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          story_id?: string | null;
          version_id?: string | null;
          pdf_id?: string | null;
          description?: string;
          quantity?: number;
          unit_amount?: number;
          total_amount?: number;
          configuration?: Json;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'order_items_order_id_fkey'; columns: ['order_id']; isOneToOne: false; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_pdf_id_fkey'; columns: ['pdf_id']; isOneToOne: false; referencedRelation: 'story_pdfs'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_version_id_fkey'; columns: ['version_id']; isOneToOne: false; referencedRelation: 'story_versions'; referencedColumns: ['id'] },
        ];
      };
      orders: {
        Row: {
          id: string;
          owner_id: string;
          order_number: string;
          status: OrderStatus;
          currency: string;
          subtotal_amount: number;
          shipping_amount: number;
          tax_amount: number;
          discount_amount: number;
          total_amount: number;
          shipping_address: Json | null;
          billing_address: Json | null;
          contact_email: string | null;
          customer_note: string | null;
          provider: string;
          provider_checkout_id: string | null;
          paid_at: string | null;
          cancelled_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          order_number: string;
          status?: OrderStatus;
          currency?: string;
          subtotal_amount?: number;
          shipping_amount?: number;
          tax_amount?: number;
          discount_amount?: number;
          total_amount?: number;
          shipping_address?: Json | null;
          billing_address?: Json | null;
          contact_email?: string | null;
          customer_note?: string | null;
          provider?: string;
          provider_checkout_id?: string | null;
          paid_at?: string | null;
          cancelled_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          order_number?: string;
          status?: OrderStatus;
          currency?: string;
          subtotal_amount?: number;
          shipping_amount?: number;
          tax_amount?: number;
          discount_amount?: number;
          total_amount?: number;
          shipping_address?: Json | null;
          billing_address?: Json | null;
          contact_email?: string | null;
          customer_note?: string | null;
          provider?: string;
          provider_checkout_id?: string | null;
          paid_at?: string | null;
          cancelled_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'orders_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      payments: {
        Row: {
          id: string;
          owner_id: string | null;
          order_id: string | null;
          subscription_id: string | null;
          provider: string;
          provider_payment_id: string | null;
          provider_event_id: string | null;
          status: PaymentStatus;
          amount: number;
          currency: string;
          refunded_amount: number;
          failure_code: string | null;
          failure_message: string | null;
          raw_payload: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string | null;
          order_id?: string | null;
          subscription_id?: string | null;
          provider?: string;
          provider_payment_id?: string | null;
          provider_event_id?: string | null;
          status?: PaymentStatus;
          amount?: number;
          currency?: string;
          refunded_amount?: number;
          failure_code?: string | null;
          failure_message?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string | null;
          order_id?: string | null;
          subscription_id?: string | null;
          provider?: string;
          provider_payment_id?: string | null;
          provider_event_id?: string | null;
          status?: PaymentStatus;
          amount?: number;
          currency?: string;
          refunded_amount?: number;
          failure_code?: string | null;
          failure_message?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'payments_order_id_fkey'; columns: ['order_id']; isOneToOne: false; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'payments_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'payments_subscription_id_fkey'; columns: ['subscription_id']; isOneToOne: false; referencedRelation: 'subscriptions'; referencedColumns: ['id'] },
        ];
      };
      prices: {
        Row: {
          id: string;
          product_id: string;
          currency: string;
          unit_amount: number;
          interval: string | null;
          interval_count: number;
          trial_period_days: number | null;
          country_code: string | null;
          provider: string;
          provider_price_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          currency: string;
          unit_amount: number;
          interval?: string | null;
          interval_count?: number;
          trial_period_days?: number | null;
          country_code?: string | null;
          provider?: string;
          provider_price_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          currency?: string;
          unit_amount?: number;
          interval?: string | null;
          interval_count?: number;
          trial_period_days?: number | null;
          country_code?: string | null;
          provider?: string;
          provider_price_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'prices_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
        ];
      };
      print_jobs: {
        Row: {
          id: string;
          order_id: string;
          order_item_id: string;
          story_id: string | null;
          print_pdf_id: string | null;
          provider: string;
          provider_job_id: string | null;
          status: PrintJobStatus;
          tracking_number: string | null;
          tracking_url: string | null;
          estimated_ship_date: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          provider_cost_amount: number | null;
          provider_currency: string | null;
          last_error: string | null;
          raw_payload: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          order_item_id: string;
          story_id?: string | null;
          print_pdf_id?: string | null;
          provider?: string;
          provider_job_id?: string | null;
          status?: PrintJobStatus;
          tracking_number?: string | null;
          tracking_url?: string | null;
          estimated_ship_date?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          provider_cost_amount?: number | null;
          provider_currency?: string | null;
          last_error?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          order_item_id?: string;
          story_id?: string | null;
          print_pdf_id?: string | null;
          provider?: string;
          provider_job_id?: string | null;
          status?: PrintJobStatus;
          tracking_number?: string | null;
          tracking_url?: string | null;
          estimated_ship_date?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          provider_cost_amount?: number | null;
          provider_currency?: string | null;
          last_error?: string | null;
          raw_payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'print_jobs_order_id_fkey'; columns: ['order_id']; isOneToOne: false; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'print_jobs_order_item_id_fkey'; columns: ['order_item_id']; isOneToOne: false; referencedRelation: 'order_items'; referencedColumns: ['id'] },
          { foreignKeyName: 'print_jobs_print_pdf_id_fkey'; columns: ['print_pdf_id']; isOneToOne: false; referencedRelation: 'story_pdfs'; referencedColumns: ['id'] },
          { foreignKeyName: 'print_jobs_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
        ];
      };
      products: {
        Row: {
          id: string;
          slug: string;
          kind: ProductKind;
          labels: Json;
          descriptions: Json;
          features: Json;
          credits_granted: number | null;
          book_trim_size: string | null;
          book_binding: BookBinding | null;
          book_page_capacity: number | null;
          provider_product_id: string | null;
          image_url: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          kind: ProductKind;
          labels?: Json;
          descriptions?: Json;
          features?: Json;
          credits_granted?: number | null;
          book_trim_size?: string | null;
          book_binding?: BookBinding | null;
          book_page_capacity?: number | null;
          provider_product_id?: string | null;
          image_url?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          kind?: ProductKind;
          labels?: Json;
          descriptions?: Json;
          features?: Json;
          credits_granted?: number | null;
          book_trim_size?: string | null;
          book_binding?: BookBinding | null;
          book_page_capacity?: number | null;
          provider_product_id?: string | null;
          image_url?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          ui_locale: string;
          country_code: string | null;
          timezone: string | null;
          credit_balance: number;
          marketing_opt_in: boolean;
          onboarding_completed: boolean;
          deletion_requested_at: string | null;
          deleted_at: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
          push_enabled: boolean;
          push_story_ready: boolean;
          push_quiet_from_minute: number | null;
          push_quiet_to_minute: number | null;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          ui_locale?: string;
          country_code?: string | null;
          timezone?: string | null;
          credit_balance?: number;
          marketing_opt_in?: boolean;
          onboarding_completed?: boolean;
          deletion_requested_at?: string | null;
          deleted_at?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
          push_enabled?: boolean;
          push_story_ready?: boolean;
          push_quiet_from_minute?: number | null;
          push_quiet_to_minute?: number | null;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          ui_locale?: string;
          country_code?: string | null;
          timezone?: string | null;
          credit_balance?: number;
          marketing_opt_in?: boolean;
          onboarding_completed?: boolean;
          deletion_requested_at?: string | null;
          deleted_at?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
          push_enabled?: boolean;
          push_story_ready?: boolean;
          push_quiet_from_minute?: number | null;
          push_quiet_to_minute?: number | null;
        };
        Relationships: [
          { foreignKeyName: 'profiles_id_fkey'; columns: ['id']; isOneToOne: true; referencedRelation: 'users'; referencedColumns: ['id'] },
        ];
      };
      rate_limits: {
        Row: {
          bucket: string;
          subject: string;
          window_start: string;
          count: number;
          expires_at: string;
        };
        Insert: {
          bucket: string;
          subject: string;
          window_start: string;
          count?: number;
          expires_at: string;
        };
        Update: {
          bucket?: string;
          subject?: string;
          window_start?: string;
          count?: number;
          expires_at?: string;
        };
        Relationships: [
        ];
      };
      share_links: {
        Row: {
          id: string;
          story_id: string;
          owner_id: string;
          token: string;
          version_id: string | null;
          is_enabled: boolean;
          allow_indexing: boolean;
          allow_audio: boolean;
          allow_download: boolean;
          expires_at: string | null;
          view_count: number;
          last_viewed_at: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          owner_id: string;
          token: string;
          version_id?: string | null;
          is_enabled?: boolean;
          allow_indexing?: boolean;
          allow_audio?: boolean;
          allow_download?: boolean;
          expires_at?: string | null;
          view_count?: number;
          last_viewed_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          owner_id?: string;
          token?: string;
          version_id?: string | null;
          is_enabled?: boolean;
          allow_indexing?: boolean;
          allow_audio?: boolean;
          allow_download?: boolean;
          expires_at?: string | null;
          view_count?: number;
          last_viewed_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'share_links_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'share_links_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
          { foreignKeyName: 'share_links_version_id_fkey'; columns: ['version_id']; isOneToOne: false; referencedRelation: 'story_versions'; referencedColumns: ['id'] },
        ];
      };
      stories: {
        Row: {
          id: string;
          owner_id: string;
          child_id: string | null;
          language_code: string;
          theme_id: string | null;
          theme_slug: string;
          objective_id: string | null;
          objective_slug: string | null;
          illustration_style_id: string | null;
          illustration_style_slug: string | null;
          length: StoryLength;
          custom_instructions: string | null;
          child_snapshot: Json;
          title: string | null;
          subtitle: string | null;
          summary: string | null;
          dedication: string | null;
          cover_illustration_id: string | null;
          is_favourite: boolean;
          status: StoryStatus;
          status_message: string | null;
          current_version_id: string | null;
          failure_reason: string | null;
          remixed_from_story_id: string | null;
          remix_kind: RemixKind | null;
          legacy_bubble_id: string | null;
          first_ready_at: string | null;
          last_opened_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          child_id?: string | null;
          language_code: string;
          theme_id?: string | null;
          theme_slug: string;
          objective_id?: string | null;
          objective_slug?: string | null;
          illustration_style_id?: string | null;
          illustration_style_slug?: string | null;
          length?: StoryLength;
          custom_instructions?: string | null;
          child_snapshot?: Json;
          title?: string | null;
          subtitle?: string | null;
          summary?: string | null;
          dedication?: string | null;
          cover_illustration_id?: string | null;
          is_favourite?: boolean;
          status?: StoryStatus;
          status_message?: string | null;
          current_version_id?: string | null;
          failure_reason?: string | null;
          remixed_from_story_id?: string | null;
          remix_kind?: RemixKind | null;
          legacy_bubble_id?: string | null;
          first_ready_at?: string | null;
          last_opened_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          child_id?: string | null;
          language_code?: string;
          theme_id?: string | null;
          theme_slug?: string;
          objective_id?: string | null;
          objective_slug?: string | null;
          illustration_style_id?: string | null;
          illustration_style_slug?: string | null;
          length?: StoryLength;
          custom_instructions?: string | null;
          child_snapshot?: Json;
          title?: string | null;
          subtitle?: string | null;
          summary?: string | null;
          dedication?: string | null;
          cover_illustration_id?: string | null;
          is_favourite?: boolean;
          status?: StoryStatus;
          status_message?: string | null;
          current_version_id?: string | null;
          failure_reason?: string | null;
          remixed_from_story_id?: string | null;
          remix_kind?: RemixKind | null;
          legacy_bubble_id?: string | null;
          first_ready_at?: string | null;
          last_opened_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'stories_child_id_fkey'; columns: ['child_id']; isOneToOne: false; referencedRelation: 'children'; referencedColumns: ['id'] },
          { foreignKeyName: 'stories_cover_illustration_fk'; columns: ['cover_illustration_id']; isOneToOne: false; referencedRelation: 'story_illustrations'; referencedColumns: ['id'] },
          { foreignKeyName: 'stories_current_version_fk'; columns: ['current_version_id']; isOneToOne: false; referencedRelation: 'story_versions'; referencedColumns: ['id'] },
          { foreignKeyName: 'stories_illustration_style_id_fkey'; columns: ['illustration_style_id']; isOneToOne: false; referencedRelation: 'illustration_styles'; referencedColumns: ['id'] },
          { foreignKeyName: 'stories_language_code_fkey'; columns: ['language_code']; isOneToOne: false; referencedRelation: 'languages'; referencedColumns: ['code'] },
          { foreignKeyName: 'stories_objective_id_fkey'; columns: ['objective_id']; isOneToOne: false; referencedRelation: 'educational_objectives'; referencedColumns: ['id'] },
          { foreignKeyName: 'stories_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'stories_remixed_from_story_id_fkey'; columns: ['remixed_from_story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
          { foreignKeyName: 'stories_theme_id_fkey'; columns: ['theme_id']; isOneToOne: false; referencedRelation: 'themes'; referencedColumns: ['id'] },
        ];
      };
      story_illustrations: {
        Row: {
          id: string;
          story_id: string;
          version_id: string;
          page_id: string | null;
          is_cover: boolean;
          style_slug: string;
          prompt: string;
          revised_prompt: string | null;
          provider: string;
          model: string | null;
          storage_path: string | null;
          width: number | null;
          height: number | null;
          mime_type: string | null;
          bytes: number | null;
          prompt_fingerprint: string | null;
          status: AssetStatus;
          error_message: string | null;
          superseded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          version_id: string;
          page_id?: string | null;
          is_cover?: boolean;
          style_slug: string;
          prompt: string;
          revised_prompt?: string | null;
          provider?: string;
          model?: string | null;
          storage_path?: string | null;
          width?: number | null;
          height?: number | null;
          mime_type?: string | null;
          bytes?: number | null;
          prompt_fingerprint?: string | null;
          status?: AssetStatus;
          error_message?: string | null;
          superseded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          version_id?: string;
          page_id?: string | null;
          is_cover?: boolean;
          style_slug?: string;
          prompt?: string;
          revised_prompt?: string | null;
          provider?: string;
          model?: string | null;
          storage_path?: string | null;
          width?: number | null;
          height?: number | null;
          mime_type?: string | null;
          bytes?: number | null;
          prompt_fingerprint?: string | null;
          status?: AssetStatus;
          error_message?: string | null;
          superseded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'story_illustrations_page_id_fkey'; columns: ['page_id']; isOneToOne: false; referencedRelation: 'story_pages'; referencedColumns: ['id'] },
          { foreignKeyName: 'story_illustrations_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
          { foreignKeyName: 'story_illustrations_superseded_by_fkey'; columns: ['superseded_by']; isOneToOne: false; referencedRelation: 'story_illustrations'; referencedColumns: ['id'] },
          { foreignKeyName: 'story_illustrations_version_id_fkey'; columns: ['version_id']; isOneToOne: false; referencedRelation: 'story_versions'; referencedColumns: ['id'] },
        ];
      };
      story_pages: {
        Row: {
          id: string;
          version_id: string;
          story_id: string;
          page_number: number;
          text: string;
          scene_summary: string | null;
          illustration_prompt: string | null;
          layout: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          version_id: string;
          story_id: string;
          page_number: number;
          text: string;
          scene_summary?: string | null;
          illustration_prompt?: string | null;
          layout?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          version_id?: string;
          story_id?: string;
          page_number?: number;
          text?: string;
          scene_summary?: string | null;
          illustration_prompt?: string | null;
          layout?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'story_pages_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
          { foreignKeyName: 'story_pages_version_id_fkey'; columns: ['version_id']; isOneToOne: false; referencedRelation: 'story_versions'; referencedColumns: ['id'] },
        ];
      };
      story_pdfs: {
        Row: {
          id: string;
          story_id: string;
          version_id: string;
          variant: string;
          page_size: string;
          storage_path: string | null;
          bytes: number | null;
          page_count: number | null;
          content_hash: string;
          status: AssetStatus;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          version_id: string;
          variant?: string;
          page_size?: string;
          storage_path?: string | null;
          bytes?: number | null;
          page_count?: number | null;
          content_hash: string;
          status?: AssetStatus;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          version_id?: string;
          variant?: string;
          page_size?: string;
          storage_path?: string | null;
          bytes?: number | null;
          page_count?: number | null;
          content_hash?: string;
          status?: AssetStatus;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'story_pdfs_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
          { foreignKeyName: 'story_pdfs_version_id_fkey'; columns: ['version_id']; isOneToOne: false; referencedRelation: 'story_versions'; referencedColumns: ['id'] },
        ];
      };
      story_versions: {
        Row: {
          id: string;
          story_id: string;
          version_number: number;
          title: string | null;
          subtitle: string | null;
          summary: string | null;
          cover_concept: string | null;
          educational_takeaway: string | null;
          discussion_questions: string[];
          character_bible: Json;
          generation_meta: Json;
          word_count: number | null;
          reading_minutes: number | null;
          status: AssetStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          version_number?: number;
          title?: string | null;
          subtitle?: string | null;
          summary?: string | null;
          cover_concept?: string | null;
          educational_takeaway?: string | null;
          discussion_questions?: string[];
          character_bible?: Json;
          generation_meta?: Json;
          word_count?: number | null;
          reading_minutes?: number | null;
          status?: AssetStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          version_number?: number;
          title?: string | null;
          subtitle?: string | null;
          summary?: string | null;
          cover_concept?: string | null;
          educational_takeaway?: string | null;
          discussion_questions?: string[];
          character_bible?: Json;
          generation_meta?: Json;
          word_count?: number | null;
          reading_minutes?: number | null;
          status?: AssetStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'story_versions_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          owner_id: string;
          product_id: string | null;
          price_id: string | null;
          status: SubscriptionStatus;
          provider: string;
          provider_customer_id: string | null;
          provider_subscription_id: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          canceled_at: string | null;
          trial_end: string | null;
          last_grant_period_start: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          product_id?: string | null;
          price_id?: string | null;
          status?: SubscriptionStatus;
          provider?: string;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          trial_end?: string | null;
          last_grant_period_start?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          product_id?: string | null;
          price_id?: string | null;
          status?: SubscriptionStatus;
          provider?: string;
          provider_customer_id?: string | null;
          provider_subscription_id?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          canceled_at?: string | null;
          trial_end?: string | null;
          last_grant_period_start?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'subscriptions_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'subscriptions_price_id_fkey'; columns: ['price_id']; isOneToOne: false; referencedRelation: 'prices'; referencedColumns: ['id'] },
          { foreignKeyName: 'subscriptions_product_id_fkey'; columns: ['product_id']; isOneToOne: false; referencedRelation: 'products'; referencedColumns: ['id'] },
        ];
      };
      themes: {
        Row: {
          id: string;
          slug: string;
          labels: Json;
          descriptions: Json;
          icon: string | null;
          accent_color: string | null;
          cover_art_url: string | null;
          prompt_guidance: string | null;
          min_age: number;
          max_age: number;
          is_premium: boolean;
          is_custom_input: boolean;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          labels?: Json;
          descriptions?: Json;
          icon?: string | null;
          accent_color?: string | null;
          cover_art_url?: string | null;
          prompt_guidance?: string | null;
          min_age?: number;
          max_age?: number;
          is_premium?: boolean;
          is_custom_input?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          labels?: Json;
          descriptions?: Json;
          icon?: string | null;
          accent_color?: string | null;
          cover_art_url?: string | null;
          prompt_guidance?: string | null;
          min_age?: number;
          max_age?: number;
          is_premium?: boolean;
          is_custom_input?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      usage_events: {
        Row: {
          id: number;
          owner_id: string | null;
          story_id: string | null;
          version_id: string | null;
          job_id: string | null;
          provider: string;
          model: string;
          operation: AiOperation;
          input_tokens: number | null;
          output_tokens: number | null;
          cached_input_tokens: number | null;
          reasoning_tokens: number | null;
          image_count: number | null;
          image_size: string | null;
          audio_characters: number | null;
          audio_seconds: number | null;
          estimated_cost_micro_usd: number;
          unit_costs: Json | null;
          duration_ms: number | null;
          succeeded: boolean;
          error_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          owner_id?: string | null;
          story_id?: string | null;
          version_id?: string | null;
          job_id?: string | null;
          provider: string;
          model: string;
          operation: AiOperation;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cached_input_tokens?: number | null;
          reasoning_tokens?: number | null;
          image_count?: number | null;
          image_size?: string | null;
          audio_characters?: number | null;
          audio_seconds?: number | null;
          estimated_cost_micro_usd?: number;
          unit_costs?: Json | null;
          duration_ms?: number | null;
          succeeded?: boolean;
          error_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          owner_id?: string | null;
          story_id?: string | null;
          version_id?: string | null;
          job_id?: string | null;
          provider?: string;
          model?: string;
          operation?: AiOperation;
          input_tokens?: number | null;
          output_tokens?: number | null;
          cached_input_tokens?: number | null;
          reasoning_tokens?: number | null;
          image_count?: number | null;
          image_size?: string | null;
          audio_characters?: number | null;
          audio_seconds?: number | null;
          estimated_cost_micro_usd?: number;
          unit_costs?: Json | null;
          duration_ms?: number | null;
          succeeded?: boolean;
          error_code?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'usage_events_job_id_fkey'; columns: ['job_id']; isOneToOne: false; referencedRelation: 'generation_jobs'; referencedColumns: ['id'] },
          { foreignKeyName: 'usage_events_owner_id_fkey'; columns: ['owner_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'usage_events_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] },
          { foreignKeyName: 'usage_events_version_id_fkey'; columns: ['version_id']; isOneToOne: false; referencedRelation: 'story_versions'; referencedColumns: ['id'] },
        ];
      };
      voices: {
        Row: {
          id: string;
          slug: string;
          provider: string;
          provider_voice_id: string;
          labels: Json;
          description: string | null;
          supported_language_codes: string[];
          sample_audio_url: string | null;
          delivery_guidance: string | null;
          is_premium: boolean;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          provider?: string;
          provider_voice_id: string;
          labels?: Json;
          description?: string | null;
          supported_language_codes?: string[];
          sample_audio_url?: string | null;
          delivery_guidance?: string | null;
          is_premium?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          provider?: string;
          provider_voice_id?: string;
          labels?: Json;
          description?: string | null;
          supported_language_codes?: string[];
          sample_audio_url?: string | null;
          delivery_guidance?: string | null;
          is_premium?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: { Args: { p_user_id?: string }; Returns: boolean };
      is_staff: { Args: { p_user_id?: string }; Returns: boolean };
      owns_story: { Args: { p_story_id: string; p_user_id?: string }; Returns: boolean };
      get_shared_story: { Args: { p_token: string }; Returns: Json };
      touch_share_link: { Args: { p_token: string }; Returns: undefined };
      admin_dashboard_metrics: { Args: { p_days?: number }; Returns: Json };
      request_account_deletion: { Args: Record<string, never>; Returns: undefined };
      next_order_number: { Args: Record<string, never>; Returns: string };
      record_credit_transaction: {
        Args: {
          p_owner_id: string;
          p_delta: number;
          p_reason: CreditReason;
          p_idempotency_key?: string | null;
          p_story_id?: string | null;
          p_job_id?: string | null;
          p_note?: string | null;
          p_metadata?: Json;
        };
        Returns: number;
      };
      claim_generation_jobs: {
        Args: { p_limit?: number; p_worker?: string; p_types?: JobType[] | null };
        Returns: Database['public']['Tables']['generation_jobs']['Row'][];
      };
      reap_stalled_jobs: { Args: { p_stale_after?: string }; Returns: number };
      consume_rate_limit: {
        Args: { p_bucket: string; p_subject: string; p_limit: number; p_window_seconds: number };
        Returns: number;
      };
    };
    Enums: {
      ai_operation: AiOperation;
      asset_status: AssetStatus;
      book_binding: BookBinding;
      credit_reason: CreditReason;
      job_status: JobStatus;
      job_type: JobType;
      moderation_outcome: ModerationOutcome;
      moderation_stage: ModerationStage;
      narration_scope: NarrationScope;
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      print_job_status: PrintJobStatus;
      product_kind: ProductKind;
      remix_kind: RemixKind;
      story_length: StoryLength;
      story_status: StoryStatus;
      subscription_status: SubscriptionStatus;
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
