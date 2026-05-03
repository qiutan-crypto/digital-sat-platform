import os
import json
import re

def parse_test(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Split by module. Look for "33 QUESTIONS" or "27 QUESTIONS"
    modules_raw = re.split(r'(?:#\s*Reading and Writing\s*)?\d+\s*QUESTIONS', content)
    
    modules_data = []
    
    # modules_raw[0] is intro.
    for i, mod_text in enumerate(modules_raw[1:]):
        mod_id = f"rw{i+1}" # Assuming Reading and Writing 1 and 2
        
        # Split by ## 1, ## 2, etc.
        q_splits = re.split(r'\n##\s+(\d+)\s*\n', mod_text)
        
        questions = []
        # q_splits[0] is text before ## 1
        for j in range(1, len(q_splits), 2):
            q_num = int(q_splits[j])
            q_content = q_splits[j+1]
            
            # Extract choices A) B) C) D)
            # Find the last occurrence of choices.
            choices_match = list(re.finditer(r'\n([A-D])\)\s+(.*?)(?=\n[A-D]\)|\Z)', q_content, re.DOTALL))
            
            choices = []
            if len(choices_match) >= 4:
                choices = [m.group(0).strip() for m in choices_match[-4:]]
                # the passage and question is everything before the first choice
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
            
            # The format is usually "Choice B is the best answer..." or "Choice B is correct."
            correct_ans_match = re.match(r'Choice\s+([A-D])\s+is\s+(correct|the\s+best\s+answer)', ans_content, re.IGNORECASE)
            correct_ans = correct_ans_match.group(1) if correct_ans_match else None
            
            # Try to get correct answer for math/grid-in
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

def main():
    test_path = "/Users/lifengliu/Downloads/full-length-sat-paper-practice-test_-bundle-4/sat-practice-test-4-digital-2026-04-26_21-36-01.md"
    answers_path = "/Users/lifengliu/Downloads/full-length-sat-paper-practice-test_-bundle-4/sat-practice-test-4-answers-digital-2026-04-26_21-33-35.md"
    
    test_modules = parse_test(test_path)
    answers_modules = parse_answers(answers_path)
    
    # Merge
    final_modules = []
    
    # Since test has RW and Math modules (total 4) and answers has the same (total 4)
    # We will just iterate and merge by index
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
        "test_id": "test4",
        "title": "SAT Practice Test 4",
        "modules": final_modules
    }
    
    out_path = "/Users/lifengliu/Documents/liulifeng_文档/python练习文件/SATWEB/data/test4_parsed.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        
    print(f"Successfully generated {out_path} with {len(final_modules)} modules.")

if __name__ == "__main__":
    main()
