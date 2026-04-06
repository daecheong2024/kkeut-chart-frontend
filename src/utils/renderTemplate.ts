export function renderTemplate(content: string, variables: Record<string, string>): string {
    const markers = new Map<string, string>();
    let markerIndex = 0;

    // 1) Preferred syntax: {{key}}
    let rendered = content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
        const marker = `__TPL_MARKER_${markerIndex++}__`;
        markers.set(marker, variables[key] ?? "");
        return marker;
    });

    // 2) Backward-compatible legacy syntax: {key}
    rendered = rendered.replace(/\{(\w+)\}/g, (_match, key: string) => {
        return variables[key] ?? "";
    });

    // 3) Restore marker values from step 1
    markers.forEach((value, marker) => {
        rendered = rendered.split(marker).join(value);
    });

    return rendered;
}
