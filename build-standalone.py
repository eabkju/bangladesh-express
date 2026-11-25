#!/usr/bin/env python3
"""
build-standalone.py - Compiles modular CSS & JS files into a single, offline train-game-standalone.html
Run this script before every commit to keep train-game-standalone.html in perfect sync.
"""
import os
import re

REPO_DIR = os.path.dirname(os.path.abspath(__file__))

def build_standalone():
    index_path = os.path.join(REPO_DIR, 'index.html')
    css_path = os.path.join(REPO_DIR, 'css', 'style.css')
    three_path = os.path.join(REPO_DIR, 'libs', 'three.min.js')
    standalone_path = os.path.join(REPO_DIR, 'train-game-standalone.html')

    js_files = [
        'js/config.js',
        'js/audio.js',
        'js/track.js',
        'js/physics.js',
        'js/train.js',
        'js/environment.js',
        'js/village.js',
        'js/weather.js',
        'js/journey.js',
        'js/controls.js',
        'js/main.js'
    ]

    with open(index_path, 'r', encoding='utf-8') as f:
        html = f.read()

    with open(css_path, 'r', encoding='utf-8') as f:
        css = f.read()

    with open(three_path, 'r', encoding='utf-8') as f:
        three_js = f.read()

    # Inline style
    style_tag = f"<style>\n{css}\n</style>"
    html = re.sub(r'<link rel="stylesheet" href="css/style\.css">', style_tag, html)

    # Build bundled scripts
    bundled_scripts = []
    # 1. Three.js
    bundled_scripts.append(f"<script>\n{three_js}\n</script>")

    # 2. Game scripts
    for rel_path in js_files:
        full_path = os.path.join(REPO_DIR, rel_path)
        with open(full_path, 'r', encoding='utf-8') as f:
            js_content = f.read()
        bundled_scripts.append(f"<script>\n// --- {rel_path} ---\n{js_content}\n</script>")

    all_scripts_str = "\n".join(bundled_scripts)

    # Replace script references in HTML
    # Remove original script tags from <script src="libs/three.min.js"> to the end of </body>
    pattern = r'<script src="libs/three\.min\.js">.*?</script>\s*(?:<script>.*?</script>\s*)*(?:<script src="js/[^"]+"></script>\s*)+'
    match = re.search(pattern, html, flags=re.DOTALL)
    if match:
        html = html[:match.start()] + all_scripts_str + "\n" + html[match.end():]
    else:
        # Fallback replacement
        html = re.sub(r'<script src="libs/three\.min\.js"></script>', f"<script>\n{three_js}\n</script>", html)
        for rel_path in js_files:
            pattern = rf'<script src="{rel_path}"></script>'
            with open(os.path.join(REPO_DIR, rel_path), 'r', encoding='utf-8') as f:
                c = f.read()
            html = re.sub(pattern, f"<script>\n{c}\n</script>", html)

    with open(standalone_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Successfully generated {standalone_path} ({len(html)} bytes).")

if __name__ == '__main__':
    build_standalone()
