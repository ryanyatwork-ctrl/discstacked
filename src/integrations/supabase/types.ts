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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      media_copies: {
        Row: {
          created_at: string
          disc_label: string | null
          format: string | null
          id: string
          media_item_id: string
          physical_product_id: string
        }
        Insert: {
          created_at?: string
          disc_label?: string | null
          format?: string | null
          id?: string
          media_item_id: string
          physical_product_id: string
        }
        Update: {
          created_at?: string
          disc_label?: string | null
          format?: string | null
          id?: string
          media_item_id?: string
          physical_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_copies_media_item_id_fkey"
            columns: ["media_item_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_copies_physical_product_id_fkey"
            columns: ["physical_product_id"]
            isOneToOne: false
            referencedRelation: "physical_products"
            referencedColumns: ["id"]
          },
        ]
      }
      media_items: {
        Row: {
          amazon_tag: string | null
          barcode: string | null
          content_type: string
          created_at: string
          digital_copy: boolean
          episode_count: number | null
          external_id: string | null
          format: string | null
          formats: string[] | null
          genre: string | null
          id: string
          in_plex: boolean
          last_watched: string | null
          media_type: string
          metadata: Json | null
          notes: string | null
          poster_url: string | null
          rating: number | null
          season_number: number | null
          sort_title: string | null
          title: string
          tmdb_series_id: number | null
          total_copies: number
          updated_at: string
          user_id: string
          want_to_watch: boolean
          watch_notes: string | null
          wishlist: boolean
          year: number | null
        }
        Insert: {
          amazon_tag?: string | null
          barcode?: string | null
          content_type?: string
          created_at?: string
          digital_copy?: boolean
          episode_count?: number | null
          external_id?: string | null
          format?: string | null
          formats?: string[] | null
          genre?: string | null
          id?: string
          in_plex?: boolean
          last_watched?: string | null
          media_type: string
          metadata?: Json | null
          notes?: string | null
          poster_url?: string | null
          rating?: number | null
          season_number?: number | null
          sort_title?: string | null
          title: string
          tmdb_series_id?: number | null
          total_copies?: number
          updated_at?: string
          user_id: string
          want_to_watch?: boolean
          watch_notes?: string | null
          wishlist?: boolean
          year?: number | null
        }
        Update: {
          amazon_tag?: string | null
          barcode?: string | null
          content_type?: string
          created_at?: string
          digital_copy?: boolean
          episode_count?: number | null
          external_id?: string | null
          format?: string | null
          formats?: string[] | null
          genre?: string | null
          id?: string
          in_plex?: boolean
          last_watched?: string | null
          media_type?: string
          metadata?: Json | null
          notes?: string | null
          poster_url?: string | null
          rating?: number | null
          season_number?: number | null
          sort_title?: string | null
          title?: string
          tmdb_series_id?: number | null
          total_copies?: number
          updated_at?: string
          user_id?: string
          want_to_watch?: boolean
          watch_notes?: string | null
          wishlist?: boolean
          year?: number | null
        }
        Relationships: []
      }
      physical_products: {
        Row: {
          barcode: string | null
          content_type: string | null
          created_at: string
          disc_count: number | null
          edition: string | null
          formats: string[] | null
          id: string
          is_multi_title: boolean | null
          media_type: string
          metadata: Json | null
          notes: string | null
          product_title: string
          purchase_date: string | null
          purchase_location: string | null
          purchase_price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          content_type?: string | null
          created_at?: string
          disc_count?: number | null
          edition?: string | null
          formats?: string[] | null
          id?: string
          is_multi_title?: boolean | null
          media_type: string
          metadata?: Json | null
          notes?: string | null
          product_title: string
          purchase_date?: string | null
          purchase_location?: string | null
          purchase_price?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          barcode?: string | null
          content_type?: string | null
          created_at?: string
          disc_count?: number | null
          edition?: string | null
          formats?: string[] | null
          id?: string
          is_multi_title?: boolean | null
          media_type?: string
          metadata?: Json | null
          notes?: string | null
          product_title?: string
          purchase_date?: string | null
          purchase_location?: string | null
          purchase_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          share_token: string | null
          shared_tabs: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          share_token?: string | null
          shared_tabs?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          share_token?: string | null
          shared_tabs?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
