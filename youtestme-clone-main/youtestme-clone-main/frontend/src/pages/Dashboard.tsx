import { FileText, TrendingUp, Award, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import StatCard from '../components/StatCard';

const Dashboard = () => {
    const navigate = useNavigate();
    const [testsCount, setTestsCount] = useState(0);
    const [attemptsCount, setAttemptsCount] = useState(0);
    const [completedAttempts, setCompletedAttempts] = useState(0);
    const [recentTests, setRecentTests] = useState<Array<{ id: number; name: string; status: string; deadline: string }>>([]);

    const loadStats = async () => {
        try {
            const res = await fetch('/api/reports/stats');
            if (!res || !res.ok) throw new Error('Failed to fetch stats');
            const data = await res.json();
            setTestsCount(Number(data.tests || 0));
            setAttemptsCount(Number(data.attempts || 0));
            setCompletedAttempts(Number(data.completedAttempts || 0));
        } catch {
            // Fallback mock data
            setTestsCount(12);
            setAttemptsCount(45);
            setCompletedAttempts(38);
        }
    };

    const loadRecentTests = async () => {
        try {
            const res = await fetch('/api/tests');
            if (!res || !res.ok) throw new Error('Failed to fetch tests');
            const data = await res.json();
            if (!Array.isArray(data)) return;
            const items = data.slice(0, 3).map((t: any) => {
                let rules: any = {};
                try {
                    rules = typeof t.rules === 'string' ? JSON.parse(t.rules) : (t.rules || {});
                } catch { }

                const deadline = rules.initialSession?.endDate
                    ? `Deadline: ${new Date(rules.initialSession.endDate).toLocaleDateString()}`
                    : 'No deadline';

                return {
                    id: Number(t.id),
                    name: String(t.name || 'Untitled'),
                    status: String(t.status || 'available'),
                    deadline
                };
            });
            setRecentTests(items);
        } catch {
            // Fallback mock data
            setRecentTests([
                { id: 1, name: 'General Science', status: 'available', deadline: 'No deadline' },
                { id: 2, name: 'Math 101', status: 'available', deadline: 'No deadline' },
                { id: 3, name: 'History Quiz', status: 'closed', deadline: 'No deadline' }
            ]);
        }
    };

    useEffect(() => {
        loadStats();
        loadRecentTests();
    }, []);

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Welcome Section */}
            <div className="bg-[#0284c7] rounded-2xl p-8 text-white shadow-soft-lg">
                <h1 className="text-3xl font-bold mb-2">Welcome back, John! 👋</h1>
                <p className="text-blue-100">You have 2 pending tests and 1 upcoming session.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="animate-slide-up" style={{ animationDelay: `0ms` }}>
                    <StatCard icon={FileText} label="Available Tests" value={String(testsCount)} trend={{ value: 0, isPositive: true }} color="primary" />
                </div>
                <div className="animate-slide-up" style={{ animationDelay: `100ms` }}>
                    <StatCard icon={Clock} label="Pending Attempts" value={String(Math.max(0, attemptsCount - completedAttempts))} color="warning" />
                </div>
                <div className="animate-slide-up" style={{ animationDelay: `200ms` }}>
                    <StatCard icon={TrendingUp} label="Average Score" value={"85%"} trend={{ value: 0, isPositive: true }} color="success" />
                </div>
                <div className="animate-slide-up" style={{ animationDelay: `300ms` }}>
                    <StatCard icon={Award} label="Certificates Earned" value={String(completedAttempts)} trend={{ value: 0, isPositive: true }} color="primary" />
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <button
                    onClick={() => navigate('/tests')}
                    className="bg-white p-6 rounded-2xl shadow-soft border border-slate-200 hover:shadow-soft-lg hover:-translate-y-1 transition-all text-left group"
                >
                    <div className="w-12 h-12 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <FileText size={24} />
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-1">Browse Tests</h3>
                    <p className="text-sm text-slate-500">View all available examinations</p>
                </button>

                <button
                    onClick={() => navigate('/sessions')}
                    className="bg-white p-6 rounded-2xl shadow-soft border border-slate-200 hover:shadow-soft-lg hover:-translate-y-1 transition-all text-left group"
                >
                    <div className="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Clock size={24} />
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-1">Book Session</h3>
                    <p className="text-sm text-slate-500">Schedule your exam time</p>
                </button>

                <button
                    onClick={() => navigate('/equipment')}
                    className="bg-white p-6 rounded-2xl shadow-soft border border-slate-200 hover:shadow-soft-lg hover:-translate-y-1 transition-all text-left group"
                >
                    <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Award size={24} />
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-1">Equipment Check</h3>
                    <p className="text-sm text-slate-500">Test your camera and microphone</p>
                </button>
            </div>

            {/* Recent Tests */}
            <div className="bg-white rounded-2xl shadow-soft border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-slate-800">Recent Tests</h2>
                    <button
                        onClick={() => navigate('/tests')}
                        className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                    >
                        View All →
                    </button>
                </div>
                <div className="space-y-4">
                    {recentTests.map((test) => (
                        <div
                            key={test.id}
                            className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => navigate('/tests', { state: { searchQuery: test.name } })}
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-lg flex items-center justify-center">
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <h3 className="font-medium text-slate-800">{test.name}</h3>
                                    <p className="text-sm text-slate-500">{test.deadline}</p>
                                </div>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${test.status === 'available'
                                ? 'bg-success/10 text-success'
                                : 'bg-warning/10 text-warning'
                                }`}>
                                {test.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
