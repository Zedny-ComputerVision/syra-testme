import { useEffect, useRef, useState } from 'react';
import { useTestWizard } from '../context/TestWizardContext';
import { useParams } from 'react-router-dom';

const DEBOUNCE_DELAY = 2000; // 2 seconds

export const useAutoSave = () => {
    const { state } = useTestWizard();
    const { id } = useParams();
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastStateJson = useRef<string>(JSON.stringify(state));

    useEffect(() => {
        if (!id) return;

        const currentStateJson = JSON.stringify(state);
        if (currentStateJson === lastStateJson.current) return;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        setSaving(true);
        timeoutRef.current = setTimeout(async () => {
            try {
                // For now, simpler payload to match what backend expects in saveWizardState (partial updates)
                // We send the whole state properties
                const backendPayload: any = {
                    info: state.info,
                    settings_new: {
                        ...state.generalSettings,
                        ...state.proctoring,
                        // flatten or nest as per backend TestSettings model?
                        // Backend TestSettings is one big table.
                        // We should map frontend sub-objects to the flat TestSettings fields.

                        // Mapping General
                        template: state.generalSettings.template,
                        totalDuration: state.generalSettings.duration ? state.generalSettings.duration * 60 : null,
                        durationType: state.generalSettings.durationType,
                        pageFormat: state.generalSettings.pageFormat,
                        deliveryPreference: state.generalSettings.deliveryPreference,

                        // Mapping Proctoring (if stored in settings) or separate?
                        // Schema has fields like 'enableDontKnow', etc.
                        // Let's assume we map them properties.
                        // For MVP/Proto, I will just send what I have and ensure backend accepts it.
                        // But backend `saveWizardState` uses `...settings_new` spread content.
                        // So I need to construct `settings_new` to match `TestSettings` model.

                        allowContinuation: state.retake.allowContinuation,
                        allowRetaking: state.retake.allowRetaking,
                        retakeLimit: state.retake.attempts,
                        retakeCount: state.retake.attemptCount,
                        timeBetweenAttempts: 0, // calc from state.retake.timeBetween

                        reportLifespan: state.security.reportLifespan,
                        autoLogout: state.security.autoLogout,
                        requireUpdateProfile: state.security.updateProfile,
                        browserLockdown: state.security.browserLockdown,

                        networkAccess: state.networkAccess.access
                    },
                    method_new: {
                        type: state.method.selectionMode,
                        generatorConfig: state.method.generatorConfig
                    },
                    grading: state.grading,
                    versions: state.versions
                };

                // Normalize payload to match backend TestSettings schema
                const toSeconds = (t: { days: number; hours: number; minutes: number }) =>
                    (t.days * 24 * 60 * 60) + (t.hours * 60 * 60) + (t.minutes * 60);
                const durationTypeMap = (val?: string) => {
                    if (val === 'one_question') return 'question';
                    return 'test';
                };
                backendPayload.info = {
                    name: state.info.name,
                    description: state.info.description,
                    label: state.info.label,
                    instructions: state.info.instructions,
                    acknowledgment: state.info.acknowledgment,
                    categoryId: state.info.categoryId,
                    image: state.info.image,
                    status: state.info.status,
                    creationType: state.info.creationType
                };
                backendPayload.settings_new = {
                    template: state.generalSettings.template,
                    totalDuration: state.generalSettings.duration ? state.generalSettings.duration * 60 : null,
                    durationType: durationTypeMap(state.generalSettings.durationType),
                    pageFormat: state.generalSettings.pageFormat,
                    deliveryPreference: state.generalSettings.deliveryPreference,
                    showReport: state.personalReport.showReport,
                    reportContent: state.personalReport.reportContent,
                    showMetadata: !state.generalSettings.hideMetadata,
                    hideAssignmentMetadata: state.generalSettings.hideMetadata,
                    allowContinuation: state.retake.allowContinuation,
                    allowRetaking: state.retake.allowRetaking,
                    retakeLimit: state.retake.attempts,
                    retakeCount: state.retake.attemptCount,
                    timeBetweenAttempts: toSeconds(state.retake.timeBetween),
                    reportLifespan: state.security.reportLifespan,
                    autoLogout: state.security.autoLogout,
                    requireUpdateProfile: state.security.updateProfile,
                    browserLockdown: state.security.browserLockdown,
                    networkAccess: state.networkAccess.access
                };
                backendPayload.grading = {
                    passMark: state.grading.passMark,
                    passMarkType: state.grading.passMarkType,
                    requireProctoring: state.grading.requirePositiveProctoring,
                    gradingScaleId: state.grading.gradingScaleId
                };
                const extra = {
                    availability: state.availability,
                    accessControl: state.accessControl,
                    certificateRules: state.certificate.conditions,
                    certificateDelivery: state.certificate.delivery
                };
                const response = await fetch(`http://localhost:3000/api/tests/${id}/wizard`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...backendPayload, extra })
                });

                if (response.ok) {
                    setLastSaved(new Date());
                    lastStateJson.current = currentStateJson;
                }
            } catch (error) {
                console.error('Auto-save failed:', error);
            } finally {
                setSaving(false);
            }
        }, DEBOUNCE_DELAY);

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [state, id]);

    return { saving, lastSaved };
};
