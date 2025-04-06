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
      gambit_characters: {
        Row: {
          actions: Json | null
          alignment: string
          created_at: string
          description: string | null
          id: string
          mimics: Json | null
          role: string | null
          sees: Json | null
        }
        Insert: {
          actions?: Json | null
          alignment: string
          created_at?: string
          description?: string | null
          id?: string
          mimics?: Json | null
          role?: string | null
          sees?: Json | null
        }
        Update: {
          actions?: Json | null
          alignment?: string
          created_at?: string
          description?: string | null
          id?: string
          mimics?: Json | null
          role?: string | null
          sees?: Json | null
        }
        Relationships: []
      }
      gambit_game_players: {
        Row: {
          character_id: string | null
          created_at: string
          game_id: string | null
          id: number
          user_id: string | null
        }
        Insert: {
          character_id?: string | null
          created_at?: string
          game_id?: string | null
          id?: number
          user_id?: string | null
        }
        Update: {
          character_id?: string | null
          created_at?: string
          game_id?: string | null
          id?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gambit_game_players_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "gambit_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gambit_game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "gambit_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gambit_game_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gambit_game_round: {
        Row: {
          created_at: string
          game_id: string | null
          id: number
          leader_id: number | null
          outcome: Json | null
          settings: Json | null
          status: Database["public"]["Enums"]["gambit_round_status"]
        }
        Insert: {
          created_at?: string
          game_id?: string | null
          id?: number
          leader_id?: number | null
          outcome?: Json | null
          settings?: Json | null
          status?: Database["public"]["Enums"]["gambit_round_status"]
        }
        Update: {
          created_at?: string
          game_id?: string | null
          id?: number
          leader_id?: number | null
          outcome?: Json | null
          settings?: Json | null
          status?: Database["public"]["Enums"]["gambit_round_status"]
        }
        Relationships: [
          {
            foreignKeyName: "gambit_game_round_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "gambit_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gambit_game_round_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "gambit_game_players"
            referencedColumns: ["id"]
          },
        ]
      }
      gambit_game_round_team: {
        Row: {
          approved: boolean | null
          attempt: number | null
          created_at: string
          game_id: string | null
          id: number
          outcome: Json | null
          round_id: number | null
          team: string[]
        }
        Insert: {
          approved?: boolean | null
          attempt?: number | null
          created_at?: string
          game_id?: string | null
          id?: number
          outcome?: Json | null
          round_id?: number | null
          team: string[]
        }
        Update: {
          approved?: boolean | null
          attempt?: number | null
          created_at?: string
          game_id?: string | null
          id?: number
          outcome?: Json | null
          round_id?: number | null
          team?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "gambit_game_round_team_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "gambit_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gambit_game_round_team_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "gambit_game_round"
            referencedColumns: ["id"]
          },
        ]
      }
      gambit_games: {
        Row: {
          created_at: string
          host_id: string | null
          id: string
          round: number | null
          slug: string | null
          status: Database["public"]["Enums"]["gambit_game_status"]
        }
        Insert: {
          created_at?: string
          host_id?: string | null
          id?: string
          round?: number | null
          slug?: string | null
          status?: Database["public"]["Enums"]["gambit_game_status"]
        }
        Update: {
          created_at?: string
          host_id?: string | null
          id?: string
          round?: number | null
          slug?: string | null
          status?: Database["public"]["Enums"]["gambit_game_status"]
        }
        Relationships: [
          {
            foreignKeyName: "gambit_games_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          profile_id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          profile_id: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          profile_id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      "rescue-time-daily-summaries": {
        Row: {
          created_at: string | null
          date: string
          id: number
          number_of_people: number
          productivity: number
          time_spent_seconds: number
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: number
          number_of_people: number
          productivity: number
          time_spent_seconds: number
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: number
          number_of_people?: number
          productivity?: number
          time_spent_seconds?: number
        }
        Relationships: []
      }
      "wakatime-daily-summaries": {
        Row: {
          created_at: string
          date: string
          id: number
          summary: Json
        }
        Insert: {
          created_at?: string
          date: string
          id?: number
          summary: Json
        }
        Update: {
          created_at?: string
          date?: string
          id?: number
          summary?: Json
        }
        Relationships: []
      }
      "weekly-reports": {
        Row: {
          created_at: string | null
          id: number
          message: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          message?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          message?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      gambit_character_alignments: "good" | "neutral" | "evil"
      gambit_game_status: "lobby" | "in_progress" | "completed"
      gambit_round_status:
        | "pending"
        | "team_selection"
        | "voting"
        | "in_progress"
        | "succeeded"
        | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
