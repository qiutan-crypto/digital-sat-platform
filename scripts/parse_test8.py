import os
import json
import re

def clean_img_tags(text):
    """Keep the OCR image tags."""
    return text

def clean_text(text):
    """Clean up various artifacts from the markdown."""
    text = clean_img_tags(text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def preprocess_test_markdown(content):
    """
    Fix known OCR issues in Test 8 markdown:
    - Add missing ## N headers for questions that lack them
    """
    
    # === RW Module 1 ===
    # Q1 is missing: appears right after DIRECTIONS paragraph, before "## 2"
    # Q1 text starts with "As Mexico's first president from an Indigenous community"
    content = re.sub(
        r'(Each question has a single best answer\.)\s*\n\n(As Mexico)',
        r'\1\n\n## 1\n\n\2',
        content,
        count=1
    )
    
    # === RW Module 2 ===
    # Q1 is missing: appears right after second DIRECTIONS paragraph
    # Q1 text starts with "Art scholars have noted that some colors"
    content = re.sub(
        r'(Each question has a single best answer\.)\s*\n\n(Art scholars have noted)',
        r'\1\n\n## 1\n\n\2',
        content,
        count=1
    )
    
    # === Math Module 1 ===
    # Q1 is missing: after instructions ending with "circled answer."
    # Q1 text starts with "A bus is traveling at a constant speed"
    q27_positions = [m.start() for m in re.finditer(r'27\s*QUESTIONS', content)]
    if len(q27_positions) >= 1:
        math_m1_start = q27_positions[0]
        prefix_m1 = content[:math_m1_start]
        suffix_m1 = content[math_m1_start:]
        
        # Fix Q1: after "circled answer."
        suffix_m1 = re.sub(
            r"(circled answer\.)\s*\n\n(A bus is traveling at a constant speed)",
            r"\1\n\n## 1\n\n\2",
            suffix_m1,
            count=1
        )
        
        # Fix Q4: missing between Q3's D) choice and ## 5
        # Q4 text starts with "Which expression is equivalent to"
        # Q3 ends with "D) (0,8)"
        suffix_m1 = re.sub(
            r"(D\) \(0,8\))\s*\n\n(Which expression is equivalent to)",
            r"\1\n\n## 4\n\n\2",
            suffix_m1,
            count=1
        )
        
        # Remove stray "## 2" that appears right before "## 26" (OCR artifact)
        suffix_m1 = re.sub(
            r'\n## 2\n\n## 26\n',
            r'\n## 26\n',
            suffix_m1
        )
        
        content = prefix_m1 + suffix_m1
    
    # === Math Module 2 ===
    # Q1 is missing: after "circled answer." in second math module
    # Q1 text starts with image tag then "What is the y-intercept of the line graphed?"
    if len(q27_positions) >= 2:
        # Re-find positions since content may have changed
        q27_positions = [m.start() for m in re.finditer(r'27\s*QUESTIONS', content)]
        math_m2_start = q27_positions[1]
        prefix_m2 = content[:math_m2_start]
        suffix_m2 = content[math_m2_start:]
        
        # Fix Q1: after "circled answer."
        suffix_m2 = re.sub(
            r"(circled answer\.)\s*\n\n(<div[^>]*>.*?</div>)\s*\n\n(What is the y-intercept of the line graphed)",
            r"\1\n\n## 1\n\n\2\n\n\3",
            suffix_m2,
            count=1,
            flags=re.DOTALL
        )
        
        # Fix Q2: missing between Q1's choices (D) (0,9)) and Q3 content
        # Q2 starts with a table about store employees
        suffix_m2 = re.sub(
            r"(D\) \(0,9\))\s*\n\n(<table)",
            r"\1\n\n## 2\n\n\2",
            suffix_m2,
            count=1
        )
        
        # Fix Q3: missing between Q2's choices (D) 495) and ## 4
        # Q3 starts with an image then "Note: Figure not drawn to scale."
        suffix_m2 = re.sub(
            r"(D\) 495)\s*\n\n(<div[^>]*>.*?</div>)\s*\n\n(Note: Figure not drawn to scale\.)",
            r"\1\n\n\2\n\n## 3\n\n\3",
            suffix_m2,
            count=1,
            flags=re.DOTALL
        )
        
        content = prefix_m2 + suffix_m2
    
    return content


def split_into_modules(content):
    """Split the test content into 4 modules based on QUESTIONS markers."""
    pattern = r'(?:#+\s*(?:Reading and Writing|Math)\s*\n*\s*)?(?:33|27)\s*QUESTIONS'
    splits = re.split(pattern, content)
    modules = splits[1:]
    print(f"Found {len(modules)} module sections in test file")
    return modules


def parse_questions_from_module(mod_text):
    """Parse questions from a module text using ## N headers."""
    questions = []
    
    q_splits = re.split(r'\n##\s+(\d+)\s*\n', mod_text)
    
    for j in range(1, len(q_splits), 2):
        if j + 1 >= len(q_splits):
            break
        q_num = int(q_splits[j])
        q_content = q_splits[j+1]
        
        q_content = clean_text(q_content)
        
        # Skip non-question content
        if q_content.strip().startswith('STOP') or q_content.strip().startswith('If you finish'):
            continue
        if 'No Test Material On This Page' in q_content and len(q_content.strip()) < 200:
            continue
        if q_content.strip().startswith('The SAT') or q_content.strip().startswith('GENERAL DIRECTIONS'):
            continue
            
        if not q_content:
            continue
        
        # Extract choices A) B) C) D)
        choices_match = list(re.finditer(r'\n([A-D])\)\s+(.*?)(?=\n[A-D]\)|$)', q_content, re.DOTALL))
        
        choices = []
        passage_and_q = q_content.strip()
        
        if len(choices_match) >= 2:
            if len(choices_match) >= 4:
                choices = [m.group(0).strip() for m in choices_match[-4:]]
                passage_and_q = q_content[:choices_match[-4].start()].strip()
            else:
                choices = [m.group(0).strip() for m in choices_match]
                passage_and_q = q_content[:choices_match[0].start()].strip()
        
        questions.append({
            "q_number": q_num,
            "type": "multiple-choice" if choices else "grid-in",
            "content_md": passage_and_q,
            "choices": choices
        })
    
    return questions


def parse_test(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Preprocess to fix missing headers
    print("Preprocessing markdown to fix missing question headers...")
    content = preprocess_test_markdown(content)
    
    modules_raw = split_into_modules(content)
    
    expected_counts = [33, 33, 27, 27]
    modules_data = []
    
    for i, mod_text in enumerate(modules_raw):
        is_math = i >= 2
        mod_type = "math" if is_math else "rw"
        
        questions = parse_questions_from_module(mod_text)
        questions.sort(key=lambda q: q["q_number"])
        
        mod_id = f"mod{i+1}"
        
        modules_data.append({
            "id": mod_id,
            "type": mod_type,
            "questions": {q["q_number"]: q for q in questions}
        })
        
        print(f"  Module {mod_id} ({mod_type}): {len(questions)} questions parsed")
        q_nums = sorted([q["q_number"] for q in questions])
        
        # Check for gaps
        expected = list(range(1, expected_counts[i] + 1))
        missing = [n for n in expected if n not in q_nums]
        if missing:
            print(f"    ⚠️  MISSING question numbers: {missing}")
        else:
            print(f"    ✅  All {expected_counts[i]} questions found")
        
    return modules_data


def parse_answers(md_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find module boundaries
    module_starts = []
    for m in re.finditer(r'Module\s*[12]\s*(?:\n+\s*)?\(\d+\s*questions\)', content):
        module_starts.append(m.end())
    
    module_starts = sorted(set(module_starts))
    
    print(f"Found {len(module_starts)} module sections in answers file")
    
    if len(module_starts) < 4:
        print(f"  ⚠️  Expected 4 modules but found {len(module_starts)}")
        return []
    
    # Build module texts
    modules_raw = []
    for k in range(len(module_starts)):
        start = module_starts[k]
        if k + 1 < len(module_starts):
            search_end = module_starts[k+1]
            chunk = content[start:search_end]
            last_module_idx = chunk.rfind('\nModule')
            if last_module_idx >= 0:
                end = start + last_module_idx
            else:
                last_header_idx = chunk.rfind('\n# ')
                if last_header_idx >= 0:
                    end = start + last_header_idx
                else:
                    end = search_end
        else:
            end = len(content)
        modules_raw.append(content[start:end])
    
    modules_data = []
    
    for i, mod_text in enumerate(modules_raw):
        q_splits = re.split(r'\n##\s+QUESTION\s+(\d+)\s*\n', mod_text)
        
        answers = {}
        for j in range(1, len(q_splits), 2):
            if j + 1 >= len(q_splits):
                break
            q_num = int(q_splits[j])
            ans_content = q_splits[j+1].strip()
            
            ans_content = clean_text(ans_content)
            
            # Extract correct answer
            correct_ans_match = re.match(r'Choice\s+([A-D])\s+is\s+(correct|the\s+best\s+answer)', ans_content, re.IGNORECASE)
            correct_ans = correct_ans_match.group(1) if correct_ans_match else None
            
            if not correct_ans:
                correct_ans_match2 = re.match(r'The\s+correct\s+answer\s+is\s+(.+?)(?:\.\s)', ans_content, re.IGNORECASE)
                correct_ans = correct_ans_match2.group(1).strip() if correct_ans_match2 else None
            
            if not correct_ans:
                correct_ans_match3 = re.match(r'The\s+correct\s+answer\s+is\s+either\s+(.+?)\.', ans_content, re.IGNORECASE)
                correct_ans = correct_ans_match3.group(1).strip() if correct_ans_match3 else None

            answers[q_num] = {
                "correct_answer": correct_ans,
                "explanation_md": ans_content
            }
            
        modules_data.append({
            "id": f"mod{i+1}",
            "answers": answers
        })
        
        expected = [33, 33, 27, 27]
        count = expected[i] if i < len(expected) else "?"
        print(f"  Module mod{i+1}: {len(answers)}/{count} answers parsed")
        
    return modules_data


def main():
    test_path = "/Users/lifengliu/Downloads/full-length-sat-paper-practice-test_-bundle-8/sat-practice-test-8-digital-2026-05-13_03-35-55.md"
    answers_path = "/Users/lifengliu/Downloads/full-length-sat-paper-practice-test_-bundle-8/sat-practice-test-8-answers-digital-2026-05-13_03-39-55.md"
    
    print("=" * 60)
    print("=== Parsing Test 8 questions ===")
    print("=" * 60)
    test_modules = parse_test(test_path)
    
    print("\n" + "=" * 60)
    print("=== Parsing Test 8 answers ===")
    print("=" * 60)
    answers_modules = parse_answers(answers_path)
    
    # Merge
    final_modules = []
    
    print("\n" + "=" * 60)
    print("=== Merging questions and answers ===")
    print("=" * 60)
    
    for i in range(min(len(test_modules), len(answers_modules))):
        t_mod = test_modules[i]
        a_mod = answers_modules[i]
        
        merged_qs = []
        for q_num in sorted(t_mod["questions"].keys()):
            q_data = t_mod["questions"][q_num]
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
        
        if i == 0:
            mod_name = "Reading and Writing Module 1"
            time_limit = 39 * 60
        elif i == 1:
            mod_name = "Reading and Writing Module 2"
            time_limit = 39 * 60
        elif i == 2:
            mod_name = "Math Module 1"
            time_limit = 43 * 60
        elif i == 3:
            mod_name = "Math Module 2"
            time_limit = 43 * 60
        else:
            mod_name = f"Module {i+1}"
            time_limit = 39 * 60
            
        final_modules.append({
            "id": f"mod{i+1}",
            "name": mod_name,
            "timeLimit": time_limit,
            "questions": merged_qs
        })
        
        print(f"\nModule {i+1} ({mod_name}): {len(merged_qs)} questions merged")
        missing_ans = [q for q in merged_qs if not q["correctAnswer"]]
        if missing_ans:
            print(f"  ⚠️  {len(missing_ans)} questions missing correct answers: {[q['number'] for q in missing_ans]}")
        else:
            print(f"  ✅  All questions have correct answers")
    
    output = {
        "test_id": "test8",
        "title": "SAT Practice Test 8",
        "modules": final_modules
    }
    
    out_path = "/Users/lifengliu/Documents/liulifeng_文档/python练习文件/SATWEB/data/test8_parsed.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
        
    total_qs = sum(len(m["questions"]) for m in final_modules)
    print(f"\n{'='*60}")
    print(f"✅ Successfully generated {out_path}")
    print(f"Total modules: {len(final_modules)}")
    print(f"Total questions: {total_qs}")
    print(f"{'='*60}")
    
    for m in final_modules:
        qs = m["questions"]
        mc = [q for q in qs if q["type"] == "multiple-choice"]
        gi = [q for q in qs if q["type"] == "grid-in"]
        print(f"  {m['name']}: {len(mc)} MC + {len(gi)} grid-in = {len(qs)} total")

if __name__ == "__main__":
    main()
