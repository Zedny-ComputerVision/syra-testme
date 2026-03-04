import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

interface QuestionPanelProps {
    question: {
        id: number;
        text: string;
        options: string[];
    };
    selectedOption: number | null;
    onSelectOption: (index: number) => void;
}

const QuestionPanel = ({ question, selectedOption, onSelectOption }: QuestionPanelProps) => {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-xl font-semibold text-slate-800 mb-6">
                <span className="text-slate-400 mr-2">Q{question.id}.</span>
                {question.text}
            </h2>

            <div className="space-y-3">
                {question.options.map((option, index) => (
                    <button
                        key={index}
                        onClick={() => onSelectOption(index)}
                        className={clsx(
                            "w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between group",
                            selectedOption === index
                                ? "border-primary-500 bg-primary-50"
                                : "border-slate-200 hover:border-primary-200 hover:bg-slate-50"
                        )}
                    >
                        <span className={clsx(
                            "font-medium",
                            selectedOption === index ? "text-primary-700" : "text-slate-600"
                        )}>
                            {option}
                        </span>
                        {selectedOption === index && (
                            <CheckCircle2 className="text-primary-500" size={20} />
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default QuestionPanel;
