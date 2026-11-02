"""Prompts adapted from Appendix A.3, using the workshop Codex bridge."""
import json

SYSTEM = """You implement conceptual blending of static, single-screen mobile UIs in Misty.
Return one JSON object with these fields:
designExplanation: concise description of reference layout and color, under 30 words;
differences: concise description of how reference differs from source;
updatedCode: the COMPLETE runnable React component as a string, preferably () => { return (...); };
categorizedChanges: array of {category: string, changes: [{type: string, before: string, after: string}]}.
Group changes by semantic impact, such as Color: Light to dark theme, Layout: Horizontal interest cards,
Visual details: Rounded corners, Font: Larger headings, Content: Added profile editing action.
Only list actual changes, not preserved content. Keep categories distinct rather than duplicating one edit.
Use actual Tailwind classes or short code fragments in before/after; use empty before for additions.
Use React and Tailwind CSS v4. No imports, exports, external dependencies, network requests or remote assets.
React, useState, useEffect, useRef, useMemo, useCallback and lucide React icon components are in scope.
Available icons: Search, User, Mail, Phone, MapPin, Heart, Star, ChevronRight, ChevronLeft, ArrowLeft,
ArrowRight, Plus, X, Menu, Home, Settings, Bell, Camera, Music, BookOpen, Bookmark, Edit, Edit2,
Check, Grid, List, Calendar, Clock, Mountain, Compass, Sun, Moon, MoreHorizontal, Share2, Download.
Local illustrations are available as /stock/landscape0.svg, /stock/landscape1.svg, /stock/portrait0.svg.
These are original vector substitutes for stock photos. Use no other image paths.
Use semantic section, article, header, nav and button elements so drag targets are meaningful.
Do not copy literal content from the reference: retain source content when blending colors and layout.
For Content/addition, generate new content consistent with the SOURCE context, adapting the reference idea.
Apply changes to all similar repeated elements, not just one item. Prefer explicit JSX list items.
Ensure text contrasts with its background and the mobile screen fits a 340px-wide viewport.
Use absolute bottom-0 for bottom navigation, not fixed. Output valid JSON only, with no markdown fences.
"""


def blending_messages(data):
    code = data["code"]
    if data["mode"] == "global":
        task = """Create a new component page that blends the content of my work-in-progress code with
the visual style, layout and appearance of the reference image. Preserve all source UI content.
Use the reference's layout and visual style, not its literal text. Optionally add contextual content
where the source cannot fill all fields in the reference layout. Make a coherent, deliberate blend."""
    else:
        task = f"""Blend only these aspects from the reference crop: {', '.join(data['aspects'])}.
Custom instructions: {data.get('custom', '')}
The user dropped the reference crop on this rendered target element:
{data.get('target', '')[:24000]}
Target context: {data.get('targetLabel', '')}
Map this rendered HTML back to the original React code. Modify this region and other corresponding
repeated elements only. Preserve unrelated source regions. Color transfers palette, Layout transfers
arrangement and spacing, Content ADDS UI elements adapted to the source context; Customize follows
the user's intent. When combining aspects apply all selected aspects. This crop is the selected
section of the example, not necessarily a full screen."""
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": [
        {"type": "text", "text": f"Here is my React and Tailwind code:\n{code}\n\n{task}"},
        {"type": "image_url", "image_url": {"url": data["image"]}},
    ]}]


def refinement_messages(data):
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": f"""
Refine an existing conceptual blend using its semantic diff controls. Return the entire updated component.
ORIGINAL SOURCE BEFORE BLENDING:
{data['originalCode']}
FULL INITIAL BLEND (all groups originally enabled):
{data['blendedCode']}
CURRENT EDITABLE CODE (preserve unrelated manual edits):
{data['code']}
REQUESTED GROUP STATES AND FINE-GRAINED VALUES:
{json.dumps(data['groups'])}
Enable each group whose enabled field is true, using its current after values. Revert only groups whose
enabled field is false to their original before state, keeping all other enabled changes. Fine-grained
edits to after values should affect corresponding UI properties. Do not blindly replace strings across
unrelated elements. Keep categories stable. All groups disabled means return to the original design
while retaining unrelated manual edits. Summarize the changes briefly in differences.
"""}]


def repair_messages(data):
    return [{"role": "system", "content": SYSTEM}, {"role": "user", "content": f"""
Repair this component's syntax or rendering error, preserving design and content. React and hooks
and the listed lucide icons are already in scope. No imports, exports or network requests.
Error: {str(data.get('error', 'Component fails to render'))[:4000]}
Code:
{data['code']}
Return the complete corrected component as updatedCode. Do not introduce design changes.
"""}]
