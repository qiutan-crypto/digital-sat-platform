import os
import json
import re
from supabase import create_client, Client

# ==========================================
# CONFIGURATION
# ==========================================
# 1. Install supabase Python client: pip install supabase
# 2. Set your Supabase URL and Key here
SUPABASE_URL = "YOUR_SUPABASE_URL_HERE"
SUPABASE_KEY = "YOUR_SUPABASE_KEY_HERE"

# Ensure the client is initialized
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print("Warning: Please set your SUPABASE_URL and SUPABASE_KEY to run the script.")
    supabase = None

# ==========================================
# PARSING LOGIC
# ==========================================
def parse_markdown(file_path):
    """
    Parses the OCR-generated Markdown file.
    This is a TEMPLATE parser. You will need to adjust the logic based on 
    how your OCR tool formats the Markdown.
    
    Expected format example:
    ## Question 1
    (Module: rw1, Type: multiple-choice)
    
    **Passage:**
    This is the text of the passage...
    
    **Question:**
    What is the main idea?
    
    **Choices:**
    A) First choice
    B) Second choice
    C) Third choice
    D) Fourth choice
    
    **Correct Answer:** A
    
    **Explanation:**
    Because it is.
    """
    questions = []
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
            # Very basic split by "## Question"
            # In reality, you'll want to use regex or a robust parser
            raw_questions = content.split("## Question ")
            
            for raw_q in raw_questions[1:]:
                # Example extraction logic - YOU MUST CUSTOMIZE THIS
                q_data = {
                    "module_id": "rw1", # Extract from text
                    "q_number": 1,      # Extract from text
                    "type": "multiple-choice",
                    "passage_md": "Extracted passage text, may include ![img](images/chart1.png)",
                    "question_md": "Extracted question text",
                    "choices": ["A) ...", "B) ...", "C) ...", "D) ..."],
                    "correct_answer": "A",
                    "explanation_md": "Extracted explanation"
                }
                questions.append(q_data)
                
    except FileNotFoundError:
        print(f"File not found: {file_path}")
        
    return questions

# ==========================================
# UPLOAD TO SUPABASE
# ==========================================
def upload_to_supabase(questions):
    if not supabase:
        print("Supabase client not initialized. Cannot upload.")
        return
        
    for q in questions:
        # Generate a unique ID or use composite key
        q_id = f"{q['module_id']}-q{q['q_number']}"
        
        data = {
            "id": q_id,
            "module_id": q['module_id'],
            "q_number": q['q_number'],
            "type": q['type'],
            "passage_md": q['passage_md'],
            "question_md": q['question_md'],
            "choices": q['choices'],
            "correct_answer": q['correct_answer'],
            "explanation_md": q['explanation_md']
        }
        
        try:
            # Assuming you created a 'questions' table in Supabase
            response = supabase.table('questions').upsert(data).execute()
            print(f"Uploaded: {q_id}")
        except Exception as e:
            print(f"Error uploading {q_id}: {e}")

if __name__ == "__main__":
    print("This is a template script for importing OCR Markdown to Supabase.")
    print("1. Update the parsing logic based on your OCR output.")
    print("2. Set your Supabase URL and Key.")
    print("3. Create a 'questions' table in your Supabase project.")
    
    # Example usage:
    # md_file = "sat_practice_4.md"
    # questions = parse_markdown(md_file)
    # upload_to_supabase(questions)
