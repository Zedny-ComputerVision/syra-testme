import { useMemo, useState } from 'react';

interface Question {
    id?: number;
    question_text: string;
    option_a: string;
    option_b: string;
    option_c?: string;
    option_d?: string;
    correct_answer: 'A' | 'B' | 'C' | 'D';
    points: number;
    order_index: number;
}

interface TestFormProps {
    initialData?: {
        id?: number;
        name?: string;
        description?: string;
        status?: string;
        image?: string;
        sensitivity?: number;
        rules?: any;
        questions?: Question[];
    };
    onClose: () => void;
    onSubmit: (data: Partial<any>) => void;
}

const TestForm = ({ initialData = {}, onClose, onSubmit }: TestFormProps) => {
    const RESTRICTION_CHOICES = [
        'Require Fullscreen',
        'Disable Right Click',
        'Camera Required',
        'Prohibited Objects Detection',
        'Talking Detection',
        'Disallow Alt+Tab',
        'Disable Copy/Paste',
        'Microphone Required',
        'Multiple Faces Detection'
    ];

    const parsedInitialRules = useMemo(() => {
        try {
            return typeof initialData.rules === 'string' ? JSON.parse(initialData.rules) : initialData.rules || {};
        } catch {
            return {};
        }
    }, [initialData.rules]);

    const [formData, setFormData] = useState({
        name: initialData.name || '',
        description: initialData.description || '',
        status: initialData.status || 'draft',
        image: initialData.image || '',
        sensitivity: initialData.sensitivity ?? 1,
        rules: JSON.stringify(parsedInitialRules, null, 2)
    });

    const [selectedRestrictions, setSelectedRestrictions] = useState<string[]>(
        Array.isArray((parsedInitialRules as any).restrictions) ? (parsedInitialRules as any).restrictions : []
    );

    const [questions, setQuestions] = useState<Question[]>(() => {
        if ((initialData as any).questions && Array.isArray((initialData as any).questions)) {
            return (initialData as any).questions;
        }
        return [];
    });

    const [showQuestionForm, setShowQuestionForm] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleAddQuestion = () => {
        setEditingQuestion({
            question_text: '',
            option_a: '',
            option_b: '',
            option_c: '',
            option_d: '',
            correct_answer: 'A',
            points: 1,
            order_index: questions.length
        });
        setShowQuestionForm(true);
    };

    const handleSaveQuestion = (question: Question) => {
        setQuestions([...questions, question]);
        setShowQuestionForm(false);
        setEditingQuestion(null);
    };

    const handleDeleteQuestion = (index: number) => {
        setQuestions(questions.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const baseRules = (() => {
            try { return JSON.parse(formData.rules as any); } catch { return {}; }
        })();
        const payload = {
            ...formData,
            rules: { ...baseRules, restrictions: selectedRestrictions },
            questions
        };
        onSubmit(payload);
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem'
        }} onClick={onClose}>
            <div style={{
                background: 'white',
                borderRadius: '16px',
                maxWidth: '900px',
                width: '100%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    position: 'sticky',
                    top: 0,
                    background: 'white',
                    zIndex: 10,
                    borderRadius: '16px 16px 0 0'
                }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0, color: '#111827' }}>
                        {initialData.name ? 'Edit Test' : 'Create New Test'}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: '#6b7280',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '6px',
                            width: '32px',
                            height: '32px'
                        }}
                    >
                        ×
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ padding: '24px' }}>
                        {/* Basic Info Section */}
                        <div style={{ marginBottom: '32px' }}>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '16px', color: '#374151' }}>
                                Basic Information
                            </h3>
                            <div style={{ display: 'grid', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                        Test Name *
                                    </label>
                                    <input
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        required
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '8px',
                                            fontSize: '0.875rem',
                                            outline: 'none',
                                            transition: 'all 0.2s',
                                            boxSizing: 'border-box'
                                        }}
                                        placeholder="Enter test name"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                        Description
                                    </label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                        rows={3}
                                        style={{
                                            width: '100%',
                                            padding: '10px 12px',
                                            border: '1px solid #d1d5db',
                                            borderRadius: '8px',
                                            fontSize: '0.875rem',
                                            outline: 'none',
                                            resize: 'vertical',
                                            fontFamily: 'inherit',
                                            boxSizing: 'border-box'
                                        }}
                                        placeholder="Describe what this test covers..."
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                            Status
                                        </label>
                                        <select
                                            name="status"
                                            value={formData.status}
                                            onChange={handleChange as any}
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                border: '1px solid #d1d5db',
                                                borderRadius: '8px',
                                                fontSize: '0.875rem',
                                                outline: 'none',
                                                background: 'white',
                                                cursor: 'pointer',
                                                boxSizing: 'border-box'
                                            }}
                                        >
                                            <option value="draft">Draft</option>
                                            <option value="active">Active</option>
                                            <option value="archived">Archived</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                            Sensitivity (0-5)
                                        </label>
                                        <input
                                            type="number"
                                            name="sensitivity"
                                            min={0}
                                            max={5}
                                            value={formData.sensitivity}
                                            onChange={handleChange}
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                border: '1px solid #d1d5db',
                                                borderRadius: '8px',
                                                fontSize: '0.875rem',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                            Image URL
                                        </label>
                                        <input
                                            name="image"
                                            value={formData.image}
                                            onChange={handleChange}
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px',
                                                border: '1px solid #d1d5db',
                                                borderRadius: '8px',
                                                fontSize: '0.875rem',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                            placeholder="https://..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Restrictions Section */}
                        <div style={{ marginBottom: '32px' }}>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '16px', color: '#374151' }}>
                                Security Restrictions
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                {RESTRICTION_CHOICES.map((choice) => (
                                    <label
                                        key={choice}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '12px',
                                            border: selectedRestrictions.includes(choice) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            background: selectedRestrictions.includes(choice) ? '#eff6ff' : 'white',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedRestrictions.includes(choice)}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setSelectedRestrictions((prev) =>
                                                    checked ? [...prev, choice] : prev.filter((c) => c !== choice)
                                                );
                                            }}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '0.875rem', color: '#374151' }}>{choice}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Questions Section */}
                        <div style={{ marginBottom: '32px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0, color: '#374151' }}>
                                    Questions ({questions.length})
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAddQuestion}
                                    style={{
                                        background: '#3b82f6',
                                        color: 'white',
                                        border: 'none',
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        fontSize: '0.875rem',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>+</span> Add Question
                                </button>
                            </div>

                            {questions.length === 0 ? (
                                <div style={{
                                    padding: '48px',
                                    textAlign: 'center',
                                    border: '2px dashed #d1d5db',
                                    borderRadius: '12px',
                                    background: '#f9fafb'
                                }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📝</div>
                                    <p style={{ color: '#6b7280', margin: 0, fontSize: '0.875rem' }}>
                                        No questions yet. Click "Add Question" to get started.
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {questions.map((q, index) => (
                                        <div
                                            key={index}
                                            style={{
                                                padding: '16px',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '12px',
                                                background: '#f9fafb'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                                                <div style={{ fontWeight: '600', color: '#111827', fontSize: '0.9375rem' }}>
                                                    Question {index + 1}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteQuestion(index)}
                                                    style={{
                                                        background: '#fee2e2',
                                                        color: '#dc2626',
                                                        border: 'none',
                                                        padding: '4px 12px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer',
                                                        fontWeight: '500'
                                                    }}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                            <div style={{ marginBottom: '8px', color: '#374151', fontSize: '0.875rem' }}>
                                                {q.question_text}
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8125rem', color: '#6b7280' }}>
                                                <div>A) {q.option_a}</div>
                                                <div>B) {q.option_b}</div>
                                                {q.option_c && <div>C) {q.option_c}</div>}
                                                {q.option_d && <div>D) {q.option_d}</div>}
                                            </div>
                                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '16px', fontSize: '0.8125rem' }}>
                                                <span style={{ color: '#059669', fontWeight: '500' }}>✓ Correct: {q.correct_answer}</span>
                                                <span style={{ color: '#6b7280' }}>Points: {q.points}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Question Editor Modal */}
                        {showQuestionForm && editingQuestion && (
                            <div style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(0, 0, 0, 0.5)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 10000
                            }} onClick={() => { setShowQuestionForm(false); setEditingQuestion(null); }}>
                                <div style={{
                                    background: 'white',
                                    borderRadius: '16px',
                                    width: '90%',
                                    maxWidth: '600px',
                                    maxHeight: '90vh',
                                    overflow: 'auto',
                                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                                }} onClick={(e) => e.stopPropagation()}>
                                    <div style={{ padding: '24px', borderBottom: '1px solid #e5e7eb' }}>
                                        <h3 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0 }}>Add Question</h3>
                                    </div>
                                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                                Question Text *
                                            </label>
                                            <textarea
                                                value={editingQuestion.question_text}
                                                onChange={(e) => setEditingQuestion({ ...editingQuestion, question_text: e.target.value })}
                                                rows={3}
                                                required
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 12px',
                                                    border: '1px solid #d1d5db',
                                                    borderRadius: '8px',
                                                    fontSize: '0.875rem',
                                                    outline: 'none',
                                                    fontFamily: 'inherit',
                                                    resize: 'vertical',
                                                    boxSizing: 'border-box'
                                                }}
                                                placeholder="Enter your question..."
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gap: '12px' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                                    Option A *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editingQuestion.option_a}
                                                    onChange={(e) => setEditingQuestion({ ...editingQuestion, option_a: e.target.value })}
                                                    required
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 12px',
                                                        border: '1px solid #d1d5db',
                                                        borderRadius: '8px',
                                                        fontSize: '0.875rem',
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                                    Option B *
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editingQuestion.option_b}
                                                    onChange={(e) => setEditingQuestion({ ...editingQuestion, option_b: e.target.value })}
                                                    required
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 12px',
                                                        border: '1px solid #d1d5db',
                                                        borderRadius: '8px',
                                                        fontSize: '0.875rem',
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#6b7280' }}>
                                                    Option C (Optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editingQuestion.option_c || ''}
                                                    onChange={(e) => setEditingQuestion({ ...editingQuestion, option_c: e.target.value })}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 12px',
                                                        border: '1px solid #d1d5db',
                                                        borderRadius: '8px',
                                                        fontSize: '0.875rem',
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#6b7280' }}>
                                                    Option D (Optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editingQuestion.option_d || ''}
                                                    onChange={(e) => setEditingQuestion({ ...editingQuestion, option_d: e.target.value })}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 12px',
                                                        border: '1px solid #d1d5db',
                                                        borderRadius: '8px',
                                                        fontSize: '0.875rem',
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                                                Correct Answer *
                                            </label>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                {(['A', 'B', 'C', 'D'] as const).map(option => (
                                                    <label
                                                        key={option}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '10px 16px',
                                                            border: editingQuestion.correct_answer === option ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                                                            borderRadius: '8px',
                                                            cursor: 'pointer',
                                                            background: editingQuestion.correct_answer === option ? '#eff6ff' : 'white',
                                                            fontWeight: editingQuestion.correct_answer === option ? '500' : '400'
                                                        }}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="correct_answer"
                                                            checked={editingQuestion.correct_answer === option}
                                                            onChange={() => setEditingQuestion({ ...editingQuestion, correct_answer: option })}
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                        <span>{option}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
                                                Points
                                            </label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={editingQuestion.points}
                                                onChange={(e) => setEditingQuestion({ ...editingQuestion, points: parseInt(e.target.value) || 1 })}
                                                style={{
                                                    width: '100px',
                                                    padding: '10px 12px',
                                                    border: '1px solid #d1d5db',
                                                    borderRadius: '8px',
                                                    fontSize: '0.875rem',
                                                    outline: 'none',
                                                    boxSizing: 'border-box'
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                        <button
                                            type="button"
                                            onClick={() => { setShowQuestionForm(false); setEditingQuestion(null); }}
                                            style={{
                                                background: 'white',
                                                border: '1px solid #d1d5db',
                                                color: '#374151',
                                                padding: '10px 20px',
                                                borderRadius: '8px',
                                                fontSize: '0.875rem',
                                                fontWeight: '500',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleSaveQuestion(editingQuestion)}
                                            disabled={!editingQuestion.question_text || !editingQuestion.option_a || !editingQuestion.option_b}
                                            style={{
                                                background: '#3b82f6',
                                                border: 'none',
                                                color: 'white',
                                                padding: '10px 20px',
                                                borderRadius: '8px',
                                                fontSize: '0.875rem',
                                                fontWeight: '500',
                                                cursor: 'pointer',
                                                opacity: (!editingQuestion.question_text || !editingQuestion.option_a || !editingQuestion.option_b) ? 0.5 : 1
                                            }}
                                        >
                                            Save Question
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{
                        padding: '16px 24px',
                        borderTop: '1px solid #e5e7eb',
                        display: 'flex',
                        gap: '12px',
                        justifyContent: 'flex-end',
                        position: 'sticky',
                        bottom: 0,
                        background: 'white',
                        borderRadius: '0 0 16px 16px'
                    }}>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                background: 'white',
                                border: '1px solid #d1d5db',
                                color: '#374151',
                                padding: '10px 24px',
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{
                                background: '#3b82f6',
                                border: 'none',
                                color: 'white',
                                padding: '10px 24px',
                                borderRadius: '8px',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                cursor: 'pointer'
                            }}
                        >
                            {initialData.name ? 'Save Changes' : 'Create Test'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TestForm;
