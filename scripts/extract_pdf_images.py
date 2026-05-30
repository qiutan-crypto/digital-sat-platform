import os
import json
import re
import fitz

SUPABASE_URL = 'https://pdsppgedfzwytogpnmrh.supabase.co'
SUPABASE_KEY = 'sb_publishable_3kFnGcu2H-sUDFLXyt2bcA_PJGuNus4'

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

import requests

def normalize_text(text):
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\$[^$]+\$', ' ', text)
    text = re.sub(r'\$\$?', ' ', text)
    text = text.lower()
    # Replace non-alphanumeric chars with spaces (keeping numbers!)
    text = re.sub(r'[^a-z0-9]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def get_search_windows(text_segment, window_size=5):
    cleaned_html = re.sub(r'<[^>]+>', ' ', text_segment)
    cleaned_math = re.sub(r'\$[^$]+\$', ' ', cleaned_html)
    cleaned_math = re.sub(r'\$\$?', ' ', cleaned_math)
    
    cleaned_space = re.sub(r'[^a-zA-Z0-9]', ' ', cleaned_math)
    words = cleaned_space.split()
    
    ignored_words = {'note', 'figure', 'drawn', 'scale'}
    filtered = []
    for w in words:
        w_clean = w.lower()
        # Keep alphanumeric words (so numbers like 2021 are preserved!)
        if w_clean.isalnum() and w_clean not in ignored_words:
            filtered.append(w_clean)
            
    windows = []
    for i in range(len(filtered) - window_size + 1):
        win = " ".join(filtered[i:i+window_size])
        windows.append(win)
    return windows

def rect_dist(r1, r2):
    dx = max(0, r1.x0 - r2.x1, r2.x0 - r1.x1)
    dy = max(0, r1.y0 - r2.y1, r2.y0 - r1.y1)
    return max(dx, dy)

def get_sorted_groups(page, threshold=40):
    drawings = page.get_drawings()
    page_rect = page.rect
    
    # Filter rects
    rects = []
    for d in drawings:
        r = d['rect']
        # Exclude header/footer: top header is at y0=115, so we exclude y0 <= 130!
        if r.y0 > 130 and r.y1 < page_rect.height - 50:
            # Exclude question header banner bars (which act as horizontal bridges)
            if r.height < 15 and r.width > 200:
                continue
            # Exclude page-border lines or column layout separators
            if r.width > 500 or r.height > 500:
                continue
            if (r.width < 3 and r.height > 300) or (r.height < 3 and r.width > 300):
                continue
            # Keep reasonable drawing elements
            if r.width < page_rect.width - 20 and r.height < page_rect.height - 20:
                rects.append(r)
                
    if not rects:
        return []
        
    # Start with one group per rect
    groups = [[r] for r in rects]
    
    # Merge groups iteratively
    changed = True
    while changed:
        changed = False
        for i in range(len(groups)):
            for j in range(i + 1, len(groups)):
                close = False
                for r1 in groups[i]:
                    for r2 in groups[j]:
                        if rect_dist(r1, r2) < threshold:
                            close = True
                            break
                    if close:
                        break
                if close:
                    groups[i].extend(groups[j])
                    groups.pop(j)
                    changed = True
                    break
            if changed:
                break
                
    # Union rects using custom union to include empty rects (e.g. 0-height grid lines)
    group_rects = []
    for g in groups:
        x0 = min(r.x0 for r in g)
        y0 = min(r.y0 for r in g)
        x1 = max(r.x1 for r in g)
        y1 = max(r.y1 for r in g)
        union = fitz.Rect(x0, y0, x1, y1)
        # Filter out tiny noise elements and large page dividers/borders
        if union.width > 15 and union.height > 15:
            if union.width < 450 and union.height < 450:
                group_rects.append(union)
            
    return group_rects

def get_adaptive_groups(page, expected_count, initial_threshold=40):
    # Try decreasing threshold to split merged groups if we expect more diagrams
    for th in range(initial_threshold, 9, -5):
        groups = get_sorted_groups(page, threshold=th)
        major_groups = [g for g in groups if g.width > 30 and g.height > 30]
        if len(major_groups) >= expected_count:
            return groups
    # Fallback to initial threshold if we can't find enough groups
    return get_sorted_groups(page, threshold=initial_threshold)

def find_page_for_context(doc, context):
    windows = get_search_windows(context, window_size=5)
    if not windows:
        return None
    page_scores = [0] * len(doc)
    for p_idx in range(len(doc)):
        page_text_norm = normalize_text(doc[p_idx].get_text())
        for win in windows:
            if win in page_text_norm:
                page_scores[p_idx] += 1
    max_score = max(page_scores)
    if max_score > 0:
        return page_scores.index(max_score) + 1
    return None

def extract_images_from_test(test_num):
    pdf_path = f"/Users/lifengliu/Downloads/full-length-sat-paper-practice-test_-bundle-{test_num}/sat-practice-test-{test_num}-digital.pdf"
    json_path = f"data/test{test_num}_parsed.json"
    dest_folder = f"/Users/lifengliu/Documents/liulifeng_文档/python练习文件/SATWEB/images/test{test_num}"
    
    if not os.path.exists(pdf_path):
        print(f"PDF file not found: {pdf_path}")
        return
    if not os.path.exists(json_path):
        print(f"JSON file not found: {json_path}")
        return
        
    os.makedirs(dest_folder, exist_ok=True)
    
    doc = fitz.open(pdf_path)
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    print(f"\n==========================================")
    print(f"Processing Test {test_num}...")
    print(f"==========================================")
    
    # 1. Clean choices watermark images first
    img_tag_pattern = re.compile(r'(<div[^>]*>\s*<img[^>]*>\s*</div>|<img[^>]*>)')
    cleaned_choices_count = 0
    for mod in data.get('modules', []):
        for q in mod.get('questions', []):
            new_choices = []
            for choice in q.get('choices', []):
                original_choice = choice
                parts = choice.split('\n\n')
                if len(parts) > 1 and parts[-1].strip().startswith('<div') and 'img' in parts[-1]:
                     choice = '\n\n'.join(parts[:-1]).strip()
                elif len(parts) > 1 and parts[-1].strip().startswith('<img'):
                     choice = '\n\n'.join(parts[:-1]).strip()
                elif 'maas-watermark-prod' in choice:
                     choice = re.sub(r'<div[^>]*><img[^>]*maas-watermark-prod[^>]*></div>', '', choice).strip()
                     choice = re.sub(r'<img[^>]*maas-watermark-prod[^>]*>', '', choice).strip()
                if 'img src=' in choice and ('maas-watermark' in choice or 'crop_' in choice):
                     choice = img_tag_pattern.sub('', choice).strip()
                if choice != original_choice:
                     cleaned_choices_count += 1
                new_choices.append(choice)
            q['choices'] = new_choices
            
    print(f"Cleaned {cleaned_choices_count} watermark choice images.")

    # 2. Collect images that need to be extracted on each page
    url_pattern = re.compile(r'https://[^\s\'"\(\)]+\.png[^\s\'"\(\)]*')
    page_to_images = {}
    replacements = []
    
    for m_idx, mod in enumerate(data.get('modules', [])):
        for q_idx, q in enumerate(mod.get('questions', [])):
            # Process question text
            q_text = q.get('question', '')
            found_urls = url_pattern.findall(q_text)
            for url in found_urls:
                # Localized context text to find page in PDF
                idx = q_text.find(url)
                end_div = q_text.find('</div>', idx)
                if end_div != -1:
                    context = q_text[end_div + 6 : end_div + 400]
                    if not context.strip():
                        context = q_text[max(0, idx - 400) : idx]
                else:
                    context = q_text[idx + len(url) : idx + len(url) + 400]
                    if not context.strip():
                        context = q_text[max(0, idx - 400) : idx]
                
                matched_page = find_page_for_context(doc, context)
                # Fallback to overall question text if localized context matching fails
                if not matched_page:
                    matched_page = find_page_for_context(doc, q_text)
                    
                if not matched_page:
                    print(f"  ❌ FAILED to match page for image {url[:50]}... in Mod {m_idx} Q{q.get('number')}")
                    continue
                    
                parsed_filename = re.search(r'crop_[^?\'"\s]+', url)
                filename = parsed_filename.group(0) if parsed_filename else os.path.basename(url.split('?')[0])
                
                if matched_page not in page_to_images:
                    page_to_images[matched_page] = []
                    
                page_to_images[matched_page].append({
                    'url': url,
                    'filename': filename,
                    'field': 'question',
                    'q_id': q.get('id'),
                    'q_num': q.get('number'),
                    'mod_idx': m_idx,
                    'q_obj': q
                })
                
            # Process explanation text
            expl_text = q.get('explanation', '')
            found_urls_expl = url_pattern.findall(expl_text)
            for url in found_urls_expl:
                matched_page = find_page_for_context(doc, q_text)
                if not matched_page:
                    print(f"  ❌ FAILED to match page for explanation image {url[:50]}... in Mod {m_idx} Q{q.get('number')}")
                    continue
                    
                parsed_filename = re.search(r'crop_[^?\'"\s]+', url)
                filename = parsed_filename.group(0) if parsed_filename else os.path.basename(url.split('?')[0])
                
                if matched_page not in page_to_images:
                    page_to_images[matched_page] = []
                    
                page_to_images[matched_page].append({
                    'url': url,
                    'filename': filename,
                    'field': 'explanation',
                    'q_id': q.get('id'),
                    'q_num': q.get('number'),
                    'mod_idx': m_idx,
                    'q_obj': q
                })

    # 3. Crop and save images for each page
    for page_num in sorted(page_to_images.keys()):
        imgs = page_to_images[page_num]
        page = doc[page_num - 1]
        page_rect = page.rect
        
        # Run adaptive threshold 2D clustering to find drawing groups
        groups = get_adaptive_groups(page, expected_count=len(imgs))
        
        # Area sort to filter out noise
        # Keep only the top len(imgs) largest groups
        groups = sorted(groups, key=lambda g: g.width * g.height, reverse=True)[:len(imgs)]
        
        # Get text blocks of the page to expand crops for titles, axis labels, legends, etc.
        text_blocks = []
        for block in page.get_text("blocks"):
            x0, y0, x1, y1, text, block_no, block_type = block
            if text.strip():
                text_blocks.append((fitz.Rect(x0, y0, x1, y1), text.strip()))
                
        expanded_groups = []
        for gr in groups:
            curr_rect = fitz.Rect(gr)
            merged_any = True
            merged_texts = []
            while merged_any:
                merged_any = False
                for tb_rect, tb_text in text_blocks:
                    if tb_text in merged_texts:
                        continue
                    text_clean = tb_text.replace("\n", " ").strip()
                    # Skip wide layout separator blocks or page banners
                    if tb_rect.width > 280:
                        continue
                    if tb_rect.height > 150:
                        continue
                    # Skip noise/layout lines containing mostly separator symbols
                    clean_symbols = re.sub(r'[\s\-\._~\|\+=\*#\(\):]+', '', tb_text)
                    if len(clean_symbols) <= 1:
                        continue
                    # Skip pure digits only if they are in the header area (likely question numbers)
                    if text_clean.isdigit() and tb_rect.y0 < 130:
                        continue
                    # Skip large paragraphs (question text / choices)
                    if len(tb_text) >= 120 or len(tb_text.split()) >= 20:
                        continue
                    # Skip choice identifiers
                    if re.match(r'^[A-D]\)', text_clean):
                        continue
                    # Skip start of question sentences
                    if text_clean.startswith("Which ") or text_clean.startswith("What is") or text_clean.startswith("If the "):
                        continue
                    # Skip directions/banners
                    if "Unauthorized copying" in text_clean or "CONTINUE" in text_clean or "STOP" in text_clean:
                        continue
                        
                    dx = max(0, tb_rect.x0 - curr_rect.x1, curr_rect.x0 - tb_rect.x1)
                    dy = max(0, tb_rect.y0 - curr_rect.y1, curr_rect.y0 - tb_rect.y1)
                    dist = max(dx, dy)
                    
                    if dist < 45:
                        overlaps_x = (tb_rect.x0 < curr_rect.x1) and (tb_rect.x1 > curr_rect.x0)
                        overlaps_y = (tb_rect.y0 < curr_rect.y1) and (tb_rect.y1 > curr_rect.y0)
                        
                        if overlaps_x or (overlaps_y and dx < 15) or (dx < 15 and dy < 15):
                            curr_rect = fitz.Rect(
                                min(curr_rect.x0, tb_rect.x0),
                                min(curr_rect.y0, tb_rect.y0),
                                max(curr_rect.x1, tb_rect.x1),
                                max(curr_rect.y1, tb_rect.y1)
                            )
                            merged_texts.append(tb_text)
                            merged_any = True
            expanded_groups.append(curr_rect)
        groups = expanded_groups
        
        # Row-major sort the final matched groups
        rows = []
        for gr in groups:
            center_y = (gr.y0 + gr.y1) / 2
            placed = False
            for r in rows:
                row_center_y = sum((item.y0 + item.y1)/2 for item in r) / len(r)
                if abs(center_y - row_center_y) < 40:
                    r.append(gr)
                    placed = True
                    break
            if not placed:
                rows.append([gr])
                
        rows = sorted(rows, key=lambda r: sum((item.y0 + item.y1)/2 for item in r)/len(r))
        sorted_groups = []
        for r in rows:
            r_sorted = sorted(r, key=lambda gr: gr.x0)
            sorted_groups.extend(r_sorted)
            
        print(f"Page {page_num}: mapping {len(imgs)} images to {len(sorted_groups)} drawings...")
        
        for idx, img in enumerate(imgs):
            if idx < len(sorted_groups):
                gr = sorted_groups[idx]
                
                # Crop page and save
                padding = 8
                crop_rect = fitz.Rect(
                    max(0, gr.x0 - padding),
                    max(0, gr.y0 - padding),
                    min(page_rect.width, gr.x1 + padding),
                    min(page_rect.height, gr.y1 + padding)
                )
                
                orig_cropbox = page.cropbox
                page.set_cropbox(crop_rect)
                
                # Render to high-DPI image
                pix = page.get_pixmap(dpi=150)
                filepath = os.path.join(dest_folder, img['filename'])
                pix.save(filepath)
                
                page.set_cropbox(orig_cropbox)
                print(f"  Saved: {img['filename']} (Mod {img['mod_idx']} Q{img['q_num']}) to {filepath}")
                
                # Update JSON replacement list
                local_url = f"images/test{test_num}/{img['filename']}"
                replacements.append((img['q_obj'], img['field'], img['url'], local_url))
            else:
                print(f"  ⚠️ Warning: No matching drawing group for {img['filename']} on page {page_num}!")

    # 4. Perform replacements in JSON data
    for q_obj, field, old_url, new_url in replacements:
        q_obj[field] = q_obj[field].replace(old_url, new_url)

    # Save the updated JSON locally
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Successfully updated local JSON: {json_path}")
    
    # 5. Upload to Supabase
    payload = {
        'id': f"test{test_num}",
        'title': data['title'],
        'content': data
    }
    url = f"{SUPABASE_URL}/rest/v1/sat_tests"
    response = requests.post(url, headers=HEADERS, json=payload)
    if response.status_code in [200, 201]:
        print(f"✅ Successfully uploaded test{test_num} to Supabase!")
    else:
        print(f"❌ Failed to upload test{test_num} to Supabase. Status: {response.status_code}")
        print(response.text)

if __name__ == '__main__':
    for t_num in range(4, 12):
        extract_images_from_test(t_num)
