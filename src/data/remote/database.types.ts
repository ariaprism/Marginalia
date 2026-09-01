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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      annotations: {
        Row: {
          actor: string
          book_id: string
          created_at: string
          deleted_at: string | null
          highlight_id: string | null
          id: string
          locator: Json
          owner_id: string
          text: string
          updated_at: string
        }
        Insert: {
          actor?: string
          book_id: string
          created_at: string
          deleted_at?: string | null
          highlight_id?: string | null
          id: string
          locator: Json
          owner_id: string
          text: string
          updated_at: string
        }
        Update: {
          actor?: string
          book_id?: string
          created_at?: string
          deleted_at?: string | null
          highlight_id?: string | null
          id?: string
          locator?: Json
          owner_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "annotations_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annotations_book_owner_fkey"
            columns: ["book_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "annotations_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annotations_highlight_owner_fkey"
            columns: ["highlight_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "highlights"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      book_sections: {
        Row: {
          book_id: string
          content_hash: string | null
          content_html: string
          content_text: string
          deleted_at: string | null
          href: string
          id: string
          owner_id: string
          spine_index: number
          title: string
          updated_at: string
        }
        Insert: {
          book_id: string
          content_hash?: string | null
          content_html?: string
          content_text?: string
          deleted_at?: string | null
          href?: string
          id: string
          owner_id: string
          spine_index: number
          title?: string
          updated_at: string
        }
        Update: {
          book_id?: string
          content_hash?: string | null
          content_html?: string
          content_text?: string
          deleted_at?: string | null
          href?: string
          id?: string
          owner_id?: string
          spine_index?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_sections_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_sections_book_owner_fkey"
            columns: ["book_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          book_id: string
          deleted_at: string | null
          locator: Json | null
          moved_at: string
          owner_id: string
        }
        Insert: {
          book_id: string
          deleted_at?: string | null
          locator?: Json | null
          moved_at: string
          owner_id: string
        }
        Update: {
          book_id?: string
          deleted_at?: string | null
          locator?: Json | null
          moved_at?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_book_owner_fkey"
            columns: ["book_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      books: {
        Row: {
          added_at: string
          author: string
          content_hash: string | null
          cover_path: string | null
          cover_tone: string | null
          deleted_at: string | null
          description: string
          english_title: string | null
          epub_path: string | null
          id: string
          language: string
          last_opened_at: string | null
          owner_id: string
          pinned_at: string | null
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          added_at: string
          author?: string
          content_hash?: string | null
          cover_path?: string | null
          cover_tone?: string | null
          deleted_at?: string | null
          description?: string
          english_title?: string | null
          epub_path?: string | null
          id: string
          language?: string
          last_opened_at?: string | null
          owner_id: string
          pinned_at?: string | null
          source?: string
          status?: string
          title: string
          updated_at: string
        }
        Update: {
          added_at?: string
          author?: string
          content_hash?: string | null
          cover_path?: string | null
          cover_tone?: string | null
          deleted_at?: string | null
          description?: string
          english_title?: string | null
          epub_path?: string | null
          id?: string
          language?: string
          last_opened_at?: string | null
          owner_id?: string
          pinned_at?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      highlights: {
        Row: {
          book_id: string
          color: string
          created_at: string
          deleted_at: string | null
          id: string
          locator: Json
          owner_id: string
          updated_at: string
        }
        Insert: {
          book_id: string
          color: string
          created_at: string
          deleted_at?: string | null
          id: string
          locator: Json
          owner_id: string
          updated_at: string
        }
        Update: {
          book_id?: string
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          locator?: Json
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_book_owner_fkey"
            columns: ["book_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      marginalia: {
        Row: {
          actor: string
          annotation_id: string | null
          book_id: string
          created_at: string
          deleted_at: string | null
          highlight_id: string | null
          id: string
          idempotency_key: string
          locator: Json
          owner_id: string
          session_id: string | null
          text: string
          updated_at: string
          visibility: string
        }
        Insert: {
          actor?: string
          annotation_id?: string | null
          book_id: string
          created_at: string
          deleted_at?: string | null
          highlight_id?: string | null
          id: string
          idempotency_key: string
          locator: Json
          owner_id: string
          session_id?: string | null
          text: string
          updated_at: string
          visibility?: string
        }
        Update: {
          actor?: string
          annotation_id?: string | null
          book_id?: string
          created_at?: string
          deleted_at?: string | null
          highlight_id?: string | null
          id?: string
          idempotency_key?: string
          locator?: Json
          owner_id?: string
          session_id?: string | null
          text?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "marginalia_annotation_id_fkey"
            columns: ["annotation_id"]
            isOneToOne: false
            referencedRelation: "annotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marginalia_annotation_owner_fkey"
            columns: ["annotation_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "annotations"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "marginalia_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marginalia_book_owner_fkey"
            columns: ["book_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "marginalia_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marginalia_highlight_owner_fkey"
            columns: ["highlight_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "highlights"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      profiles: {
        Row: {
          companion_name: string
          companion_subject: string
          owner_id: string
          updated_at: string
          user_name: string
        }
        Insert: {
          companion_name?: string
          companion_subject?: string
          owner_id: string
          updated_at?: string
          user_name?: string
        }
        Update: {
          companion_name?: string
          companion_subject?: string
          owner_id?: string
          updated_at?: string
          user_name?: string
        }
        Relationships: []
      }
      reading_positions: {
        Row: {
          book_id: string
          chapter_progress: number
          locator: Json
          owner_id: string
          read_at: string
          total_progress: number
          updated_at: string
        }
        Insert: {
          book_id: string
          chapter_progress?: number
          locator: Json
          owner_id: string
          read_at: string
          total_progress?: number
          updated_at: string
        }
        Update: {
          book_id?: string
          chapter_progress?: number
          locator?: Json
          owner_id?: string
          read_at?: string
          total_progress?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_positions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: true
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_positions_book_owner_fkey"
            columns: ["book_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      sync_changes: {
        Row: {
          change_id: number
          changed_at: string
          entity_id: string
          entity_type: string
          operation: string
          owner_id: string
        }
        Insert: {
          change_id?: never
          changed_at?: string
          entity_id: string
          entity_type: string
          operation: string
          owner_id: string
        }
        Update: {
          change_id?: never
          changed_at?: string
          entity_id?: string
          entity_type?: string
          operation?: string
          owner_id?: string
        }
        Relationships: []
      }
      sync_operations: {
        Row: {
          accepted_at: string
          entity_id: string
          entity_type: string
          occurred_at: string
          operation_id: string
          owner_id: string
        }
        Insert: {
          accepted_at?: string
          entity_id: string
          entity_type: string
          occurred_at: string
          operation_id: string
          owner_id: string
        }
        Update: {
          accepted_at?: string
          entity_id?: string
          entity_type?: string
          occurred_at?: string
          operation_id?: string
          owner_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_profile_book_sync_operation: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_occurred_at: string
          p_operation: string
          p_operation_id: string
          p_payload: Json
        }
        Returns: boolean
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
  public: {
    Enums: {},
  },
} as const
