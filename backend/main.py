import os
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import docx
import json

# --- Environment and API Configuration ---
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found. Please set it in the .env file.")

genai.configure(api_key=GEMINI_API_KEY)

# --- Flask App Initialization ---
app = Flask(__name__)
# Allow requests from your React app's origin
CORS(app, resources={r"/api/*": {"origins": "http://localhost:3000"}})

# --- Helper Function: Parse DOCX to JSON ---
def parse_docx_to_json(file_stream):
    """
    Parses an uploaded .docx file stream into a structured JSON.
    Each paragraph becomes an object with a unique ID and text.
    """
    doc = docx.Document(file_stream)
    clauses = []
    for i, para in enumerate(doc.paragraphs):
        if para.text.strip():  # Only include non-empty paragraphs
            clauses.append({
                "clause_id": f"clause_{i+1:03d}",
                "text": para.text.strip()
            })
    return clauses

# --- AI Interaction Logic ---
def get_ai_suggestions(document_json, scenario_text):
    """
    Constructs a prompt and gets modification suggestions from Gemini.
    """
    model = genai.GenerativeModel('gemini-1.5-flash-latest')

    # This detailed prompt is crucial for getting reliable, structured JSON output.
    prompt = f"""
    You are a meticulous legal AI assistant. Your task is to analyze a user's scenario
    against a provided legal document and suggest specific modifications.

    **Instructions:**
    1.  Carefully review the `scenario` provided by the user.
    2.  Analyze each `clause` from the `document_clauses`.
    3.  Based on the scenario, decide if each clause needs to be modified, removed, or if new clauses need to be added.
    4.  Your response **MUST** be a single, valid JSON object. Do not include any text or markdown before or after the JSON object.
    5.  The JSON object must contain one key: "suggestions".
    6.  The value of "suggestions" must be a list of JSON objects, where each object represents a single suggested change and has the following structure:
        - `action`: "MODIFY", "ADD", or "REMOVE".
        - `clause_id`: The ID of the clause to be modified or removed. For "ADD", this is the ID of the clause *after which* the new clause should be inserted.
        - `original_text`: (For "MODIFY" and "REMOVE" actions) The original text of the clause.
        - `new_text`: (For "MODIFY" action only) The suggested new text for the clause.
        - `new_clause`: (For "ADD" action only) An object with "clause_id", "clause_title", and "text" for the new clause.
        - `reason`: A brief, clear explanation for why the change is being suggested.

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
        # Clean up the response to ensure it's valid JSON
        cleaned_response_text = response.text.strip().replace("```json", "").replace("```", "")
        suggestions = json.loads(cleaned_response_text)
        return suggestions.get("suggestions", [])
    except Exception as e:
        print(f"Error during AI call or JSON parsing: {e}")
        # In case of an error, return an empty list or an error message
        return [{"action": "ERROR", "reason": str(e)}]


# --- API Endpoint ---
@app.route('/api/analyze', methods=['POST'])
def analyze_document():
    """
    The main API endpoint that the frontend will call.
    """
    if 'document' not in request.files:
        return jsonify({"error": "No document file provided"}), 400

    file = request.files['document']
    scenario = request.form.get('scenario', '')

    if not scenario:
        return jsonify({"error": "No scenario text provided"}), 400
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        # Parse the document and get AI suggestions
        parsed_doc = parse_docx_to_json(file.stream)
        ai_suggestions = get_ai_suggestions(parsed_doc, scenario)

        # Return the original parsed document and the AI's suggestions
        return jsonify({
            "originalDoc": parsed_doc,
            "suggestions": ai_suggestions
        })

    except Exception as e:
        print(f"An error occurred: {e}")
        return jsonify({"error": "Failed to process the document."}), 500

# --- Run the App ---
if __name__ == '__main__':
    # Runs the Flask app on port 5001 to avoid conflicts
    app.run(debug=True, port=5001)