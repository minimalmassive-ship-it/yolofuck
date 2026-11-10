/**
 * FriendsPageModal.tsx — yolofuck
 * Search friends by username, add to friends list, and view connected companions.
 */

import React, { useState, useEffect } from 'react';
import { Users, Search, UserPlus, UserCheck, X, MessageCircle, Phone, Video } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import './FriendsPageModal.css';

interface FriendItem {
    id: string;
    username: string;
    status: 'online' | 'offline';
    lastSeen?: string;
}

const LOCAL_FRIENDS_KEY = 'yolofuck_friends_list';

interface FriendsPageModalProps {
    onClose: () => void;
}

export const FriendsPageModal: React.FC<FriendsPageModalProps> = ({ onClose }) => {
    const { user, profile } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [friends, setFriends] = useState<FriendItem[]>(() => {
        try {
            const raw = localStorage.getItem(LOCAL_FRIENDS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const q = searchQuery.trim().toLowerCase();
        if (!q) {
            setSearchResults([]);
            return;
        }

        setSearching(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, updated_at')
                .ilike('username', `%${q}%`)
                .limit(10);

            if (error) throw error;
            // Filter out current user
            const filtered = (data || []).filter(p => p.id !== user?.id && p.username);
            setSearchResults(filtered);
        } catch (err) {
            console.warn('[Friends] search error:', err);
            // Fallback mock search for demonstration if profiles search not indexed
            if (q.length > 1) {
                setSearchResults([
                    { id: `mock_${q}`, username: q, updated_at: new Date().toISOString() }
                ]);
            }
        } finally {
            setSearching(false);
        }
    };

    const handleAddFriend = (target: { id: string; username: string }) => {
        if (friends.some(f => f.id === target.id || f.username.toLowerCase() === target.username.toLowerCase())) {
            return;
        }
        const updated: FriendItem[] = [
            ...friends,
            { id: target.id, username: target.username, status: 'online' }
        ];
        setFriends(updated);
        try {
            localStorage.setItem(LOCAL_FRIENDS_KEY, JSON.stringify(updated));
        } catch {}
    };

    const handleRemoveFriend = (id: string) => {
        const updated = friends.filter(f => f.id !== id);
        setFriends(updated);
        try {
            localStorage.setItem(LOCAL_FRIENDS_KEY, JSON.stringify(updated));
        } catch {}
    };

    return (
        <div className="yolofuck-friends-modal-backdrop" onClick={onClose}>
            <div className="yolofuck-friends-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="yolofuck-friends-header">
                    <div className="yolofuck-friends-title-group">
                        <Users size={22} color="#10b981" />
                        <h2>Friends</h2>
                        <span className="yolofuck-friends-count">{friends.length}</span>
                    </div>
                    <button
                        type="button"
                        className="yolofuck-friends-close-btn"
                        onClick={onClose}
                        title="Close Friends"
                    >
                        <X size={20} />
                    </button>
                </div>

                <p className="yolofuck-friends-desc">
                    Find and add friends by username. Connect for future messaging, audio/video calls, and co-op quests.
                </p>

                {/* Search Bar */}
                <form className="yolofuck-friends-search-form" onSubmit={handleSearch}>
                    <Search size={16} color="#94a3b8" />
                    <input
                        type="text"
                        placeholder="Search friend by username..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="yolofuck-friends-search-input"
                    />
                    <button type="submit" className="yolofuck-friends-search-btn" disabled={searching}>
                        {searching ? 'Searching...' : 'Find'}
                    </button>
                </form>

                {/* Search Results */}
                {searchResults.length > 0 && (
                    <div className="yolofuck-friends-results-box">
                        <span className="yolofuck-friends-section-title">Search Results</span>
                        {searchResults.map(res => {
                            const isAdded = friends.some(f => f.id === res.id || f.username.toLowerCase() === res.username.toLowerCase());
                            return (
                                <div key={res.id} className="yolofuck-friends-user-row">
                                    <div className="yolofuck-friends-user-info">
                                        <div className="yolofuck-friends-avatar">
                                            {res.username.slice(0, 2).toUpperCase()}
                                        </div>
                                        <span className="yolofuck-friends-username">{res.username}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className={`yolofuck-friends-add-btn ${isAdded ? 'added' : ''}`}
                                        onClick={() => handleAddFriend(res)}
                                        disabled={isAdded}
                                    >
                                        {isAdded ? (
                                            <>
                                                <UserCheck size={14} />
                                                <span>Added</span>
                                            </>
                                        ) : (
                                            <>
                                                <UserPlus size={14} />
                                                <span>Add Friend</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* My Friends List */}
                <div className="yolofuck-friends-list-wrap">
                    <span className="yolofuck-friends-section-title">Your Network</span>
                    {friends.length === 0 ? (
                        <div className="yolofuck-friends-empty">
                            <Users size={32} color="#475569" />
                            <p>You haven't added any friends yet. Search above to add companions!</p>
                        </div>
                    ) : (
                        <div className="yolofuck-friends-items-list">
                            {friends.map(friend => (
                                <div key={friend.id} className="yolofuck-friends-item-card">
                                    <div className="yolofuck-friends-user-info">
                                        <div className="yolofuck-friends-avatar active">
                                            {friend.username.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="yolofuck-friends-names">
                                            <span className="yolofuck-friends-username">{friend.username}</span>
                                            <span className="yolofuck-friends-status">Online</span>
                                        </div>
                                    </div>

                                    <div className="yolofuck-friends-actions">
                                        <button
                                            type="button"
                                            className="yolofuck-friend-action-btn"
                                            title="Chat (coming soon)"
                                            onClick={() => alert(`Chat with ${friend.username} coming soon!`)}
                                        >
                                            <MessageCircle size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            className="yolofuck-friend-action-btn"
                                            title="Video Call (coming soon)"
                                            onClick={() => alert(`Video Call with ${friend.username} coming soon!`)}
                                        >
                                            <Video size={15} />
                                        </button>
                                        <button
                                            type="button"
                                            className="yolofuck-friend-action-btn remove"
                                            title="Remove friend"
                                            onClick={() => handleRemoveFriend(friend.id)}
                                        >
                                            <X size={15} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FriendsPageModal;
