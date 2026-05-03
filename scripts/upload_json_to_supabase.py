import json
import requests
import sys

import os

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'your_supabase_url_here')
SUPABASE_KEY = os.environ.get('SUPABASE_KEY', 'your_supabase_key_here')

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

def upload_test_data():
    with open('/Users/lifengliu/Documents/liulifeng_文档/python练习文件/SATWEB/data/test4_parsed.json', 'r', encoding='utf-8') as f:
        test_data = json.load(f)
        
    payload = {
        'id': test_data['test_id'],
        'title': test_data['title'],
        'content': test_data
    }
    
    url = f"{SUPABASE_URL}/rest/v1/sat_tests"
    
    response = requests.post(url, headers=headers, json=payload)
    
    if response.status_code in [200, 201]:
        print("Successfully uploaded the test data to Supabase!")
    else:
        print(f"Failed to upload data. Status code: {response.status_code}")
        print(response.text)

if __name__ == '__main__':
    upload_test_data()
