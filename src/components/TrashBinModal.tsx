/**
 * TrashBinModal.tsx — yolofuck
 * Displays trash bin with deleted clips in a single row sequence just like Journal,
 * showing date above time on each film card, with options to delete single or purge all.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, X, RefreshCw, AlertTriangle, Video, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getTrashClips, removeSingleTrashClip, clearAllTrashClips, TrashClipItem } from '../lib/journalTrashStorage';
import './TrashBinModal.css';

interface TrashBinModalProps {
    onClose: () => void;
}

export const TrashBinModal: React.FC<TrashBinModalProps> = ({ onClose }) => {
    const { user } = useAuth();
    const [trashItems, setTrashItems] = useState<TrashClipItem[]>([]);
    const [activeClip, setActiveClip] = useState<TrashClipItem | null>(null);

    const loadTrash = useCallback(() => {
        setTrashItems(getTrashClips(user?.id));
    }, [user?.id]);

    useEffect(() => {
        loadTrash();
        window.addEventListener('memcut_trash_updated', loadTrash);
        window.addEventListener('yolofuck_trash_updated', loadTrash);
        return () => {
            window.removeEventListener('memcut_trash_updated', loadTrash);
            window.removeEventListener('yolofuck_trash_updated', loadTrash);
        };
    }, [loadTrash]);

    const handleDeleteSingle = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        removeSingleTrashClip(id, user?.id);
    };

    const handleClearAll = () => {
        if (trashItems.length === 0) return;
        if (window.confirm('Permanently delete all videos in trash bin? They cannot be recovered.')) {
            clearAllTrashClips(user?.id);
        }
    };

    return (
        <div className="yolofuck-trash-modal-backdrop" onClick={onClose}>
            <div className="yolofuck-trash-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="yolofuck-trash-header">
                    <div className="yolofuck-trash-title-group">
                        <Trash2 size={20} color="#f87171" />
                        <h2>Trash Bin</h2>
                        <span className="yolofuck-trash-count">
                            {trashItems.length} {trashItems.length === 1 ? 'film' : 'films'}
                        </span>
                    </div>

                    <div className="yolofuck-trash-header-actions">
                        {trashItems.length > 0 && (
                            <button
                                type="button"
                                className="yolofuck-trash-purge-all-btn"
                                onClick={handleClearAll}
                                title="Permanently delete all"
                            >
                                <Trash2 size={14} />
                                <span>Delete All</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="yolofuck-trash-close-btn"
                            onClick={onClose}
                            title="Close Trash Bin"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Subtitle description */}
                <p className="yolofuck-trash-desc">
                    Videos deleted from your Journal or Shared timeline. You can review them here or delete them forever.
                </p>

                {/* Main Content: Single 1-line row like Journal */}
                {trashItems.length === 0 ? (
                    <div className="yolofuck-trash-empty">
                        <div className="yolofuck-trash-empty-icon">
                            <Trash2 size={36} color="#475569" />
                        </div>
                        <h3>Trash Bin is Empty</h3>
                        <p>No deleted films found. Deleted items will be preserved here.</p>
                    </div>
                ) : (
                    <div className="yolofuck-trash-row-wrapper">
                        <div className="yolofuck-trash-strip">
                            {trashItems.map((item, idx) => {
                                const isPlaying = activeClip?.id === item.id;
                                const delDate = item.deleted_at ? item.deleted_at.slice(0, 10).split('-').reverse().join('-') : item.clip_date;
                                const delTime = item.deleted_at ? item.deleted_at.slice(11, 16) : '00:00';

                                return (
                                    <div
                                        key={item.id}
                                        className={`yolofuck-trash-film-card ${isPlaying ? 'is-active' : ''}`}
                                        onClick={() => setActiveClip(isPlaying ? null : item)}
                                        title={`Deleted ${delDate} at ${delTime}`}
                                    >
                                        {isPlaying ? (
                                            <video
                                                src={item.clip_url}
                                                autoPlay
                                                loop
                                                playsInline
                                                muted={false}
                                                className="yolofuck-trash-film-media"
                                            />
                                        ) : item.thumbnail_url ? (
                                            <img
                                                src={item.thumbnail_url}
                                                alt="Deleted Take"
                                                className="yolofuck-trash-film-media"
                                            />
                                        ) : (
                                            <video
                                                src={item.clip_url}
                                                className="yolofuck-trash-film-media"
                                                preload="metadata"
                                                muted
                                            />
                                        )}

                                        {/* Top Centered Sequence Number */}
                                        <div className="yolofuck-trash-film-top-idx">
                                            <span>{idx + 1}</span>
                                        </div>

                                        {/* Bottom Overlay: Date Above Time */}
                                        <div className="yolofuck-trash-film-bottom-meta">
                                            <span className="yolofuck-trash-meta-date">{delDate}</span>
                                            <span className="yolofuck-trash-meta-time">{delTime}</span>
                                        </div>

                                        {/* Hover/Tap Delete Button to remove permanently */}
                                        <button
                                            type="button"
                                            className="yolofuck-trash-item-purge-btn"
                                            onClick={(e) => handleDeleteSingle(item.id, e)}
                                            title="Delete permanently"
                                        >
                                            <Trash2 size={13} color="#f87171" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TrashBinModal;
