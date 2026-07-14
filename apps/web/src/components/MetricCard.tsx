import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number | null;
  unit?: string;
  icon: LucideIcon;
  subtext?: string;
  status?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  loading?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  icon: Icon,
  subtext,
  status = 'default',
  loading = false,
}) => {
  const getStatusClass = () => {
    switch (status) {
      case 'success':
        return 'metric-card-success';
      case 'warning':
        return 'metric-card-warning';
      case 'danger':
        return 'metric-card-danger';
      case 'info':
        return 'metric-card-info';
      default:
        return 'metric-card-default';
    }
  };

  return (
    <div className={`metric-card ${getStatusClass()} ${loading ? 'metric-card-loading' : ''}`}>
      <div className="metric-card-header">
        <span className="metric-card-title">{title}</span>
        <Icon className="metric-card-icon" size={18} />
      </div>
      <div className="metric-card-body">
        {loading ? (
          <span className="metric-card-value-loading">--</span>
        ) : (
          <span className="metric-card-value">
            {value !== null && value !== undefined ? value : 'N/A'}
          </span>
        )}
        {unit && !loading && value !== null && value !== undefined && (
          <span className="metric-card-unit">{unit}</span>
        )}
      </div>
      {subtext && (
        <div className="metric-card-footer">
          <span className="metric-card-subtext">{subtext}</span>
        </div>
      )}
    </div>
  );
};
