import { useState, useCallback, useRef, useEffect } from "react";

export interface ColumnDef {
    minWidth: number;
    ratio: number;
}

export function useResizableColumns(columns: readonly ColumnDef[]) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [widths, setWidths] = useState<number[]>([]);
    const initializedRef = useRef(false);
    const dragging = useRef<{ index: number; startX: number; startWidths: number[] } | null>(null);

    const separatorCount = columns.length - 1;
    const separatorTotalWidth = separatorCount * 4;

    useEffect(() => {
        if (initializedRef.current) return;
        const el = containerRef.current;
        if (!el) return;

        const available = el.clientWidth - separatorTotalWidth;
        const totalRatio = columns.reduce((s, c) => s + c.ratio, 0);
        const computed = columns.map((c) => Math.round((c.ratio / totalRatio) * available));

        const diff = available - computed.reduce((s, w) => s + w, 0);
        computed[computed.length - 1]! += diff;

        setWidths(computed);
        initializedRef.current = true;
    });

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleResize = () => {
            if (!el || widths.length === 0) return;

            const available = el.clientWidth - separatorTotalWidth;
            const currentTotal = widths.reduce((s, w) => s + w, 0);
            if (currentTotal === 0 || available === currentTotal) return;

            const scale = available / currentTotal;
            const scaled = widths.map((w, i) => Math.max(columns[i]!.minWidth, Math.round(w * scale)));

            const diff = available - scaled.reduce((s, w) => s + w, 0);
            scaled[scaled.length - 1]! += diff;

            setWidths(scaled);
        };

        const ro = new ResizeObserver(handleResize);
        ro.observe(el);

        return () => ro.disconnect();
    }, [widths, columns, separatorTotalWidth]);

    const onMouseDown = useCallback(
        (separatorIndex: number, e: React.MouseEvent) => {
            e.preventDefault();
            dragging.current = {
                index: separatorIndex,
                startX: e.clientX,
                startWidths: [...widths],
            };
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        },
        [widths]
    );

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            const d = dragging.current;
            if (!d) return;
            const delta = e.clientX - d.startX;
            const left = d.index;
            const right = d.index + 1;
            const minL = columns[left]!.minWidth;
            const minR = columns[right]!.minWidth;

            let newLeft = d.startWidths[left]! + delta;
            let newRight = d.startWidths[right]! - delta;

            if (newLeft < minL) {
                newLeft = minL;
                newRight = d.startWidths[left]! + d.startWidths[right]! - minL;
            }
            if (newRight < minR) {
                newRight = minR;
                newLeft = d.startWidths[left]! + d.startWidths[right]! - minR;
            }

            setWidths((prev) => {
                const next = [...prev];
                next[left] = newLeft;
                next[right] = newRight;
                return next;
            });
        };

        const onMouseUp = () => {
            if (!dragging.current) return;
            dragging.current = null;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, [columns]);

    return { containerRef, widths, onMouseDown };
}
