import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * 숨겨진 DOM 요소를 캡처하여 A4 PDF를 생성합니다.
 * @param element - 캡처할 HTMLElement (이미 DOM에 mount 되어 있어야 함)
 * @param filename - 저장할 파일명 (확장자 포함)
 * @param mode - 'download' | 'print'
 */
export async function generatePdf(
    element: HTMLElement,
    filename: string,
    mode: 'download' | 'print' = 'download'
): Promise<void> {
    // A4 -> 210mm x 297mm, at 2x scale for high quality
    const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    // Calculate aspect ratio to fit within A4
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);

    const finalWidth = imgWidth * ratio;
    const finalHeight = imgHeight * ratio;

    // Center on page
    const offsetX = (pdfWidth - finalWidth) / 2;
    const offsetY = 0; // Top-aligned

    pdf.addImage(imgData, 'PNG', offsetX, offsetY, finalWidth, finalHeight);

    if (mode === 'download') {
        pdf.save(filename);
    } else {
        // Open in new tab for printing
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        if (printWindow) {
            printWindow.addEventListener('load', () => {
                printWindow.print();
            });
        }
    }
}

/**
 * 날짜를 한국식 형식으로 변환 (2026년 2월 10일)
 */
export function formatKoreanDate(date: Date | string | undefined | null): string {
    if (!date) return "-";
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return "-";
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/**
 * 주민등록번호 마스킹 처리 (앞자리만 표시)
 */
export function maskResidentNumber(residentNumber?: string): string {
    if (!residentNumber) return '-';
    // Format: 910101-1****** or just show front part
    if (residentNumber.includes('-')) {
        const parts = residentNumber.split('-');
        return `${parts[0]}-${parts[1]?.[0] || '*'}******`;
    }
    if (residentNumber.length >= 7) {
        return `${residentNumber.substring(0, 6)}-${residentNumber[6]}******`;
    }
    return residentNumber;
}
