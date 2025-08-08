import os
import google.generativeai as genai
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from dotenv import load_dotenv
import docx
import json
import io

# --- Environment and API Configuration ---
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found. Please set it in the .env file.")

genai.configure(api_key=GEMINI_API_KEY)

# --- Flask App Initialization ---
app = Flask(__name__)
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')
app.config['TEMPLATE_DIR'] = TEMPLATE_DIR
CORS(app, resources={r"/api/*": {"origins": "http://localhost:3000"}})

# --- Helper Functions ---
def parse_docx_to_json(file_stream):
    doc = docx.Document(file_stream)
    clauses = []
    for i, para in enumerate(doc.paragraphs):
        if para.text.strip():
            clauses.append({"clause_id": f"clause_{i+1:03d}", "text": para.text.strip()})
    return clauses

# --- AI Interaction Logic ---
def get_ai_suggestions(document_json, scenario_text, form_data_text):
    model = genai.GenerativeModel('gemini-1.5-flash-latest')
    prompt = f"""
    You are a meticulous legal AI assistant. Your task is to analyze a user's scenario against a legal document,
    incorporate pre-filled data, and suggest specific modifications.

    **Instructions:**
    1.  First, review the `base_details` which contain the foundational information for the agreement.
    2.  Next, carefully review the `scenario` which describes the specific, custom changes required.
    3.  Analyze each `clause` from the `document_clauses`.
    4.  Suggest modifications ("MODIFY", "ADD", "REMOVE") based on the `scenario`.
    5.  When generating `new_text` for "MODIFY" or "ADD" actions, you **MUST** replace the placeholders with the corresponding values from the `base_details`. Do not leave placeholders like [Client Name] in your final suggested text.
    6.  Your response **MUST** be a single, valid JSON object with one key: "suggestions".

    **Base Details (from user form):**
    ---
    {form_data_text}
    ---

    **Scenario:**
    ---
    {scenario_text}
    ---

    **Document Clauses (JSON):**
    ---
    {json.dumps(document_json, indent=2)}
    ---

    **Your JSON Response:**
    """
    try:
        response = model.generate_content(prompt)
        cleaned_response_text = response.text.strip().replace("```json", "").replace("```", "")
        suggestions = json.loads(cleaned_response_text)
        return suggestions.get("suggestions", [])
    except Exception as e:
        print(f"Error during AI call or JSON parsing: {e}")
        return [{"action": "ERROR", "reason": str(e)}]

# --- API Endpoints ---
@app.route('/api/templates', methods=['GET'])
def list_templates():
    try:
        files = [f for f in os.listdir(app.config['TEMPLATE_DIR']) if f.endswith('.docx')]
        return jsonify(files)
    except FileNotFoundError:
        return jsonify({"error": "Templates directory not found."}), 404

@app.route('/api/templates/<filename>', methods=['GET'])
def get_template(filename):
    try:
        return send_from_directory(app.config['TEMPLATE_DIR'], filename, as_attachment=True)
    except FileNotFoundError:
        return jsonify({"error": "File not found."}), 404

@app.route('/api/analyze', methods=['POST'])
def analyze_document():
    if 'document' not in request.files:
        return jsonify({"error": "No document file provided"}), 400

    file = request.files['document']
    scenario = request.form.get('scenario', '')
    form_data_json = request.form.get('formData', '{}')
    
    try:
        form_data = json.loads(form_data_json)
        form_data_text = "\n".join([f"- {key.replace('_', ' ').title()}: {value}" for key, value in form_data.items()])
    except json.JSONDecodeError:
        return jsonify({"error": "Invalid form data format."}), 400

    if not scenario:
        return jsonify({"error": "No scenario text provided"}), 400

    try:
        # Use io.BytesIO to allow the stream to be read multiple times
        file_stream = io.BytesIO(file.stream.read())
        parsed_doc = parse_docx_to_json(file_stream)
        ai_suggestions = get_ai_suggestions(parsed_doc, scenario, form_data_text)

        return jsonify({
            "originalDoc": parsed_doc,
            "suggestions": ai_suggestions
        })

    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({"error": "Failed to process the document."}), 500

# --- NEWLY ADDED CODE ---
@app.route('/api/generate-document', methods=['POST'])
def generate_document():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request body"}), 400

    file_name = data.get('fileName')
    suggestions = data.get('suggestions', [])

    if not file_name:
        return jsonify({"error": "Missing fileName"}), 400

    try:
        template_path = os.path.join(app.config['TEMPLATE_DIR'], file_name)
        if not os.path.exists(template_path):
            return jsonify({"error": "Template file not found on server"}), 404

        # Load the original document to get the base paragraphs
        original_doc = docx.Document(template_path)
        
        # Create a dictionary of original clauses that we can modify
        # Key: clause_id, Value: paragraph text
        final_clauses = {
            f"clause_{i+1:03d}": para.text
            for i, para in enumerate(original_doc.paragraphs)
            if para.text.strip()
        }

        added_clauses = []

        # Process accepted suggestions to update the final_clauses dictionary
        for suggestion in suggestions:
            action = suggestion.get('action')
            clause_id = suggestion.get('clause_id')

            if action == 'MODIFY' and clause_id in final_clauses:
                final_clauses[clause_id] = suggestion.get('new_text', final_clauses[clause_id])
            
            elif action == 'REMOVE' and clause_id in final_clauses:
                final_clauses.pop(clause_id, None)

            elif action == 'ADD' and 'new_clause' in suggestion:
                # Store new clauses to be appended at the end
                added_clauses.append(suggestion['new_clause'].get('text', ''))

        # Create a new document and populate it with the final text
        new_doc = docx.Document()
        
        # Add modified and untouched clauses in their original order
        for text in final_clauses.values():
            new_doc.add_paragraph(text)
        
        # Add new clauses at the end of the document
        for text in added_clauses:
            if text:
                new_doc.add_paragraph(text)

        # Save the new document to an in-memory stream
        file_stream = io.BytesIO()
        new_doc.save(file_stream)
        file_stream.seek(0)

        # Send the stream back as a file download
        return send_file(
            file_stream,
            as_attachment=True,
            download_name=f"Generated_{file_name}",
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )

    except Exception as e:
        print(f"Error generating document: {e}")
        return jsonify({"error": "Failed to generate the document on the server."}), 500
# --- END OF NEWLY ADDED CODE ---


# --- Run the App ---
if __name__ == '__main__':
    app.run(debug=True, port=5001)