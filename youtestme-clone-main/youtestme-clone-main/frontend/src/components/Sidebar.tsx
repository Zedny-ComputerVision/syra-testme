import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
    Home,
    ClipboardCheck,
    Users,
    FileText,
    Monitor,
    Edit3,
    GraduationCap,
    BarChart2,
    Settings,
    ChevronDown,
    ChevronRight,
    LogOut
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';

const SidebarItem = ({ icon: Icon, label, path, children }: any) => {
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(path === '/tests'); // Keep assignments open if on tests page
    const isActive = location.pathname === path;
    const hasChildren = children && children.length > 0;

    return (
        <div>
            <div
                className={clsx(
                    "flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors group",
                    (isActive || (hasChildren && isOpen)) ? "bg-[#1e293b] text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}
                onClick={() => hasChildren && setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <Icon size={20} />
                    <span className="font-medium text-[0.9rem]">{label}</span>
                </div>
                {hasChildren && (
                    isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                )}
            </div>

            {hasChildren && isOpen && (
                <div className="bg-[#0f172a] py-1">
                    {children.map((child: any) => (
                        <NavLink
                            key={child.path}
                            to={child.path}
                            className={({ isActive }) =>
                                clsx(
                                    "flex items-center pl-11 py-2 text-[0.85rem] transition-colors",
                                    isActive ? "text-white font-medium" : "text-slate-400 hover:text-white"
                                )
                            }
                        >
                            {child.label}
                        </NavLink>
                    ))}
                </div>
            )}
        </div>
    );
};

const Sidebar = () => {
    const navigate = useNavigate();
    const { logout } = useAuth();

    const sections = [
        { icon: Home, label: 'Home', path: '/dashboard' },
        {
            icon: ClipboardCheck,
            label: 'Assignments',
            path: '/assignments',
            children: [
                { label: 'My tests', path: '/tests' },
                { label: 'My surveys', path: '/surveys' },
                { label: 'My training courses', path: '/training' },
            ]
        },
        {
            icon: Users,
            label: 'Users',
            path: '/admin/users',
            children: [
                { label: 'All Users', path: '/admin/users' },
                { label: 'Groups', path: '/admin/groups' },
            ]
        },
        { icon: FileText, label: 'Tests', path: '/admin/manage-tests' },
        { icon: Monitor, label: 'Testing center', path: '/admin/testing-center' },
        {
            icon: Edit3,
            label: 'Surveys',
            path: '/admin/surveys-group',
            children: [
                { label: 'New survey', path: '/admin/new-survey' },
                { label: 'Manage surveys', path: '/admin/manage-surveys' },
                { label: 'Question pools', path: '/admin/survey-question-pools' },
                { label: 'Grading scales', path: '/admin/survey-grading-scales' },
            ]
        },
        {
            icon: GraduationCap,
            label: 'Training courses',
            path: '/admin/training-group',
            children: [
                { label: 'Training courses', path: '/admin/training' },
            ]
        },
        { icon: BarChart2, label: 'Reporting', path: '/admin/reports' },
        { icon: Settings, label: 'System', path: '/admin/settings' },
    ];

    return (
        <aside className="w-64 bg-[#0f172a] text-white h-screen flex flex-col fixed left-0 top-0 z-50 overflow-y-auto border-r border-slate-800">
            <div className="p-4 flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-white rounded flex items-center justify-center">
                    <img src="/vite.svg" alt="logo" className="w-6 h-6" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[0.7rem] uppercase tracking-wider text-slate-400 font-bold">The Council</span>
                    <span className="text-[0.75rem] font-medium leading-tight">National Occupational Safety</span>
                </div>
            </div>

            <nav className="flex-1">
                {sections.map((section) => (
                    <SidebarItem key={section.label} {...section} />
                ))}
            </nav>

            <div className="p-4 border-t border-slate-800 mt-auto">
                <button
                    onClick={() => {
                        logout();
                        navigate('/login');
                    }}
                    className="flex items-center gap-3 px-4 py-2 w-full text-slate-400 hover:text-danger hover:bg-danger/10 transition-colors rounded-lg"
                >
                    <LogOut size={18} />
                    <span className="font-medium text-sm">Logout</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
