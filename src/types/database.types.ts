export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_exercise_preferences: {
        Row: {
          created_at: string;
          exercise_id: string;
          preference: Database["public"]["Enums"]["ai_exercise_preference"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          exercise_id: string;
          preference: Database["public"]["Enums"]["ai_exercise_preference"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          exercise_id?: string;
          preference?: Database["public"]["Enums"]["ai_exercise_preference"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_exercise_preferences_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_provider_keys: {
        Row: {
          ciphertext: string;
          created_at: string;
          encryption_key_version: number;
          iv: string;
          key_hint: string;
          key_prefix: string | null;
          provider: Database["public"]["Enums"]["ai_provider"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          ciphertext: string;
          created_at?: string;
          encryption_key_version: number;
          iv: string;
          key_hint: string;
          key_prefix?: string | null;
          provider?: Database["public"]["Enums"]["ai_provider"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          ciphertext?: string;
          created_at?: string;
          encryption_key_version?: number;
          iv?: string;
          key_hint?: string;
          key_prefix?: string | null;
          provider?: Database["public"]["Enums"]["ai_provider"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_reduced_generation_confirmations: {
        Row: {
          allowed_count: number;
          candidate_fingerprint: string;
          consumed_at: string | null;
          created_at: string;
          expires_at: string;
          nonce_digest: string;
          user_id: string;
        };
        Insert: {
          allowed_count: number;
          candidate_fingerprint: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          nonce_digest: string;
          user_id: string;
        };
        Update: {
          allowed_count?: number;
          candidate_fingerprint?: string;
          consumed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          nonce_digest?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_workout_completion_events: {
        Row: {
          completed_at: string;
          expires_at: string;
          proposal_lineage_id: string;
          user_id: string;
          workout_id: string;
        };
        Insert: {
          completed_at: string;
          expires_at?: string;
          proposal_lineage_id: string;
          user_id: string;
          workout_id: string;
        };
        Update: {
          completed_at?: string;
          expires_at?: string;
          proposal_lineage_id?: string;
          user_id?: string;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_workout_completion_events_workout_owner_fkey";
            columns: ["workout_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      ai_workout_proposal_events: {
        Row: {
          created_at: string;
          event_type: Database["public"]["Enums"]["ai_proposal_event_type"];
          exercise_id: string | null;
          expires_at: string;
          id: string;
          proposal_id: string;
          replacement_exercise_id: string | null;
          user_id: string;
          workout_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_type: Database["public"]["Enums"]["ai_proposal_event_type"];
          exercise_id?: string | null;
          expires_at?: string;
          id?: string;
          proposal_id: string;
          replacement_exercise_id?: string | null;
          user_id: string;
          workout_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_type?: Database["public"]["Enums"]["ai_proposal_event_type"];
          exercise_id?: string | null;
          expires_at?: string;
          id?: string;
          proposal_id?: string;
          replacement_exercise_id?: string | null;
          user_id?: string;
          workout_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_workout_proposal_events_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_workout_proposal_events_proposal_owner_fkey";
            columns: ["proposal_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "ai_workout_proposals";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "ai_workout_proposal_events_replacement_exercise_id_fkey";
            columns: ["replacement_exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_workout_proposal_exercises: {
        Row: {
          exercise_id: string;
          position: number;
          proposal_id: string;
        };
        Insert: {
          exercise_id: string;
          position: number;
          proposal_id: string;
        };
        Update: {
          exercise_id?: string;
          position?: number;
          proposal_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_workout_proposal_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ai_workout_proposal_exercises_proposal_id_fkey";
            columns: ["proposal_id"];
            isOneToOne: false;
            referencedRelation: "ai_workout_proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_workout_proposals: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          lineage_id: string;
          rerolled_from_proposal_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          lineage_id?: string;
          rerolled_from_proposal_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          lineage_id?: string;
          rerolled_from_proposal_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_workout_proposals_rerolled_from_proposal_id_fkey";
            columns: ["rerolled_from_proposal_id"];
            isOneToOne: false;
            referencedRelation: "ai_workout_proposals";
            referencedColumns: ["id"];
          },
        ];
      };
      exercise_muscle_groups: {
        Row: {
          exercise_id: string;
          muscle_group_code: string;
          role: Database["public"]["Enums"]["exercise_muscle_role"];
        };
        Insert: {
          exercise_id: string;
          muscle_group_code: string;
          role: Database["public"]["Enums"]["exercise_muscle_role"];
        };
        Update: {
          exercise_id?: string;
          muscle_group_code?: string;
          role?: Database["public"]["Enums"]["exercise_muscle_role"];
        };
        Relationships: [
          {
            foreignKeyName: "exercise_muscle_groups_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exercise_muscle_groups_muscle_group_code_fkey";
            columns: ["muscle_group_code"];
            isOneToOne: false;
            referencedRelation: "muscle_groups";
            referencedColumns: ["code"];
          },
        ];
      };
      exercises: {
        Row: {
          equipment: Database["public"]["Enums"]["equipment_type"];
          id: string;
          movement_pattern: Database["public"]["Enums"]["exercise_movement_pattern"] | null;
          name: string;
          slug: string;
        };
        Insert: {
          equipment: Database["public"]["Enums"]["equipment_type"];
          id?: string;
          movement_pattern?: Database["public"]["Enums"]["exercise_movement_pattern"] | null;
          name: string;
          slug: string;
        };
        Update: {
          equipment?: Database["public"]["Enums"]["equipment_type"];
          id?: string;
          movement_pattern?: Database["public"]["Enums"]["exercise_movement_pattern"] | null;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      muscle_groups: {
        Row: {
          category: Database["public"]["Enums"]["muscle_category"];
          code: string;
          name: string;
          recovery_hours: number;
        };
        Insert: {
          category: Database["public"]["Enums"]["muscle_category"];
          code: string;
          name: string;
          recovery_hours: number;
        };
        Update: {
          category?: Database["public"]["Enums"]["muscle_category"];
          code?: string;
          name?: string;
          recovery_hours?: number;
        };
        Relationships: [];
      };
      workout_exercises: {
        Row: {
          exercise_id: string;
          id: string;
          position: number;
          reps: number;
          sets: number;
          workout_id: string;
        };
        Insert: {
          exercise_id: string;
          id?: string;
          position: number;
          reps: number;
          sets: number;
          workout_id: string;
        };
        Update: {
          exercise_id?: string;
          id?: string;
          position?: number;
          reps?: number;
          sets?: number;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey";
            columns: ["exercise_id"];
            isOneToOne: false;
            referencedRelation: "exercises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey";
            columns: ["workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
      workouts: {
        Row: {
          ai_proposal_lineage_id: string | null;
          completed_at: string | null;
          created_at: string;
          id: string;
          origin: Database["public"]["Enums"]["workout_origin"];
          revision: number;
          status: Database["public"]["Enums"]["workout_status"];
          user_id: string;
        };
        Insert: {
          ai_proposal_lineage_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          origin: Database["public"]["Enums"]["workout_origin"];
          revision?: number;
          status?: Database["public"]["Enums"]["workout_status"];
          user_id: string;
        };
        Update: {
          ai_proposal_lineage_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          origin?: Database["public"]["Enums"]["workout_origin"];
          revision?: number;
          status?: Database["public"]["Enums"]["workout_status"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      append_ai_workout_proposal_event: {
        Args: {
          p_event_type: Database["public"]["Enums"]["ai_proposal_event_type"];
          p_exercise_id?: string;
          p_proposal_id: string;
          p_replacement_exercise_id?: string;
          p_workout_id?: string;
        };
        Returns: undefined;
      };
      complete_planned_workout: {
        Args: { p_expected_revision: number; p_expected_workout_id: string };
        Returns: string;
      };
      consume_ai_reduced_generation_confirmation: {
        Args: {
          p_allowed_count: number;
          p_candidate_fingerprint: string;
          p_nonce_digest: string;
        };
        Returns: undefined;
      };
      delete_planned_workout: {
        Args: { p_expected_revision: number; p_expected_workout_id: string };
        Returns: string;
      };
      get_ai_exercise_preferences: {
        Args: never;
        Returns: {
          exercise_id: string;
          preference: Database["public"]["Enums"]["ai_exercise_preference"];
        }[];
      };
      get_exercise_completion_profile: {
        Args: never;
        Returns: {
          completed_count: number;
          exercise_id: string;
          in_last_completed_workout: boolean;
          last_completed_at: string;
        }[];
      };
      record_ai_workout_proposal: {
        Args: { p_exercise_ids: string[]; p_rerolled_from_proposal_id: string };
        Returns: {
          lineage_id: string;
          proposal_id: string;
        }[];
      };
      register_ai_reduced_generation_confirmation: {
        Args: {
          p_allowed_count: number;
          p_candidate_fingerprint: string;
          p_nonce_digest: string;
        };
        Returns: undefined;
      };
      save_ai_planned_workout: {
        Args: {
          p_exercises: Json;
          p_expected_revision?: number;
          p_expected_workout_id?: string;
          p_replace_existing: boolean;
        };
        Returns: string;
      };
      save_history_aware_ai_planned_workout: {
        Args: {
          p_exercises: Json;
          p_expected_revision?: number;
          p_expected_workout_id?: string;
          p_proposal_id: string;
          p_replace_existing: boolean;
        };
        Returns: string;
      };
      save_manual_planned_workout: {
        Args: {
          p_exercises: Json;
          p_expected_revision?: number;
          p_expected_workout_id?: string;
          p_replace_existing: boolean;
        };
        Returns: string;
      };
      set_ai_exercise_preference: {
        Args: {
          p_exercise_id: string;
          p_preference?: Database["public"]["Enums"]["ai_exercise_preference"];
        };
        Returns: undefined;
      };
      update_planned_workout: {
        Args: {
          p_exercises: Json;
          p_expected_revision: number;
          p_expected_workout_id: string;
        };
        Returns: number;
      };
    };
    Enums: {
      ai_exercise_preference: "liked" | "dont_suggest";
      ai_proposal_event_type: "exposure" | "reroll" | "removal" | "swap" | "retention" | "save" | "completion";
      ai_provider: "openrouter";
      equipment_type: "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight" | "kettlebell" | "resistance_band";
      exercise_movement_pattern: "push" | "pull";
      exercise_muscle_role: "primary" | "secondary";
      muscle_category: "upper_body" | "lower_body" | "core";
      workout_origin: "ai" | "manual";
      workout_status: "planned" | "completed";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ai_exercise_preference: ["liked", "dont_suggest"],
      ai_proposal_event_type: ["exposure", "reroll", "removal", "swap", "retention", "save", "completion"],
      ai_provider: ["openrouter"],
      equipment_type: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "resistance_band"],
      exercise_movement_pattern: ["push", "pull"],
      exercise_muscle_role: ["primary", "secondary"],
      muscle_category: ["upper_body", "lower_body", "core"],
      workout_origin: ["ai", "manual"],
      workout_status: ["planned", "completed"],
    },
  },
} as const;
