import os
import requests
import re

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Please set SUPABASE_URL and SUPABASE_KEY environment variables.")
    exit(1)

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

def fix_text(text):
    if not text:
        return text
        
    original = text

    # Fix $$ ... $$ containing lots of English
    def replacer_double(m):
        inner = m.group(1)
        words = re.findall(r'[a-zA-Z]{4,}', inner)
        if len(words) >= 4 and '=' not in inner and '\\frac' not in inner and '\\sqrt' not in inner:
            return '\n\n' + inner.strip() + '\n\n'
        return m.group(0)

    # Fix $ ... $ containing lots of English
    def replacer_single(m):
        inner = m.group(1)
        words = re.findall(r'[a-zA-Z]{4,}', inner)
        if len(words) >= 4 and '=' not in inner and '\\frac' not in inner and '\\sqrt' not in inner:
            return ' ' + inner.strip() + ' '
        return m.group(0)

    text = re.sub(r'\$\$([^\$]+)\$\$', replacer_double, text)
    text = re.sub(r'\$([^\$]+)\$', replacer_single, text)
    
    return text

print("Fetching tests from Supabase...")
url = f"{SUPABASE_URL}/rest/v1/sat_tests?select=id,content"
resp = requests.get(url, headers=HEADERS)
resp.raise_for_status()
tests = resp.json()

total_fixes = 0

for test in tests:
    content = test['content']
    modified = False
    
    print(f"Checking {test['id']}...")
    for mod in content.get('modules', []):
        for q in mod.get('questions', []):
            orig_q = q.get('question', '')
            new_q = fix_text(orig_q)
            if new_q != orig_q:
                q['question'] = new_q
                modified = True
                print(f"  Fixed question text in Q{q.get('id')}")
                
            new_choices = []
            for c in q.get('choices', []):
                new_c = fix_text(c)
                if new_c != c:
                    modified = True
                    print(f"  Fixed choice text in Q{q.get('id')}")
                new_choices.append(new_c)
            q['choices'] = new_choices
            
    if modified:
        total_fixes += 1
        print(f"  --> Updating {test['id']} in Supabase...")
        post_url = f"{SUPABASE_URL}/rest/v1/sat_tests"
        data = {
            "id": test['id'],
            "content": content
        }
        res = requests.post(post_url, headers=HEADERS, json=data)
        res.raise_for_status()

print(f"Done. Fixed {total_fixes} tests.")
