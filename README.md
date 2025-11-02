  <h1>LegalEase</h1>

  <p class="muted">AI legal document assistant used by advocates to edit agreements and avoid manual errors. The system analyzes uploaded agreements, provides clause-level suggestions, and generates an updated document that solves a real problem in legal drafting and customization.</p>

  <section class="section">
    <h2>What it does</h2>
    <ul>
      <li>Upload a .docx legal template or choose a template from the library.</li>
      <li>Provide base details via a guided form (e.g., licensor, licensee, period, rent).</li>
      <li>Describe a case scenario; the AI returns clause-level suggestions: MODIFY, ADD, or REMOVE.</li>
      <li>Review, accept, reject, or edit suggestions, then generate a final .docx agreement.</li>
    </ul>
  </section>

  <section class="section">
    <h2>Problem solved</h2>
    <p class="small">Advocates and legal professionals spend time manually editing agreements and are prone to drafting errors. LegalEase automates clause analysis and drafting, reducing manual effort and minimizing human error while producing a ready-to-use agreement.</p>
  </section>

  <section class="section">
    <h2>Project structure</h2>
    <pre><code>LegalEase/
├── frontend/        # React UI (App.js)
├── backend/         # Flask API (main.py)
├── venv/            # Python virtual environment
└── README.html
</code></pre>
  </section>

  <section class="section">
    <h2>Tech stack</h2>
    <ul>
      <li>Frontend: React (Tailwind utility classes in UI), react-datepicker, file-saver, lucide-react icons</li>
      <li>Backend: Python Flask</li>
      <li>AI: Google Gemini via google.generativeai</li>
      <li>Document handling: python-docx</li>
      <li>Dev: REST API between frontend and backend</li>
    </ul>
  </section>

  <section class="section">
    <h2>How it works (high level)</h2>
    <ol>
      <li>User uploads or selects a .docx template.</li>
      <li>User fills base details and describes a scenario in the UI.</li>
      <li>Frontend sends the document, scenario and form data to the backend API.</li>
      <li>Backend parses the .docx into clauses, calls Gemini to get structured suggestions, and returns those suggestions to the UI.</li>
      <li>User reviews suggestions; accepted suggestions are applied to the original .docx and a new document is generated and downloaded.</li>
    </ol>
  </section>

  <section class="section">
    <h2>Usage</h2>
    <p class="small">Basic steps to run locally:</p>
    <pre><code># Backend (python)
cd backend
python -m venv venv
# activate venv, then
pip install -r requirements.txt
# create .env with GEMINI_API_KEY
python main.py  # runs Flask on port 5001

# Frontend (react)
cd frontend
npm install
npm start  # runs React dev server on port 3000
</code></pre>
    <p class="small">Backend expects templates in a local <code>templates/</code> directory. Frontend communicates with backend at <code>http://localhost:5001</code>.</p>
  </section>

  <section class="section">
    <h2>Notes</h2>
    <ul>
      <li>Requires a valid <code>GEMINI_API_KEY</code> in <code>.env</code> for AI suggestions.</li>
      <li>Current prototype supports a specific template in the frontend; extend template support by updating the React form schema and backend parsing as needed.</li>
      <li>New clauses are appended to the document; paragraph styles are preserved where possible by <code>python-docx</code>.</li>
    </ul>
  </section>
  <footer class="muted">
    <p>Repository maintained by the project author. For setup questions, refer to <code>main.py</code> and <code>App.js</code>.</p>
  </footer>
</body>
</html>
