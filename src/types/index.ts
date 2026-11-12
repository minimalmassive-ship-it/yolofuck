/**
 * Yolofuck Types
 * Clean, dedicated type definitions for Yolofuck Video Journal
 */

export interface Project {
    id: string;
    name: string;
    created_at?: string;
    user_id?: string | null;
    color?: string;
    description?: string;
    is_public?: boolean;
    is_system?: boolean;
    system_type?: 'journal' | string | null;
}
