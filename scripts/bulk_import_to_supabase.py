import os
import json
import re
import requests
import glob

# Supabase Config
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'your_supabase_url_here')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', 'your_supabase_key_here')

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

def parse_test(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by module. Look for "33 QUESTIONS" or "27 QUESTIONS"
    modules_raw = re.split(r'(?:#\s*Reading and Writing\s*)?\d+\s*QUESTIONS', content)
    
    modules_data = []
    
    # modules_raw[0] is intro.
    for i, mod_text in enumerate(modules_raw[1:]):
        mod_id = f"rw{i+1}" # default ID
        
        # Split by ## 1, ## 2, etc.
        q_splits = re.split(r'\n##\s+(\d+)\s*\n', mod_text)
        
        questions = []
        for j in range(1, len(q_splits), 2):
            q_num = int(q_splits[j])
            q_content = q_splits[j+1]
            
            # Extract choices A) B) C) D)
            choices_match = list(re.finditer(r'\n([A-D])\)\s+(.*?)(?=\n[A-D]\)|\Z)', q_content, re.DOTALL))
            
            choices = []
            if len(choices_match) >= 4:
                choices = [m.group(0).strip() for m in choices_match[-4:]]
                passage_and_q = q_content[:choices_match[-4].start()].strip()
            else:
                passage_and_q = q_content.strip()
            
            questions.append({
                "q_number": q_num,
                "type": "multiple-choice" if choices else "grid-in",
                "content_md": passage_and_q,
                "choices": choices
            })
            
        modules_data.append({
            "id": mod_id,
            "questions": {q["q_number"]: q for q in questions}
        })
        
    return modules_data


def parse_answers(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    modules_raw = re.split(r'(?i)Module\s*[12][\s\n]*\(\d+\s*questions\)', content)
    modules_data = []
    
    for i, mod_text in enumerate(modules_raw[1:]):
        mod_id = f"rw{i+1}"
        
        q_splits = re.split(r'\n##\s+QUESTION\s+(\d+)\s*\n', mod_text)
        
        answers = {}
        for j in range(1, len(q_splits), 2):
            q_num = int(q_splits[j])
            ans_content = q_splits[j+1].strip()
            
            correct_ans_match = re.match(r'Choice\s+([A-D])\s+is\s+(correct|the\s+best\s+answer)', ans_content, re.IGNORECASE)
            correct_ans = correct_ans_match.group(1) if correct_ans_match else None
            
            if not correct_ans:
                correct_ans_match2 = re.match(r'The\s+correct\s+answer\s+is\s+([^\.]+)\.', ans_content, re.IGNORECASE)
                correct_ans = correct_ans_match2.group(1).strip() if correct_ans_match2 else None

            answers[q_num] = {
                "correct_answer": correct_ans,
                "explanation_md": ans_content
            }
            
        modules_data.append({
            "id": mod_id,
            "answers": answers
        })
        
    return modules_data


def process_test(test_num, test_path, answers_path):
    print(f"Processing Test {test_num}...")
    test_modules = parse_test(test_path)
    answers_modules = parse_answers(answers_path)
    
    final_modules = []
    
    for i in range(min(len(test_modules), len(answers_modules))):
        t_mod = test_modules[i]
        a_mod = answers_modules[i]
        
        merged_qs = []
        for q_num, q_data in t_mod["questions"].items():
            ans_data = a_mod["answers"].get(q_num, {})
            merged_qs.append({
                "id": f"q{q_num}",
                "number": q_num,
                "type": q_data["type"],
                "question": q_data["content_md"],
                "choices": q_data["choices"],
                "correctAnswer": ans_data.get("correct_answer"),
                "explanation": ans_data.get("explanation_md")
            })
            
        mod_name = "Reading and Writing Module 1"
        time_limit = 39 * 60
        if i == 1: 
            mod_name = "Reading and Writing Module 2"
        elif i == 2: 
            mod_name = "Math Module 1"
            time_limit = 43 * 60
        elif i == 3: 
            mod_name = "Math Module 2"
            time_limit = 43 * 60
            
        final_modules.append({
            "id": f"mod{i+1}",
            "name": mod_name,
            "timeLimit": time_limit,
            "questions": merged_qs
        })
        
    output = {
        "test_id": f"test{test_num}",
        "title": f"SAT Practice Test {test_num}",
        "modules": final_modules
    }
    
    # Upload to Supabase
    payload = {
        'id': output['test_id'],
        'title': output['title'],
        'content': output
    }
    
    url = f"{SUPABASE_URL}/rest/v1/sat_tests"
    response = requests.post(url, headers=HEADERS, json=payload)
    
    if response.status_code in [200, 201]:
        print(f"Successfully uploaded Test {test_num} to Supabase!")
    else:
        print(f"Failed to upload Test {test_num}. Status code: {response.status_code}")
        print(response.text)

def main():
    import sys
    
    target_dir = ""
    if len(sys.argv) > 1:
        target_dir = sys.argv[1].strip()
    else:
        target_dir = input("Enter the directory containing the Markdown files (or press enter to search in Downloads): ").strip()
        
    if not target_dir:
        target_dir = "/Users/lifengliu/Downloads"
        
    print(f"Scanning directory: {target_dir}")
    
    # Search for all test files
    test_pattern = os.path.join(target_dir, "**", "sat-practice-test-*-digital*.md")
    test_files = glob.glob(test_pattern, recursive=True)
    
    for tf in test_files:
        # Ignore answer files in this pass
        if "answers" in tf.lower():
            continue
            
        # Extract test number
        match = re.search(r'sat-practice-test-(\d+)-digital', tf, re.IGNORECASE)
        if not match:
            continue
            
        test_num = match.group(1)
        
        # Look for corresponding answer file
        ans_pattern = os.path.join(target_dir, "**", f"sat-practice-test-{test_num}-answers-digital*.md")
        ans_files = glob.glob(ans_pattern, recursive=True)
        
        if not ans_files:
            print(f"Warning: Found test {test_num} but no corresponding answers file. Skipping.")
            continue
            
        process_test(test_num, tf, ans_files[0])

if __name__ == "__main__":
    main()
