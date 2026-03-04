export const rootPaths = {
    homeRoot: 'admin',
    authRoot: 'authentication',
    errorRoot: 'error',
};

export default {
    home: `/${rootPaths.homeRoot}`,
    login: `/${rootPaths.authRoot}/login`,
    signup: `/${rootPaths.authRoot}/sign-up`,
    dashboard: `/${rootPaths.homeRoot}/dashboard`,

    // Assignments
    myTests: `/${rootPaths.homeRoot}/my-tests`,
    mySurveys: `/${rootPaths.homeRoot}/my-surveys`,

    // Users
    userProfiles: `/${rootPaths.homeRoot}/user-profiles`,
    userGroups: `/${rootPaths.homeRoot}/user-groups`,
    rolesPermissions: `/${rootPaths.homeRoot}/roles-permissions`,

    // Tests
    newTest: `/${rootPaths.homeRoot}/new-test`,
    manageTests: `/${rootPaths.homeRoot}/manage-tests`,
    editTestSettings: `/${rootPaths.homeRoot}/tests/:testId/settings/:section`,
    testTemplates: `/${rootPaths.homeRoot}/test-templates`,
    manageCertificates: `/${rootPaths.homeRoot}/manage-certificates`,
    questionPools: `/${rootPaths.homeRoot}/question-pools`,
    gradingScales: `/${rootPaths.homeRoot}/grading-scales`,
    categories: `/${rootPaths.homeRoot}/categories`,

    // Testing Center
    testingSessions: `/${rootPaths.homeRoot}/testing-sessions`,
    candidates: `/${rootPaths.homeRoot}/candidates`,

    // Surveys
    newSurvey: `/${rootPaths.homeRoot}/new-survey`,
    manageSurveys: `/${rootPaths.homeRoot}/manage-surveys`,
    surveyQuestionPools: `/${rootPaths.homeRoot}/survey-question-pools`,
    surveyGradingScales: `/${rootPaths.homeRoot}/survey-grading-scales`,

    // Reporting
    reportBuilder: `/${rootPaths.homeRoot}/report-builder`,
    predefinedReports: `/${rootPaths.homeRoot}/predefined-reports`,
    favoriteReports: `/${rootPaths.homeRoot}/favorite-reports`,
    scheduledReports: `/${rootPaths.homeRoot}/scheduled-reports`,
    subscribers: `/${rootPaths.homeRoot}/subscribers`,

    // System
    settings: `/${rootPaths.homeRoot}/settings`,
    integrations: `/${rootPaths.homeRoot}/integrations`,
    maintenance: `/${rootPaths.homeRoot}/maintenance`,

    404: `/${rootPaths.errorRoot}/404`,
};
