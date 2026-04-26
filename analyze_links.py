import os
import re

def get_html_files():
    html_files = []
    for root, dirs, files in os.walk('.'):
        for file in files:
            if file.endswith('.html'):
                html_files.append(os.path.normpath(os.path.join(root, file)))
    return html_files

def extract_links(filepath):
    links = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
            # Find href="..."
            hrefs = re.findall(r'href="([^"#\?]+)', content)
            links.extend([h for h in hrefs if h.endswith('.html')])
            # Find window.location.href="..."
            locs = re.findall(r'window\.location\.href\s*=\s*"([^"#\?]+)', content)
            links.extend([l for l in locs if l.endswith('.html')])
            # Find window.location.replace("...")
            repl = re.findall(r'window\.location\.replace\("([^"#\?]+)', content)
            links.extend([r for r in repl if r.endswith('.html')])
    except Exception as e:
        pass
    return links

def main():
    all_files = get_html_files()
    graph = {}
    for f in all_files:
        links = extract_links(f)
        resolved_links = set()
        base_dir = os.path.dirname(f)
        for link in links:
            if link.startswith('http'):
                continue
            resolved = os.path.normpath(os.path.join(base_dir, link))
            if resolved in all_files:
                resolved_links.add(resolved)
        graph[f] = list(resolved_links)

    # Start from known entry points
    entry_points = [
        'index.html',
        'firebase/index.html',
        'firebase/home/cyborg/index.html',
        'firebase/home/Scaffold/index3.html',
        'login/login.html',
        'login/login2.html',
        'login/fire-login.html',
        'firebase/home/main_ai3.html'
    ]

    visited = set()
    queue = [os.path.normpath(e) for e in entry_points if os.path.normpath(e) in all_files]
    
    while queue:
        node = queue.pop(0)
        if node not in visited:
            visited.add(node)
            for neighbor in graph.get(node, []):
                if neighbor not in visited:
                    queue.append(neighbor)
                    
    with open('unused_files_report.txt', 'w') as out:
        out.write("ACTIVE FILES:\n")
        for v in sorted(visited):
            out.write(f"  {v}\n")
            
        out.write("\nUNUSED FILES:\n")
        for f in sorted(all_files):
            if f not in visited and 'older' not in f and 'backup' not in f:
                out.write(f"  {f}\n")

if __name__ == '__main__':
    main()
