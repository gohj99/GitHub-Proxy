#!/usr/bin/env python3
"""
Minify github-hook.js with aggressive compression:
- Remove all comments and whitespace
- Encode Chinese strings to Unicode escapes
- Minimize variable names where safe
- Remove console.warn in production
"""

import re
import json

def unicode_escape_chinese(text):
    """Convert Chinese characters to \\uXXXX escapes"""
    result = []
    for char in text:
        if ord(char) > 127:  # Non-ASCII
            result.append(f"\\u{ord(char):04x}")
        else:
            result.append(char)
    return ''.join(result)

def minify_js(code):
    # Remove single-line comments (but preserve URLs)
    code = re.sub(r'(?<!:)//[^\n]*', '', code)

    # Remove multi-line comments
    code = re.sub(r'/\*[\s\S]*?\*/', '', code)

    # Encode Chinese strings
    def replace_string(match):
        quote = match.group(1)
        content = match.group(2)
        escaped = unicode_escape_chinese(content)
        return f'{quote}{escaped}{quote}'

    code = re.sub(r'(["\'])([^"\']*[一-鿿][^"\']*)\1', replace_string, code)

    # Remove console.warn (optional - comment out to keep for debugging)
    code = re.sub(r'console\.warn\([^)]*\);?', '', code)

    # Remove excessive whitespace while preserving string literals
    # This is a simple approach - preserves spaces in strings
    lines = code.split('\n')
    minified_lines = []

    for line in lines:
        # Remove leading/trailing whitespace
        line = line.strip()
        if line:
            minified_lines.append(line)

    code = ''.join(minified_lines)

    # Remove spaces around operators and punctuation (careful approach)
    replacements = [
        (r'\s*([{};,:\[\]()])\s*', r'\1'),  # Around brackets and punctuation
        (r'\s*(&&|\|\||===|!==|==|!=|<=|>=)\s*', r'\1'),  # Around operators
        (r'\s*([+\-*/%=<>!])\s*', r'\1'),  # Around single-char operators
        (r'}\s*else\s*{', '}else{'),  # else blocks
        (r'}\s*catch\s*\(', '}catch('),  # catch blocks
        (r'\)\s*{', '){'),  # Function bodies
        (r'return\s+', 'return '),  # Keep space after return
        (r'const\s+', 'const '),  # Keep space after const
        (r'let\s+', 'let '),  # Keep space after let
        (r'var\s+', 'var '),  # Keep space after var
        (r'new\s+', 'new '),  # Keep space after new
        (r'function\s+', 'function '),  # Keep space after function
        (r'if\s*\(', 'if('),  # if statements
        (r'for\s*\(', 'for('),  # for loops
        (r'while\s*\(', 'while('),  # while loops
    ]

    for pattern, replacement in replacements:
        code = re.sub(pattern, replacement, code)

    # Final cleanup - remove any remaining double spaces
    code = re.sub(r'\s{2,}', ' ', code)

    return code

def main():
    input_file = 'github.gohj99.site/index/static/github-hook.js'
    output_file = 'github.gohj99.site/index/static/github-hook.min.js'

    with open(input_file, 'r', encoding='utf-8') as f:
        original = f.read()

    minified = minify_js(original)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(minified)

    original_size = len(original.encode('utf-8'))
    minified_size = len(minified.encode('utf-8'))
    ratio = (1 - minified_size / original_size) * 100

    print(f"Original size: {original_size:,} bytes")
    print(f"Minified size: {minified_size:,} bytes")
    print(f"Reduction: {ratio:.1f}%")
    print(f"\nOutput: {output_file}")

if __name__ == '__main__':
    main()
