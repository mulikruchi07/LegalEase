import React, { useState, useMemo, useEffect, useRef } from 'react';
import { UploadCloud, FileText, Wand2, Download, Check, X, ThumbsUp, ThumbsDown, Calendar, AlertCircle, FileCheck2, Library, XSquare, Menu, Loader2 } from 'lucide-react';
import { saveAs } from 'file-saver';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// --- Hardcoded Form Schema for L&L-R-RD-10-1L.docx ---
const leaveAndLicenseForm = {
    fileName: "L&L-R-RD-10-1L.docx",
    fields: [
        { name: "Licensor", label: "Licensor Name", type: "text" },
        { name: "Licensor Address", label: "Licensor Address", type: "textarea" },
        { name: "Licensee", label: "Licensee Name", type: "text" },
        { name: "Licensee Address", label: "Licensee Address", type: "textarea" },
        { name: "Property Address", label: "Property Address", type: "textarea" },
        { name: "Period", label: "Agreement Period (in months)", type: "number" },
        { name: "Start Date", label: "Start Date", type: "date" },
        { name: "End Date", label: "End Date", type: "date" },
        { name: "Rent Amount", label: "Rent Amount (per month)", type: "number" },
        { name: "Security Deposit", label: "Security Deposit", type: "number" },
    ]
};

// --- UI COMPONENTS (MOVED OUTSIDE OF APP COMPONENT)--- //
const Card = ({ children, className = '' }) => (<div className={`bg-white rounded-xl shadow-lg border border-slate-200/80 ${className}`}>{children}</div>);

const StepCard = ({ step, title, children, isActive, isCompleted }) => (
    <Card className={`p-6 transition-all duration-500 ${isActive ? 'ring-2 ring-indigo-500 shadow-indigo-200/50' : 'shadow-md'} ${!isActive && !isCompleted ? 'opacity-60 grayscale-[50%]' : ''}`}>
        <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-xl transition-all duration-300 ${isCompleted ? 'bg-green-500' : 'bg-indigo-500'}`}>{isCompleted ? <Check size={28} /> : step}</div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
        </div>
        <div className="mt-4 pl-16">{children}</div>
    </Card>
);

const SuggestionCard = ({ suggestion, onUpdate }) => {
    const { action, original_text, new_text, new_clause, reason, status, clause_id } = suggestion;
    const id = clause_id || new_clause?.clause_id;
    const actionStyles = { MODIFY: { badge: "bg-yellow-100 text-yellow-800" }, ADD: { badge: "bg-green-100 text-green-800" }, REMOVE: { badge: "bg-red-100 text-red-800" } };
    const currentStyle = actionStyles[action] || {};
    return (
        <Card className="mb-4 p-5 hover:shadow-xl transition-shadow duration-300 overflow-hidden">
            <div className="flex justify-between items-start">
                <span className={`text-xs font-semibold me-2 px-3 py-1 rounded-full ${currentStyle.badge}`}>{action}</span>
                {status === 'pending' && (<div className="flex gap-2"><button onClick={() => onUpdate(id, 'rejected')} className="p-2 rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors" aria-label="Reject"><X size={16} /></button><button onClick={() => onUpdate(id, 'accepted')} className="p-2 rounded-full bg-green-100 hover:bg-green-200 text-green-600 transition-colors" aria-label="Accept"><Check size={16} /></button></div>)}
                {status !== 'pending' && (<span className={`flex items-center text-sm font-semibold ${status === 'accepted' ? 'text-green-600' : 'text-red-600'}`}>{status === 'accepted' ? <ThumbsUp size={16} className="mr-1.5"/> : <ThumbsDown size={16} className="mr-1.5"/>}{status.charAt(0).toUpperCase() + status.slice(1)}</span>)}
            </div>
            <p className="text-sm text-slate-500 mt-4 mb-3 font-medium">AI Rationale: <span className="italic font-normal">{reason}</span></p>
            <div className={`border-t border-slate-200 mt-3 pt-3 space-y-3`}>
                {action === 'MODIFY' && (<><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Original</p><p className="text-sm text-slate-600 p-3 bg-red-50 rounded-md line-through decoration-red-400">{original_text}</p><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suggestion</p><p className="text-sm text-slate-800 p-3 bg-green-50 rounded-md">{new_text}</p></>)}
                {action === 'ADD' && new_clause && (<><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New Clause: <span className="font-bold text-slate-700">{new_clause.clause_title}</span></p><p className="text-sm text-slate-800 p-3 bg-green-50 rounded-md">{new_clause.text}</p></>)}
                {action === 'REMOVE' && (<><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Suggested for Removal</p><p className="text-sm text-slate-600 p-3 bg-red-50 rounded-md">{original_text}</p></>)}
            </div>
        </Card>
    );
};

// --- MAIN APP COMPONENT --- //
export default function App() {
    const [file, setFile] = useState(null);
    const [scenario, setScenario] = useState('');
    const [status, setStatus] = useState('idle');
    const [suggestions, setSuggestions] = useState([]);
    const [finalFormData, setFinalFormData] = useState({});
    const [formFields, setFormFields] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const suggestionsListRef = useRef(null);
    const scrollPositionRef = useRef(0);

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const response = await fetch('http://localhost:5001/api/templates');
                if (!response.ok) throw new Error('Could not fetch templates');
                const data = await response.json();
                setTemplates(data);
            } catch (error) { console.error("Failed to fetch templates:", error); }
        };
        fetchTemplates();
    }, []);

    useEffect(() => {
        if (suggestionsListRef.current && scrollPositionRef.current > 0) {
            suggestionsListRef.current.scrollTop = scrollPositionRef.current;
            scrollPositionRef.current = 0;
        }
    }, [suggestions]);

    const resetState = () => {
        setFile(null);
        setScenario('');
        setStatus('idle');
        setSuggestions([]);
        setFinalFormData({});
        setFormFields([]);
    };

    const handleFileSelect = async (selectedFile) => {
        setFile(selectedFile);
        if (selectedFile.name === leaveAndLicenseForm.fileName) {
            const fields = leaveAndLicenseForm.fields;
            setFormFields(fields);
            const initialFormData = {};
            fields.forEach(field => { initialFormData[field.name] = ''; });
            setFinalFormData(initialFormData);
            setStatus('baseForm');
        } else {
            alert("This prototype only supports the 'L&L-R-RD-10-1L.docx' template.");
            resetState();
        }
    };

    const handleFileChange = (e) => { if (e.target.files && e.target.files[0]) handleFileSelect(e.target.files[0]); };
    const handleTemplateSelect = async (templateName) => {
        try {
            const response = await fetch(`http://localhost:5001/api/templates/${templateName}`);
            if (!response.ok) throw new Error('Could not fetch template file');
            const blob = await response.blob();
            const selectedFile = new File([blob], templateName, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            setSidebarOpen(false);
            handleFileSelect(selectedFile);
        } catch (error) { alert(`Could not load template: ${error.message}`); }
    };

    const handleFormChange = (name, value) => { setFinalFormData(prev => ({ ...prev, [name]: value })); };
    const handleBaseFormSubmit = () => { setStatus('scenarioInput'); };

    const handleAnalyze = async () => {
        if (!file || !scenario) { alert("Please describe the scenario."); return; }
        setStatus('analyzing');
        const apiFormData = new FormData();
        apiFormData.append('document', file);
        apiFormData.append('scenario', scenario);
        apiFormData.append('formData', JSON.stringify(finalFormData));
        try {
            const response = await fetch('http://localhost:5001/api/analyze', { method: 'POST', body: apiFormData });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Network response was not ok');
            }
            const data = await response.json();
            if (data.suggestions && data.suggestions[0]?.action === "ERROR") throw new Error(`AI Error: ${data.suggestions[0].reason}`);
            setSuggestions((data.suggestions || []).map(s => ({ ...s, status: 'pending' })));
            setStatus('suggested');
        } catch (error) {
            console.error("Failed to analyze document:", error);
            setStatus('scenarioInput');
            alert(`An error occurred: ${error.message}`);
        }
    };
    
    const handleSuggestionUpdate = (id, newStatus) => {
        if (suggestionsListRef.current) {
            scrollPositionRef.current = suggestionsListRef.current.scrollTop;
        }
        setSuggestions(currentSuggestions =>
            currentSuggestions.map(s =>
                (s.clause_id === id || (s.new_clause && s.new_clause.clause_id === id)) ? { ...s, status: newStatus } : s
            )
        );
    };
    
    const acceptedSuggestions = useMemo(() => suggestions.filter(s => s.status === 'accepted'), [suggestions]);
    const areAllSuggestionsReviewed = suggestions.length > 0 && suggestions.every(s => s.status !== 'pending');
    
    const handleGenerateDocx = async () => {
        setStatus('generatingDoc');
        try {
            const response = await fetch('http://localhost:5001/api/generate-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: file.name,
                    formData: finalFormData,
                    suggestions: acceptedSuggestions
                })
            });
            if (!response.ok) throw new Error('Failed to generate document on server.');
            const blob = await response.blob();
            saveAs(blob, "Generated_Agreement.docx");
            setStatus('done');
        } catch (error) {
            console.error("Error generating docx:", error);
            setStatus('suggested');
            alert("Could not generate the document.");
        }
    };

    const renderMainContent = () => {
        if (status === 'suggested' || status === 'generatingDoc') {
            return (
                <Card className="min-h-[600px] p-2 sm:p-6">
                    <div className="flex justify-between items-center mb-4 p-3 bg-slate-50 rounded-lg">
                        <h3 className="text-lg font-semibold text-slate-800">Review AI Suggestions</h3>
                        {!areAllSuggestionsReviewed && <p className="text-sm text-yellow-700 flex items-center gap-2"><AlertCircle size={16} />Please accept or reject each suggestion.</p>}
                        {areAllSuggestionsReviewed && <p className="text-sm text-green-600 flex items-center gap-2"><Check size={16} />All reviewed. You can now generate the document.</p>}
                    </div>
                    <div ref={suggestionsListRef} className="max-h-[70vh] overflow-y-auto p-1">
                        {suggestions.map((s, i) => <SuggestionCard key={s.clause_id || s.new_clause?.clause_id || i} suggestion={s} onUpdate={handleSuggestionUpdate} />)}
                    </div>
                </Card>
            );
        }
        
        const centralContent = {
            'idle': { icon: <Wand2 size={48} />, title: 'AI Assistant is Ready', text: 'Select a template or upload your document to begin.' },
            'scenarioInput': { icon: <FileText size={48} />, title: 'Base Details Saved', text: 'Now, describe your custom scenario in the panel on the left.' },
            'analyzing': { icon: <Loader2 size={48} className="animate-spin" />, title: 'Analyzing Scenario...', text: 'The AI is generating suggestions based on your scenario.' },
            'done': { icon: <FileCheck2 size={48} />, title: 'Document Generated!', text: 'Your file has been downloaded.', button: <button onClick={resetState} className="mt-8 bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-indigo-700 transition-all">Start a New Analysis</button> },
        };
        const currentContent = centralContent[status];
        return (<Card className="min-h-[600px] p-2 sm:p-6 flex items-center justify-center">{currentContent ? (<div className="text-center p-10 flex flex-col justify-center items-center h-full"><div className={`relative mb-6 text-white p-5 rounded-full shadow-lg ${status === 'done' ? 'bg-green-500' : 'bg-indigo-500'}`}><div className={`absolute -inset-2 rounded-full animate-pulse ${status === 'done' ? 'bg-green-200' : 'bg-indigo-200'}`}></div><div className="relative">{currentContent.icon}</div></div><h3 className="text-2xl font-bold text-slate-800 tracking-tight">{currentContent.title}</h3><p className="text-slate-500 mt-2 max-w-sm">{currentContent.text}</p>{currentContent.button}</div>) : null}</Card>)
    };

    return (<div className="min-h-screen bg-slate-50/50 font-sans text-slate-800">
        <style>{`.react-datepicker-wrapper, .react-datepicker__input-container { width: 100%; }`}</style>
        <div className={`fixed inset-y-0 left-0 bg-white w-72 z-30 shadow-2xl transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-4"><div className="flex justify-between items-center mb-4"><h2 className="text-lg font-bold text-indigo-600">Template Library</h2><button onClick={() => setSidebarOpen(false)} className="p-1 rounded-full hover:bg-slate-100"><XSquare size={24} className="text-slate-500" /></button></div><ul className="space-y-2">{templates.map(template => (<li key={template}><button onClick={() => handleTemplateSelect(template)} className="w-full text-left flex items-center gap-3 p-2 rounded-md text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"><FileText size={16} />{template.replace('.docx', '')}</button></li>))}</ul></div>
        </div>
        {isSidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/30 z-20"></div>}
        {status === 'baseForm' && (
            <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
                <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
                    <div className="p-4 border-b"><h2 className="text-xl font-bold text-slate-800">Fill Base Details</h2><p className="text-sm text-slate-500">Please provide the initial details for the <span className="font-semibold text-indigo-600">{file?.name.replace('.docx', '')}</span>.</p></div>
                    <div className="p-6 space-y-4 overflow-y-auto">{formFields.map(field => (
                        <div key={field.name}>
                            <label htmlFor={field.name} className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-2">
                                {field.type === 'date' && <Calendar size={14} className="text-slate-500" />}
                                {field.label}
                            </label>
                            {field.type === 'date' ? (
                                <DatePicker selected={finalFormData[field.name] ? new Date(finalFormData[field.name]) : null} onChange={(date) => handleFormChange(field.name, date)} className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm" dateFormat="MMMM d, yyyy" />
                            ) : field.type === 'textarea' ? (
                                <textarea value={finalFormData[field.name] || ''} onChange={(e) => handleFormChange(e.target.name, e.target.value)} name={field.name} id={field.name} rows={3} className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm" />
                            ) : (
                                <input type={field.type} id={field.name} name={field.name} value={finalFormData[field.name] || ''} onChange={(e) => handleFormChange(e.target.name, e.target.value)} className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-lg shadow-sm" />
                            )}
                        </div>
                    ))}
                    </div>
                    <div className="p-4 border-t flex justify-end gap-3"><button onClick={resetState} className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button><button onClick={handleBaseFormSubmit} className="px-6 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Save & Continue</button></div>
                </Card>
            </div>
        )}
        <header className="bg-white/90 backdrop-blur-lg border-b border-slate-200/80 sticky top-0 z-10">
            <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8"><div className="flex items-center justify-between h-16"><div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(true)} className="p-2 rounded-md hover:bg-slate-100"><Menu size={24} className="text-slate-600" /></button><div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/30"><Wand2 className="text-white" size={24}/></div><span className="text-2xl font-bold text-slate-800 tracking-tighter">LexiGenius</span></div><span className="text-sm font-medium text-slate-500 hidden md:block">AI-Powered Legal Document Assistant</span></div></div>
        </header>
        <main className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-4 space-y-6">
                    <StepCard step="1" title="Select Document" isActive={status === 'idle'} isCompleted={!!file}>
                         <div className="flex space-x-2"><button onClick={() => setSidebarOpen(true)} className="flex-1 flex items-center justify-center gap-2 p-3 text-sm font-semibold rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"><Library size={16} /> From Library</button><label htmlFor="file-upload" className="flex-1 flex items-center justify-center gap-2 p-3 text-sm font-semibold rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"><UploadCloud size={16} /> Upload File<input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".docx" /></label></div>
                        {file && <p className="mt-3 text-sm font-semibold text-green-700 flex items-center gap-2 p-2 bg-green-50 rounded-md"><FileText size={16} />{file.name}</p>}
                    </StepCard>
                    <StepCard step="2" title="Describe & Analyze" isActive={status === 'scenarioInput' || status === 'analyzing'} isCompleted={status === 'suggested' || status === 'done'}>
                        <div className="space-y-4">
                            <div><label htmlFor="scenario" className="block text-sm font-bold text-slate-700 mb-2">Describe Case Scenario</label><textarea id="scenario" rows="6" disabled={status !== 'scenarioInput'} className="block w-full p-3 bg-white border border-slate-300 rounded-lg shadow-sm disabled:bg-slate-50" placeholder="Describe custom changes here..." value={scenario} onChange={(e) => setScenario(e.target.value)}></textarea></div>
                            <button onClick={handleAnalyze} disabled={status !== 'scenarioInput' || !scenario} className="w-full flex items-center justify-center gap-2 px-6 py-3 text-base font-bold rounded-lg shadow-lg shadow-indigo-500/20 text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300">{status === 'analyzing' ? (<><Loader2 className="animate-spin" size={20} /><span>Analyzing...</span></>) : (<><Wand2 size={20} /><span>Analyze & Suggest</span></>)}</button>
                        </div>
                    </StepCard>
                    <StepCard step="3" title="Generate Document" isActive={status === 'suggested' || status === 'fillDetails'} isCompleted={status === 'done'}>
                         <p className="text-sm text-slate-600">Review the AI suggestions, then generate your final document.</p>
                        <button disabled={!areAllSuggestionsReviewed || status === 'generatingDoc'} onClick={handleGenerateDocx} className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 text-base font-bold rounded-lg shadow-lg shadow-green-500/20 text-white bg-green-600 hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transform hover:scale-105 transition-all duration-300">{status === 'generatingDoc' ? (<><Loader2 className="animate-spin" size={20} /><span>Generating...</span></>) : (<><Download size={20} /><span>Generate & Download</span></>)}</button>
                    </StepCard>
                </div>
                <div className="lg:col-span-8">{renderMainContent()}</div>
            </div>
        </main>
        <footer className="text-center py-6 border-t border-slate-200 mt-8"><p className="text-sm text-slate-500">&copy; 2025 LexiGenius. All Rights Reserved.</p></footer>
    </div>);
}
