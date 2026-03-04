import { createContext, useContext, useState, ReactNode, useMemo } from 'react';

// Define state interfaces based on wizard steps
export interface TestInfo {
    name: string;
    label: string;
    description: string;
    categoryId: number | null;
    tags: string[];
    image: string;
    status: string;
    creationType: string;
    instructions?: string;
    acknowledgment?: string;
    completionMessage?: string;
}

export interface InstructionSettings {
    requireAcknowledgment: boolean;
    showInstructions: boolean;
    showDuration: boolean;
    showPassingMark: boolean;
    showQuestionCount: boolean;
    showRetakes: boolean;
}

export interface GeneralSettings {
    template: string;
    duration: number | null; // Core
    durationType: string;
    pageFormat: string;
    deliveryPreference: string;
    attempts: number | null; // Core (attemptLimit)
    // New fields
    hideMetadata: boolean;
    hideFinishButton: boolean;
    enforceSectionOrder: boolean;
    calculatorType: string;
    shuffleQuestions: boolean;
    shuffleAnswers: boolean;
    enableDontKnow?: boolean;
    enableFeedback?: boolean;
    enableNotes?: boolean;
    requireAllAnswers?: boolean;
    disableBackwards?: boolean;
    disableDeselect?: boolean;
}

export interface ProctoringSettings {
    enabled: boolean;
    recordVideo: boolean;
    recordAudio: boolean;
    recordScreen: boolean;
    face: boolean;
    multiFace: boolean;
    gaze: boolean;
    mouth: boolean;
    object: boolean;
    audio: boolean;
}

export interface RetakeSettings {
    allowContinuation: boolean;
    allowRetaking: boolean;
    enableFreeReschedules: boolean;
    attempts: string; // 'unlimited' or 'limited'
    attemptCount: number;
    timeBetween: { days: number; hours: number; minutes: number };
}

export interface SecuritySettings {
    reportLifespan: boolean;
    autoLogout: boolean;
    updateProfile: boolean;
    browserLockdown: boolean;
}

export interface AvailabilitySettings {
    start: string | null;
    end: string | null;
    timeZone: string;
    unlimited: boolean;
}

export interface AccessControl {
    isPublic: boolean;
    accessCode: string;
}

export interface ResultValiditySettings {
    enabled: boolean;
    value: number;
    unit: 'days' | 'months' | 'years';
}

export interface PersonalReportSettings {
    showReport: string;
    accessDuration: boolean;
    reportContent: string;
    displayScore: boolean;
    displaySubScores: boolean;
    displaySectionScores: boolean;
    displayPassingPercentage: boolean;
    displayEmployeeId: boolean;
    displaySummaryScore: boolean;
    displayScoreDescription: boolean;
    showPassedFailed: boolean;
    showCorrectAnswers: 'immediate' | 'delayed' | 'never';
    displayQuestionScore: boolean;
    displayNotes: boolean;
    displayUserGroups: boolean;
    showTimestamps: boolean;
    showRoundedScores: boolean;
    exportExcel: boolean;
    exportPdf: boolean;
    downloadScoreReport: boolean;
    downloadDeficiencyReport: boolean;
}

export interface NetworkAccess {
    access: 'all' | 'internal';
}

export interface CertificateOptions {
    style?: string;
    orientation?: 'portrait' | 'landscape';
    title?: string;
    subtitle?: string;
    companyName?: string;
    idText?: string;
    description?: string;
}

export interface CertificateSettings {
    enabled: boolean;
    certificateId: number | null;
    passingScore: number | null;
    options: CertificateOptions;
    conditions?: {
        onlyIfPassed: boolean;
        onlyIfCleanProctoring: boolean;
        onlyFirstAttempt: boolean;
    };
    delivery?: 'download' | 'email' | 'approval';
}

export interface TestVersion {
    id?: number;
    name: string;
    uniqueCode?: string;
    status: string;
    questions: QuestionItem[];
}

export interface GeneratorConfig {
    mode: 'difficulty' | 'categories';
    totalQuestions: number;
    difficultyDistribution?: { easy: number; medium: number; hard: number };
    categories?: number[]; // IDs
}

export interface MethodSettings {
    method: 'linear' | 'random';
    randomize: boolean; // Core
    selectionMode: 'manual' | 'generator';
    generatorConfig?: GeneratorConfig;
}

export interface GradingSettings {
    gradingScaleId: number | null;
    passMarkType: 'percentage' | 'points';
    passMark: number;
    passMarkInclusive: boolean;
    requirePositiveProctoring: boolean;
}

export interface QuestionItem {
    id?: number;
    text: string;
    type: string;
    options: string[]; // Or Json
    answer: any;
    points: number;
    correct_option?: number; // Legacy/MCQ specific
    sectionId?: string;
}

export interface CouponItem {
    id: string;
    code: string;
    discountType: 'percentage' | 'amount';
    amount: number;
    status: 'active' | 'used' | 'expired';
    expirationDate: string;
    usedBy?: string;
    dateUsed?: string;
    createdBy: string;
}

export interface LanguageSettings {
    languagePreference: string;
    allowChange: boolean;
    translations: Array<{ id: string; language: string }>;
}

export interface AttachmentSettings {
    files: Array<{ id: string; name: string; type: string; size: string }>;
}

export interface ExternalAttributes {
    externalId: string;
}

interface TestWizardState {
    info: TestInfo;
    instructions: InstructionSettings;
    generalSettings: GeneralSettings;
    proctoring: ProctoringSettings;
    retake: RetakeSettings;
    security: SecuritySettings;
    availability: AvailabilitySettings;
    accessControl: AccessControl;
    resultValidity: ResultValiditySettings;
    personalReport: PersonalReportSettings;
    networkAccess: NetworkAccess;
    certificate: CertificateSettings;
    method: MethodSettings;
    grading: GradingSettings;

    // Versions support
    versions: TestVersion[];
    activeVersionIndex: number;

    // Legacy support (optional, can be removed if fully migrated)
    questions: QuestionItem[];

    coupons: CouponItem[];
    language: LanguageSettings;
    attachments: AttachmentSettings;
    externalAttributes: ExternalAttributes;
}

interface TestWizardContextType {
    state: TestWizardState;
    updateInfo: (data: Partial<TestInfo>) => void;
    updateInstructions: (data: Partial<InstructionSettings>) => void;
    updateGeneralSettings: (data: Partial<GeneralSettings>) => void;
    updateProctoring: (data: Partial<ProctoringSettings>) => void;
    updateRetake: (data: Partial<RetakeSettings>) => void;
    updateSecurity: (data: Partial<SecuritySettings>) => void;
    updateAvailability: (data: Partial<AvailabilitySettings>) => void;
    updateAccessControl: (data: Partial<AccessControl>) => void;
    updateResultValidity: (data: Partial<ResultValiditySettings>) => void;
    updatePersonalReport: (data: Partial<PersonalReportSettings>) => void;
    updateNetworkAccess: (data: Partial<NetworkAccess>) => void;
    updateCertificate: (data: Partial<CertificateSettings>) => void;
    updateMethod: (data: Partial<MethodSettings>) => void;
    updateGrading: (data: Partial<GradingSettings>) => void;

    // Versioning
    setVersions: (versions: TestVersion[]) => void;
    setActiveVersionIndex: (index: number) => void;

    setQuestions: (questions: QuestionItem[]) => void;
    setCoupons: (coupons: CouponItem[]) => void;
    updateLanguage: (data: Partial<LanguageSettings>) => void;
    updateAttachments: (data: Partial<AttachmentSettings>) => void;
    updateExternalAttributes: (data: Partial<ExternalAttributes>) => void;
    resetWizard: () => void;
    loadState: (newState: Partial<TestWizardState>) => void;
}

const initialInfo: TestInfo = {
    name: '',
    label: '',
    description: '',
    categoryId: null,
    tags: [],
    image: '',
    status: 'available',
    creationType: 'with_sections'
};

// ... keep existing initial settings ...
const initialInstructions: InstructionSettings = {
    requireAcknowledgment: true,
    showInstructions: true,
    showDuration: true,
    showPassingMark: true,
    showQuestionCount: true,
    showRetakes: false
};

const initialGeneralSettings: GeneralSettings = {
    template: 'blank',
    duration: 60,
    durationType: 'all_questions',
    pageFormat: 'one_page',
    deliveryPreference: 'online',
    attempts: 1,
    hideMetadata: true,
    hideFinishButton: true,
    enforceSectionOrder: true,
    calculatorType: 'none',
    shuffleQuestions: false,
    shuffleAnswers: false,
    enableDontKnow: false,
    enableFeedback: false,
    enableNotes: false,
    requireAllAnswers: false,
    disableBackwards: false,
    disableDeselect: false
};

const initialProctoring: ProctoringSettings = {
    enabled: true,
    recordVideo: false,
    recordAudio: false,
    recordScreen: false,
    face: true,
    multiFace: true,
    gaze: true,
    mouth: true,
    object: true,
    audio: true
};

const initialRetake: RetakeSettings = {
    allowContinuation: false,
    allowRetaking: false,
    enableFreeReschedules: false,
    attempts: 'unlimited',
    attemptCount: 1,
    timeBetween: { days: 0, hours: 0, minutes: 0 }
};

const initialSecurity: SecuritySettings = {
    reportLifespan: false,
    autoLogout: true,
    updateProfile: false,
    browserLockdown: true
};

const initialAvailability: AvailabilitySettings = {
    start: null,
    end: null,
    timeZone: 'UTC',
    unlimited: true
};

const initialAccessControl: AccessControl = {
    isPublic: true,
    accessCode: ''
};

const initialResultValidity: ResultValiditySettings = {
    enabled: false,
    value: 12,
    unit: 'months'
};

const initialPersonalReport: PersonalReportSettings = {
    showReport: 'after_approval',
    accessDuration: false,
    reportContent: 'score_only',
    displayScore: true,
    displaySubScores: true,
    displaySectionScores: true,
    displayPassingPercentage: true,
    displayEmployeeId: false,
    displaySummaryScore: true,
    displayScoreDescription: false,
    showPassedFailed: true,
    showCorrectAnswers: 'never',
    displayQuestionScore: true,
    displayNotes: false,
    displayUserGroups: false,
    showTimestamps: true,
    showRoundedScores: false,
    exportExcel: false,
    exportPdf: false,
    downloadScoreReport: true,
    downloadDeficiencyReport: false
};

const initialNetworkAccess: NetworkAccess = {
    access: 'all'
};

const initialCertificate: CertificateSettings = {
    enabled: false,
    certificateId: null,
    passingScore: 70,
    options: {},
    conditions: {
        onlyIfPassed: true,
        onlyIfCleanProctoring: false,
        onlyFirstAttempt: false
    },
    delivery: 'download'
};

const initialMethod: MethodSettings = {
    method: 'linear',
    randomize: false,
    selectionMode: 'manual',
    generatorConfig: {
        mode: 'difficulty',
        totalQuestions: 0
    }
};

const initialGrading: GradingSettings = {
    gradingScaleId: null,
    passMarkType: 'percentage',
    passMark: 60,
    passMarkInclusive: true,
    requirePositiveProctoring: false
};

const initialLanguage: LanguageSettings = {
    languagePreference: '',
    allowChange: false,
    translations: []
};

const initialAttachments: AttachmentSettings = {
    files: []
};

const initialExternalAttributes: ExternalAttributes = {
    externalId: ''
};

const TestWizardContext = createContext<TestWizardContextType | undefined>(undefined);

export const TestWizardProvider = ({ children }: { children: ReactNode }) => {
    const [state, setState] = useState<TestWizardState>({
        info: initialInfo,
        instructions: initialInstructions,
        generalSettings: initialGeneralSettings,
        proctoring: initialProctoring,
        retake: initialRetake,
        security: initialSecurity,
        resultValidity: initialResultValidity,
        personalReport: initialPersonalReport,
        networkAccess: initialNetworkAccess,
        certificate: initialCertificate,
        method: initialMethod,
        grading: initialGrading,
        availability: initialAvailability,
        accessControl: initialAccessControl,

        versions: [{ name: 'Test version 1', status: 'draft', questions: [] }],
        activeVersionIndex: 0,

        questions: [],
        coupons: [],
        language: initialLanguage,
        attachments: initialAttachments,
        externalAttributes: initialExternalAttributes
    });

    const actions = useMemo(() => {
        const createUpdater = <T extends object>(key: keyof TestWizardState) => (data: Partial<T>) => {
            setState(prev => {
                const current = prev[key] as unknown as object;
                const next = Object.assign({}, current, data);
                return { ...prev, [key]: next } as TestWizardState;
            });
        };

        return {
            updateInfo: createUpdater<TestInfo>('info'),
            updateInstructions: createUpdater<InstructionSettings>('instructions'),
            updateGeneralSettings: createUpdater<GeneralSettings>('generalSettings'),
            updateProctoring: createUpdater<ProctoringSettings>('proctoring'),
            updateRetake: createUpdater<RetakeSettings>('retake'),
            updateSecurity: createUpdater<SecuritySettings>('security'),
            updateAvailability: createUpdater<AvailabilitySettings>('availability'),
            updateAccessControl: createUpdater<AccessControl>('accessControl'),
            updateResultValidity: createUpdater<ResultValiditySettings>('resultValidity'),
            updatePersonalReport: createUpdater<PersonalReportSettings>('personalReport'),
            updateNetworkAccess: createUpdater<NetworkAccess>('networkAccess'),
            updateCertificate: createUpdater<CertificateSettings>('certificate'),
            updateMethod: createUpdater<MethodSettings>('method'),
            updateGrading: createUpdater<GradingSettings>('grading'),

            setVersions: (versions: TestVersion[]) => setState(prev => ({ ...prev, versions })),
            setActiveVersionIndex: (index: number) => setState(prev => ({ ...prev, activeVersionIndex: index })),

            setQuestions: (questions: QuestionItem[]) => setState(prev => ({ ...prev, questions })),
            setCoupons: (coupons: CouponItem[]) => setState(prev => ({ ...prev, coupons })),
            updateLanguage: createUpdater<LanguageSettings>('language'),
            updateAttachments: createUpdater<AttachmentSettings>('attachments'),
            updateExternalAttributes: createUpdater<ExternalAttributes>('externalAttributes'),
            resetWizard: () => setState({
                info: initialInfo,
                instructions: initialInstructions,
                generalSettings: initialGeneralSettings,
                proctoring: initialProctoring,
                retake: initialRetake,
                security: initialSecurity,
                resultValidity: initialResultValidity,
                personalReport: initialPersonalReport,
                networkAccess: initialNetworkAccess,
                certificate: initialCertificate,
                method: initialMethod,
                grading: initialGrading,
                availability: initialAvailability,
                accessControl: initialAccessControl,
                versions: [{ name: 'Test version 1', status: 'draft', questions: [] }],
                activeVersionIndex: 0,
                questions: [],
                coupons: [],
                language: initialLanguage,
                attachments: initialAttachments,
                externalAttributes: initialExternalAttributes
            }),
            loadState: (newState: Partial<TestWizardState>) => setState(prev => ({ ...prev, ...newState }))
        };
    }, []);

    const value = useMemo(() => ({
        state,
        ...actions
    }), [state, actions]);

    return (
        <TestWizardContext.Provider value={value}>
            {children}
        </TestWizardContext.Provider>
    );
};

export const useTestWizard = () => {
    const context = useContext(TestWizardContext);
    if (!context) {
        throw new Error('useTestWizard must be used within a TestWizardProvider');
    }
    return context;
};
