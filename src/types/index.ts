

export interface Workspace {
    id: string;
    name: string;
    created_at: string;
    user_id: string | null;
    color: string;
    description?: string;
    image_url?: string;
    drawing_url?: string;
    video_url?: string | null;
    likes?: number;
    views?: number;
    view_count?: number;
    is_public?: boolean;
    is_tokenized?: boolean;
    nft_mint_address?: string;
    blockchain_owner_wallet?: string;
    provenance_log?: any[];
    updated_at: string;
    is_favorite?: boolean;
    team_id?: string | null;
    category_id?: string[];
    status?: 'active' | 'locked' | 'locked_orphaned';
    visibility?: 'private' | 'network' | 'public';
    allow_link_access?: boolean;
    is_group_locked?: boolean;
    public_tabs?: any;
    is_system?: boolean;
    system_type?: 'planer' | 'journal' | null;
    world_building_level?: number;
    world_building_type?: string;
    project_metadata?: any;
}

export type Project = Workspace;

export interface Folder {
    id: string;
    name: string;
    project_id: string | null;
    parent_id: string | null;
    created_at: string;
    user_id: string | null;
    pack_id?: string | null;
    collection_id?: string | null;
    display_order?: number;
    visibility?: 'public' | 'network' | 'private' | string;
}

export type { Idea, MediaType } from '../models/idea';
