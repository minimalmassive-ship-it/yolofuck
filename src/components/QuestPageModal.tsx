/**
 * QuestPageModal.tsx — yolofuck
 * Quest center where template challenges can be viewed and activated.
 */

import React, { useState } from 'react';
import { Target, X, CheckCircle, Flame, Clock, Award, Play } from 'lucide-react';
import './QuestPageModal.css';

interface QuestTemplate {
    id: string;
    title: string;
    description: string;
    rules: string[];
    durationDays: number;
    badge: string;
    status: 'available' | 'active' | 'completed';
}

const INITIAL_QUESTS: QuestTemplate[] = [
    {
        id: 'quest_speed_takes',
        title: 'Micro-Takes Sprint',
        description: 'Record 10 takes of 5 seconds, 10 takes of 1 second, and 10 takes of 0.5s throughout your day.',
        rules: [
            '10 takes @ 5 seconds max',
            '10 takes @ 1 second',
            '10 takes @ 0.5 seconds'
        ],
        durationDays: 1,
        badge: 'Lightning Takes',
        status: 'active'
    },
    {
        id: 'quest_seven_day_streak',
        title: '7-Day Non-Stop Sequence',
        description: 'Complete at least 5 takes every single day for 7 consecutive days without skipping.',
        rules: [
            'Min. 5 takes daily',
            '7 days in a row',
            'Compilation auto-published to timeline'
        ],
        durationDays: 7,
        badge: 'Consistency Beast',
        status: 'available'
    },
    {
        id: 'quest_silent_cinema',
        title: 'Silent Cinematic Day',
        description: 'Record 15 atmospheric takes with pure visual action and no spoken words.',
        rules: [
            '15 ambient vertical takes',
            'No voice transcription detected',
            'High cinematic contrast'
        ],
        durationDays: 1,
        badge: 'Silent Director',
        status: 'available'
    }
];

interface QuestPageModalProps {
    onClose: () => void;
}

export const QuestPageModal: React.FC<QuestPageModalProps> = ({ onClose }) => {
    const [quests, setQuests] = useState<QuestTemplate[]>(INITIAL_QUESTS);

    const handleToggleQuest = (id: string) => {
        setQuests(prev => prev.map(q => {
            if (q.id === id) {
                return {
                    ...q,
                    status: q.status === 'active' ? 'available' : 'active'
                };
            }
            return q;
        }));
    };

    return (
        <div className="yolofuck-quest-modal-backdrop" onClick={onClose}>
            <div className="yolofuck-quest-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="yolofuck-quest-header">
                    <div className="yolofuck-quest-title-group">
                        <Target size={22} color="var(--yolo-lime, #c8f72c)" />
                        <h2>Quest Center</h2>
                    </div>
                    <button
                        type="button"
                        className="yolofuck-quest-close-btn"
                        onClick={onClose}
                        title="Close Quest Center"
                    >
                        <X size={20} />
                    </button>
                </div>

                <p className="yolofuck-quest-desc">
                    Activate take-challenge templates with custom limits, time constraints, and multi-day sequence goals.
                </p>

                <div className="yolofuck-quest-list">
                    {quests.map(quest => {
                        const isActive = quest.status === 'active';
                        return (
                            <div key={quest.id} className={`yolofuck-quest-card ${isActive ? 'is-active' : ''}`}>
                                <div className="yolofuck-quest-card-top">
                                    <div className="yolofuck-quest-card-info">
                                        <div className="yolofuck-quest-badge-tag">
                                            <Award size={12} />
                                            <span>{quest.badge}</span>
                                        </div>
                                        <h3>{quest.title}</h3>
                                        <p>{quest.description}</p>
                                    </div>

                                    <button
                                        type="button"
                                        className={`yolofuck-quest-action-btn ${isActive ? 'active' : ''}`}
                                        onClick={() => handleToggleQuest(quest.id)}
                                    >
                                        {isActive ? (
                                            <>
                                                <CheckCircle size={14} />
                                                <span>Active</span>
                                            </>
                                        ) : (
                                            <>
                                                <Play size={14} fill="currentColor" />
                                                <span>Activate</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                <div className="yolofuck-quest-rules-box">
                                    {quest.rules.map((rule, idx) => (
                                        <div key={idx} className="yolofuck-quest-rule-item">
                                            <span className="yolofuck-quest-bullet" />
                                            <span>{rule}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default QuestPageModal;
