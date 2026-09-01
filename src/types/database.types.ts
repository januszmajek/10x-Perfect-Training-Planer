export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      ai_provider_keys: {
        Row: {
          ciphertext: string;
          created_at: string;
          encryption_key_version: number;
          iv: string;
          key_hint: string;
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
          provider?: Database["public"]["Enums"]["ai_provider"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
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
          name: string;
          slug: string;
        };
        Insert: {
          equipment: Database["public"]["Enums"]["equipment_type"];
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          equipment?: Database["public"]["Enums"]["equipment_type"];
          id?: string;
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
          completed_at: string | null;
          created_at: string;
          id: string;
          origin: Database["public"]["Enums"]["workout_origin"];
          status: Database["public"]["Enums"]["workout_status"];
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          origin: Database["public"]["Enums"]["workout_origin"];
          status?: Database["public"]["Enums"]["workout_status"];
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          origin?: Database["public"]["Enums"]["workout_origin"];
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
      save_manual_planned_workout: {
        Args: {
          p_exercises: Json;
          p_expected_workout_id: string;
          p_replace_existing: boolean;
        };
        Returns: string;
      };
    };
    Enums: {
      ai_provider: "openrouter";
      equipment_type: "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight" | "kettlebell" | "resistance_band";
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
      ai_provider: ["openrouter"],
      equipment_type: ["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "resistance_band"],
      exercise_muscle_role: ["primary", "secondary"],
      muscle_category: ["upper_body", "lower_body", "core"],
      workout_origin: ["ai", "manual"],
      workout_status: ["planned", "completed"],
    },
  },
} as const;
