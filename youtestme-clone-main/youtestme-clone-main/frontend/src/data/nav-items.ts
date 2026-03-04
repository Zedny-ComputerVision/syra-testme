export interface NavItem {
    id: number;
    path: string;
    title: string;
    icon: string;
    active: boolean;
}

export interface NavSection {
    id: string;
    title: string;
    icon: string;
    items: NavItem[];
}

// Grouped navigation matching the reference exactly
const navSections: NavSection[] = [
    {
        id: 'home',
        title: 'Home',
        icon: 'mdi:home-variant-outline',
        items: [
            { id: 999, path: '/admin/home', title: 'Home', icon: 'mdi:home-outline', active: true },
            { id: 1000, path: '/admin', title: 'Dashboard', icon: 'mdi:view-dashboard-outline', active: true },
        ],
    },
    {
        id: 'assignments',
        title: 'Assignments',
        icon: 'mdi:clipboard-check-outline',
        items: [
            { id: 2, path: '/admin/my-tests', title: 'My Tests', icon: 'mdi:file-document-outline', active: true },
            { id: 3, path: '/admin/my-surveys', title: 'My Surveys', icon: 'mdi:clipboard-text-outline', active: true },
            { id: 4, path: '/admin/training', title: 'My training courses', icon: 'mdi:school-outline', active: true },
        ],
    },
    {
        id: 'users',
        title: 'Users',
        icon: 'mdi:account-group-outline',
        items: [
            { id: 5, path: '/admin/user-profiles', title: 'User profiles', icon: 'mdi:account-outline', active: true },
            { id: 6, path: '/admin/user-groups', title: 'User groups', icon: 'mdi:account-multiple-outline', active: true },
            { id: 7, path: '/admin/roles-permissions', title: 'Roles and permissions', icon: 'mdi:shield-account-outline', active: true },
        ],
    },
    {
        id: 'tests',
        title: 'Tests',
        icon: 'mdi:file-document-edit-outline',
        items: [
            { id: 8, path: '/admin/new-test', title: 'New test', icon: 'mdi:plus-circle-outline', active: true },
            { id: 9, path: '/admin/manage-tests', title: 'Manage tests', icon: 'mdi:file-document-multiple-outline', active: true },
            { id: 10, path: '/admin/test-templates', title: 'Test templates', icon: 'mdi:file-document-outline', active: true },
            { id: 11, path: '/admin/manage-certificates', title: 'Manage certificates', icon: 'mdi:certificate-outline', active: true },
            { id: 12, path: '/admin/question-pools', title: 'Question pools', icon: 'mdi:help-circle-outline', active: true },
            { id: 13, path: '/admin/grading-scales', title: 'Grading scales', icon: 'mdi:chart-bar', active: true },
            { id: 14, path: '/admin/categories', title: 'Categories', icon: 'mdi:tag-outline', active: true },
        ],
    },
    {
        id: 'testing-center',
        title: 'Testing center',
        icon: 'mdi:clipboard-check-outline',
        items: [
            { id: 15, path: '/admin/testing-sessions', title: 'Testing sessions', icon: 'mdi:calendar-clock-outline', active: true },
            { id: 16, path: '/admin/candidates', title: 'Candidates', icon: 'mdi:account-check-outline', active: true },
        ],
    },
    {
        id: 'surveys',
        title: 'Surveys',
        icon: 'mdi:clipboard-list-outline',
        items: [
            { id: 17, path: '/admin/new-survey', title: 'New survey', icon: 'mdi:clipboard-plus-outline', active: true },
            { id: 18, path: '/admin/manage-surveys', title: 'Manage surveys', icon: 'mdi:clipboard-text-outline', active: true },
            { id: 19, path: '/admin/survey-question-pools', title: 'Question pools', icon: 'mdi:help-circle-outline', active: true },
            { id: 20, path: '/admin/survey-grading-scales', title: 'Grading scales', icon: 'mdi:chart-bar', active: true },
        ],
    },
    {
        id: 'training-courses',
        title: 'Training courses',
        icon: 'mdi:school-outline',
        items: [
            { id: 21, path: '/admin/training', title: 'Training courses', icon: 'mdi:school-outline', active: true },
        ],
    },

    {
        id: 'reporting',
        title: 'Reporting',
        icon: 'mdi:chart-box-outline',
        items: [
            { id: 23, path: '/admin/report-builder', title: 'Report builder', icon: 'mdi:file-chart-outline', active: true },
            { id: 24, path: '/admin/predefined-reports', title: 'Predefined reports', icon: 'mdi:chart-box-outline', active: true },
            { id: 25, path: '/admin/favorite-reports', title: 'My favorite reports', icon: 'mdi:star-outline', active: true },
            { id: 26, path: '/admin/scheduled-reports', title: 'Scheduled reports', icon: 'mdi:clock-outline', active: true },
            { id: 27, path: '/admin/subscribers', title: 'Subscribers', icon: 'mdi:account-multiple-outline', active: true },
        ],
    },
    {
        id: 'system',
        title: 'System',
        icon: 'mdi:cog-outline',
        items: [
            { id: 28, path: '/admin/settings', title: 'Settings and customization', icon: 'mdi:cog-outline', active: true },
            { id: 29, path: '/admin/integrations', title: 'Integrations', icon: 'mdi:puzzle-outline', active: true },
            { id: 30, path: '/admin/maintenance', title: 'Maintenance', icon: 'mdi:wrench-outline', active: true },
        ],
    },
];

// Flat list for backward compatibility
const navItems: NavItem[] = navSections.flatMap((section) => section.items);

export { navSections };
export default navItems;
