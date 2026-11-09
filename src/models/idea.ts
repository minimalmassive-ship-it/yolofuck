export type MediaType = 'text' | 'voice' | 'video' | 'drawing' | 'image';

export interface Idea {
    is_archived?: boolean;
    archived_at?: string | null;
    id: string;
    title: string;
    description?: string | null;
    content: string;
    media_type: MediaType;
    media_url?: string;
    video_url?: string;
    project_id?: string | null;
    folder_id?: string | null;
    pack_id?: string | null;
    collection_id?: string | null;
    created_at: string;
    updated_at?: string;
    user_id?: string | null;
    transcription_status: 'pending' | 'processing' | 'completed' | 'failed';
    slug?: string;
    is_public?: boolean;
    visibility?: 'private' | 'network' | 'public';
    allow_link_access?: boolean;
    category?: string;
    category_id?: string[] | string | null;
    category_path?: string[] | string | null;
    thumbnail_url?: string;
    short_description?: string;
    view_count?: number;
    views?: number;
    likes?: number;
    dislikes?: number;
    dislikes_count?: number;
    published_at?: string;
    image_url?: string | null;
    drawing_url?: string | null;
    draw_svg?: string | null;
    level?: number;
    details?: string;
    author?: string;
    idea_images?: any[];
    project_metadata?: any;
    tools_data?: any[] | null;
    projects?: { color?: string | null, name?: string | null } | null;
    profiles?: {
        id: string;
        username: string;
        display_name?: string;
        avatar_url: string;
    } | null;
    
    // Web3 / NFT Tracking Fields
    is_tokenized?: boolean;
    nft_mint_address?: string | null;
    blockchain_owner_wallet?: string | null;
    provenance_log?: any[] | null;
}
