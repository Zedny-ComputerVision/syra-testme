
import { Calendar, Clock, MapPin, Users, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

const Sessions = () => {
    const sessions = [
        {
            id: 1,
            testName: "Senior Frontend Developer Assessment",
            date: "2025-10-25",
            time: "10:00 AM - 11:30 AM",
            location: "Online Proctoring",
            seats: { available: 5, total: 20 },
            status: "open",
            deadline: "2025-10-24 23:59"
        },
        {
            id: 2,
            testName: "Senior Frontend Developer Assessment",
            date: "2025-10-26",
            time: "02:00 PM - 03:30 PM",
            location: "Online Proctoring",
            seats: { available: 0, total: 20 },
            status: "full",
            deadline: "2025-10-25 23:59"
        },
        {
            id: 3,
            testName: "Backend Architecture & System Design",
            date: "2025-11-01",
            time: "09:00 AM - 11:00 AM",
            location: "Online Proctoring",
            seats: { available: 12, total: 15 },
            status: "open",
            deadline: "2025-10-31 23:59"
        }
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Available Sessions</h1>
                <p className="text-slate-500 mt-1">Book a seat for your upcoming examinations</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-6 py-4 font-semibold text-slate-700">Test Name</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Date & Time</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Location</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Availability</th>
                                <th className="px-6 py-4 font-semibold text-slate-700">Deadline</th>
                                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sessions.map((session) => (
                                <tr key={session.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-slate-800">{session.testName}</div>
                                        <div className="text-xs text-slate-500 mt-1">ID: #{session.id.toString().padStart(4, '0')}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <Calendar size={16} className="text-slate-400" />
                                            <span>{session.date}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                                            <Clock size={16} className="text-slate-400" />
                                            <span>{session.time}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <MapPin size={16} className="text-slate-400" />
                                            <span>{session.location}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <Users size={16} className={clsx(
                                                session.seats.available === 0 ? "text-danger" : "text-slate-400"
                                            )} />
                                            <span className={clsx(
                                                "font-medium",
                                                session.seats.available === 0 ? "text-danger" : "text-success"
                                            )}>
                                                {session.seats.available} / {session.seats.total} seats
                                            </span>
                                        </div>
                                        {session.seats.available < 5 && session.seats.available > 0 && (
                                            <div className="text-xs text-warning mt-1 font-medium">Filling up fast!</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <AlertCircle size={16} className="text-slate-400" />
                                            <span>{session.deadline}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {session.status === 'open' ? (
                                            <button className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">
                                                Book Seat
                                            </button>
                                        ) : (
                                            <button disabled className="bg-slate-100 text-slate-400 px-4 py-2 rounded-lg font-medium cursor-not-allowed text-sm">
                                                Full
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Sessions;
