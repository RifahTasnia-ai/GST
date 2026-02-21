import os
import json
import re
import base64
from bs4 import BeautifulSoup, NavigableString

INPUT_FILES = [
    {
        'path': 'Udavas_Files/GST Guccho Admission Test 2024-25 Practice Exam.html',
        'output': 'public/GST-Admission-2024-25.json'
    },
    {
        'path': 'Udavas_Files/GST Guccho Model Test-03 Practice Exam.html',
        'output': 'public/GST-Model-Test-03.json'
    },
    {
        'path': 'Udavas_Files/GST Guccho Model Test-04 Practice Exam.html',
        'output': 'public/GST-Model-Test-04.json'
    }
]

IMAGE_DIR = 'public/images'
if not os.path.exists(IMAGE_DIR):
    os.makedirs(IMAGE_DIR)

def mathml_to_latex(math_tag):
    if isinstance(math_tag, NavigableString):
        return math_tag.strip()
    
    tag = math_tag.name
    
    if tag == 'math':
        return "".join([mathml_to_latex(c) for c in math_tag.children])
    
    if tag == 'mfrac':
        children = [c for c in math_tag.children if not isinstance(c, NavigableString) or c.strip()]
        if len(children) >= 2:
            num = mathml_to_latex(children[0])
            den = mathml_to_latex(children[1])
            return f"\\frac{{{num}}}{{{den}}}"
    
    if tag == 'msqrt':
        return f"\\sqrt{{{''.join([mathml_to_latex(c) for c in math_tag.children])}}}"
    
    if tag == 'msup':
        children = [c for c in math_tag.children if not isinstance(c, NavigableString) or c.strip()]
        if len(children) >= 2:
            base = mathml_to_latex(children[0])
            sup = mathml_to_latex(children[1])
            return f"{{{base}}}^{{{sup}}}"
            
    if tag == 'msub':
        children = [c for c in math_tag.children if not isinstance(c, NavigableString) or c.strip()]
        if len(children) >= 2:
            base = mathml_to_latex(children[0])
            sub = mathml_to_latex(children[1])
            return f"{{{base}}}_{{{sub}}}"
            
    if tag == 'msubsup':
        children = [c for c in math_tag.children if not isinstance(c, NavigableString) or c.strip()]
        if len(children) >= 3:
            base = mathml_to_latex(children[0])
            sub = mathml_to_latex(children[1])
            sup = mathml_to_latex(children[2])
            return f"{{{base}}}_{{{sub}}}^{{{sup}}}"

    if tag == 'mn' or tag == 'mi' or tag == 'mo':
        return math_tag.get_text().strip()

    if tag == 'mtext':
        t = math_tag.get_text()
        return f"\\text{{{t}}}" if t.strip() else " "
    
    if tag == 'mtable':
        rows = []
        for row in math_tag.find_all('mtr'):
            cols = []
            for col in row.find_all('mtd'):
                cols.append(mathml_to_latex(col))
            rows.append(" & ".join(cols))
        return f"\\begin{{matrix}} {' \\\\ '.join(rows)} \\end{{matrix}}"
        
    return "".join([mathml_to_latex(c) for c in math_tag.children])

def process_text_content(soup_elem):
    for mml in soup_elem.find_all('mjx-assistive-mml'):
        math_tag = mml.find('math')
        if math_tag:
            latex = mathml_to_latex(math_tag)
            # Clean up: remove trailing lone backslashes/spaces
            latex = latex.strip()
            latex = re.sub(r'\\\s*$', '', latex)  # remove trailing \ 
            latex_str = f" $${latex}$$ "
            container = mml.find_parent('mjx-container')
            if container:
                container.replace_with(latex_str)
            else:
                mml.replace_with(latex_str)
    
    text = soup_elem.get_text(" ", strip=True)
    text = re.sub(r'pt-[0-9a-f-]+', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    # Clean any remaining trailing backslashes inside $$..$$
    text = re.sub(r'\$\$(.*?)\\\s*\$\$', lambda m: '$$' + m.group(1).rstrip('\\').rstrip() + '$$', text)
    return text

def extract_images_from_div(div_elem, q_id, prefix):
    found = False
    for img in div_elem.find_all('img'):
        src = img.get('src')
        if src and src.startswith('data:image'):
            try:
                header, encoded = src.split(',', 1)
                ext = 'png'
                if 'svg' in header: ext = 'svg'
                elif 'jpeg' in header: ext = 'jpg'
                
                h = str(hash(encoded) % 1000000)
                fname = f"{prefix}_q{q_id}_{h}.{ext}"
                fpath = os.path.join(IMAGE_DIR, fname)
                
                with open(fpath, "wb") as fh:
                    fh.write(base64.b64decode(encoded))
                
                img['src'] = f"/images/{fname}"
                img['style'] = "max-width:100%; display:block; margin:10px auto;"
                found = True
            except:
                pass
    return found

def process_file(file_config):
    print(f"Processing {file_config['path']}...")
    if not os.path.exists(file_config['path']):
        print(f"File not found")
        return

    with open(file_config['path'], 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')

    mcqs = []
    current_subject = "General"
    q_counter = 0
    
    # Linear scan of all elements
    elements = soup.find_all(['h2', 'div'])
    
    # We use a set to avoid processing nested divs duplicatively if find_all returns both parent and child
    # But find_all returns all descendants.
    # We only care about 'questionBlock'.
    # We need to filter out non-questionBlock divs unless they strictly contain questionBlocks?
    # No, we just check if it IS a questionBlock.
    
    processed_blocks = set()

    for elem in elements:
        if elem.name == 'h2':
            txt = elem.get_text(strip=True)
            # Regex to capture "Physics" from "Physics (25)" or "Bangla (20)"
            m = re.match(r'^(.+)\s*\(', txt)
            if m:
                current_subject = m.group(1).strip()
            elif txt:
                current_subject = txt
        
        elif elem.name == 'div' and 'questionBlock' in elem.get('class', []):
            if elem in processed_blocks:
                continue
            processed_blocks.add(elem)
            
            q_counter += 1
            q_data = process_question(elem, q_counter, current_subject, file_config['output'])
            if q_data:
                mcqs.append(q_data)

    # Filter: keep only science subjects
    KEEP_SUBJECTS = {'Physics', 'Chemistry', 'Biology', 'Higher Mathematics',
                     'পদার্থবিজ্ঞান', 'রসায়ন', 'জীববিজ্ঞান', 'উচ্চতর গণিত'}
    before = len(mcqs)
    all_subjects = set(q['subject'] for q in mcqs)
    print(f"  Before filter: {before} questions, subjects: {all_subjects}")
    mcqs = [q for q in mcqs if q['subject'] in KEEP_SUBJECTS]
    print(f"  After filter: {len(mcqs)} questions")
    
    # Re-number IDs
    for i, q in enumerate(mcqs):
        q['id'] = i + 1

    with open(file_config['output'], 'w', encoding='utf-8') as f:
        json.dump(mcqs, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(mcqs)} questions (filtered from {q_counter} total)")

def process_question(block, q_id, subject, filename):
    q_text_div = block.find('div', class_='questionText')
    if not q_text_div: return None
    
    prefix = os.path.basename(filename).replace('.json', '')
    has_diagram = extract_images_from_div(q_text_div, q_id, prefix)
    q_text = process_text_content(q_text_div)
    
    options = {}
    correct = None
    
    opts_div = block.find('div', class_='questionOptions')
    if opts_div:
        opt_divs = opts_div.find_all('div', class_='questionOption')
        map_idx = {0:'a', 1:'b', 2:'c', 3:'d'}
        for i, od in enumerate(opt_divs):
            key = map_idx.get(i)
            if not key: continue
            
            if od.find('span', class_='fa-check'):
                correct = key
            
            label = od.find('label') or od
            if extract_images_from_div(label, q_id, prefix):
                has_diagram = True
            options[key] = process_text_content(label)
    
    expl = ""
    solve = block.find('div', class_='solveText')
    if solve:
        for s in solve.find_all('span'):
            if 'Solution:' in s.get_text():
                s.decompose()
        expl = process_text_content(solve)
        
    return {
        "id": q_id,
        "subject": subject,
        "question": q_text,
        "options": options,
        "correctAnswer": correct,
        "explanation": expl,
        "hasDiagram": has_diagram,
        "svg_code": "", 
        "topic": ""
    }

if __name__ == "__main__":
    for c in INPUT_FILES:
        process_file(c)
