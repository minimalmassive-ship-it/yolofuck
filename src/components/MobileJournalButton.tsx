import React from 'react';
import { Plus } from 'lucide-react';
import './MobileJournalButton.css';

interface MobileJournalButtonProps {
    isActive?: boolean;
    onClick: () => void;
}

export const MobileJournalButton: React.FC<MobileJournalButtonProps> = ({ 
    isActive = false, 
    onClick 
}) => {
    return (
        <div 
            className={`mobile-journal-btn ${isActive ? 'active' : ''}`}
            onClick={onClick}
            title="Add Journal"
            data-action="journal-add"
        >
            {/* Neumorphic capsule backdrop mound — identical to create FAB */}
            <div className="journal-capsule-backdrop" />

            {/* The circular capsule containing the green plus button */}
            <div className="journal-capsule">
                <div 
                    className="journal-capsule-icon journal-capsule-main"
                    title="Add Journal"
                >
                    <Plus size={28} color="#00FF00" strokeWidth={2.4} />
                </div>
            </div>
        </div>
    );
};

export default MobileJournalButton;
