import { supabase } from '../lib/supabase';
import type { Idea } from '../models/idea';

// Tokenization disabled for yolofuck

export const ideaController = {
    /**
     * Uploads a media file (audio/video) to Supabase Storage
     */
    async uploadMedia(file: Blob, path: string): Promise<string | null> {
        const { data, error } = await supabase.storage
            .from('recordings')
            .upload(path, file);

        if (error) {
            console.error('Error uploading media:', error);
            throw new Error(error?.message || String(error));
        }
        return data.path;
    },

    /**
     * Get public URL for a media file
     */
    getPublicMediaUrl(path: string): string {
        const { data } = supabase.storage
            .from('recordings')
            .getPublicUrl(path);
        return data.publicUrl;
    },

    /**
     * Saves an idea (text or media metadata) to the database
     */
    async saveIdea(idea: Partial<Idea>): Promise<Idea | null> {
        let insertData: any = null;

        const sanitizedIdea: any = {
            level: 1,
            is_public: false,
            visibility: 'private',
            media_type: 'text',
            is_tokenized: true,
            ...idea
        };

        if (!sanitizedIdea.slug) {
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const cleanSlug = (sanitizedIdea.title || 'idea').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
            sanitizedIdea.slug = `${cleanSlug || 'idea'}-${randomSuffix}`;
        }

        const { data, error } = await supabase
            .from('ideas')
            .insert([sanitizedIdea])
            .select();

        if (error) {
            console.warn('[ideaController] Primary save failed, trying fallback without foreign keys:', error);
            const fallbackIdea = { ...sanitizedIdea, project_id: null, folder_id: null };
            const { data: retryData, error: retryError } = await supabase
                .from('ideas')
                .insert([fallbackIdea])
                .select();

            if (retryError) {
                console.error('Error saving idea:', retryError);
                throw new Error(retryError?.message || String(retryError));
            }
            insertData = retryData?.[0];
        } else {
            insertData = data?.[0];
        }

        if (!insertData) {
            throw new Error('No idea returned from database insert');
        }

        // Tokenization not needed in yolofuck

        return insertData;
    },

    /**
     * Fetches accessible projects for a specific user
     */
    async getProjects(userId: string) {
        if (!userId) return [];

        // 1. Projects I own
        const { data: ownedProjects, error: ownedErr } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', userId);

        if (ownedErr) {
            console.error('Error fetching owned projects:', ownedErr);
            return [];
        }

        // 2. Projects where I am a team member
        const { data: teamMemberships } = await supabase
            .from('team_members')
            .select('team_id')
            .eq('user_id', userId);

        let teamProjectIds: string[] = [];
        if (teamMemberships && teamMemberships.length > 0) {
            const teamIds = teamMemberships.map(tm => tm.team_id);
            const { data: teamsData } = await supabase
                .from('teams')
                .select('project_id')
                .in('id', teamIds);

            if (teamsData) {
                teamProjectIds = teamsData.map(t => t.project_id).filter(Boolean) as string[];
            }
        }

        const filterSystem = (list: any[]) => list.filter(p => !p.is_system && !p.system_type && p.name !== 'Journal' && p.name !== 'Planer' && p.name !== 'Planner');

        if (teamProjectIds.length === 0) {
            return filterSystem(ownedProjects || []);
        }

        // 3. Combine and deduplicate
        const allProjectIds = Array.from(new Set([
            ...(ownedProjects || []).map(p => p.id),
            ...teamProjectIds
        ]));

        const { data: finalProjects, error: finalErr } = await supabase
            .from('projects')
            .select('*')
            .in('id', allProjectIds)
            .order('created_at', { ascending: false });

        if (finalErr) {
            console.error('Error fetching final project list:', finalErr);
            return filterSystem(ownedProjects || []);
        }

        return filterSystem(finalProjects || []);
    },

    /**
     * Create a new project
     */
    async createProject(name: string, userId?: string | null, color: string = '#FFD700'): Promise<any> {
        const { data, error } = await supabase
            .from('projects')
            .insert([{ name, user_id: userId || null, color }])
            .select()
            .single();

        if (error) {
            console.error('Error creating project:', error);
            throw new Error(error?.message || String(error));
        }
        return data;
    },

    /**
     * Fetches all folders for a specific project
     */
    async getFoldersByProject(projectId: string) {
        const { data, error } = await supabase
            .from('folders')
            .select('*')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching folders:', error);
            return [];
        }
        return data;
    },

    /**
     * Fetches all root folders for a user (folders with no project_id and no pack_id)
     */
    async getRootFolders(userId: string, environmentId?: string | null) {
        let query = supabase
            .from('folders')
            .select('*')
            .is('project_id', null)
            .is('pack_id', null);

        if (environmentId) {
            query = query.eq('environment_id', environmentId);
        } else {
            query = query.eq('user_id', userId);
        }

        let { data, error } = await query.order('created_at', { ascending: false });

        if (error && (error.code === '42703' || error.message?.includes('environment_id'))) {
            if (environmentId) {
                return [];
            }
            const fallbackNoEnv = await supabase
                .from('folders')
                .select('*')
                .is('project_id', null)
                .is('pack_id', null)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            data = fallbackNoEnv.data;
            error = fallbackNoEnv.error;
        }

        if (error) {
            let legacyQuery = supabase
                .from('folders')
                .select('*')
                .is('project_id', null)
                .is('collection_id', null);

            if (environmentId) {
                legacyQuery = legacyQuery.eq('environment_id', environmentId);
            } else {
                legacyQuery = legacyQuery.eq('user_id', userId);
            }

            const fallback = await legacyQuery.order('created_at', { ascending: false });
            if (fallback.error && (fallback.error.code === '42703' || fallback.error.message?.includes('environment_id'))) {
                if (environmentId) return [];
                const plainLegacy = await supabase
                    .from('folders')
                    .select('*')
                    .is('project_id', null)
                    .is('collection_id', null)
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false });
                data = plainLegacy.data;
                error = plainLegacy.error;
            } else {
                data = fallback.data;
                error = fallback.error;
            }
        }

        if (error) {
            console.error('Error fetching root folders:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Fetches ALL folders for a user across all projects and packs
     */
    async getAllUserFolders(userId: string, environmentId?: string | null) {
        let query = supabase
            .from('folders')
            .select('*')
            .is('pack_id', null);

        if (environmentId) {
            query = query.eq('environment_id', environmentId);
        } else {
            query = query.eq('user_id', userId);
        }

        let { data, error } = await query.order('created_at', { ascending: false });

        if (error && (error.code === '42703' || error.message?.includes('environment_id'))) {
            if (environmentId) return [];
            const fallbackNoEnv = await supabase
                .from('folders')
                .select('*')
                .is('pack_id', null)
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            data = fallbackNoEnv.data;
            error = fallbackNoEnv.error;
        }

        if (error) {
            let legacyQuery = supabase
                .from('folders')
                .select('*')
                .is('collection_id', null);

            if (environmentId) {
                legacyQuery = legacyQuery.eq('environment_id', environmentId);
            } else {
                legacyQuery = legacyQuery.eq('user_id', userId);
            }

            const fallback = await legacyQuery.order('created_at', { ascending: false });
            if (fallback.error && (fallback.error.code === '42703' || fallback.error.message?.includes('environment_id'))) {
                if (environmentId) return [];
                const plainLegacy = await supabase
                    .from('folders')
                    .select('*')
                    .is('collection_id', null)
                    .eq('user_id', userId)
                    .order('created_at', { ascending: false });
                data = plainLegacy.data;
                error = plainLegacy.error;
            } else {
                data = fallback.data;
                error = fallback.error;
            }
        }

        if (error) {
            console.error('Error fetching all user folders:', error);
            return [];
        }
        return data || [];
    },

    /**
     * Create a new folder (can be within a project or a root collection)
     */
    async createFolder(name: string, projectId: string | null, parentId: string | null = null, environmentId?: string | null): Promise<any> {
        const { data: { user } } = await supabase.auth.getUser();

        // Only include parent_id if it's set (column may not exist in all environments)
        const insertData: Record<string, any> = {
            name,
            project_id: projectId,
            user_id: user?.id || null
        };
        if (parentId !== null) {
            insertData.parent_id = parentId;
        }
        if (environmentId !== undefined) {
            insertData.environment_id = environmentId;
        }

        let { data, error } = await supabase
            .from('folders')
            .insert([insertData])
            .select()
            .single();

        if (error && (error.code === '42703' || error.message?.includes('environment_id'))) {
            delete insertData.environment_id;
            const retry = await supabase
                .from('folders')
                .insert([insertData])
                .select()
                .single();
            data = retry.data;
            error = retry.error;
        }

        if (error) {
            console.error('Error creating folder:', error);
            throw new Error(error?.message || String(error));
        }
        return data;
    },

    /**
     * Update a folder
     */
    async updateFolder(id: string, updates: any): Promise<any> {
        const { data, error } = await supabase
            .from('folders')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating folder:', error);
            throw new Error(error?.message || String(error));
        }
        return data;
    },

    /**
     * Update an existing idea
     */
    async updateIdea(id: string, updates: Partial<Idea>): Promise<Idea | null> {
        let payload: any = { ...updates };
        let { data, error } = await supabase
            .from('ideas')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error && (error.code === 'PGRST204' || error.code === '42703' || error.message?.includes('column'))) {
            // Check if column mismatch for pack_id vs collection_id
            if ('collection_id' in payload && !('pack_id' in payload)) {
                payload = { ...payload, pack_id: payload.collection_id };
                delete payload.collection_id;
                const retry = await supabase.from('ideas').update(payload).eq('id', id).select().single();
                data = retry.data;
                error = retry.error;
            } else if ('pack_id' in payload && !('collection_id' in payload)) {
                payload = { ...payload, collection_id: payload.pack_id };
                delete payload.pack_id;
                const retry = await supabase.from('ideas').update(payload).eq('id', id).select().single();
                data = retry.data;
                error = retry.error;
            } else if ('collection_id' in payload && 'pack_id' in payload) {
                // If both were provided and query failed, try pack_id only
                delete payload.collection_id;
                let retry = await supabase.from('ideas').update(payload).eq('id', id).select().single();
                if (retry.error) {
                    // Try collection_id only
                    payload = { ...updates };
                    delete payload.pack_id;
                    retry = await supabase.from('ideas').update(payload).eq('id', id).select().single();
                }
                data = retry.data;
                error = retry.error;
            }
        }

        if (error) {
            console.error('Error updating idea:', error);
            throw new Error(error?.message || String(error));
        }
        return data;
    },

    /**
     * Update transcription for an idea
     */
    async updateTranscription(
        ideaId: string,
        transcription: string,
        status: 'completed' | 'failed' = 'completed'
    ): Promise<void> {
        await this.updateIdea(ideaId, {
            content: transcription,
            transcription_status: status
        });
    },

    /**
     * Fetch all ideas with optional filtering by project or folder
     */
    async getIdeas(filters?: { projectId?: string | null; folderId?: string; userId?: string }) {
        let query = supabase
            .from('ideas')
            .select('*, idea_images(public_url, display_order)')
            .order('created_at', { ascending: false });

        if (filters?.projectId !== undefined) {
            if (filters.projectId === null) {
                query = query.is('project_id', null);
            } else {
                query = query.eq('project_id', filters.projectId);
            }
        }
        if (filters?.folderId) {
            query = query.eq('folder_id', filters.folderId);
        }
        if (filters?.userId) {
            query = query.eq('user_id', filters.userId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching ideas:', error);
            return [];
        }
        return data;
    },

    /**
     * Assign an idea to a project and/or folder
     */
    async assignIdeaToFolder(ideaId: string, projectId?: string | null, folderId?: string | null): Promise<void> {
        try {
            await this.updateIdea(ideaId, {
                project_id: projectId,
                folder_id: folderId,
                updated_at: new Date().toISOString()
            });
        } catch (error: any) {
            // If folder_id column is missing (PGRST204), try updating only project_id
            if (error?.code === 'PGRST204' || error?.message?.includes('folder_id')) {
                console.warn('folder_id column missing, falling back to project_id update only');
                await this.updateIdea(ideaId, {
                    project_id: projectId,
                    updated_at: new Date().toISOString()
                });
            } else {
                throw new Error(error?.message || String(error));
            }
        }
    },

    /**
     * Delete an idea
     */
    async deleteIdea(id: string): Promise<void> {
        const { error } = await supabase
            .from('ideas')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting idea:', error);
            throw new Error(error?.message || String(error));
        }
    },

    /**
     * Delete a project
     */
    async deleteProject(id: string): Promise<void> {
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting project:', error);
            throw new Error(error?.message || String(error));
        }
    },

    /**
     * Convert a project to a pack/folder preserving the full folder/idea structure.
     * Creates a "Deleted - {name}" root folder and migrates everything into it.
     */
    async convertProjectToPack(projectId: string, projectName: string): Promise<void> {

        // 0. Check if the project has any ideas
        const { data: projectIdeas } = await supabase
            .from('ideas')
            .select('id')
            .eq('project_id', projectId)
            .limit(1);

        const hasIdeas = projectIdeas && projectIdeas.length > 0;

        if (!hasIdeas) {
            // If no ideas, we don't need a review folder. Just clean up everything.
            await supabase.from('folders').delete().eq('project_id', projectId);
            
            const { data: linkedTeams } = await supabase
                .from('teams')
                .select('id')
                .eq('project_id', projectId);

            if (linkedTeams && linkedTeams.length > 0) {
                const teamIds = linkedTeams.map((t: any) => t.id);
                await supabase.from('team_members').delete().in('team_id', teamIds);
                await supabase.from('teams').delete().in('id', teamIds);
            }

            await this.deleteProject(projectId);
            return;
        }

        // 1. Create a root "Deleted - <name>" folder (no project_id, user-owned)
        const rootFolder = await this.createFolder(`Deleted - ${projectName}`, null, null);
        if (!rootFolder) throw new Error('Failed to create archive folder');

        // 2. Fetch all sub-folders belonging to this project
        const { data: projectFolders, error: folderFetchErr } = await supabase
            .from('folders')
            .select('id')
            .eq('project_id', projectId);

        if (folderFetchErr) {
            console.error('Error fetching project folders:', folderFetchErr);
            throw folderFetchErr;
        }

        // Re-parent each project sub-folder under the root archive folder
        if (projectFolders && projectFolders.length > 0) {
            const subFolderIds = projectFolders.map((f: any) => f.id);

            // Try with parent_id first; fall back if column doesn't exist
            const { error: reparentErr } = await supabase
                .from('folders')
                .update({ project_id: null, parent_id: rootFolder.id })
                .in('id', subFolderIds);

            if (reparentErr) {
                // Column parent_id may not exist â€” just clear project_id
                await supabase
                    .from('folders')
                    .update({ project_id: null })
                    .in('id', subFolderIds);
            }
        }

        // 3a. Move loose ideas (not in any sub-folder) into the root archive folder
        await supabase
            .from('ideas')
            .update({ project_id: null, folder_id: rootFolder.id })
            .eq('project_id', projectId)
            .is('folder_id', null);

        // 3b. Clear project_id from ideas that are already in sub-folders
        await supabase
            .from('ideas')
            .update({ project_id: null })
            .eq('project_id', projectId);

        // 4. Delete linked teams and their members
        const { data: linkedTeams } = await supabase
            .from('teams')
            .select('id')
            .eq('project_id', projectId);

        if (linkedTeams && linkedTeams.length > 0) {
            const teamIds = linkedTeams.map((t: any) => t.id);
            await supabase.from('team_members').delete().in('team_id', teamIds);
            await supabase.from('teams').delete().in('id', teamIds);
        }

        // 5. Delete the project
        await this.deleteProject(projectId);
    },

    async convertProjectToCollection(projectId: string, projectName: string): Promise<void> {
        return this.convertProjectToPack(projectId, projectName);
    }
};

