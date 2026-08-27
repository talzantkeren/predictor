export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
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
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      competitions: {
        Row: {
          country_code: string
          created_at: string
          external_id: string | null
          external_provider: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          country_code: string
          created_at?: string
          external_id?: string | null
          external_provider?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          external_id?: string | null
          external_provider?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      invite_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          league_id: string
          public_id: string
          revoked_at: string | null
          status: Database["public"]["Enums"]["invite_status"]
          token_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          league_id: string
          public_id?: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          token_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          league_id?: string
          public_id?: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["invite_status"]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_links_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "invite_links_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          league_id: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["join_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          league_id: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          league_id?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "join_requests_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_match_reconciliations: {
        Row: {
          candidate_away_score: number | null
          candidate_home_score: number | null
          candidate_status: Database["public"]["Enums"]["match_status"]
          created_at: string
          created_by: string
          decided_at: string | null
          decided_by: string | null
          disposition: Database["public"]["Enums"]["league_match_reconciliation_disposition"]
          id: string
          league_id: string
          match_id: string
          result_version: number
        }
        Insert: {
          candidate_away_score?: number | null
          candidate_home_score?: number | null
          candidate_status: Database["public"]["Enums"]["match_status"]
          created_at?: string
          created_by: string
          decided_at?: string | null
          decided_by?: string | null
          disposition?: Database["public"]["Enums"]["league_match_reconciliation_disposition"]
          id?: string
          league_id: string
          match_id: string
          result_version: number
        }
        Update: {
          candidate_away_score?: number | null
          candidate_home_score?: number | null
          candidate_status?: Database["public"]["Enums"]["match_status"]
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          disposition?: Database["public"]["Enums"]["league_match_reconciliation_disposition"]
          id?: string
          league_id?: string
          match_id?: string
          result_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_match_reconciliations_snapshot_fkey"
            columns: ["league_id", "match_id"]
            isOneToOne: false
            referencedRelation: "league_match_snapshots"
            referencedColumns: ["league_id", "match_id"]
          },
        ]
      }
      league_match_snapshots: {
        Row: {
          completed_at: string
          completed_away_score: number | null
          completed_home_score: number | null
          completed_result_version: number
          completed_status: Database["public"]["Enums"]["match_status"]
          league_id: string
          match_id: string
        }
        Insert: {
          completed_at: string
          completed_away_score?: number | null
          completed_home_score?: number | null
          completed_result_version: number
          completed_status: Database["public"]["Enums"]["match_status"]
          league_id: string
          match_id: string
        }
        Update: {
          completed_at?: string
          completed_away_score?: number | null
          completed_home_score?: number | null
          completed_result_version?: number
          completed_status?: Database["public"]["Enums"]["match_status"]
          league_id?: string
          match_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_match_snapshots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_match_snapshots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_match_snapshots_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_match_snapshots_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          approved_at: string
          approved_by: string
          created_at: string
          id: string
          league_id: string
          removed_at: string | null
          removed_by: string | null
          status: Database["public"]["Enums"]["member_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          created_at?: string
          id?: string
          league_id: string
          removed_at?: string | null
          removed_by?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          created_at?: string
          id?: string
          league_id?: string
          removed_at?: string | null
          removed_by?: string | null
          status?: Database["public"]["Enums"]["member_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_scoring_rules: {
        Row: {
          correct_outcome_points: number
          created_at: string
          exact_points: number
          incorrect_points: number
          league_id: string
          locked_at: string | null
          updated_at: string
          version: number
        }
        Insert: {
          correct_outcome_points?: number
          created_at?: string
          exact_points?: number
          incorrect_points?: number
          league_id: string
          locked_at?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          correct_outcome_points?: number
          created_at?: string
          exact_points?: number
          incorrect_points?: number
          league_id?: string
          locked_at?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_scoring_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "league_match_results"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_scoring_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          activated_at: string | null
          allow_late_join: boolean
          completed_at: string | null
          created_at: string
          demo_entry_fee_agorot: number
          demo_payment_instructions: string | null
          description: string | null
          id: string
          joins_close_at: string | null
          manager_id: string
          name: string
          season_id: string
          settings_version: number
          status: Database["public"]["Enums"]["league_status"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          allow_late_join?: boolean
          completed_at?: string | null
          created_at?: string
          demo_entry_fee_agorot?: number
          demo_payment_instructions?: string | null
          description?: string | null
          id?: string
          joins_close_at?: string | null
          manager_id: string
          name: string
          season_id: string
          settings_version?: number
          status?: Database["public"]["Enums"]["league_status"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          allow_late_join?: boolean
          completed_at?: string | null
          created_at?: string
          demo_entry_fee_agorot?: number
          demo_payment_instructions?: string | null
          description?: string | null
          id?: string
          joins_close_at?: string | null
          manager_id?: string
          name?: string
          season_id?: string
          settings_version?: number
          status?: Database["public"]["Enums"]["league_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      match_result_reviews: {
        Row: {
          applied_result_version: number | null
          candidate_away_score: number | null
          candidate_home_score: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          disposition: Database["public"]["Enums"]["match_result_review_disposition"]
          match_id: string
          provider_status: string
          result_version: number
          selected_away_score: number | null
          selected_home_score: number | null
          selected_status: Database["public"]["Enums"]["match_status"] | null
        }
        Insert: {
          applied_result_version?: number | null
          candidate_away_score?: number | null
          candidate_home_score?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          disposition?: Database["public"]["Enums"]["match_result_review_disposition"]
          match_id: string
          provider_status: string
          result_version: number
          selected_away_score?: number | null
          selected_home_score?: number | null
          selected_status?: Database["public"]["Enums"]["match_status"] | null
        }
        Update: {
          applied_result_version?: number | null
          candidate_away_score?: number | null
          candidate_home_score?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          disposition?: Database["public"]["Enums"]["match_result_review_disposition"]
          match_id?: string
          provider_status?: string
          result_version?: number
          selected_away_score?: number | null
          selected_home_score?: number | null
          selected_status?: Database["public"]["Enums"]["match_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "match_result_reviews_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_result_reviews_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_score: number | null
          away_team_id: string
          created_at: string
          external_id: string | null
          external_provider: string | null
          home_score: number | null
          home_team_id: string
          id: string
          is_manually_overridden: boolean
          kickoff_at: string
          predictions_locked_at: string | null
          provider_round_label: string | null
          provider_status: string | null
          requires_review: boolean
          result_version: number
          review_code: string | null
          review_result_version: number | null
          round_number: number
          season_id: string
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
        }
        Insert: {
          away_score?: number | null
          away_team_id: string
          created_at?: string
          external_id?: string | null
          external_provider?: string | null
          home_score?: number | null
          home_team_id: string
          id?: string
          is_manually_overridden?: boolean
          kickoff_at: string
          predictions_locked_at?: string | null
          provider_round_label?: string | null
          provider_status?: string | null
          requires_review?: boolean
          result_version?: number
          review_code?: string | null
          review_result_version?: number | null
          round_number: number
          season_id: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Update: {
          away_score?: number | null
          away_team_id?: string
          created_at?: string
          external_id?: string | null
          external_provider?: string | null
          home_score?: number | null
          home_team_id?: string
          id?: string
          is_manually_overridden?: boolean
          kickoff_at?: string
          predictions_locked_at?: string | null
          provider_round_label?: string | null
          provider_status?: string | null
          requires_review?: boolean
          result_version?: number
          review_code?: string | null
          review_result_version?: number | null
          round_number?: number
          season_id?: string
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          deleted_at: string | null
          id: string
          join_request_id: string
          mime_type: string
          sha256: string
          size_bytes: number
          storage_path: string
          upload_idempotency_key: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          deleted_at?: string | null
          id: string
          join_request_id: string
          mime_type?: string
          sha256: string
          size_bytes: number
          storage_path: string
          upload_idempotency_key: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          deleted_at?: string | null
          id?: string
          join_request_id?: string
          mime_type?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          upload_idempotency_key?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_join_request_id_fkey"
            columns: ["join_request_id"]
            isOneToOne: false
            referencedRelation: "join_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          created_at: string
          id: string
          is_correct_outcome: boolean | null
          is_exact: boolean | null
          league_id: string
          match_id: string
          points: number
          predicted_away_score: number
          predicted_home_score: number
          predicted_outcome: Database["public"]["Enums"]["outcome"]
          scored_at: string | null
          scored_result_version: number | null
          scored_rule_version: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct_outcome?: boolean | null
          is_exact?: boolean | null
          league_id: string
          match_id: string
          points?: number
          predicted_away_score: number
          predicted_home_score: number
          predicted_outcome?: Database["public"]["Enums"]["outcome"]
          scored_at?: string | null
          scored_result_version?: number | null
          scored_rule_version?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct_outcome?: boolean | null
          is_exact?: boolean | null
          league_id?: string
          match_id?: string
          points?: number
          predicted_away_score?: number
          predicted_home_score?: number
          predicted_outcome?: Database["public"]["Enums"]["outcome"]
          scored_at?: string | null
          scored_result_version?: number | null
          scored_rule_version?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "predictions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_rules: {
        Row: {
          created_at: string
          id: string
          league_id: string
          percentage_bps: number
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          percentage_bps: number
          position: number
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          percentage_bps?: number
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "prize_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "prize_rules_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          action: string
          created_at: string
          id: string
          join_request_id: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          join_request_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          join_request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_events_join_request_id_fkey"
            columns: ["join_request_id"]
            isOneToOne: false
            referencedRelation: "join_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          competition_id: string
          created_at: string
          ends_on: string
          external_id: string | null
          external_provider: string | null
          id: string
          is_current: boolean
          name: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          ends_on: string
          external_id?: string | null
          external_provider?: string | null
          id?: string
          is_current?: boolean
          name: string
          starts_on: string
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          ends_on?: string
          external_id?: string | null
          external_provider?: string | null
          id?: string
          is_current?: boolean
          name?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_provider_rounds: {
        Row: {
          created_at: string
          id: string
          provider: string
          provider_label: string
          requires_review: boolean
          round_number: number | null
          season_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          provider_label: string
          requires_review: boolean
          round_number?: number | null
          season_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          provider_label?: string
          requires_review?: boolean
          round_number?: number | null
          season_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_provider_rounds_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_leases: {
        Row: {
          backoff_until: string | null
          fencing_token: string | null
          generation: number
          last_catalog_at: string | null
          last_forced_at: string | null
          last_reconciliation_at: string | null
          last_targeted_at: string | null
          locked_until: string | null
          provider: string
          run_id: string | null
          updated_at: string
        }
        Insert: {
          backoff_until?: string | null
          fencing_token?: string | null
          generation?: number
          last_catalog_at?: string | null
          last_forced_at?: string | null
          last_reconciliation_at?: string | null
          last_targeted_at?: string | null
          locked_until?: string | null
          provider: string
          run_id?: string | null
          updated_at?: string
        }
        Update: {
          backoff_until?: string | null
          fencing_token?: string | null
          generation?: number
          last_catalog_at?: string | null
          last_forced_at?: string | null
          last_reconciliation_at?: string | null
          last_targeted_at?: string | null
          locked_until?: string | null
          provider?: string
          run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_leases_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          error_code: string | null
          error_message_safe: string | null
          finished_at: string | null
          fixtures_seen: number
          id: string
          lease_generation: number | null
          locked_until: string | null
          manual_overrides_skipped: number
          matches_changed: number
          operator_notes: string[]
          provider: string
          quota_remaining: number | null
          results_changed: number
          rows_inserted: number
          started_at: string
          status: Database["public"]["Enums"]["sync_status"]
          sync_kind: string
          teams_changed: number
        }
        Insert: {
          error_code?: string | null
          error_message_safe?: string | null
          finished_at?: string | null
          fixtures_seen?: number
          id?: string
          lease_generation?: number | null
          locked_until?: string | null
          manual_overrides_skipped?: number
          matches_changed?: number
          operator_notes?: string[]
          provider: string
          quota_remaining?: number | null
          results_changed?: number
          rows_inserted?: number
          started_at?: string
          status: Database["public"]["Enums"]["sync_status"]
          sync_kind?: string
          teams_changed?: number
        }
        Update: {
          error_code?: string | null
          error_message_safe?: string | null
          finished_at?: string | null
          fixtures_seen?: number
          id?: string
          lease_generation?: number | null
          locked_until?: string | null
          manual_overrides_skipped?: number
          matches_changed?: number
          operator_notes?: string[]
          provider?: string
          quota_remaining?: number | null
          results_changed?: number
          rows_inserted?: number
          started_at?: string
          status?: Database["public"]["Enums"]["sync_status"]
          sync_kind?: string
          teams_changed?: number
        }
        Relationships: []
      }
      system_admins: {
        Row: {
          granted_at: string
          granted_by: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          user_id?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          external_id: string | null
          external_provider: string | null
          id: string
          logo_url: string | null
          name: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          external_provider?: string | null
          id?: string
          logo_url?: string | null
          name: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          external_provider?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      league_leaderboard: {
        Row: {
          correct_outcomes: number | null
          display_name: string | null
          exact_scores: number | null
          league_id: string | null
          predictions_submitted: number | null
          rank: number | null
          total_points: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "league_match_results"
            referencedColumns: ["league_id"]
          },
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_match_results: {
        Row: {
          away_score: number | null
          away_team_id: string | null
          away_team_name: string | null
          away_team_short_name: string | null
          home_score: number | null
          home_team_id: string | null
          home_team_name: string | null
          home_team_short_name: string | null
          id: string | null
          kickoff_at: string | null
          league_id: string | null
          predictions_locked_at: string | null
          provider_status: string | null
          round_number: number | null
          status: Database["public"]["Enums"]["match_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_due_leagues: {
        Args: never
        Returns: {
          activated_count: number
          late_count: number
          recorded_at: string
        }[]
      }
      apply_api_football_sync_batch: {
        Args: {
          p_generation: number
          p_payload: Json
          p_run_id: string
          p_token: string
        }
        Returns: {
          result_manual_overrides_skipped: number
          result_matches_changed: number
          result_results_changed: number
          result_rows_inserted: number
          result_teams_changed: number
        }[]
      }
      apply_manual_fixture_catalog: {
        Args: { p_payload: Json }
        Returns: {
          result_code: string
          result_finished_at: string
          result_matches_changed: number
          result_rows_inserted: number
          result_run_id: string
          result_started_at: string
          result_status: Database["public"]["Enums"]["sync_status"]
          result_teams_changed: number
        }[]
      }
      approve_join_request: {
        Args: { p_request_id: string }
        Returns: {
          decided_at: string
          member_id: string
          member_status: Database["public"]["Enums"]["member_status"]
          request_id: string
          request_status: Database["public"]["Enums"]["join_request_status"]
        }[]
      }
      authorize_payment_proof_access: {
        Args: { p_proof_id: string }
        Returns: {
          league_id: string
          proof_id: string
          request_id: string
        }[]
      }
      claim_sports_sync: {
        Args: { p_force?: boolean; p_provider: string }
        Returns: {
          result_code: string
          result_fixture_ids: string[]
          result_generation: number
          result_locked_until: string
          result_outcome: string
          result_provider: string
          result_run_id: string
          result_sync_kind: string
          result_token: string
        }[]
      }
      clear_manual_match_override: {
        Args: { p_match_id: string }
        Returns: {
          result_away_score: number
          result_cleared: boolean
          result_external_provider: string
          result_home_score: number
          result_manual_override: boolean
          result_match_id: string
          result_status: Database["public"]["Enums"]["match_status"]
          result_version: number
        }[]
      }
      complete_league: {
        Args: { p_league_id: string }
        Returns: {
          result_changed: boolean
          result_closed_request_count: number
          result_completed_at: string
          result_league_id: string
          result_snapshot_count: number
          result_status: Database["public"]["Enums"]["league_status"]
        }[]
      }
      consume_proof_upload_rate_limit: {
        Args: { p_request_id: string }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      create_league: {
        Args: {
          p_allow_late_join: boolean
          p_correct_outcome_points: number
          p_demo_entry_fee_agorot: number
          p_demo_payment_instructions: string
          p_description: string
          p_exact_points: number
          p_incorrect_points: number
          p_joins_close_at: string
          p_name: string
          p_prizes: Json
          p_season_id: string
        }
        Returns: string
      }
      create_or_correct_match: {
        Args: {
          p_away_score: number
          p_away_team_id: string
          p_home_score: number
          p_home_team_id: string
          p_kickoff_at: string
          p_match_id: string
          p_operation: string
          p_round_number: number
          p_season_id: string
          p_status: Database["public"]["Enums"]["match_status"]
        }
        Returns: {
          result_away_score: number
          result_changed: boolean
          result_created: boolean
          result_home_score: number
          result_manual_override: boolean
          result_match_id: string
          result_status: Database["public"]["Enums"]["match_status"]
          result_version: number
        }[]
      }
      create_or_rotate_invite: {
        Args: { p_league_id: string }
        Returns: {
          created_at: string
          expires_at: string
          invite_id: string
          public_id: string
          raw_token: string
          revoked_at: string
          status: Database["public"]["Enums"]["invite_status"]
        }[]
      }
      finalize_payment_proof: {
        Args: {
          p_idempotency_key: string
          p_proof_id: string
          p_request_id: string
          p_sha256: string
          p_size_bytes: number
        }
        Returns: {
          proof_id: string
          replayed: boolean
          request_id: string
          status: Database["public"]["Enums"]["join_request_status"]
        }[]
      }
      finalize_sports_sync: {
        Args: {
          p_error_code: string
          p_error_message_safe: string
          p_fixtures_seen: number
          p_generation: number
          p_operator_notes: string[]
          p_quota_remaining: number
          p_retry_after_seconds?: number
          p_run_id: string
          p_status: string
          p_token: string
        }
        Returns: {
          result_code: string
          result_finished_at: string
          result_run_id: string
          result_status: Database["public"]["Enums"]["sync_status"]
        }[]
      }
      get_dashboard_leagues_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_league_id?: string
          p_page_size?: number
        }
        Returns: {
          league_created_at: string
          league_id: string
          league_name: string
          league_status: Database["public"]["Enums"]["league_status"]
          season_name: string
          viewer_role: string
        }[]
      }
      get_editable_league_settings: {
        Args: { p_league_id: string }
        Returns: {
          allow_late_join: boolean
          correct_outcome_points: number
          database_time: string
          demo_entry_fee_agorot: number
          demo_payment_instructions: string
          description: string
          editor_role: string
          exact_points: number
          first_kickoff_at: string
          has_started_or_latched: boolean
          incorrect_points: number
          joins_close_at: string
          league_id: string
          name: string
          prizes: Json
          rules_locked: boolean
          scoring_locked_at: string
          scoring_version: number
          settings_version: number
          status: Database["public"]["Enums"]["league_status"]
        }[]
      }
      get_join_request_upload_context: {
        Args: { p_request_id: string }
        Returns: {
          league_id: string
          request_id: string
          status: Database["public"]["Enums"]["join_request_status"]
        }[]
      }
      get_league_invite_metadata: {
        Args: { p_league_id: string }
        Returns: {
          created_at: string
          expires_at: string
          invite_id: string
          is_expired: boolean
          revoked_at: string
          status: Database["public"]["Enums"]["invite_status"]
        }[]
      }
      get_manager_join_requests_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_request_id?: string
          p_league_id: string
          p_page_size?: number
          p_status?: Database["public"]["Enums"]["join_request_status"]
        }
        Returns: {
          created_at: string
          decided_at: string
          proofs: Json
          rejection_reason: string
          request_id: string
          requester_display_name: string
          status: Database["public"]["Enums"]["join_request_status"]
          updated_at: string
        }[]
      }
      get_match_detail_context: {
        Args: { p_league_id: string; p_match_id: string }
        Returns: {
          away_score: number
          away_team_id: string
          away_team_name: string
          away_team_short_name: string
          database_time: string
          home_score: number
          home_team_id: string
          home_team_name: string
          home_team_short_name: string
          kickoff_at: string
          league_id: string
          league_name: string
          league_status: Database["public"]["Enums"]["league_status"]
          match_id: string
          match_status: Database["public"]["Enums"]["match_status"]
          own_predicted_away_score: number
          own_predicted_home_score: number
          own_predicted_outcome: Database["public"]["Enums"]["outcome"]
          own_prediction_created_at: string
          own_prediction_id: string
          own_prediction_updated_at: string
          predictions_locked_at: string
          provider_status: string
          round_number: number
        }[]
      }
      get_match_eligible_leagues_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_league_id?: string
          p_match_id: string
          p_page_size?: number
        }
        Returns: {
          league_created_at: string
          league_id: string
          league_name: string
          league_status: Database["public"]["Enums"]["league_status"]
        }[]
      }
      get_match_selection_context: {
        Args: { p_match_id: string }
        Returns: {
          away_score: number
          away_team_id: string
          away_team_name: string
          away_team_short_name: string
          database_time: string
          home_score: number
          home_team_id: string
          home_team_name: string
          home_team_short_name: string
          kickoff_at: string
          match_id: string
          match_status: Database["public"]["Enums"]["match_status"]
          predictions_locked_at: string
          provider_status: string
          round_number: number
        }[]
      }
      get_my_join_requests_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_request_id?: string
          p_page_size?: number
        }
        Returns: {
          created_at: string
          league_name: string
          proofs: Json
          rejection_reason: string
          request_id: string
          status: Database["public"]["Enums"]["join_request_status"]
          updated_at: string
        }[]
      }
      get_prediction_database_time: { Args: never; Returns: string }
      get_revealed_predictions_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_prediction_id?: string
          p_league_id: string
          p_match_id: string
          p_page_size?: number
        }
        Returns: {
          created_at: string
          display_name: string
          predicted_away_score: number
          predicted_home_score: number
          predicted_outcome: Database["public"]["Enums"]["outcome"]
          prediction_id: string
          updated_at: string
          user_id: string
        }[]
      }
      is_system_admin: { Args: never; Returns: boolean }
      reject_join_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: {
          decided_at: string
          rejection_reason: string
          request_id: string
          request_status: Database["public"]["Enums"]["join_request_status"]
        }[]
      }
      resolve_invite: {
        Args: { p_public_id: string; p_token_hash: string }
        Returns: {
          available: boolean
          demo_entry_fee_agorot: number
          demo_payment_instructions: string
          join_request_id: string
          join_request_status: Database["public"]["Enums"]["join_request_status"]
          joins_close_at: string
          league_name: string
          proofs: Json
          request_created_at: string
          request_updated_at: string
          viewer_state: string
        }[]
      }
      revoke_invite: {
        Args: { p_invite_id: string }
        Returns: {
          created_at: string
          expires_at: string
          invite_id: string
          revoked_at: string
          status: Database["public"]["Enums"]["invite_status"]
        }[]
      }
      save_prediction: {
        Args: {
          p_league_id: string
          p_match_id: string
          p_predicted_away_score: number
          p_predicted_home_score: number
        }
        Returns: {
          created_at: string
          league_id: string
          match_id: string
          predicted_away_score: number
          predicted_home_score: number
          predicted_outcome: Database["public"]["Enums"]["outcome"]
          prediction_id: string
          updated_at: string
        }[]
      }
      score_match: {
        Args: {
          p_away_score: number
          p_home_score: number
          p_is_manual_override: boolean
          p_match_id: string
          p_source: string
          p_status: Database["public"]["Enums"]["match_status"]
        }
        Returns: {
          predictions_scored: number
          result_away_score: number
          result_changed: boolean
          result_home_score: number
          result_match_id: string
          result_status: Database["public"]["Enums"]["match_status"]
          result_version: number
        }[]
      }
      start_league: {
        Args: { p_league_id: string }
        Returns: {
          result_activated_at: string
          result_changed: boolean
          result_code: string
          result_league_id: string
          result_recorded_at: string
          result_status: Database["public"]["Enums"]["league_status"]
        }[]
      }
      submit_join_request: {
        Args: { p_public_id: string; p_token_hash: string }
        Returns: {
          created_at: string
          request_id: string
          status: Database["public"]["Enums"]["join_request_status"]
          updated_at: string
        }[]
      }
      update_league_settings: {
        Args: {
          p_allow_late_join: boolean
          p_correct_outcome_points: number
          p_demo_entry_fee_agorot: number
          p_demo_payment_instructions: string
          p_description: string
          p_exact_points: number
          p_expected_settings_version: number
          p_incorrect_points: number
          p_joins_close_at: string
          p_league_id: string
          p_name: string
          p_prizes: Json
        }
        Returns: {
          changed: boolean
          league_id: string
          scoring_version: number
          settings_version: number
        }[]
      }
    }
    Enums: {
      invite_status: "active" | "revoked"
      join_request_status:
        | "pending_proof"
        | "pending_approval"
        | "approved"
        | "rejected"
      league_match_reconciliation_disposition:
        | "pending"
        | "applied"
        | "dismissed"
      league_status: "draft" | "open" | "active" | "completed" | "archived"
      match_result_review_disposition: "pending" | "resolved"
      match_status: "scheduled" | "live" | "finished" | "postponed" | "canceled"
      member_status: "active" | "removed"
      outcome: "HOME" | "DRAW" | "AWAY"
      sync_status: "running" | "succeeded" | "failed" | "skipped"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      invite_status: ["active", "revoked"],
      join_request_status: [
        "pending_proof",
        "pending_approval",
        "approved",
        "rejected",
      ],
      league_match_reconciliation_disposition: [
        "pending",
        "applied",
        "dismissed",
      ],
      league_status: ["draft", "open", "active", "completed", "archived"],
      match_result_review_disposition: ["pending", "resolved"],
      match_status: ["scheduled", "live", "finished", "postponed", "canceled"],
      member_status: ["active", "removed"],
      outcome: ["HOME", "DRAW", "AWAY"],
      sync_status: ["running", "succeeded", "failed", "skipped"],
    },
  },
} as const

