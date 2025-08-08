import React, { useState, useMemo, useEffect } from 'react';
import { UploadCloud, FileText, Wand2, Download, Check, X, ThumbsUp, ThumbsDown, Calendar, AlertCircle, FileCheck2, Library, XSquare, Menu } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// --- UTILITY --- //

const extractPlaceholders = (originalDoc, aiSuggestions, acceptedSuggestions) => {
    const placeholderRegex = /\[(.*?)\]/g;
    const placeholders = new Set();
    const acceptedIds = new Set(acceptedSuggestions.map(s => s.clause_id || s.new_clause?.clause_id));

    const scanText = (text) => {
        if (!text) return;
        let match;
        while ((match = placeholderRegex.exec(text)) !== null) {
            placeholders.add(match[1]);
        }
    };

    const modifiedOrRemovedIds = new Set();
    aiSuggestions.forEach(s => {
        if ((s.action === 'MODIFY' || s.action === 'REMOVE') && acceptedIds.has(s.clause_id)) {
            modifiedOrRemovedIds.add(s.clause_id);
        }
    });

    originalDoc.forEach(clause => {
        if (!modifiedOrRemovedIds.has(clause.clause_id)) {
            scanText(clause.text);
        }
    });

    acceptedSuggestions.forEach(suggestion => {
        if (suggestion.action === 'MODIFY') {
            scanText(suggestion.new_text);
        } else if (suggestion.action === 'ADD') {
            scanText(suggestion.new_clause.text);
        }
    });

    return Array.from(placeholders);
};


// --- UI COMPONENTS --- //

const Card = ({ children, className = '' }) => (
    <div className={`bg-white rounded-xl shadow-lg border border-slate-200/80 ${className}`}>{children}</div>
);

const StepCard = ({ step, title, children, isActive, isCompleted }) => (
    <Card className={`p-6 transition-all duration-500 ${isActive ? 'ring-2 ring-indigo-500 shadow-indigo-200/50' : 'shadow-md'} ${!isActive && !isCompleted ? 'opacity-60 grayscale-[50%]' : ''}`}>
        <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl transition-all duration-300 ${isCompleted ? 'bg-green-500' : 'bg-indigo-500'}`}>
                {isCompleted ? <Check size={28} /> : step}
            </div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
        </div>
        <div className="mt-4 pl-16">{children}</div>
    </Card>
);

const SuggestionCard = ({ suggestion, onUpdate }) => {
    const { action, original_text, new_text, new_clause, reason, status, clause_id } = suggestion;
    const id = clause_id || new_clause?.clause_id;

    const actionStyles = {
        MODIFY: { badge: "bg-yellow-100 text-yellow-800" },
        ADD: { badge: "bg-green-100 text-green-800" },
        REMOVE: { badge: "bg-red-100 text-red-800" },
    };
    const currentStyle = actionStyles[action] || {};

    return (
        <Card className="mb-4 p-5 hover:shadow-xl transition-shadow duration-300 overflow-hidden">
            <div className="flex justify-between items-start">
                <span className={`text-xs font-semibold me-2 px-3 py-1 rounded-full ${currentStyle.badge}`}>{action}</span>
                {status === 'pending' && (
                    <div className="flex gap-2">
                        <button onClick={() => onUpdate(id, 'rejected')} className="p-2 rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors" aria-label="Reject"><X size={16} /></button>
                        <button onClick={() => onUpdate(id, 'accepted')} className="p-2 rounded-full bg-green-100 hover:bg-green-200 text-green-600 transition-colors" aria-label="Accept"><Check size={16} /></button>
                    </div>
                )}
                 {status !== 'pending' && (
                     <span className={`flex items-center text-sm font-semibold ${status === 'accepted' ? 'text-green-600' : 'text-red-600'}`}>
                         {status === 'accepted' ? <ThumbsUp size={16} className="mr-1.5"/> : <ThumbsDown size={16} className="mr-1.5"/>}
                         {status.charAt(0).toUpperCase() + status.slice(1)}
                     </span>
                 )}
            </div>
            <p className="text-sm text-slate-500 mt-4 mb-3 font-medium">AI Rationale: <span className="italic font-normal">{reason}</span></p>
            <div className={`border-t border-slate-200 mt-3 pt-3 space-y-3`}>
                {action === 'MODIFY' && (<>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Original</p>
                    <p className="text-sm text-slate-600 p-3 bg-red-50 rounded-md line-through decoration-red-400">{original_text}</p>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suggestion</p>
                    <p className="text-sm text-slate-800 p-3 bg-green-50 rounded-md">{new_text}</p>
                </>)}
                {action === 'ADD' && new_clause && (<>
                     <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New Clause: <span className="font-bold text-slate-700">{new_clause.clause_title}</span></p>
                     <p className="text-sm text-slate-800 p-3 bg-green-50 rounded-md">{new_clause.text}</p>
                </>)}
                {action === 'REMOVE' && (<>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suggested for Removal</p>
                    <p className="text-sm text-slate-600 p-3 bg-red-50 rounded-md">{original_text}</p>
                </>)}
            </div>
        </Card>
    );
};


// --- MAIN APP COMPONENT --- //

export default function App() {
    const [file, setFile] = useState(null);
    const [scenario, setScenario] = useState('');
    const [status, setStatus] = useState('idle');
    const [activeTab, setActiveTab] = useState('suggestions');
    const [suggestions, setSuggestions] = useState([]);
    const [originalDoc, setOriginalDoc] = useState([]);
    const [formData, setFormData] = useState({});
    const [templates, setTemplates] = useState([]);
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        // Fetch templates from the backend when the component mounts
        const fetchTemplates = async () => {
            try {
                const response = await fetch('http://localhost:5001/api/templates');
                if (!response.ok) throw new Error('Could not fetch templates');
                const data = await response.json();
                setTemplates(data);
            } catch (error) {
                console.error("Failed to fetch templates:", error);
            }
        };
        fetchTemplates();
    }, []);

    useEffect(() => {
        setStatus('idle');
        setSuggestions([]);
        setOriginalDoc([]);
        setFormData({});
        setActiveTab('suggestions');
    }, [file, scenario]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleTemplateSelect = async (templateName) => {
        try {
            const response = await fetch(`http://localhost:5001/api/templates/${templateName}`);
            if (!response.ok) throw new Error('Could not fetch template file');
            const blob = await response.blob();
            const selectedFile = new File([blob], templateName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            setFile(selectedFile);
            setSidebarOpen(false);
        } catch (error) {
            console.error("Failed to select template:", error);
            alert(`Could not load template: ${error.message}`);
        }
    };

    const handleAnalyze = async () => {
        if (!file || !scenario) {
            alert("Please upload a document and describe the scenario.");
            return;
        }
        setStatus('analyzing');

        const apiFormData = new FormData();
        apiFormData.append('document', file);
        apiFormData.append('scenario', scenario);

        try {
            const response = await fetch('http://localhost:5001/api/analyze', {
                method: 'POST',
                body: apiFormData,
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Network response was not ok');
            }

            const data = await response.json();

            if (data.suggestions && data.suggestions[0]?.action === "ERROR") {
                 throw new Error(`AI Error: ${data.suggestions[0].reason}`);
            }

            setOriginalDoc(data.originalDoc || []);
            setSuggestions((data.suggestions || []).map(s => ({ ...s, status: 'pending' })));
            setStatus('suggested');
            setActiveTab('suggestions');

        } catch (error) {
            console.error("Failed to analyze document:", error);
            setStatus('idle');
            alert(`An error occurred: ${error.message}`);
        }
    };
    
    const handleSuggestionUpdate = (id, newStatus) => {
        setSuggestions(currentSuggestions =>
            currentSuggestions.map(s =>
                (s.clause_id === id || (s.new_clause && s.new_clause.clause_id === id))
                    ? { ...s, status: newStatus }
                    : s
            )
        );
    };
    
    const handleFormInputChange = (name, value) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const acceptedSuggestions = useMemo(() => suggestions.filter(s => s.status === 'accepted'), [suggestions]);
    const placeholders = useMemo(() => extractPlaceholders(originalDoc, suggestions, acceptedSuggestions), [originalDoc, suggestions, acceptedSuggestions]);
    
    const areAllSuggestionsReviewed = suggestions.length > 0 && suggestions.every(s => s.status !== 'pending');
    const isFormFilled = placeholders.length === 0 || placeholders.every(p => formData[p] && formData[p] !== '');
    
    const handleGenerateDocx = () => {
        if (!isFormFilled) {
            alert("Please fill all the details before generating the document.");
            return;
        }
        setStatus('generating');

        const finalParagraphs = [];
        const placeholderRegex = /\[(.*?)\]/g;
        
        const processText = (text) => {
            const parts = [];
            let lastIndex = 0;
            let match;
            
            while ((match = placeholderRegex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    parts.push(new TextRun(text.substring(lastIndex, match.index)));
                }
                const placeholderName = match[1];
                let value = formData[placeholderName] || `[${placeholderName}]`;
                if (value instanceof Date) {
                    value = value.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                }
                parts.push(new TextRun({ text: String(value), bold: true, color: "0052cc" }));
                lastIndex = match.index + match[0].length;
            }
            if (lastIndex < text.length) {
                parts.push(new TextRun(text.substring(lastIndex)));
            }
            return new Paragraph({ children: parts, spacing: { after: 200 } });
        };

        originalDoc.forEach(clause => {
            const suggestionForClause = suggestions.find(s => s.clause_id === clause.clause_id);

            if (suggestionForClause && suggestionForClause.action === 'REMOVE' && suggestionForClause.status === 'accepted') {
                // Skip removed clause
            } else if (suggestionForClause && suggestionForClause.action === 'MODIFY' && suggestionForClause.status === 'accepted') {
                 finalParagraphs.push(processText(suggestionForClause.new_text));
            } else {
                 finalParagraphs.push(processText(clause.text));
            }

            const addSuggestion = acceptedSuggestions.find(s => s.action === 'ADD' && s.after_clause_id === clause.clause_id);
            if (addSuggestion) {
                finalParagraphs.push(processText(addSuggestion.new_clause.text));
            }
        });

        const doc = new Document({ sections: [{ children: finalParagraphs }] });
        
        Packer.toBlob(doc).then(blob => {
            saveAs(blob, "Generated_Agreement.docx");
            setStatus('done');
        }).catch(err => {
            console.error("Error generating docx:", err);
            setStatus('suggested');
            alert("Could not generate the document.");
        });
    };

    const renderContent = () => {
        // ... (renderContent function remains the same as the previous version)
        switch(status) {
            case 'idle':
            case 'analyzing':
                return (
                    <div className="text-center p-10 flex flex-col justify-center items-center h-full">
                        <div className="relative mb-6">
                            <div className="absolute -inset-2 bg-indigo-200 rounded-full animate-pulse"></div>
                            <div className="relative bg-indigo-500 text-white p-5 rounded-full shadow-lg">
                                <Wand2 size={48} />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 tracking-tight">AI Assistant is Ready</h3>
                        <p className="text-slate-500 mt-2 max-w-sm">Upload your document and describe your scenario to begin the automated legal review process.</p>
                        {status === 'analyzing' && (
                            <div className="mt-8 flex items-center justify-center gap-3 text-indigo-600 font-semibold">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                                Analyzing your document...
                            </div>
                        )}
                    </div>
                );
            case 'done':
                return (
                    <div className="text-center p-10 flex flex-col justify-center items-center h-full">
                         <div className="relative mb-6">
                            <div className="absolute -inset-2 bg-green-200 rounded-full"></div>
                            <div className="relative bg-green-500 text-white p-5 rounded-full shadow-lg">
                                <FileCheck2 size={48} />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Document Generated!</h3>
                        <p className="text-slate-500 mt-2 max-w-sm">Your file 'Generated_Agreement.docx' has been downloaded.</p>
                        <button onClick={() => { setFile(null); setScenario(''); }} className="mt-8 bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-indigo-700 transition-all">
                            Start a New Analysis
                        </button>
                    </div>
                );
            default:
                return (
                    <div>
                        <div className="border-b border-slate-200 mb-6">
                            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                                <button onClick={() => setActiveTab('suggestions')} className={`${activeTab === 'suggestions' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-all duration-300`}>
                                    AI Suggestions <span className={`ml-1.5 inline-block text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === 'suggestions' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>{suggestions.length}</span>
                                </button>
                                <button onClick={() => setActiveTab('form')} disabled={!areAllSuggestionsReviewed} className={`${activeTab === 'form' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300`}>
                                    Fill Details <span className={`ml-1.5 inline-block text-xs font-bold px-2 py-0.5 rounded-full ${activeTab === 'form' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-600'}`}>{placeholders.length}</span>
                                </button>
                            </nav>
                        </div>

                        {activeTab === 'suggestions' && (
                            <div>
                                <div className="flex justify-between items-center mb-4 p-3 bg-slate-50 rounded-lg">
                                    <h3 className="text-lg font-semibold text-slate-800">Review Suggestions</h3>
                                    {!areAllSuggestionsReviewed && <p className="text-sm text-yellow-700 flex items-center gap-2"><AlertCircle size={16} />Please accept or reject each suggestion.</p>}
                                    {areAllSuggestionsReviewed && <p className="text-sm text-green-600 flex items-center gap-2"><Check size={16} />All reviewed. Proceed to the next tab.</p>}
                                </div>
                                {suggestions.map((s, i) => <SuggestionCard key={s.clause_id || s.new_clause?.clause_id || i} suggestion={s} onUpdate={handleSuggestionUpdate} />)}
                            </div>
                        )}
                        
                        {activeTab === 'form' && areAllSuggestionsReviewed && (
                            <div>
                                <h3 className="text-lg font-semibold text-slate-800 mb-4">Fill Required Details</h3>
                                {placeholders.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                                    {placeholders.map(p => {
                                            const isDate = p.toLowerCase().includes('date');
                                            return (<div key={p}>
                                                <label htmlFor={p} className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-2">
                                                    {isDate && <Calendar size={14} className="text-slate-500" />}
                                                    {p.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                </label>
                                                {isDate ? (
                                                    <DatePicker 
                                                        selected={formData[p] || null} 
                                                        onChange={(date) => handleFormInputChange(p, date)}
                                                        className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                                        dateFormat="MMMM d, yyyy"
                                                    />
                                                ) : (
                                                    <input type="text" id={p} name={p} value={formData[p] || ''} onChange={(e) => handleFormInputChange(e.target.name, e.target.value)}
                                                        className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                                    />
                                                )}
                                            </div>)
                                    })}
                                    </div>
                                ) : <p className="text-slate-500">No details required based on the accepted clauses.</p>}
                            </div>
                        )}
                    </div>
                );
        }
    };
    
    return (<div className="min-h-screen bg-slate-50/50 font-sans text-slate-800">
        <style>{`
          .react-datepicker-wrapper, .react-datepicker__input-container { width: 100%; }
        `}</style>
        
        {/* Sidebar */}
        <div className={`fixed inset-y-0 left-0 bg-white w-64 z-30 shadow-2xl transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-4">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-indigo-600">Template Library</h2>
                    <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-full hover:bg-slate-100">
                        <XSquare size={24} className="text-slate-500" />
                    </button>
                </div>
                <ul className="space-y-2">
                    {templates.map(template => (
                        <li key={template}>
                            <button 
                                onClick={() => handleTemplateSelect(template)}
                                className="w-full text-left flex items-center gap-3 p-2 rounded-md text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                            >
                                <FileText size={16} />
                                {template.replace('.docx', '')}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
        {isSidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/30 z-20"></div>}

        <header className="bg-white/90 backdrop-blur-lg border-b border-slate-200/80 sticky top-0 z-10">
            <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-md hover:bg-slate-100 lg:hidden">
                            <Menu size={24} className="text-slate-600" />
                        </button>
                        <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/30"><Wand2 className="text-white" size={24}/></div>
                        <span className="text-2xl font-bold text-slate-800 tracking-tighter">LexiGenius</span>
                    </div>
                    <span className="text-sm font-medium text-slate-500 hidden md:block">AI-Powered Legal Document Assistant</span>
                </div>
            </div>
        </header>
        
        <main className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5 space-y-6">
                    <StepCard step="1" title="Provide Inputs" isActive={status === 'idle'} isCompleted={file && scenario}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Upload Agreement</label>
                                <div className="flex space-x-2">
                                    <button onClick={() => setSidebarOpen(true)} className="flex-1 flex items-center justify-center gap-2 p-3 text-sm font-semibold rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                                        <Library size={16} />
                                        From Library
                                    </button>
                                    <label htmlFor="file-upload" className="flex-1 flex items-center justify-center gap-2 p-3 text-sm font-semibold rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer">
                                        <UploadCloud size={16} />
                                        Upload File
                                        <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".docx" />
                                    </label>
                                </div>
                                {file && <p className="mt-3 text-sm font-semibold text-green-700 flex items-center gap-2 p-2 bg-green-50 rounded-md"><FileText size={16} />{file.name}</p>}
                            </div>
                            <div>
                                <label htmlFor="scenario" className="block text-sm font-bold text-slate-700 mb-2">Describe Case Scenario</label>
                                <textarea id="scenario" rows="6" className="block w-full p-3 bg-white border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" placeholder="e.g., The client wants to rent a house for 10 months with a 1 month break after the first 5 months..." value={scenario} onChange={(e) => setScenario(e.target.value)}></textarea>
                            </div>
                        </div>
                        <button onClick={handleAnalyze} disabled={!file || !scenario || status === 'analyzing'} className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 text-base font-bold rounded-lg shadow-lg shadow-indigo-500/20 text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300">
                           {status === 'analyzing' ? (<><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div><span>Analyzing...</span></>) : (<><Wand2 size={20} /><span>Analyze & Suggest</span></>)}
                        </button>
                    </StepCard>

                    <StepCard step="2" title="Generate Document" isActive={areAllSuggestionsReviewed} isCompleted={status === 'done'}>
                        <p className="text-sm text-slate-600">Review all suggestions, fill in the required details, then generate your final document.</p>
                        <button disabled={!isFormFilled || status === 'generating'} onClick={handleGenerateDocx} className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 text-base font-bold rounded-lg shadow-lg shadow-green-500/20 text-white bg-green-600 hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300">
                            {status === 'generating' ? (<><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div><span>Generating...</span></>) : (<><Download size={20} /><span>Generate & Download</span></>)}
                        </button>
                    </StepCard>
                </div>

                <div className="lg:col-span-7">
                    <Card className="min-h-[600px] p-2 sm:p-6">{renderContent()}</Card>
                </div>
            </div>
        </main>
        <footer className="text-center py-6 border-t border-slate-200 mt-8">
            <p className="text-sm text-slate-500">&copy; 2025 LexiGenius. All Rights Reserved.</p>
        </footer>
    </div>);
}
