import React from 'react';

interface StatusBadgeProps {
  label: string;
  status: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  pulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  status,
  pulse = false,
}) => {
  const getStatusClass = () => {
    switch (status) {
      case 'success':
        return 'status-badge-success';
      case 'warning':
        return 'status-badge-warning';
      case 'danger':
        return 'status-badge-danger';
      case 'info':
        return 'status-badge-info';
      default:
        return 'status-badge-neutral';
    }
  };

  return (
    <div className={`status-badge ${getStatusClass()}`}>
      <span className={`status-dot ${pulse ? 'status-dot-pulse' : ''}`} />
      <span className="status-label">{label}</span>
    </div>
  );
};
