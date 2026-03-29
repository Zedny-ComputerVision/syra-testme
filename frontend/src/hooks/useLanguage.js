import { useState, useCallback, useMemo } from 'react';

const translations = {
  en: {
    // Navigation
    home: 'Home',
    dashboard: 'Dashboard',
    exams: 'Tests',
    attempts: 'Attempts',
    schedule: 'Schedule',
    profile: 'Profile',

    // Admin navigation
    admin_exams: 'Admin Tests',
    categories: 'Categories',
    grading_scales: 'Grading Scales',
    question_pools: 'Question Pools',
    schedules: 'Schedules',
    attempt_analysis: 'Attempt Analysis',
    roles: 'Roles & Permissions',

    // Auth
    login: 'Login',
    logout: 'Logout',
    welcome: 'Welcome',
    email: 'Email',
    password: 'Password',
    sign_in: 'Sign In',
    sign_out: 'Sign Out',

    // Actions
    submit: 'Submit',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    update: 'Update',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    close: 'Close',
    add: 'Add',
    remove: 'Remove',
    search: 'Search',
    filter: 'Filter',
    reset: 'Reset',
    export: 'Export',
    import: 'Import',
    download: 'Download',
    upload: 'Upload',
    retry: 'Retry',

    // Status
    loading: 'Loading...',
    saving: 'Saving...',
    no_data: 'No data available',
    error: 'An error occurred',
    success: 'Operation successful',
    not_found: 'Page not found',

    // Exam related
    exam_name: 'Test Name',
    duration: 'Duration',
    questions: 'Questions',
    total_marks: 'Total Marks',
    start_exam: 'Start Test',
    end_exam: 'End Test',
    time_remaining: 'Time Remaining',
    question: 'Question',
    answer: 'Answer',
    score: 'Score',
    result: 'Result',
    passed: 'Passed',
    failed: 'Failed',
    pending: 'Pending',
    graded: 'Graded',

    // Table & lists
    actions: 'Actions',
    status: 'Status',
    date: 'Date',
    name: 'Name',
    description: 'Description',
    showing: 'Showing',
    of: 'of',
    page: 'Page',
    per_page: 'Per Page',
    no_results: 'No results found',

    // Theme
    light_mode: 'Light Mode',
    dark_mode: 'Dark Mode',

    // Language
    language: 'Language',
    english: 'English',
    arabic: 'Arabic',

    // Misc
    copyright: 'syra',
    all_rights_reserved: 'All rights reserved',
    version: 'Version',
  },

  ar: {
    // Navigation
    home: '\u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629',
    dashboard: '\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645',
    exams: '\u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a',
    attempts: '\u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0627\u062a',
    schedule: '\u0627\u0644\u062c\u062f\u0648\u0644',
    profile: '\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a',

    // Admin navigation
    admin_exams: '\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631\u0627\u062a',
    categories: '\u0627\u0644\u062a\u0635\u0646\u064a\u0641\u0627\u062a',
    grading_scales: '\u0645\u0642\u0627\u064a\u064a\u0633 \u0627\u0644\u062a\u0642\u064a\u064a\u0645',
    question_pools: '\u0628\u0646\u0648\u0643 \u0627\u0644\u0623\u0633\u0626\u0644\u0629',
    schedules: '\u0627\u0644\u062c\u062f\u0627\u0648\u0644',
    attempt_analysis: '\u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0627\u062a',
    roles: '\u0627\u0644\u0623\u062f\u0648\u0627\u0631 \u0648\u0627\u0644\u0635\u0644\u0627\u062d\u064a\u0627\u062a',

    // Auth
    login: '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644',
    logout: '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c',
    welcome: '\u0645\u0631\u062d\u0628\u0627',
    email: '\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a',
    password: '\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    sign_in: '\u062f\u062e\u0648\u0644',
    sign_out: '\u062e\u0631\u0648\u062c',

    // Actions
    submit: '\u0625\u0631\u0633\u0627\u0644',
    cancel: '\u0625\u0644\u063a\u0627\u0621',
    save: '\u062d\u0641\u0638',
    delete: '\u062d\u0630\u0641',
    edit: '\u062a\u0639\u062f\u064a\u0644',
    create: '\u0625\u0646\u0634\u0627\u0621',
    update: '\u062a\u062d\u062f\u064a\u062b',
    confirm: '\u062a\u0623\u0643\u064a\u062f',
    back: '\u0631\u062c\u0648\u0639',
    next: '\u0627\u0644\u062a\u0627\u0644\u064a',
    close: '\u0625\u063a\u0644\u0627\u0642',
    add: '\u0625\u0636\u0627\u0641\u0629',
    remove: '\u0625\u0632\u0627\u0644\u0629',
    search: '\u0628\u062d\u062b',
    filter: '\u062a\u0635\u0641\u064a\u0629',
    reset: '\u0625\u0639\u0627\u062f\u0629 \u062a\u0639\u064a\u064a\u0646',
    export: '\u062a\u0635\u062f\u064a\u0631',
    import: '\u0627\u0633\u062a\u064a\u0631\u0627\u062f',
    download: '\u062a\u062d\u0645\u064a\u0644',
    upload: '\u0631\u0641\u0639',
    retry: '\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629',

    // Status
    loading: '\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644...',
    saving: '\u062c\u0627\u0631\u064a \u0627\u0644\u062d\u0641\u0638...',
    no_data: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a',
    error: '\u062d\u062f\u062b \u062e\u0637\u0623',
    success: '\u062a\u0645\u062a \u0627\u0644\u0639\u0645\u0644\u064a\u0629 \u0628\u0646\u062c\u0627\u062d',
    not_found: '\u0627\u0644\u0635\u0641\u062d\u0629 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f\u0629',

    // Exam related
    exam_name: '\u0627\u0633\u0645 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631',
    duration: '\u0627\u0644\u0645\u062f\u0629',
    questions: '\u0627\u0644\u0623\u0633\u0626\u0644\u0629',
    total_marks: '\u0627\u0644\u062f\u0631\u062c\u0629 \u0627\u0644\u0643\u0644\u064a\u0629',
    start_exam: '\u0628\u062f\u0621 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631',
    end_exam: '\u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631',
    time_remaining: '\u0627\u0644\u0648\u0642\u062a \u0627\u0644\u0645\u062a\u0628\u0642\u064a',
    question: '\u0633\u0624\u0627\u0644',
    answer: '\u0625\u062c\u0627\u0628\u0629',
    score: '\u0627\u0644\u062f\u0631\u062c\u0629',
    result: '\u0627\u0644\u0646\u062a\u064a\u062c\u0629',
    passed: '\u0646\u0627\u062c\u062d',
    failed: '\u0631\u0627\u0633\u0628',
    pending: '\u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631',
    graded: '\u062a\u0645 \u0627\u0644\u062a\u0642\u064a\u064a\u0645',

    // Table & lists
    actions: '\u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a',
    status: '\u0627\u0644\u062d\u0627\u0644\u0629',
    date: '\u0627\u0644\u062a\u0627\u0631\u064a\u062e',
    name: '\u0627\u0644\u0627\u0633\u0645',
    description: '\u0627\u0644\u0648\u0635\u0641',
    showing: '\u0639\u0631\u0636',
    of: '\u0645\u0646',
    page: '\u0635\u0641\u062d\u0629',
    per_page: '\u0644\u0643\u0644 \u0635\u0641\u062d\u0629',
    no_results: '\u0644\u0627 \u062a\u0648\u062c\u062f \u0646\u062a\u0627\u0626\u062c',

    // Theme
    light_mode: '\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0641\u0627\u062a\u062d',
    dark_mode: '\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u062f\u0627\u0643\u0646',

    // Language
    language: '\u0627\u0644\u0644\u063a\u0629',
    english: '\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629',
    arabic: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629',

    // Misc
    copyright: 'syra',
    all_rights_reserved: '\u062c\u0645\u064a\u0639 \u0627\u0644\u062d\u0642\u0648\u0642 \u0645\u062d\u0641\u0648\u0638\u0629',
    version: '\u0627\u0644\u0625\u0635\u062f\u0627\u0631',
  },
};

/**
 * Language hook with EN/AR support.
 *
 * Usage:
 *   const { lang, t, toggle, dir } = useLanguage();
 *   <h1>{t('welcome')}</h1>
 */
export default function useLanguage() {
  const [lang, setLang] = useState(() => {
    try {
      const stored = localStorage.getItem('syra_lang');
      if (stored && translations[stored]) return stored;
    } catch {
      // Ignore storage errors
    }
    return 'en';
  });

  /** Translate a key, falling back to the key itself if not found */
  const t = useCallback(
    (key) => {
      return translations[lang]?.[key] ?? translations.en?.[key] ?? key;
    },
    [lang]
  );

  /** Toggle between English and Arabic */
  const toggle = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'en' ? 'ar' : 'en';
      try {
        localStorage.setItem('syra_lang', next);
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  /** Text direction for the current language */
  const dir = useMemo(() => (lang === 'ar' ? 'rtl' : 'ltr'), [lang]);

  return { lang, t, toggle, dir };
}
