import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

interface StatCardProps {
    icon: LucideIcon;
    label: string;
    value: string | number;
    trend?: {
        value: number;
        isPositive: boolean;
    };
    color?: 'primary' | 'success' | 'warning' | 'danger';
}

const StatCard = ({ icon: Icon, label, value, trend, color = 'primary' }: StatCardProps) => {
    const colorClasses = {
        primary: 'bg-primary-50 text-primary-600',
        success: 'bg-green-50 text-green-600',
        warning: 'bg-yellow-50 text-yellow-600',
        danger: 'bg-red-50 text-red-600',
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-soft border border-slate-200 hover:shadow-soft-lg transition-shadow">
            <div className="flex items-center justify-between mb-4">
                <div className={clsx('p-3 rounded-xl', colorClasses[color])}>
                    <Icon size={24} />
                </div>
                {trend && (
                    <div className={clsx(
                        'flex items-center gap-1 text-sm font-medium',
                        trend.isPositive ? 'text-success' : 'text-danger'
                    )}>
                        {trend.isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        <span>{Math.abs(trend.value)}%</span>
                    </div>
                )}
            </div>
            <div className="text-3xl font-bold text-slate-800 mb-1">{value}</div>
            <div className="text-sm text-slate-500">{label}</div>
        </div>
    );
};

export default StatCard;
