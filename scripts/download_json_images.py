import os
import json
import re
import requests
from urllib.parse import urlparse

SUPABASE_URL = 'https://pdsppgedfzwytogpnmrh.supabase.co'
SUPABASE_KEY = 'sb_publishable_3kFnGcu2H-sUDFLXyt2bcA_PJGuNus4'

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

import time

def download_image(url, dest_folder):
    try:
        # Check if the URL is expired to avoid network calls
        expires_match = re.search(r'Expires=(\d+)', url)
        if expires_match:
            expires_ts = int(expires_match.group(1))
            if expires_ts < time.time():
                # Already expired, don't try to download
                return False, None
                
        # Extract filename from URL path
        parsed_url = urlparse(url)
        path = parsed_url.path
        filename = os.path.basename(path)
        if not filename.endswith('.png') and not filename.endswith('.jpg'):
            filename = filename + '.png' # fallback
            
        dest_path = os.path.join(dest_folder, filename)
        
        # Don't download again if it already exists
        if os.path.exists(dest_path):
            return True, filename
            
        # Download the file
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            with open(dest_path, 'wb') as f:
                f.write(r.content)
            print(f"  Downloaded: {filename}")
            return True, filename
        else:
            return False, None
    except Exception as e:
        print(f"  Error downloading {url[:60]}: {e}")
        return False, None

def process_test(json_path):
    if not os.path.exists(json_path):
        print(f"File not found: {json_path}")
        return
        
    with open(json_path, 'r', encoding='utf-8') as f:
        test_data = json.load(f)
        
    test_id = test_data['test_id']
    print(f"Processing {test_id} ({test_data['title']})...")
    
    # Create images directory
    dest_folder = f"/Users/lifengliu/Documents/liulifeng_文档/python练习文件/SATWEB/images/{test_id}"
    os.makedirs(dest_folder, exist_ok=True)
    
    downloaded_count = 0
    failed_count = 0
    already_local_count = 0
    
    # regex to find maas-watermark image urls
    url_pattern = re.compile(r'https://maas-watermark-prod-new\.cn-wlcb\.ufileos\.com/[^\'\"]+')
    
    for mod in test_data.get('modules', []):
        for q in mod.get('questions', []):
            # 1. Process question text
            q_text = q.get('question', '')
            found_urls = url_pattern.findall(q_text)
            for url in found_urls:
                success, local_filename = download_image(url, dest_folder)
                if success:
                    local_url = f"images/{test_id}/{local_filename}"
                    q['question'] = q['question'].replace(url, local_url)
                    downloaded_count += 1
                else:
                    failed_count += 1
                    
            # 2. Process choices
            new_choices = []
            for choice in q.get('choices', []):
                found_urls = url_pattern.findall(choice)
                for url in found_urls:
                    success, local_filename = download_image(url, dest_folder)
                    if success:
                        local_url = f"images/{test_id}/{local_filename}"
                        choice = choice.replace(url, local_url)
                        downloaded_count += 1
                    else:
                        failed_count += 1
                new_choices.append(choice)
            q['choices'] = new_choices
            
            # 3. Process explanation
            expl = q.get('explanation', '')
            found_urls = url_pattern.findall(expl)
            for url in found_urls:
                success, local_filename = download_image(url, dest_folder)
                if success:
                    local_url = f"images/{test_id}/{local_filename}"
                    q['explanation'] = q['explanation'].replace(url, local_url)
                    downloaded_count += 1
                else:
                    failed_count += 1
                    
    # Clean up garbage watermark images from choices in the JSON if any remain
    # (using same logic as scratch_clean.py)
    for mod in test_data.get('modules', []):
        for q in mod.get('questions', []):
            new_choices = []
            for choice in q.get('choices', []):
                original_choice = choice
                parts = choice.split('\n\n')
                if len(parts) > 1 and parts[-1].strip().startswith('<div'):
                    if 'img' in parts[-1]:
                        choice = '\n\n'.join(parts[:-1]).strip()
                elif len(parts) > 1 and parts[-1].strip().startswith('<img'):
                    choice = '\n\n'.join(parts[:-1]).strip()
                new_choices.append(choice)
            q['choices'] = new_choices

    print(f"  Summary: {downloaded_count} images local/downloaded, {failed_count} failed/expired")
    
    # Save the updated JSON locally
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(test_data, f, indent=2, ensure_ascii=False)
    print(f"  Saved updated JSON file: {json_path}")
    
    # Upload to Supabase
    payload = {
        'id': test_id,
        'title': test_data['title'],
        'content': test_data
    }
    url = f"{SUPABASE_URL}/rest/v1/sat_tests"
    response = requests.post(url, headers=HEADERS, json=payload)
    if response.status_code in [200, 201]:
        print(f"  ✅ Successfully uploaded {test_id} to Supabase!")
    else:
        print(f"  ❌ Failed to upload {test_id}. Status code: {response.status_code}")
        print(response.text)

if __name__ == '__main__':
    import sys
    data_dir = '/Users/lifengliu/Documents/liulifeng_文档/python练习文件/SATWEB/data'
    if len(sys.argv) > 1:
        test_file = sys.argv[1]
        process_test(os.path.join(data_dir, f"{test_file}_parsed.json"))
    else:
        # Process all files
        for filename in sorted(os.listdir(data_dir)):
            if filename.endswith('_parsed.json'):
                process_path = os.path.join(data_dir, filename)
                process_test(process_path)
