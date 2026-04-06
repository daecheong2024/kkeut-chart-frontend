export interface PrintSection {
    label: string;
    content: string;
}

export const printService = {
    async printChartSections(sections: PrintSection[], header?: string): Promise<void> {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.');
            return;
        }

        const escape = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const headerHtml = header
            ? `<div style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #999;white-space:pre-wrap">${escape(header)}</div>`
            : '';

        const body = sections
            .map((s) => `<pre style="margin:0 0 14px 0;white-space:pre-wrap;font-family:inherit">${escape(s.content)}</pre>`)
            .join('');

        printWindow.document.write(`
            <html>
            <head>
                <title>차트 인쇄</title>
                <style>
                    @page { size: 80mm auto; margin: 2mm 3mm; }
                    body { margin: 0; padding: 2mm; font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; font-size: 9pt; line-height: 1.4; word-break: break-all; }
                    pre { margin: 0 0 3mm 0; white-space: pre-wrap; font-family: inherit; font-size: 9pt; }
                </style>
            </head>
            <body>${headerHtml}${body}</body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    }
};
